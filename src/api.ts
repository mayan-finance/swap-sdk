import fetch from 'cross-fetch';
import { Token, ChainName, QuoteParams, Quote, QuoteError } from './types';
import addresses from './addresses';
import { checkSdkVersionSupport } from './utils';

export async function fetchAllTokenList(): Promise<{[index: string]: Token[]}> {
	const res = await fetch(`${addresses.PRICE_URL}/tokens`, {
		method: 'GET',
		redirect: 'follow',
	});
	if (res.status === 200) {
		const result = await res.json();
		return result as { [index: string]: Token[] };
	}
	throw new Error('Cannot fetch Mayan tokens!');
}

export async function fetchTokenList(chain: ChainName): Promise<Token[]> {
	const res = await fetch(`${addresses.PRICE_URL}/tokens?chain=${chain}`);
	if (res.status === 200) {
		const result = await res.json();
		return result[chain] as Token[];
	}
	throw new Error('Cannot fetch Mayan tokens!');
}

export async function fetchQuote(params: QuoteParams): Promise<Quote> {
	const { withReferrer, gasDrop } = params;
	const normalizedSlippage = params.slippage / 100;
	const baseUrl = `${addresses.PRICE_URL}/quote?`;
	const basicQueries = `amountIn=${params.amount}&fromToken=${params.fromToken}&fromChain=${params.fromChain}&toToken=${params.toToken}&toChain=${params.toChain}`;
	const criteriaQueries = `&slippage=${normalizedSlippage}&withReferrer=${!!withReferrer}${gasDrop ? `&gasDrop=${gasDrop}` : ''}`;
	const url = baseUrl + basicQueries + criteriaQueries;
	const res = await fetch(url, {
		method: 'GET',
		redirect: 'follow',
	});
	const result = await res.json();
	if (res.status !== 200) {
		throw {
			code: result?.code || 0,
			message: result?.msg || 'Route not found',
		} as QuoteError
	}
	if (!checkSdkVersionSupport(result.minimumSdkVersion)) {
		throw {
			code: 9999,
			message: 'Swap SDK is outdated!',
		} as QuoteError
	}
	return result;
}

export async function getCurrentSolanaTime(): Promise<number> {
	const res = await fetch(`${addresses.PRICE_URL}/clock/solana`, {
		method: 'GET',
		redirect: 'follow',
	});
	const result = await res.json();
	if (res.status !== 200) {
		throw result;
	}
	return result.clock;
}
