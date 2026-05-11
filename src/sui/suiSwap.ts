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
import {createSwiftFromSuiMoveCalls} from "./suiSwift";

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

	if (quote.toChain === 'hypercore') {
		throw new Error('HyperCore deposit temporarily not supported from Sui chain');
	}

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
	} else if (quote.type === 'SWIFT') {
		throw new Error('SWIFT swaps are not supported to Sui chain yet');
		return createSwiftFromSuiMoveCalls(
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
