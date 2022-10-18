import fetch from 'cross-fetch';
import { Token, ChainName, QuoteParams, Quote, QuoteError } from './types';

const addresses = require('./addresses.json');

export async function fetchAllTokenList(): Promise<{[index: string]: Token[]}> {
	const res = await fetch(`${addresses.EXPLORER_URL}/tokens`);
	if (res.status === 200) {
		const result = await res.json();
		return result as { [index: string]: Token[] };
	}
	throw new Error('Cannot fetch Mayan tokens!');
}

export async function fetchTokenList(chain: ChainName): Promise<Token[]> {
	const res = await fetch(`${addresses.EXPLORER_URL}/tokens?chain=${chain}`);
	if (res.status === 200) {
		const result = await res.json();
		return result[chain] as Token[];
	}
	throw new Error('Cannot fetch Mayan tokens!');
}

export async function fetchQuote(params: QuoteParams): Promise<Quote> {
	const normalizedSlippage = params.slippage / 100;
	const baseUrl = `${process.env.REACT_APP_MAYAN_PRICE_URL}/quote?`;
	const basicQueries = `amountIn=${params.amount}&fromToken=${params.fromToken}&fromChain=${params.fromChain}&toToken=${params.toToken}&toChain=${params.toChain}`;
	const criteriaQueries = `&slippage=${normalizedSlippage}`;
	const url = baseUrl + basicQueries + criteriaQueries;
	const res = await fetch(url);
	const result = await res.json();
	if (res.status !== 200) {
		throw {
			code: result?.code || 0,
			message: result?.msg || 'Route not found',
		} as QuoteError
	}
	return result;
}
