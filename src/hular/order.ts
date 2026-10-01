import { SystemProgram } from '@solana/web3.js';
import { parseUnits, ZeroAddress } from 'ethers';
import { getHularChains, getHularOrder, getHularSwapInstructions } from '../api';
import type { ChainName, ChainReferrers, Quote, Referrer, ReferrerAddresses, Token } from '../types';
import { getGasDecimal, getHularReferrers } from '../utils';
import { decodeHularChains, decodeHularQuote, decodeHularSwapInstructions } from './decode';
import { assertHularQuoteHash, HULAR_SUPPORTED_PARAMS_VERSION } from './hash';
import type { HularOrder, HularOrderParams, HularQuote, HularQuoteRequest, HularSwapInstructions } from './types';

function getHularTokenAddress(chain: ChainName, token: Token): string {
	if (chain === 'solana' && token.contract === ZeroAddress) {
		return SystemProgram.programId.toBase58();
	}
	return token.contract;
}

export function isHularSourceSwap(params: HularOrderParams): boolean {
	return params.srcToken !== params.bridgeTokenSrc;
}

function assertDepositDeadline(quote: HularQuote): void {
	if (!quote.depositDeadline) {
		return;
	}
	const deadline = new Date(quote.depositDeadline).getTime();
	if (!Number.isNaN(deadline) && deadline <= Date.now()) {
		throw new Error('Hular quote deposit deadline passed, request a new quote');
	}
}

type OrderExpectation = {
	srcChain: string;
	dstChain: string;
	amountIn: bigint;
	recipient: string;
	refundAddress: string;
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

function assertOrderMatches(quote: HularQuote, expected: OrderExpectation): void {
	const params = quote.orderParams;
	if (params.srcChain !== expected.srcChain || params.dstChain !== expected.dstChain) {
		throw new Error('Hular order chains do not match the quote');
	}
	if (BigInt(params.amountIn) !== expected.amountIn) {
		throw new Error('Hular order amount does not match the quote');
	}
	if (!sameAddress(params.recipient, expected.recipient)) {
		throw new Error('Hular order recipient does not match the destination address');
	}
	if (!sameAddress(params.refundAddress, expected.refundAddress)) {
		throw new Error('Hular order refund address does not match');
	}
	if (expected.minAmountOut !== undefined && BigInt(params.minAmountOut) < expected.minAmountOut) {
		throw new Error('Hular order minimum output is below the quoted minimum, request a new quote');
	}
	if (!sameReferrers(params.referrers, expected.referrers)) {
		throw new Error('Hular order referrers do not match the requested referrers');
	}
}

export async function fetchHularOrder(
	quote: Quote,
	refundAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	apiKey?: string
): Promise<HularOrder> {
	if (quote.type !== 'HULAR') {
		throw new Error('Quote type is not HULAR');
	}
	if (quote.fromChain === quote.toChain) {
		throw new Error('Hular same-chain swaps are not supported');
	}
	if (destinationAddress === ZeroAddress || destinationAddress === SystemProgram.programId.toBase58()) {
		throw new Error(`Invalid destination address: ${destinationAddress}`);
	}
	if (refundAddress === ZeroAddress || refundAddress === SystemProgram.programId.toBase58()) {
		throw new Error(`Invalid refund address: ${refundAddress}`);
	}
	const referrers = getHularReferrers(quote, referrerAddresses);
	const gasDropDecimals = getGasDecimal(quote.toChain);
	const request: HularQuoteRequest = {
		srcChain: quote.fromChain,
		dstChain: quote.toChain,
		srcToken: getHularTokenAddress(quote.fromChain, quote.fromToken),
		dstToken: getHularTokenAddress(quote.toChain, quote.toToken),
		amount: quote.effectiveAmountIn64,
		recipient: destinationAddress,
		refundAddress,
		slippageBps: quote.slippageBps,
		referrers,
		gasDrop: parseUnits((quote.gasDrop || 0).toFixed(gasDropDecimals), gasDropDecimals).toString(),
		tradeType: 'TRADE_TYPE_EXACT_INPUT',
		supportedParamsVersion: HULAR_SUPPORTED_PARAMS_VERSION,
	};
	const [quoteJson, chainsJson] = await Promise.all([
		getHularOrder(request, apiKey),
		getHularChains(apiKey),
	]);
	const orderQuote = decodeHularQuote(quoteJson);
	assertHularQuoteHash(orderQuote);
	assertDepositDeadline(orderQuote);
	const chain = decodeHularChains(chainsJson).find((c) => c.chain === quote.fromChain);
	if (!chain) {
		throw new Error('Hular chain not found: ' + quote.fromChain);
	}
	assertOrderMatches(orderQuote, {
		srcChain: quote.fromChain,
		dstChain: quote.toChain,
		amountIn: BigInt(quote.effectiveAmountIn64),
		recipient: destinationAddress,
		refundAddress,
		minAmountOut: quote.minReceivedBaseUnits ? BigInt(quote.minReceivedBaseUnits) : undefined,
		referrers,
	});
	let swap: HularSwapInstructions | undefined;
	if (isHularSourceSwap(orderQuote.orderParams)) {
		swap = decodeHularSwapInstructions(await getHularSwapInstructions(orderQuote.quoteHash, apiKey));
	}
	return { quote: orderQuote, swap, chain };
}
