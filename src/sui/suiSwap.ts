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
import { createHyperCoreDepositFromSuiMoveCalls } from './suiHyperCore';
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
		if (!quote.hyperCoreParams) {
			throw new Error('HyperCore parameters are required for this quote');
		}
		if (!options?.usdcPermitSignature) {
			throw new Error('USDC permit signature is required for this quote');
		}
		if (quote.type !== 'MCTP') {
			throw new Error('Unsupported quote type for HyperCore deposit: ' + quote.type);
		}
		if (payload) {
			throw new Error('Payload is not supported for HyperCore deposit quotes');
		}
		return createHyperCoreDepositFromSuiMoveCalls(
			quote,
			swapperWalletAddress,
			destinationAddress,
			referrerAddress,
			suiClient,
			options,
		);
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
