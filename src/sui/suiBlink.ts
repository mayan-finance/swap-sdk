import { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { ChainReferrers, ComposableSuiMoveCallsOptions, Quote, ReferrerAddresses } from '../types';
import { hexToUint8Array } from '../utils';
import { getCurrentChainTime } from '../api';
import { getBlinkChains } from '../blink/api';
import { submitAndTrackBlinkGaslessOrder } from '../blink/gasless';
import { fetchBlinkOrder, isBlinkSourceSwap } from '../blink/order';
import type { BlinkOrder } from '../blink/types';
import { resolveInputCoin } from './utils';

const SOURCE_SWAP_WINDOW_MS = BigInt(300_000);
const SOURCE_SWAP_ALLOWANCE_NAME = 'blink source swap';
const SPONSORED_BUDGET_MARGIN_BPS = BigInt(12_500);

export type SuiSignedTransaction = {
	bytes: string;
	signature: string;
};

export type SuiTransactionSigner = (transaction: Transaction) => Promise<SuiSignedTransaction>;

function assertBlinkSuiQuote(quote: Quote): void {
	if (quote.type !== 'BLINK') {
		throw new Error('Unsupported quote type for Blink: ' + quote.type);
	}
	if (quote.fromChain !== 'sui') {
		throw new Error('Unsupported source chain for Blink: ' + quote.fromChain);
	}
}

function escrowOf(order: BlinkOrder): string {
	const escrow = order.contracts.escrow;
	if (!escrow) {
		throw new Error('Blink deposits are unavailable on sui');
	}
	return escrow;
}

async function addDepositCall(
	tx: Transaction,
	order: BlinkOrder,
	swapperAddress: string,
	suiClient: ClientWithCoreApi,
	options?: ComposableSuiMoveCallsOptions
): Promise<void> {
	const params = order.quote.orderParams;
	const inputCoin = await resolveInputCoin(
		BigInt(params.amountIn),
		swapperAddress,
		params.srcToken,
		suiClient,
		tx,
		options?.inputCoin
	);
	tx.moveCall({
		target: `${params.routerAddress}::blink::deposit`,
		typeArguments: [params.srcToken],
		arguments: [
			tx.object(escrowOf(order)),
			tx.pure.vector('u8', hexToUint8Array(order.quote.quoteHash)),
			inputCoin as TransactionObjectArgument,
		],
	});
}

async function sourceSwapExpiryMs(): Promise<bigint> {
	const chainTimeSecs = await getCurrentChainTime('sui');
	return BigInt(chainTimeSecs) * BigInt(1000) + SOURCE_SWAP_WINDOW_MS;
}

async function addSourceSwapOpenCall(
	tx: Transaction,
	order: BlinkOrder,
	swapperAddress: string,
	suiClient: ClientWithCoreApi,
	options?: ComposableSuiMoveCallsOptions
): Promise<void> {
	const params = order.quote.orderParams;
	const amountIn = BigInt(params.amountIn);
	const [chains, expiresAtMs] = await Promise.all([getBlinkChains(), sourceSwapExpiryMs()]);
	const swapExecutor = chains.find((c) => c.chain === params.srcChain)?.swapExecutor;
	if (!swapExecutor) {
		throw new Error('Blink source swaps are unavailable on sui');
	}
	const { balance } = await suiClient.core.getBalance({ owner: swapperAddress, coinType: params.srcToken });
	const shortfall = amountIn - BigInt(balance.addressBalance);
	if (shortfall > BigInt(0)) {
		const payment = await resolveInputCoin(shortfall, swapperAddress, params.srcToken, suiClient, tx, options?.inputCoin);
		tx.moveCall({
			target: '0x2::coin::send_funds',
			typeArguments: [params.srcToken],
			arguments: [payment as TransactionObjectArgument, tx.pure.address(swapperAddress)],
		});
	}
	const noRateLimit = tx.moveCall({
		target: '0x1::option::none',
		typeArguments: ['0x2::allowance::RateLimit'],
	});
	const proposal = tx.moveCall({
		target: '0x2::allowance::propose_for_app',
		typeArguments: [`0x2::balance::Balance<${params.srcToken}>`, `${params.routerAddress}::blink::SourceSwapFunding`],
		arguments: [
			tx.pure.string(SOURCE_SWAP_ALLOWANCE_NAME),
			tx.pure.address(swapExecutor),
			tx.pure.option('u256', amountIn),
			tx.pure.option('u64', null),
			tx.pure.option('u64', expiresAtMs),
			noRateLimit,
		],
	});
	tx.moveCall({
		target: `${params.routerAddress}::blink::open_source_swap`,
		typeArguments: [params.srcToken, params.bridgeTokenSrc],
		arguments: [
			tx.object(escrowOf(order)),
			proposal,
			tx.pure.vector('u8', hexToUint8Array(order.quote.quoteHash)),
			tx.pure.u64(BigInt(params.minBridgeOut)),
			tx.object.clock(),
		],
	});
}

async function buildDepositTransaction(
	order: BlinkOrder,
	swapperAddress: string,
	suiClient: ClientWithCoreApi,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	const tx = options?.builtTransaction ?? new Transaction();
	tx.setSenderIfNotSet(swapperAddress);
	if (isBlinkSourceSwap(order.quote.orderParams)) {
		await addSourceSwapOpenCall(tx, order, swapperAddress, suiClient, options);
	} else {
		await addDepositCall(tx, order, swapperAddress, suiClient, options);
	}
	return tx;
}

export async function createBlinkFromSuiMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	suiClient: ClientWithCoreApi,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	assertBlinkSuiQuote(quote);
	if (quote.gasless) {
		throw new Error('Gasless Blink quotes are submitted through swapBlinkGaslessFromSui');
	}
	const order =
		options?.blinkOrder ??
		(await fetchBlinkOrder(quote, swapperAddress, destinationAddress, referrerAddresses, options?.apiKey));
	return buildDepositTransaction(order, swapperAddress, suiClient, options);
}

async function sponsorTransaction(
	tx: Transaction,
	suiClient: ClientWithCoreApi,
	sponsor: string,
	maxGasBudget: bigint
): Promise<Transaction> {
	tx.setGasOwner(sponsor);
	tx.setGasPayment([]);
	tx.setGasBudget(maxGasBudget);
	const simulated = await suiClient.core.simulateTransaction({
		transaction: await tx.build({ client: suiClient }),
		include: { effects: true },
	});
	if (simulated.$kind === 'FailedTransaction') {
		throw new Error(
			`Sponsored Blink deposit would fail: ${simulated.FailedTransaction.status.error?.message ?? 'unknown'}`
		);
	}
	const { computationCost, storageCost } = simulated.Transaction.effects.gasUsed;
	const needed = ((BigInt(computationCost) + BigInt(storageCost)) * SPONSORED_BUDGET_MARGIN_BPS) / BigInt(10_000);
	tx.setGasBudget(needed < maxGasBudget ? needed : maxGasBudget);
	return Transaction.from(await tx.build({ client: suiClient }));
}

export async function swapBlinkGaslessFromSui(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	suiClient: ClientWithCoreApi,
	signTransaction: SuiTransactionSigner,
	options?: ComposableSuiMoveCallsOptions
): Promise<string> {
	assertBlinkSuiQuote(quote);
	if (!quote.gasless) {
		throw new Error('Quote is not a gasless BLINK quote');
	}
	const order =
		options?.blinkOrder ??
		(await fetchBlinkOrder(quote, swapperAddress, destinationAddress, referrerAddresses, options?.apiKey));
	const sponsor = order.quote.sponsorAddress;
	const gasBudget = order.quote.sponsorGasBudget;
	if (!sponsor || gasBudget === undefined) {
		throw new Error('Gasless Blink deposits are unavailable on sui');
	}
	const tx = await buildDepositTransaction(order, swapperAddress, suiClient, options);
	const sponsored = await sponsorTransaction(tx, suiClient, sponsor, gasBudget);
	const signed = await signTransaction(sponsored);
	await submitAndTrackBlinkGaslessOrder({
		quoteHash: order.quote.quoteHash,
		sui: { txBase64: signed.bytes, signature: signed.signature },
	});
	return order.quote.quoteHash;
}
