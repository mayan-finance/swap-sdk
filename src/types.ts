import {
	CompileV0Args,
	Transaction,
	VersionedTransaction,
	TransactionInstruction as SolanaTransactionInstruction,
	Keypair as SolanaKeypair,
} from '@solana/web3.js';
import {
	Transaction as SuiTransaction,
	TransactionResult as SuiTransactionResult,
} from '@mysten/sui/transactions';
import { Buffer } from 'buffer';

export type ChainName = 'solana'
	| 'ethereum' | 'bsc' | 'polygon' | 'avalanche' | 'arbitrum' | 'optimism' |
	'base' | 'aptos' | 'sui' | 'unichain' | 'linea' | 'hypercore' | 'sonic' | 'hyperevm' | 'fogo' |  'ton' | 'monad';

export type TokenStandard = 'native' | 'erc20' | 'spl' | 'spl2022' | 'suicoin' | 'hypertoken';

export type Token = {
	name: string,
	symbol: string,
	mint: string,
	contract: string,
	chainId: number,
	wChainId: number,
	decimals: number,
	logoURI: string,
	coingeckoId: string,
	realOriginChainId?: number,
	realOriginContractAddress?: string,
	supportsPermit?: boolean,
	verified: boolean;
	standard: TokenStandard,
	verifiedAddress?: string,
	currencyId?: string,
};

export type QuoteParams = {
	/**
	 * @deprecated to avoid precision issues, use {@link amountIn64} instead
	 */
	amount?: number;
	amountIn64?: string;
	fromToken: string;
	fromChain: ChainName;
	toToken: string;
	toChain: ChainName;
	/**
	 * @deprecated Use the new property {@link slippageBps} instead
	 */
	slippage?: number;
	/**
	 * Slippage in basis points.
	 * One basis point (bps) = 0.01%.
	 *
	 * - A value of `50` means a slippage of 0.5%.
	 * - A value of `100` means a slippage of 1%.
	 * - If set to `'auto'`, the system will automatically determine slippage.
	 *
	 * @example
	 * slippageBps: 50 // 0.5% slippage
	 */
	slippageBps: 'auto' | number;
	gasDrop?: number;
	referrer?: string;
	referrerBps?: number;
	destinationAddress?: string;
	refundAddress?: string;
	/**
	 * The wallet that signs the swap. Blink binds a Solana source swap to it, and uses it as the
	 * refund address when {@link refundAddress} is not given.
	 */
	swapperAddress?: string;
};

export type QuoteError = {
	message: string,
	code: number,
	data: any,
}

export type QuoteType = 'WH' | 'SWIFT' | 'MCTP' | 'SHUTTLE' | 'FAST_MCTP' | 'MONO_CHAIN' | 'BLINK';
export type Quote = {
	type: QuoteType;
	/**
	 * @deprecated Use the new property {@link effectiveAmountIn64} instead
	 */
	effectiveAmountIn: number;
	effectiveAmountIn64: string;
	expectedAmountOut: number;
	priceImpact?: number | null;
	minAmountOut: number;
	minReceived: number;
	gasDrop: number;
	price: number;
	swapRelayerFee: number;
	redeemRelayerFee: number;
	refundRelayerFee: number;
	solanaRelayerFee: number;
	swapRelayerFee64?: string | null;
	redeemRelayerFee64?: string | null;
	refundRelayerFee64?: string | null;
	cancelRelayerFee64: string | null;
	submitRelayerFee64: string | null;
	solanaRelayerFee64: string;
	clientRelayerFeeSuccess: number | null;
	clientRelayerFeeRefund: number | null;
	eta: number;
	etaSeconds: number;
	clientEta: string;
	fromToken: Token;
	toToken: Token;
	fromChain: ChainName;
	toChain: ChainName;
	slippageBps: number;
	priceStat: {
		ratio: number;
		status: 'GOOD' | 'NORMAL' | 'BAD';
	}
	mintDecimals?: {
		from: number;
		to: number;
	} | null;
	bridgeFee: number;
	suggestedPriorityFee: number;
	meta: {
		icon: string;
		title: string;
		advertisedTitle: string;
		advertisedDescription: string;
		switchText: string;
	};
	onlyBridging: boolean;
	deadline64: string;
	referrerBps?: number;
	protocolBps?: number;
	whMayanContract: string;
	cheaperChain: ChainName;
	mctpInputContract: string;
	hasAuction: boolean;
	minMiddleAmount?: number;
	evmSwapRouterAddress?: string; // only for mono-chain
	evmSwapRouterCalldata?: string; // only for mono-chain
	mctpMayanContract?: string;
	swiftMayanContract?: string;
	shuttleContract?: string;
	swiftAuctionMode?: number;
	swiftInputContract: string;
	swiftInputDecimals: number;
	swiftWrapAndLock: boolean;
	gasless: boolean;
	relayer: string;
	sendTransactionCost: number;
	maxUserGasDrop: number;
	rentCost?: string;
	shuttleParams : {
		maxLLFee: string;
		maxRelayingFee: string;
		fastTransferDeadline: number;
		hasDestSwap: boolean
		path: string;
	}
	shuttleInputContract: string;
	shuttleInputDecimals: number;
	mctpVerifiedInputAddress: string;
	mctpInputTreasury: string;
	circleMaxFee64: string;
	fastMctpMayanContract: string;
	fastMctpInputContract: string;
	fastMctpInputCurrencyId?: string;
	fastMctpMinFinality: number;
	hcSwiftDeposit?: {
		relayerFee64: string;
	};
	hcSwiftWithdraw?: {
		gasLimit: number;
		relayerFee64: string;
		maxFee64: string;
		minFinalityThreshold: number;
	};
	monoChainMayanContract: string;
	swiftInputContractStandard: TokenStandard;
	swiftVerifiedInputAddress: string;
	swiftVersion: 'V1' | 'V2';
	quoteId: string;
	expectedAmountOutBaseUnits: string;
	minReceivedBaseUnits: string;
	memoHex?: string;
	maxSwapAccounts?: number,
	maxSwapDataLength?: number,
	mpsDepositAddress?: string,
	mpsUserId?: string,
	mpsIntegratorId?: string,
	mixedRefAddress?: string,
	/**
	 * Blink order bound to `destinationAddress` and the refund address, embedded only when
	 * {@link fetchQuote} got `destinationAddress` and `swapperAddress` or `refundAddress`. A BLINK
	 * quote without it is a price preview and cannot be swapped.
	 */
	blinkQuote?: BlinkQuoteJson,
	blinkInputContract?: string;
	blinkInputContractStandard?: TokenStandard;
};

export type QuoteOptions = {
	wormhole?: boolean;
	swift?: boolean;
	mctp?: boolean;
	shuttle?: boolean;
	fastMctp?: boolean;
	gasless?: boolean;
	onlyDirect?: boolean;
	fullList?: boolean;
	guaranteedOutput?: boolean;
	payload?: string;
	monoChain?: boolean;
	blink?: boolean;
	apiKey?: string;
	memoHex?: string,
	extraInstructions?: {
		instructions: InstructionInfo[],
		lookupTables?: string[],
	},
	solanaBridgeOptions?: Omit<SolanaBridgeOptions, 'apiKey' | 'separateSwapTx' | 'usdcPermitSignature' | 'allowSwapperOffCurve'>,
	mpsDeposit?: boolean,
	mpsUserId?: string,
	referrers?: ChainReferrers,
};

export type SolanaTransactionSigner = {
	(trx: Transaction): Promise<Transaction>;
	(trx: VersionedTransaction): Promise<VersionedTransaction>;
};

export type Erc20Permit = {
	value: bigint,
	deadline: number,
	v: number,
	r: string,
	s: string,
}

type BaseGetSolanaSwapParams = {
	amountIn64: string,
	fromToken: string,
	minMiddleAmount: number,
	middleToken: string,
	userWallet: string,
	destinationWallet: string,
	slippageBps: number,
	referrerAddress?: string | null,
	fillMaxAccounts?: boolean,
	tpmTokenAccount?: string | null,
	chainName: ChainName,
	maxSwapAccounts?: number,
	maxSwapDataLength?: number,
	apiKey?: string,
}

type MctpGetSolanaSwapParams = BaseGetSolanaSwapParams & {
	userLedger: string,
	depositMode: 'WITH_FEE' | 'LOCK_FEE' | 'SWAP',
}

type SwiftGetSolanaSwapParams = BaseGetSolanaSwapParams & {
	depositMode: 'SWIFT' | 'SWIFT_GASLESS',
	userLedger: string,
}

type HCDepositUSDCGetSolanaSwapParams = BaseGetSolanaSwapParams & {
	tpmTokenAccount: string,
	depositMode: 'HC_USDC',
	userLedger: string,
	quoteType: 'MCTP' | 'FAST_MCTP'
}

type MonoChainGetSolanaSwapParams = Omit<
	BaseGetSolanaSwapParams,
	'minMiddleAmount' | 'fillMaxAccounts' | 'tpmTokenAccount'
> & {
	destinationWallet: string;
	expectedAmountOut64: string;
	depositMode: 'MONO_CHAIN';
	referrerBps: number;
};

type FastMctpGetSolanaSwapParams = BaseGetSolanaSwapParams & {
	userLedger: string,
	depositMode: 'FAST_MCTP_BRIDGE' | 'FAST_MCTP_ORDER',
}

export type GetSolanaSwapParams =
	MctpGetSolanaSwapParams |
	SwiftGetSolanaSwapParams |
	HCDepositUSDCGetSolanaSwapParams |
	MonoChainGetSolanaSwapParams |
	FastMctpGetSolanaSwapParams;

type BaseGetSuiSwapParams = {
	amountIn64: string,
	inputCoinType: string,
	middleCoinType: string,
	userWallet: string,
	destinationWallet: string,
	referrerAddress?: string | null,
	inputCoin?: SuiFunctionParameter | null,
	transaction?: string | null,
	chainName: ChainName,
	slippageBps: number,
	apiKey?: string,
}

type BaseGetEvmSwapParams = {
	forwarderAddress: string,
	chainName: ChainName,
	amountIn64: string,
	fromToken: string
	middleToken: string,
	referrerAddress?: string | null,
	slippageBps: number,
	apiKey?: string,
	userWallet: string,
	destinationWallet: string,
}

export type GetEvmSwapParams = BaseGetEvmSwapParams;

type MctpGetSuiSwapParams = BaseGetSuiSwapParams & {
	withWhFee: boolean
}

export type GetSuiSwapParams = MctpGetSuiSwapParams;

export type SolanaKeyInfo = {
	pubkey: string,
	isWritable: boolean,
	isSigner: boolean,
}
export type InstructionInfo = {
	accounts: SolanaKeyInfo[],
	data: string,
	programId: string,
}

export type SolanaClientSwap = {
	computeBudgetInstructions?: InstructionInfo[],
	setupInstructions?: InstructionInfo[],
	swapInstruction: InstructionInfo,
	cleanupInstruction: InstructionInfo,
	addressLookupTableAddresses: string[],
	maxAccountsFilled: boolean,
}

export type SuiFunctionNestedResult = {
	$kind: 'NestedResult';
	NestedResult: [number, number];
};

export type SuiFunctionParameter =
 {
	result:
		| SuiTransactionResult
		| SuiFunctionNestedResult
		| { $kind: 'Input'; Input: number; type?: 'object' };
	objectId?: undefined | null;
}
	| {
	result?: undefined | null;
	objectId: string;
};

export type SuiClientSwap = {
	tx: string,
	outCoin: SuiTransactionResult,
	whFeeCoin?: SuiTransactionResult | SuiFunctionNestedResult,
}

export type ReferrerAddresses = {
	solana?: string | null,
	evm?: string | null,
	sui?: string | null,
}

export type Referrer = {
	address: string,
	bps: number,
}

export type ChainReferrers = {
	solana?: Referrer[] | null,
	evm?: Referrer[] | null,
	sui?: Referrer[] | null,
}

export type SwiftEvmOrderTypedData = {
	domain: {
		name: "Mayan Swift",
		chainId: number,
		verifyingContract: string,
	},
	types: {
		CreateOrder: [
			{ name: 'OrderId', type: 'bytes32' },
			{ name: 'InputAmount', type: 'uint256' },
			{ name: 'SubmissionFee', type: 'uint256' },
		],
	},
	value: {
		OrderId: string,
		InputAmount: bigint,
		SubmissionFee: bigint,
	}
}

export type EvmForwarderParams = {
	method: string,
	params: any[],
}

export type JitoBundleOptions = {
	tipLamports: number,
	signAllTransactions: <T extends Transaction | VersionedTransaction>(transactions: T[]) => Promise<T[]>
	jitoAccount?: string,
	jitoSendUrl?: string,
	separateSwapTx?: boolean,
}

export type ComposableSuiMoveCallsOptions = {
	builtTransaction?: SuiTransaction | null;
	inputCoin?: SuiFunctionParameter | null;
	whFeeCoin?: SuiFunctionParameter | null;
	usdcPermitSignature?: string | null;
	apiKey?: string;
	blinkOrder?: BlinkOrder | null;
	refundAddress?: string | null;
};

export type SwapMessageV0Params = {
	messageV0: Omit<CompileV0Args, 'recentBlockhash'>,
	createTmpTokenAccountIxs: SolanaTransactionInstruction[],
	tmpTokenAccount: SolanaKeypair,
}

export type PermitDomain = {
	name: string;
	version: string;
	verifyingContract: string;
	chainId?: number;
	salt?: string;
};

export type PermitValue = {
	owner: string;
	spender: string;
	value: string;
	nonce: string;
	deadline: string;
}

export type SolanaBridgeOptions = {
	allowSwapperOffCurve?: boolean,
	forceSkipCctpInstructions?: boolean,
	separateSwapTx?: boolean,
	skipProxyMayanInstructions?: boolean;
	customPayload?: Buffer | Uint8Array | null;
	apiKey?: string;
	refundAddress?: string | null;
	swiftRefundAddress?: string | null;
}

export type EstimateGasEvmParams = {
	from: string;
	tokenIn: string;
	value: string;
	to: string;
	data: string;
	chainId: number;
}

export type HyperCoreWithdrawCircleTypedData = {
	domain: {
		name: 'HyperliquidSignTransaction',
		version: '1',
		chainId: 42161,
		verifyingContract: '0x0000000000000000000000000000000000000000',
	},
	types: {
		'HyperliquidTransaction:SendToEvmWithData': [
			{ name: 'hyperliquidChain', type: 'string' },
			{ name: 'token', type: 'string' },
			{ name: 'amount', type: 'string' },
			{ name: 'sourceDex', type: 'string' },
			{ name: 'destinationRecipient', type: 'string' },
			{ name: 'addressEncoding', type: 'string' },
			{ name: 'destinationChainId', type: 'uint32' },
			{ name: 'gasLimit', type: 'uint64' },
			{ name: 'data', type: 'bytes' },
			{ name: 'nonce', type: 'uint64' },
		],
	},
	value: {
		hyperliquidChain: 'Mainnet',
		token: 'USDC',
		amount: string,
		sourceDex: string,
		destinationRecipient: string,
		addressEncoding: 'hex',
		destinationChainId: number,
		gasLimit: number,
		data: string,
		nonce: number,
	}
}

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

export type BlinkSvmLookupTable = {
	address: string;
	addresses: string[];
};

export type BlinkSvmSwap = {
	setup: InstructionInfo[];
	swap: InstructionInfo;
	cleanup: InstructionInfo[];
	lookupTables: BlinkSvmLookupTable[];
	/** lamports the depositor lends the swap authority for rent the route pays; deposit_swap returns the unspent part */
	swapAuthorityLamports: string;
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
	| { quoteHash: string; sui: { txBase64: string; signature: string } };

export type BlinkOrder = {
	quote: BlinkQuote;
	swap?: BlinkSwapInstructions;
	contracts: BlinkChainContracts;
};

// Proto JSON (lowerCamelCase, as Mayan's quote API embeds it in `Quote.blinkQuote`) of Blink's
// `QuoteResponse`. Fields at their proto default (0, false, "", empty list) are omitted, and
// 64-bit integers are decimal strings. `decodeBlinkQuote` turns this into a `BlinkQuote`.

export type BlinkReferrerJson = {
	address?: string;
	bps?: number;
};

/** The fields the quote hash commits to; see `encodeBlinkOrderParams`. */
export type BlinkOrderParamsJson = {
	srcChain?: string;
	dstChain?: string;
	srcToken?: string;
	dstToken?: string;
	lockToken?: string;
	expectedAmountIn?: string;
	expectedAmountOut?: string;
	expectedLockAmount?: string;
	minLockAmount?: string;
	minAmountOut?: string;
	gasDrop?: string;
	recipient?: string;
	refundAddress?: string;
	referrers?: BlinkReferrerJson[];
	routerAddress?: string;
	refundFeeBridge?: string;
	/** base64 */
	random?: string;
	paramsVersion?: number;
};

export type BlinkFeeComponentJson = {
	name?: string;
	side?: string;
	usdMicros?: string;
	native?: string;
};

export type BlinkFeeBreakdownJson = {
	components?: BlinkFeeComponentJson[];
	dstTotalUsdMicros?: string;
	srcTotalUsdMicros?: string;
	dstGasNative?: string;
	srcGasNative?: string;
};

export type BlinkCrossChainQuoteJson = {
	quoteHash?: string;
	amountIn?: string;
	amountOut?: string;
	minAmountOut?: string;
	amountInUsdMicros?: string;
	amountOutUsdMicros?: string;
	slippageBps?: number;
	feeBreakdown?: BlinkFeeBreakdownJson;
	routerAddress?: string;
	orderParams?: BlinkOrderParamsJson;
	gasless?: boolean;
	sponsorFees?: boolean;
	gaslessRouterAddress?: string;
	sponsorAddress?: string;
	fulfillEtaSecs?: string;
	directTransfer?: boolean;
	/** RFC 3339 */
	expiresAt?: string;
	sponsorGasBudget?: string;
	guardianSetIndex?: number;
	isGuaranteed?: boolean;
	sponsorGasMax?: string;
};

export type BlinkSameChainSwapQuoteJson = {
	quoteHash?: string;
	amountIn?: string;
	amountOut?: string;
	minAmountOut?: string;
	amountInUsdMicros?: string;
	amountOutUsdMicros?: string;
	slippageBps?: number;
	feeBreakdown?: BlinkFeeBreakdownJson;
	routerAddress?: string;
	orderParams?: BlinkOrderParamsJson;
	fulfillEtaSecs?: string;
	/** RFC 3339 */
	expiresAt?: string;
	guardianSetIndex?: number;
};

/** Exactly one of the two variants is set. */
export type BlinkQuoteJson = {
	crossChain?: BlinkCrossChainQuoteJson;
	sameChainSwap?: BlinkSameChainSwapQuoteJson;
};
