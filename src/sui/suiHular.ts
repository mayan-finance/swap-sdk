import { suiOrderDepositCall } from '@mayanfinance/hular-sdk';
import { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { ChainReferrers, ComposableSuiMoveCallsOptions, Quote, ReferrerAddresses } from '../types';
import { fetchHularOrder } from '../hular/order';
import { resolveInputCoin } from './utils';

export async function createHularFromSuiMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	suiClient: ClientWithCoreApi,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	if (quote.type !== 'HULAR') {
		throw new Error('Unsupported quote type for hular: ' + quote.type);
	}
	if (quote.fromChain !== 'sui') {
		throw new Error('Unsupported source chain for hular: ' + quote.fromChain);
	}
	const order = await fetchHularOrder(quote, swapperAddress, destinationAddress, referrerAddresses, options?.apiKey);
	const tx = options?.builtTransaction ?? new Transaction();
	const inputCoin = await resolveInputCoin(
		BigInt(order.quote.orderParams!.amountIn),
		swapperAddress,
		order.quote.orderParams!.srcToken,
		suiClient,
		tx,
		options?.inputCoin
	);
	suiOrderDepositCall(order, tx, inputCoin as TransactionObjectArgument);
	return tx;
}
