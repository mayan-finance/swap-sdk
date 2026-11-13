import { SystemProgram } from '@solana/web3.js';
import { ZeroAddress } from 'ethers';
import type {
	BlinkOrder,
	BlinkOrderParams,
	BlinkOrderParamsJson,
	BlinkQuote,
	ChainReferrers,
	Quote,
	Referrer,
	ReferrerAddresses,
} from '../types';
import { getBlinkReferrers } from '../utils';
import { getBlinkSwapInstructions } from '../api';
import {
	assertBlinkContractRegistered,
	blinkAddressKey,
	getBlinkChainContracts,
	sameBlinkAddress,
} from './contracts';
import { assertBlinkQuoteHash, decodeBlinkQuote } from './utils';

export function needsBlinkSourceSwap(params: BlinkOrderParams): boolean {
	return params.srcToken !== params.lockToken;
}

export function isBlinkQuoteExpired(quote: BlinkQuote): boolean {
	return Date.parse(quote.expiresAt) <= Date.now();
}

/**
 * True when the quote carries a Blink order, i.e. `blinkQuote` with a quote hash. Mayan embeds
 * it only when `fetchQuote` was called with `destinationAddress` and `swapperAddress` or
 * `refundAddress`; a quote fetched without them is a price preview and cannot be swapped.
 */
export function hasBlinkQuoteHash(quote: Quote): boolean {
	const embedded = quote.blinkQuote?.crossChain ?? quote.blinkQuote?.sameChainSwap;
	const hash = embedded?.quoteHash;
	return typeof hash === 'string' && hash !== '';
}

/**
 * The order params exactly as the quote embeds them (proto JSON), for a gasless submission: the
 * explorer re-hashes them and must get the quote hash back.
 */
export function getBlinkOrderParamsJson(quote: Quote): BlinkOrderParamsJson {
	const embedded = quote.blinkQuote?.crossChain ?? quote.blinkQuote?.sameChainSwap;
	if (!hasBlinkQuoteHash(quote) || !embedded?.orderParams) {
		throw new Error('Blink quote carries no order: fetch the quote with destinationAddress and swapperAddress to get one');
	}
	return embedded.orderParams;
}


function isZeroAddress(address: string): boolean {
	return address === ZeroAddress || address === SystemProgram.programId.toBase58();
}

function referrerKey(referrer: Referrer): string {
	return `${blinkAddressKey(referrer.address)}:${referrer.bps}`;
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
	if (!sameBlinkAddress(params.recipient, destinationAddress)) {
		throw new Error(
			`Blink order is bound to recipient ${params.recipient}, not ${destinationAddress}: fetch the quote with this destinationAddress`
		);
	}
	if (!sameBlinkAddress(params.refundAddress, refundAddress)) {
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
 * `Quote` must come from `fetchQuote` called with `destinationAddress` and `swapperAddress` or
 * `refundAddress`.
 */
export async function resolveBlinkOrder(
	quote: Quote,
	refundAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined
): Promise<BlinkOrder> {
	const order = decodeBlinkOrder(quote);
	if (isZeroAddress(destinationAddress)) {
		throw new Error(`Invalid destination address: ${destinationAddress}`);
	}
	if (isZeroAddress(refundAddress)) {
		throw new Error(`Invalid refund address: ${refundAddress}`);
	}
	const referrers = getBlinkReferrers(quote, referrerAddresses);
	assertOrderMatchesQuote(order, quote, refundAddress, destinationAddress, referrers);
	const resolved = await loadBlinkOrderContracts(order);
	const params = order.orderParams;
	if (!needsBlinkSourceSwap(params) || quote.fromChain === 'sui') {
		return resolved;
	}
	const swap = await getBlinkSwapInstructions(order.quoteHash);
	await assertBlinkContractRegistered(params.srcChain, swap.routerAddress, order.guardianSetIndex);
	return { ...resolved, swap };
}

/**
 * The Blink order embedded in a quote with its contracts, like {@link resolveBlinkOrder} but
 * without checking it against swap inputs and without a source swap's route. Enough to know
 * which contract a deposit approves, and it calls no Blink endpoint but the cached contract
 * manifest; use `resolveBlinkOrder` to build the deposit itself.
 */
export async function loadBlinkOrder(quote: Quote): Promise<BlinkOrder> {
	return loadBlinkOrderContracts(decodeBlinkOrder(quote));
}

function decodeBlinkOrder(quote: Quote): BlinkQuote {
	if (quote.type !== 'BLINK') {
		throw new Error('Quote type is not BLINK');
	}
	if (!hasBlinkQuoteHash(quote)) {
		throw new Error(
			'Blink quote carries no order: fetch the quote with destinationAddress and swapperAddress to get one'
		);
	}
	return decodeBlinkQuote(quote.blinkQuote);
}

async function loadBlinkOrderContracts(order: BlinkQuote): Promise<BlinkOrder> {
	assertBlinkQuoteHash(order);
	if (isBlinkQuoteExpired(order)) {
		throw new Error('Blink quote expired, request a new quote');
	}
	const params = order.orderParams;
	await assertBlinkContractRegistered(params.srcChain, params.routerAddress, order.guardianSetIndex);
	const contracts = await getBlinkChainContracts(params.srcChain, order.guardianSetIndex);
	return { quote: order, contracts };
}
