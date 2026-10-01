import type { Referrer } from '../types';

export type HularQuoteRequest = {
	srcChain: string;
	dstChain: string;
	srcToken: string;
	dstToken: string;
	amount: string;
	recipient: string;
	refundAddress: string;
	slippageBps: number;
	referrers: Referrer[];
	gasDrop: string;
	tradeType: 'TRADE_TYPE_EXACT_INPUT';
	supportedParamsVersion: number;
};

export type HularOrderParams = {
	srcChain: string;
	dstChain: string;
	srcToken: string;
	dstToken: string;
	bridgeTokenSrc: string;
	bridgeTokenDst: string;
	amountIn: string;
	amountOut: string;
	bridgeAmount: string;
	minBridgeOut: string;
	minAmountOut: string;
	gasDrop: string;
	recipient: string;
	refundAddress: string;
	refundToken: string;
	referrers: Referrer[];
	slippageBps: number;
	srcSlippageBps: number;
	routerAddress: string;
	refundFeeBridge: string;
	refundFeeNative: string;
	nonce: Uint8Array;
	paramsVersion: number;
};

export type HularQuote = {
	quoteHash: string;
	amountIn: string;
	amountOut: string;
	minAmountOut: string;
	slippageBps: number;
	routerAddress: string;
	orderParams: HularOrderParams;
	directTransfer: boolean;
	depositDeadline: string;
};

export type HularEvmSwap = {
	aggregator: string;
	swapCalldata: string;
	value: string;
};

export type HularSvmAccountMeta = {
	pubkey: string;
	isSigner: boolean;
	isWritable: boolean;
};

export type HularSvmInstruction = {
	programId: string;
	accounts: HularSvmAccountMeta[];
	data: string;
};

export type HularSvmLookupTable = {
	address: string;
	addresses: string[];
};

export type HularSvmSwap = {
	setup: HularSvmInstruction[];
	swap: HularSvmInstruction;
	cleanup: HularSvmInstruction[];
	lookupTables: HularSvmLookupTable[];
	allowedSwapPrograms: string[];
	swapProgramsSignature: string;
};

export type HularSwapInstructions = {
	routerAddress: string;
	srcToken: string;
	amountIn: string;
	bridgeToken: string;
	minBridgeOut: string;
	evm?: HularEvmSwap;
	svm?: HularSvmSwap;
};

export type HularChain = {
	chain: string;
	router: string;
	treasury: string;
	escrow: string;
};

export type HularOrder = {
	quote: HularQuote;
	swap?: HularSwapInstructions;
	chain: HularChain;
};
