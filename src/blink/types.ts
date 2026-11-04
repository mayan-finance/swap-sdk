import type { Referrer } from '../types';

export type BlinkOrderParams = {
	srcChain: string;
	dstChain: string;
	srcToken: string;
	dstToken: string;
	lockToken: string;
	expectedAmountIn: string;
	expectedAmountOut: string;
	expectedLockAmount: string;
	minLockAmount: string;
	minAmountOut: string;
	gasDrop: string;
	recipient: string;
	refundAddress: string;
	referrers: Referrer[];
	routerAddress: string;
	refundFeeBridge: string;
	random: Uint8Array;
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
	expiresAt: string;
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
	lockToken: string;
	minLockAmount: string;
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

// Proto JSON (snake_case, as Mayan's quote API embeds it in `Quote.blinkQuote`) of Blink's
// `QuoteResponse`. Fields at their proto default (0, false, "", empty list) are omitted, and
// 64-bit integers are decimal strings. `decodeBlinkQuote` turns this into a `BlinkQuote`.

export type BlinkReferrerJson = {
	address?: string;
	bps?: number;
};

/** The fields the quote hash commits to; see `encodeBlinkOrderParams`. */
export type BlinkOrderParamsJson = {
	src_chain?: string;
	dst_chain?: string;
	src_token?: string;
	dst_token?: string;
	lock_token?: string;
	expected_amount_in?: string;
	expected_amount_out?: string;
	expected_lock_amount?: string;
	min_lock_amount?: string;
	min_amount_out?: string;
	gas_drop?: string;
	recipient?: string;
	refund_address?: string;
	referrers?: BlinkReferrerJson[];
	router_address?: string;
	refund_fee_bridge?: string;
	/** base64 */
	random?: string;
	params_version?: number;
};

export type BlinkFeeComponentJson = {
	name?: string;
	side?: string;
	usd_micros?: string;
	native?: string;
};

export type BlinkFeeBreakdownJson = {
	components?: BlinkFeeComponentJson[];
	dst_total_usd_micros?: string;
	src_total_usd_micros?: string;
	dst_gas_native?: string;
	src_gas_native?: string;
};

export type BlinkCrossChainQuoteJson = {
	quote_hash?: string;
	amount_in?: string;
	amount_out?: string;
	min_amount_out?: string;
	amount_in_usd_micros?: string;
	amount_out_usd_micros?: string;
	slippage_bps?: number;
	fee_breakdown?: BlinkFeeBreakdownJson;
	router_address?: string;
	order_params?: BlinkOrderParamsJson;
	gasless?: boolean;
	sponsor_fees?: boolean;
	gasless_router_address?: string;
	sponsor_address?: string;
	fulfill_eta_secs?: string;
	direct_transfer?: boolean;
	/** RFC 3339 */
	expires_at?: string;
	sponsor_gas_budget?: string;
	guardian_set_index?: number;
	is_guaranteed?: boolean;
	sponsor_gas_max?: string;
};

export type BlinkSameChainSwapQuoteJson = {
	quote_hash?: string;
	amount_in?: string;
	amount_out?: string;
	min_amount_out?: string;
	amount_in_usd_micros?: string;
	amount_out_usd_micros?: string;
	slippage_bps?: number;
	fee_breakdown?: BlinkFeeBreakdownJson;
	router_address?: string;
	order_params?: BlinkOrderParamsJson;
	fulfill_eta_secs?: string;
	/** RFC 3339 */
	expires_at?: string;
	guardian_set_index?: number;
};

/** Exactly one of the two variants is set. */
export type BlinkQuoteJson = {
	cross_chain?: BlinkCrossChainQuoteJson;
	same_chain_swap?: BlinkSameChainSwapQuoteJson;
};
