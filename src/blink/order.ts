import { SystemProgram } from '@solana/web3.js';
import { ZeroAddress } from 'ethers';
import { fetchQuote } from '../api';
import type { ChainReferrers, Quote, QuoteOptions, QuoteParams, Referrer, ReferrerAddresses } from '../types';
import { getBlinkReferrers, isChainReferrers } from '../utils';
import { getBlinkSwapInstructions } from './api';
import { assertBlinkContractRegistered, getBlinkChainContracts } from './contracts';
import { decodeBlinkQuote } from './decode';
import { assertBlinkQuoteHash } from './hash';
import type { BlinkOrder, BlinkOrderParams, BlinkQuote } from './types';

export function isBlinkSourceSwap(params: BlinkOrderParams): boolean {
	return params.srcToken !== params.bridgeTokenSrc;
}

export function isBlinkQuoteExpired(quote: BlinkQuote): boolean {
	if (!quote.depositDeadline) {
		return false;
	}
	const deadline = new Date(quote.depositDeadline).getTime();
	return !Number.isNaN(deadline) && deadline <= Date.now();
}

function assertDepositDeadline(quote: BlinkQuote): void {
	if (isBlinkQuoteExpired(quote)) {
		throw new Error('Blink quote deposit deadline passed, request a new quote');
	}
}

type OrderExpectation = {
	srcChain: string;
	dstChain: string;
	amountIn: bigint;
	recipient: string;
	refundAddress: string;
	gasless: boolean;
	minAmountOut?: bigint;
	referrers: Referrer[];
};

function sameAddress(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
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

function orderMismatch(quote: BlinkQuote, expected: OrderExpectation): string | null {
	const params = quote.orderParams;
	if (params.srcChain !== expected.srcChain || params.dstChain !== expected.dstChain) {
		return 'Blink order chains do not match the quote';
	}
	if (BigInt(params.amountIn) !== expected.amountIn) {
		return 'Blink order amount does not match the quote';
	}
	if (!sameAddress(params.recipient, expected.recipient)) {
		return 'Blink order recipient does not match the destination address';
	}
	if (!sameAddress(params.refundAddress, expected.refundAddress)) {
		return 'Blink order refund address does not match';
	}
	if (quote.gasless !== expected.gasless) {
		return 'Blink order gasless flag does not match the quote';
	}
	if (expected.minAmountOut !== undefined && BigInt(params.minAmountOut) < expected.minAmountOut) {
		return 'Blink order minimum output is below the quoted minimum, request a new quote';
	}
	if (!sameReferrers(params.referrers, expected.referrers)) {
		return 'Blink order referrers do not match the requested referrers';
	}
	return null;
}

function embeddedQuote(quote: Quote, expected: OrderExpectation): BlinkQuote | null {
	if (!quote.blinkQuote) {
		return null;
	}
	const embedded = decodeBlinkQuote(quote.blinkQuote);
	if (isBlinkQuoteExpired(embedded) || orderMismatch(embedded, expected)) {
		return null;
	}
	return embedded;
}

function referrerQuoteInputs(
	quote: Quote,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	referrers: Referrer[]
): { params: Pick<QuoteParams, 'referrer' | 'referrerBps'>; options: Pick<QuoteOptions, 'referrers'> } {
	if (referrerAddresses && isChainReferrers(referrerAddresses)) {
		return { params: {}, options: { referrers: referrerAddresses } };
	}
	const single = referrers[0];
	return {
		params: single ? { referrer: single.address, referrerBps: single.bps } : {},
		options: {},
	};
}

async function requestFullQuote(
	quote: Quote,
	refundAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	referrers: Referrer[],
	apiKey?: string
): Promise<Quote> {
	const referrerInputs = referrerQuoteInputs(quote, referrerAddresses, referrers);
	const quotes = await fetchQuote(
		{
			amountIn64: quote.effectiveAmountIn64,
			fromToken: quote.fromToken.contract,
			fromChain: quote.fromChain,
			toToken: quote.toToken.contract,
			toChain: quote.toChain,
			slippageBps: quote.slippageBps,
			gasDrop: quote.gasDrop,
			destinationAddress,
			refundAddress,
			...referrerInputs.params,
		},
		{
			blink: true,
			wormhole: false,
			swift: false,
			mctp: false,
			fastMctp: false,
			shuttle: false,
			monoChain: false,
			gasless: quote.gasless === true,
			apiKey,
			...referrerInputs.options,
		}
	);
	const full = quotes.find((q) => q.type === 'BLINK' && q.blinkQuote);
	if (!full) {
		throw new Error('Mayan did not return a Blink order for this swap');
	}
	return full;
}

export async function fetchBlinkOrder(
	quote: Quote,
	refundAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	apiKey?: string
): Promise<BlinkOrder> {
	if (quote.type !== 'BLINK') {
		throw new Error('Quote type is not BLINK');
	}
	if (destinationAddress === ZeroAddress || destinationAddress === SystemProgram.programId.toBase58()) {
		throw new Error(`Invalid destination address: ${destinationAddress}`);
	}
	if (refundAddress === ZeroAddress || refundAddress === SystemProgram.programId.toBase58()) {
		throw new Error(`Invalid refund address: ${refundAddress}`);
	}
	const referrers = getBlinkReferrers(quote, referrerAddresses);
	const expected: OrderExpectation = {
		srcChain: quote.fromChain,
		dstChain: quote.toChain,
		amountIn: BigInt(quote.effectiveAmountIn64),
		recipient: destinationAddress,
		refundAddress,
		gasless: quote.gasless === true,
		minAmountOut: quote.minReceivedBaseUnits ? BigInt(quote.minReceivedBaseUnits) : undefined,
		referrers,
	};
	let orderQuote = embeddedQuote(quote, expected);
	if (!orderQuote) {
		const full = await requestFullQuote(quote, refundAddress, destinationAddress, referrerAddresses, referrers, apiKey);
		orderQuote = decodeBlinkQuote(full.blinkQuote as Record<string, unknown>);
		const mismatch = orderMismatch(orderQuote, expected);
		if (mismatch) {
			throw new Error(mismatch);
		}
	}
	assertBlinkQuoteHash(orderQuote);
	assertDepositDeadline(orderQuote);
	const params = orderQuote.orderParams;
	await assertBlinkContractRegistered(params.srcChain, params.routerAddress, orderQuote.guardianSetIndex);
	const contracts = await getBlinkChainContracts(params.srcChain, orderQuote.guardianSetIndex);
	let swap = undefined;
	if (isBlinkSourceSwap(params) && quote.fromChain !== 'sui') {
		swap = await getBlinkSwapInstructions(orderQuote.quoteHash);
		await assertBlinkContractRegistered(params.srcChain, swap.routerAddress, orderQuote.guardianSetIndex);
	}
	return { quote: orderQuote, swap, contracts };
}
