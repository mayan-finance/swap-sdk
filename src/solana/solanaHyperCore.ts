import {
	Connection,
	Keypair,
	TransactionInstruction,
	AddressLookupTableAccount,
} from '@solana/web3.js';
import { Quote, SwapMessageV0Params, SolanaBridgeOptions } from '../types';
import {
	createHyperCoreClonedQuote,
	getEvmChainIdByName,
	getHyperCoreUSDCDepositCustomPayload,
	getWormholeChainIdByName,
} from '../utils';
import addresses from '../addresses';
import { createSwiftFromSolanaInstructions } from './solanaSwift';

export async function createHyperCoreDepositFromSolanaInstructions(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	connection: Connection,
	options: SolanaBridgeOptions = {}
): Promise<{
	instructions: TransactionInstruction[];
	signers: Keypair[];
	lookupTables: AddressLookupTableAccount[];
	swapMessageV0Params: SwapMessageV0Params | null;
}> {
	if (quote.toToken.name !== 'USDC (perps)' && quote.toToken.name !== 'USDC (spot)') {
		throw new Error('Unsupported to token for HyperCore deposit: ' + quote.toToken.name);
	}
	if (Number.isNaN(Number(quote.toToken.contract))) {
		throw new Error('Invalid to token contract for HyperCore deposit USDC: ' + quote.toToken.contract);
	}

	if (quote.type !== 'SWIFT') {
		throw new Error('Unsupported quote type for USDC deposit: ' + quote.type);
	}
	if (quote.swiftVersion !== 'V2') {
		throw new Error('Invalid quote swift version for Solana: ' + quote.swiftVersion);
	}
	if (!quote.hcSwiftDeposit) {
		throw new Error('HyperCore parameters are required for this quote');
	}
	if (!Number(quote.deadline64)) {
		throw new Error('HyperCore deposit requires timeout');
	}
	const hcDepositDex = Number(quote.toToken.contract);
	const clonedQuote = createHyperCoreClonedQuote(quote);
	return createSwiftFromSolanaInstructions(
		clonedQuote,
		swapperAddress,
		addresses.HC_HYPEREVM_DEPOSIT_PROCESSOR, // destination address
		referrerAddress,
		connection,
		{
			...options,
			customPayload: getHyperCoreUSDCDepositCustomPayload(clonedQuote, destinationAddress, hcDepositDex),
		}
	);
}
