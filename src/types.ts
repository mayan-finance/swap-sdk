import { Transaction } from '@solana/web3.js';

export type ChainName = 'solana'
	| 'ethereum' | 'bsc' | 'polygon' | 'avalanche' | 'aptos';

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
};

export type QuoteParams = {
	amount: number,
	fromToken: string,
	fromChain: ChainName,
	toToken: string,
	toChain: ChainName,
	slippage: number,
	customRelayerFees?: {
		swapRelayerFee: number,
		redeemRelayerFee: number,
		refundRelayerFee: number,
	}
}

export type QuoteError = {
	message: string,
	code: number,
}

export type Quote = {
	effectiveAmountIn: number;
	expectedAmountOut: number;
	priceImpact: number;
	minAmountOut: number;
	price: number;
	route: Array<{
		fromSymbol: string;
		toSymbol: string;
		protocol?: string | null;
	}>;
	swapRelayerFee: number,
	redeemRelayerFee: number,
	refundRelayerFee: number,
	fromToken: Token,
	toToken: Token,
	fromChain: string,
	toChain: string,
	mintDecimals: {
		from: number,
		to: number,
	}
};

export type SolanaTransactionSigner = (trx: Transaction) => Promise<Transaction>;
