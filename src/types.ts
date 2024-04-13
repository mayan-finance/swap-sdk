import { Transaction, VersionedTransaction } from '@solana/web3.js';

export type ChainName = 'solana'
	| 'ethereum' | 'bsc' | 'polygon' | 'avalanche' | 'arbitrum' | 'optimism' | 'base' | 'aptos';

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
};

export type QuoteParams = {
	amount: number;
	fromToken: string;
	fromChain: ChainName;
	toToken: string;
	toChain: ChainName;
	//@deprecated
	slippage?: number;
	slippageBps: number;
	gasDrop?: number;
	referrer?: string;
	referrerBps?: number;
};

export type QuoteError = {
	message: string,
	code: number,
}

export type Quote = {
	type: 'WH' | 'SWIFT' | 'MCTP';
	effectiveAmountIn: number;
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
	clientRelayerFeeSuccess: number | null;
	clientRelayerFeeRefund: number | null;
	eta: number;
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

	referrerBps?: number;

	cheaperChain: ChainName;
	mctpInputContract: string;
	mctpOutputContract: string;
	hasAuction: boolean;
	minMiddleAmount?: number;
	evmSwapRouterAddress?: string;
	evmSwapRouterCalldata?: string;
	mctpMayanContract?: string;
};

export type QuoteOptions = {
	swift?: boolean;
	mctp?: boolean;
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

export type GetSolanaSwapParams = {
	amountIn: number,
	fromToken: string,
	minMiddleAmount: number,
	middleToken: string,
	userWallet: string,
	userLedger: string,
	slippageBps: number,
	depositMode: 'WITH_FEE' | 'LOCK_FEE' | 'SWAP',
}

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
}

export type ReferrerAddresses = {
	solana?: string | null,
	evm?: string | null,
}
