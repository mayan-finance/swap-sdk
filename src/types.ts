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

export type ChainName = 'solana'
	| 'ethereum' | 'bsc' | 'polygon' | 'avalanche' | 'arbitrum' | 'optimism' | 'base' | 'aptos' | 'sui';

export type TokenStandard = 'native' | 'erc20' | 'spl' | 'spl2022' | 'suicoin';

export type Token = {
	name: string,
	symbol: string,
	mint: string,
	contract: string,
	chainId: number,
	wChainId?: number,
	decimals: number,
	logoURI: string,
	coingeckoId: string,
	realOriginChainId?: number,
	realOriginContractAddress?: string,
	supportsPermit: boolean,
	verified: boolean;
	standard: TokenStandard,
	verifiedAddress: string,
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
};

export type QuoteError = {
	message: string,
	code: number,
	data: any,
}

export type Quote = {
	type: 'WH' | 'SWIFT' | 'MCTP' | 'SHUTTLE';
	/**
	 * @deprecated Use the new property `slippageBps` instead
	 */
	effectiveAmountIn: number;
	effectiveAmountIn64: string;
	expectedAmountOut: number;
	priceImpact: number;
	minAmountOut: number;
	minReceived: number;
	gasDrop: number;
	price: number;
	swapRelayerFee: number;
	redeemRelayerFee: number;
	refundRelayerFee: number;
	solanaRelayerFee: number;
	refundRelayerFee64: string;
	cancelRelayerFee64: string;
	submitRelayerFee64: string;
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
	mintDecimals: {
		from: number;
		to: number;
	};
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
	mctpOutputContract: string;
	hasAuction: boolean;
	minMiddleAmount?: number;
	evmSwapRouterAddress?: string;
	evmSwapRouterCalldata?: string;
	mctpMayanContract?: string;
	swiftMayanContract?: string;
	shuttleContract?: string;
	swiftAuctionMode?: number;
	swiftInputContract: string;
	swiftInputDecimals: number;
	gasless: boolean;
	relayer: string;
	sendTransactionCost: number;
	maxUserGasDrop: number;
	rentCost?: bigint;
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
};

export type QuoteOptions = {
	wormhole?: boolean;
	swift?: boolean;
	mctp?: boolean;
	shuttle?: boolean;
	gasless?: boolean;
	onlyDirect?: boolean;
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
	slippageBps: number,
	referrerAddress?: string,
	fillMaxAccounts?: boolean,
	tpmTokenAccount?: string,
}

type MctpGetSolanaSwapParams = BaseGetSolanaSwapParams & {
	userLedger: string,
	depositMode: 'WITH_FEE' | 'LOCK_FEE' | 'SWAP',
}

type SwiftGetSolanaSwapParams = BaseGetSolanaSwapParams & {
	orderHash: string,
	depositMode: 'SWIFT' | 'SWIFT_GASLESS',
}

export type GetSolanaSwapParams = MctpGetSolanaSwapParams | SwiftGetSolanaSwapParams;

type BaseGetSuiSwapParams = {
	amountIn64: string,
	inputCoinType: string,
	middleCoinType: string,
	userWallet: string,
	referrerAddress?: string,
	inputCoin: SuiFunctionParameter,
	transaction: string,
}

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
	builtTransaction?: SuiTransaction;
	inputCoin?: SuiFunctionParameter;
	whFeeCoin?: SuiFunctionParameter;
};

export type SwapMessageV0Params = {
	messageV0: Omit<CompileV0Args, 'recentBlockhash'>,
	createTmpTokenAccountIxs: SolanaTransactionInstruction[],
	tmpTokenAccount: SolanaKeypair,
}
