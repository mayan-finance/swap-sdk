import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { ClientWithCoreApi } from '@mysten/sui/client';
import {
	Quote,
	SuiFunctionNestedResult,
	ComposableSuiMoveCallsOptions,
} from '../types';
import { fetchMayanSuiPackageId, resolveInputCoin } from './utils';
import {
	getAmountOfFractionalAmount,
	getGasDecimal,
	getWormholeChainIdByName,
	nativeAddressToHexString,
	FAST_MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD,
	FAST_MCTP_PAYLOAD_TYPE_DEFAULT,
} from '../utils';
import addresses from '../addresses';
import { Buffer } from 'buffer';
import { CCTP_TOKEN_DECIMALS, getCCTPDomain } from '../cctp';
import { SystemProgram } from '@solana/web3.js';
import { getSwapSui } from '../api';
import { ZeroAddress } from 'ethers';

const SUI_DENY_LIST_OBJECT_ID = '0x403';

export async function createFastMctpFromSuiMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	payload: Uint8Array | Buffer | null | undefined,
	suiClient: ClientWithCoreApi,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	if (!quote.fromToken.currencyId || !quote.fastMctpInputCurrencyId) {
		throw new Error('from token or fast mctp input currency id is not provided');
	}
	if (payload && quote.hasAuction) {
		throw new Error('Cannot use custom payload with fast mctp order');
	}

	if (!destinationAddress || destinationAddress === ZeroAddress || destinationAddress === SystemProgram.programId.toString()) {
		throw new Error('Invalid destination address for fast mctp');
	}
	const fastMctpPackageId = await fetchMayanSuiPackageId(addresses.SUI_FAST_MCTP_STATE, suiClient);

	let tx: Transaction;
	let inputCoin:
		| TransactionResult
		| SuiFunctionNestedResult
		| { $kind: 'Input'; Input: number; type?: 'object' };

	// Setup tx based on we should have client swap or not
	if (quote.fromToken.contract === quote.fastMctpInputContract) {
		tx = options?.builtTransaction ?? new Transaction();
		inputCoin = await resolveInputCoin(
			BigInt(quote.effectiveAmountIn64),
			swapperAddress,
			quote.fastMctpInputContract,
			suiClient,
			tx,
			options?.inputCoin
		);
	} else {
		const { tx: serializedTx, outCoin } = await getSwapSui({
			amountIn64: quote.effectiveAmountIn64,
			inputCoinType: quote.fromToken.contract,
			middleCoinType: quote.fastMctpInputContract,
			userWallet: swapperAddress,
			withWhFee: false,
			referrerAddress,
			inputCoin: options?.inputCoin,
			transaction: options?.builtTransaction ? (await options.builtTransaction.toJSON()) : undefined,
			slippageBps: quote.slippageBps,
			chainName: quote.fromChain,
			apiKey: options?.apiKey,
		});
		tx = Transaction.from(serializedTx);
		inputCoin = outCoin;
	}

	const moveCallsOptions = { inputCoin: { result: inputCoin }, builtTransaction: tx };
	if (quote.hasAuction) {
		await addFastMctpCreateOrderMoveCalls(
			quote,
			swapperAddress,
			destinationAddress,
			referrerAddress,
			fastMctpPackageId,
			suiClient,
			moveCallsOptions
		);
	} else {
		await addFastMctpBridgeMoveCalls(
			quote,
			swapperAddress,
			destinationAddress,
			referrerAddress,
			fastMctpPackageId,
			payload,
			suiClient,
			moveCallsOptions
		);
	}

	// Log initial coin and amount
	const _payload = payload ? Uint8Array.from(payload) : Uint8Array.from([]);
	tx.moveCall({
		package: fastMctpPackageId,
		module: 'bridge',
		function: 'log_initialize_fast_mctp',
		typeArguments: [quote.fromToken.contract],
		arguments: [
			tx.pure.u64(BigInt(quote.effectiveAmountIn64)),
			tx.object(quote.fromToken.currencyId),
			tx.pure.vector('u8', _payload),
		],
	});
	return tx;
}

export async function addFastMctpBridgeMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	fastMctpPackageId: string,
	payload: Uint8Array | Buffer | null | undefined,
	suiClient: ClientWithCoreApi,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	const destChainId = getWormholeChainIdByName(quote.toChain);
	const tx = options?.builtTransaction ?? new Transaction();

	const inputCoin = await resolveInputCoin(
		BigInt(quote.effectiveAmountIn64),
		swapperAddress,
		quote.fastMctpInputContract,
		suiClient,
		tx,
		options?.inputCoin
	);

	const payloadType = payload
		? FAST_MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD
		: FAST_MCTP_PAYLOAD_TYPE_DEFAULT;
	const _payload = payload ? Uint8Array.from(payload) : Uint8Array.from([]);

	const [bridgeTicket] = tx.moveCall({
		package: fastMctpPackageId,
		module: 'bridge',
		function: 'prepare_bridge',
		typeArguments: [quote.fastMctpInputContract],
		arguments: [
			tx.pure.u8(payloadType),
			inputCoin,
			tx.pure.u64(getFastMctpAmountInMin(quote)),
			tx.pure.address(nativeAddressToHexString(destinationAddress, destChainId)),
			tx.pure.u32(getCCTPDomain(quote.toChain)),
			tx.pure.u64(getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8))),
			tx.pure.u64(getAmountOfFractionalAmount(quote.redeemRelayerFee, CCTP_TOKEN_DECIMALS)),
			tx.pure.address(getFastMctpReferrerHex(quote, referrerAddress)),
			tx.pure.u8(quote.referrerBps || 0),
			tx.pure.u64(BigInt(quote.circleMaxFee64)),
			tx.pure.u32(Number(quote.fastMctpMinFinality)),
			tx.pure.vector('u8', _payload),
		],
	});

	const [burnTicket] = tx.moveCall({
		package: fastMctpPackageId,
		module: 'bridge',
		function: 'bridge',
		typeArguments: [quote.fastMctpInputContract],
		arguments: [
			tx.object(addresses.SUI_FAST_MCTP_STATE),
			tx.object(quote.fastMctpInputCurrencyId!),
			bridgeTicket,
		],
	});

	addCircleBurnMoveCalls(tx, quote, fastMctpPackageId, burnTicket);
	return tx;
}

export async function addFastMctpCreateOrderMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	fastMctpPackageId: string,
	suiClient: ClientWithCoreApi,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	const destChainId = getWormholeChainIdByName(quote.toChain);
	const tx = options?.builtTransaction ?? new Transaction();

	if (!Number(quote.deadline64)) {
		throw new Error('Fast Mctp order requires timeout');
	}
	if (!quote.refundRelayerFee64) {
		throw new Error('Refund relayer fee is missing in quote');
	}

	const inputCoin = await resolveInputCoin(
		BigInt(quote.effectiveAmountIn64),
		swapperAddress,
		quote.fastMctpInputContract,
		suiClient,
		tx,
		options?.inputCoin
	);

	const tokenOut =
		quote.toToken.contract === ZeroAddress ?
			nativeAddressToHexString(SystemProgram.programId.toString(), getWormholeChainIdByName('solana')) :
			nativeAddressToHexString(quote.toToken.contract, quote.toToken.wChainId);

	const [createOrderTicket] = tx.moveCall({
		package: fastMctpPackageId,
		module: 'create_order',
		function: 'prepare_create_order',
		typeArguments: [quote.fastMctpInputContract],
		arguments: [
			inputCoin,
			tx.pure.u64(getFastMctpAmountInMin(quote)),
			tx.pure.address(nativeAddressToHexString(destinationAddress, destChainId)),
			tx.pure.u32(getCCTPDomain(quote.toChain)),
			tx.pure.address(tokenOut),
			tx.pure.u64(getAmountOfFractionalAmount(quote.minAmountOut, Math.min(8, quote.toToken.decimals))),
			tx.pure.u64(getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8))),
			tx.pure.u64(getAmountOfFractionalAmount(quote.redeemRelayerFee, CCTP_TOKEN_DECIMALS)),
			tx.pure.u64(BigInt(quote.refundRelayerFee64)),
			tx.pure.u64(BigInt(quote.deadline64)),
			tx.pure.address(getFastMctpReferrerHex(quote, referrerAddress)),
			tx.pure.u8(quote.referrerBps || 0),
			tx.pure.u64(BigInt(quote.circleMaxFee64)),
			tx.pure.u32(Number(quote.fastMctpMinFinality)),
		],
	});

	const [burnTicket] = tx.moveCall({
		package: fastMctpPackageId,
		module: 'create_order',
		function: 'create_order',
		typeArguments: [quote.fastMctpInputContract],
		arguments: [
			tx.object(addresses.SUI_FAST_MCTP_STATE),
			tx.object(quote.fastMctpInputCurrencyId!),
			createOrderTicket,
		],
	});

	addCircleBurnMoveCalls(tx, quote, fastMctpPackageId, burnTicket);
	return tx;
}

function addCircleBurnMoveCalls(
	tx: Transaction,
	quote: Quote,
	fastMctpPackageId: string,
	burnTicket: SuiFunctionNestedResult,
) {
	const [burnReceipt, burnCoin] = tx.moveCall({
		package: addresses.SUI_CCTP_V2_TOKEN_PACKAGE_ID,
		module: 'deposit_for_burn',
		function: 'deposit_for_burn_with_package_auth',
		typeArguments: [
			quote.fastMctpInputContract,
			`${fastMctpPackageId}::circle_auth::CircleAuth`,
		],
		arguments: [burnTicket, tx.object(addresses.SUI_CCTP_V2_TOKEN_STATE)],
	});

	const [completeBurnTicket] = tx.moveCall({
		package: addresses.SUI_CCTP_V2_HANDLER_PACKAGE_ID,
		module: 'handler',
		function: 'burn',
		arguments: [
			tx.object(addresses.SUI_CCTP_V2_HANDLER_STATE),
			burnReceipt,
			burnCoin,
			tx.object(SUI_DENY_LIST_OBJECT_ID),
			tx.object(addresses.SUI_USDC_TREASURY),
		],
	});

	tx.moveCall({
		package: addresses.SUI_CCTP_V2_TOKEN_PACKAGE_ID,
		module: 'deposit_for_burn',
		function: 'complete_burn',
		typeArguments: [
			quote.fastMctpInputContract,
			`${addresses.SUI_CCTP_V2_HANDLER_PACKAGE_ID}::handler::Auth`,
		],
		arguments: [
			completeBurnTicket,
			tx.object(addresses.SUI_CCTP_V2_TOKEN_STATE),
			tx.object(addresses.SUI_CCTP_V2_CORE_STATE),
		],
	});
}

function getFastMctpAmountInMin(quote: Quote): bigint {
	if (quote.fromToken.contract === quote.fastMctpInputContract) {
		return BigInt(quote.effectiveAmountIn64);
	}
	if (!quote.minMiddleAmount) {
		throw new Error('minMiddleAmount is required when fromToken is different than fastMctpInputContract');
	}
	return getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS);
}

function getFastMctpReferrerHex(quote: Quote, referrerAddress: string | null | undefined): string {
	if (referrerAddress) {
		return nativeAddressToHexString(referrerAddress, getWormholeChainIdByName(quote.toChain));
	}
	return nativeAddressToHexString(SystemProgram.programId.toString(), getWormholeChainIdByName('solana'));
}
