import { SystemProgram } from '@solana/web3.js';
import { ZeroAddress } from 'ethers';
import type { ChainReferrers, Quote, Referrer, ReferrerAddresses } from '../types';
import { getBlinkReferrers } from '../utils';
import { getBlinkSwapInstructions } from './api';
import { assertBlinkContractRegistered, getBlinkChainContracts } from './contracts';
import { decodeBlinkQuote } from './decode';
import { assertBlinkQuoteHash } from './hash';
import type { BlinkOrder, BlinkOrderParams, BlinkQuote, BlinkSwapInstructions } from './types';

export function isBlinkSourceSwap(params: BlinkOrderParams): boolean {
	return params.srcToken !== params.lockToken;
}

export function isBlinkQuoteExpired(quote: BlinkQuote): boolean {
	if (!quote.expiresAt) {
		return false;
	}
	const expiry = new Date(quote.expiresAt).getTime();
	return !Number.isNaN(expiry) && expiry <= Date.now();
}

/**
 * True when the quote carries a Blink order, i.e. `blinkQuote` with a quote hash. Mayan embeds
 * it only when `fetchQuote` was called with `destinationAddress` and `refundAddress`; a quote
 * fetched without them is a price preview and cannot be swapped.
 */
export function hasBlinkQuoteHash(quote: Quote): boolean {
	const embedded = quote.blinkQuote?.cross_chain ?? quote.blinkQuote?.same_chain_swap;
	const hash = embedded?.quote_hash;
	return typeof hash === 'string' && hash !== '';
}

function sameAddress(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

function isZeroAddress(address: string): boolean {
	return address === ZeroAddress || address === SystemProgram.programId.toBase58();
}

function referrerKey(referrer: Referrer): string {
	return `${referrer.address.toLowerCase()}:${referrer.bps}`;
}

function sameReferrers(a: Referrer[], b: Referrer[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	const keys = new Set(a.map(referrerKey));
	return b.every((referrer) => keys.has(referrerKey(referrer)));
}

function assertOrderMatchesQuote(
	order: BlinkQuote,
	quote: Quote,
	refundAddress: string,
	destinationAddress: string,
	referrers: Referrer[]
): void {
	const params = order.orderParams;
	if (params.srcChain !== quote.fromChain || params.dstChain !== quote.toChain) {
		throw new Error('Blink order chains do not match the quote');
	}
	if (BigInt(params.expectedAmountIn) !== BigInt(quote.effectiveAmountIn64)) {
		throw new Error('Blink order amount does not match the quote');
	}
	if (!sameAddress(params.recipient, destinationAddress)) {
		throw new Error(
			`Blink order is bound to recipient ${params.recipient}, not ${destinationAddress}: fetch the quote with this destinationAddress`
		);
	}
	if (!sameAddress(params.refundAddress, refundAddress)) {
		throw new Error(
			`Blink order is bound to refund address ${params.refundAddress}, not ${refundAddress}: fetch the quote with this refundAddress`
		);
	}
	if (order.gasless !== (quote.gasless === true)) {
		throw new Error('Blink order gasless flag does not match the quote');
	}
	if (quote.minReceivedBaseUnits && BigInt(params.minAmountOut) < BigInt(quote.minReceivedBaseUnits)) {
		throw new Error('Blink order minimum output is below the quoted minimum, request a new quote');
	}
	if (!sameReferrers(params.referrers, referrers)) {
		throw new Error(
			'Blink order referrers do not match the requested referrers: pass the same referrers to fetchQuote and the swap'
		);
	}
}

/**
 * Verifies the Blink order embedded in a quote against the swap inputs and resolves the
 * contracts (and source-swap instructions) the deposit needs. It never requests a quote: the
 * `Quote` must come from `fetchQuote` called with `destinationAddress` and `refundAddress`.
 */
export async function fetchBlinkOrder(
	quote: Quote,
	refundAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined
): Promise<BlinkOrder> {
	if (quote.type !== 'BLINK') {
		throw new Error('Quote type is not BLINK');
	}
	if (!hasBlinkQuoteHash(quote)) {
		throw new Error(
			'Blink quote carries no order: fetch the quote with destinationAddress and refundAddress to get one'
		);
	}
	if (isZeroAddress(destinationAddress)) {
		throw new Error(`Invalid destination address: ${destinationAddress}`);
	}
	if (isZeroAddress(refundAddress)) {
		throw new Error(`Invalid refund address: ${refundAddress}`);
	}
	const order = decodeBlinkQuote(quote.blinkQuote);
	const referrers = getBlinkReferrers(quote, referrerAddresses);
	assertOrderMatchesQuote(order, quote, refundAddress, destinationAddress, referrers);
	assertBlinkQuoteHash(order);
	if (isBlinkQuoteExpired(order)) {
		throw new Error('Blink quote expired, request a new quote');
	}

	const params = order.orderParams;
	await assertBlinkContractRegistered(params.srcChain, params.routerAddress, order.guardianSetIndex);
	const contracts = await getBlinkChainContracts(params.srcChain, order.guardianSetIndex);
	let swap: BlinkSwapInstructions | undefined;
	if (isBlinkSourceSwap(params) && quote.fromChain !== 'sui') {
		swap = await getBlinkSwapInstructions(order.quoteHash);
		await assertBlinkContractRegistered(params.srcChain, swap.routerAddress, order.guardianSetIndex);
	}
	return { quote: order, swap, contracts };
}
