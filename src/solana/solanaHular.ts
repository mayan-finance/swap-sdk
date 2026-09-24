import { svmOrderDepositInstructions } from '@mayanfinance/hular-sdk';
import { AddressLookupTableAccount, Connection, Keypair, TransactionInstruction } from '@solana/web3.js';
import type { ChainReferrers, Quote, ReferrerAddresses, SwapMessageV0Params } from '../types';
import { fetchHularOrder } from '../hular/order';

export async function createHularFromSolanaInstructions(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	connection: Connection,
	options: {
		apiKey?: string;
	} = {}
): Promise<{
	instructions: TransactionInstruction[];
	signers: Keypair[];
	lookupTables: AddressLookupTableAccount[];
	swapMessageV0Params: SwapMessageV0Params | null;
}> {
	if (quote.type !== 'HULAR') {
		throw new Error('Unsupported quote type for hular: ' + quote.type);
	}
	if (quote.fromChain !== 'solana') {
		throw new Error('Unsupported source chain for hular: ' + quote.fromChain);
	}
	const order = await fetchHularOrder(quote, swapperAddress, destinationAddress, referrerAddresses, options.apiKey);
	const { instructions, lookupTables } = await svmOrderDepositInstructions(
		order,
		connection.rpcEndpoint,
		swapperAddress
	);
	return { instructions, signers: [], lookupTables, swapMessageV0Params: null };
}
