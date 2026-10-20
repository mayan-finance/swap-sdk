import type { Referrer } from '../types';

export type BlinkOrderParams = {
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

export type BlinkQuote = {
	quoteHash: string;
	amountIn: string;
	amountOut: string;
	minAmountOut: string;
	slippageBps: number;
	routerAddress: string;
	orderParams: BlinkOrderParams;
	gasless: boolean;
	sponsorFees: boolean;
	gaslessRouterAddress?: string;
	sponsorAddress?: string;
	sponsorGasBudget?: bigint;
	fulfillEtaSecs?: number;
	directTransfer: boolean;
	depositDeadline: string;
	guardianSetIndex: number;
};

export type BlinkEvmSwap = {
	aggregator: string;
	swapCalldata: string;
	value: string;
};

export type BlinkSvmAccountMeta = {
	pubkey: string;
	isSigner: boolean;
	isWritable: boolean;
};

export type BlinkSvmInstruction = {
	programId: string;
	accounts: BlinkSvmAccountMeta[];
	data: string;
};

export type BlinkSvmLookupTable = {
	address: string;
	addresses: string[];
};

export type BlinkSvmSwap = {
	setup: BlinkSvmInstruction[];
	swap: BlinkSvmInstruction;
	cleanup: BlinkSvmInstruction[];
	lookupTables: BlinkSvmLookupTable[];
};

export type BlinkSwapInstructions = {
	routerAddress: string;
	srcToken: string;
	amountIn: string;
	bridgeToken: string;
	minBridgeOut: string;
	evm?: BlinkEvmSwap;
	svm?: BlinkSvmSwap;
};

export type BlinkChain = {
	chain: string;
	vm: string;
	rpcUrl?: string;
	router?: string;
	escrow?: string;
	treasury?: string;
	swapExecutor?: string;
	maxGasDrop: string;
	nativeSymbol: string;
	nativeDecimals: number;
	gasless: boolean;
};

export type BlinkGuardianSet = {
	index: number;
	members: string[];
	signatures: string[];
};

export type BlinkContractsResponse = {
	manifest: string;
	signatures: string[];
	guardianSets: BlinkGuardianSet[];
};

export type BlinkChainContracts = {
	router: string;
	escrow?: string;
	swapPrograms: string[];
};

export type BlinkContractManifest = {
	guardianSetIndex: number;
	chains: Record<string, BlinkChainContracts>;
};

export type BlinkSourceSwapStatus = {
	intent: string;
	status: string;
	openTx: string;
	swapTx?: string;
	expiresAt: string;
	reason?: string;
};

export type BlinkOrderDetail = {
	state?: string;
	srcTx?: string;
	dstTxHash?: string;
};

export type BlinkGaslessSubmission = {
	quoteHash: string;
	status: string;
	txHash?: string;
	error?: string;
};

export type BlinkEvmGaslessOrder = {
	owner: string;
	permit2Nonce: string;
	deadline: string;
	signature: string;
	permitSignature?: string;
};

export type BlinkGaslessOrderRequest =
	| { quoteHash: string; evm: BlinkEvmGaslessOrder }
	| { quoteHash: string; svm: { txBase64: string } }
	| { quoteHash: string; sui: { txBase64: string; signature: string } }
	| { quoteHash: string };

export type BlinkOrder = {
	quote: BlinkQuote;
	swap?: BlinkSwapInstructions;
	contracts: BlinkChainContracts;
};
