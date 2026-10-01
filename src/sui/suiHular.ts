import { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { ChainReferrers, ComposableSuiMoveCallsOptions, Quote, ReferrerAddresses } from '../types';
import { hexToUint8Array } from '../utils';
import { fetchHularOrder, isHularSourceSwap } from '../hular/order';
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
	const params = order.quote.orderParams;
	if (isHularSourceSwap(params)) {
		throw new Error('Hular swap deposits are unavailable on sui');
	}
	if (!order.chain.escrow) {
		throw new Error('Hular deposits are unavailable on sui');
	}
	const tx = options?.builtTransaction ?? new Transaction();
	const inputCoin = await resolveInputCoin(
		BigInt(params.amountIn),
		swapperAddress,
		params.srcToken,
		suiClient,
		tx,
		options?.inputCoin
	);
	tx.moveCall({
		target: `${params.routerAddress}::hular::deposit`,
		typeArguments: [params.srcToken],
		arguments: [
			tx.object(order.chain.escrow),
			tx.pure.vector('u8', hexToUint8Array(order.quote.quoteHash)),
			inputCoin as TransactionObjectArgument,
		],
	});
	return tx;
}
