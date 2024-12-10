import {
	Quote,
	ReferrerAddresses,
	ComposableSuiMoveCallsOptions,
} from '../types';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getQuoteSuitableReferrerAddress } from '../utils';
import { createMctpFromSuiMoveCalls } from './suiMctp';
import { Buffer } from 'buffer';

export async function createSwapFromSuiMoveCalls(
	quote: Quote,
	swapperWalletAddress: string,
	destinationAddress: string,
	referrerAddresses: ReferrerAddresses | null | undefined,
	payload: Uint8Array | Buffer | null | undefined,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	const referrerAddress = getQuoteSuitableReferrerAddress(
		quote,
		referrerAddresses
	);

	if (quote.type === 'MCTP') {
		return createMctpFromSuiMoveCalls(
			quote,
			swapperWalletAddress,
			destinationAddress,
			referrerAddress,
			payload,
			suiClient,
			options
		);
	} else {
		throw new Error('Unsupported quote type from Sui chain');
	}
}
