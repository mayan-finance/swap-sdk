import { create, fromJson, toJson } from '@bufbuild/protobuf';
import {
	assertOrderMatches,
	ChainsResponseSchema,
	decodeCrossChainQuote,
	isSourceSwap,
	QuoteRequestSchema,
	SUPPORTED_PARAMS_VERSION,
	SwapInstructionsSchema,
	TradeType,
	type HularOrder,
	type SwapInstructions,
} from '@mayanfinance/hular-sdk';
import { SystemProgram } from '@solana/web3.js';
import { parseUnits, ZeroAddress } from 'ethers';
import { getHularChains, getHularOrder, getHularSwapInstructions } from '../api';
import type { ChainName, ChainReferrers, Quote, ReferrerAddresses, Token } from '../types';
import { getGasDecimal, getHularReferrers } from '../utils';

function getHularTokenAddress(chain: ChainName, token: Token): string {
	if (chain === 'solana' && token.contract === ZeroAddress) {
		return SystemProgram.programId.toBase58();
	}
	return token.contract;
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
	const request = create(QuoteRequestSchema, {
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
		gasless: false,
		sponsorFees: false,
		tradeType: TradeType.EXACT_INPUT,
		supportedParamsVersion: SUPPORTED_PARAMS_VERSION,
	});
	const [quoteJson, chainsJson] = await Promise.all([
		getHularOrder(toJson(QuoteRequestSchema, request), apiKey),
		getHularChains(apiKey),
	]);
	const orderQuote = decodeCrossChainQuote(quoteJson);
	const chain = fromJson(ChainsResponseSchema, chainsJson).chains.find((c) => c.chain === quote.fromChain);
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
	const params = orderQuote.orderParams!;
	let swap: SwapInstructions | undefined;
	if (isSourceSwap(params)) {
		swap = fromJson(SwapInstructionsSchema, await getHularSwapInstructions(orderQuote.quoteHash, apiKey));
	}
	return { quote: orderQuote, swap, chain };
}
