import {
	AccountMeta,
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	TransactionInstruction,
	AddressLookupTableAccount,
	ComputeBudgetProgram,
} from '@solana/web3.js';
import { blob, struct, u16, u8 } from '@solana/buffer-layout';
import { Quote, SwapMessageV0Params } from '../types';
import {
	hexToUint8Array,
	nativeAddressToHexString,
	getSafeU64Blob,
	getAmountOfFractionalAmount,
	getAssociatedTokenAddress,
	getWormholeChainIdByName,
	getGasDecimal,
} from '../utils';
import { Buffer } from 'buffer';
import addresses from '../addresses';
import { ethers, ZeroAddress } from 'ethers';
import { getSwapSolana } from '../api';
import {
	createAssociatedTokenAccountInstruction,
	createInitializeRandomTokenAccountInstructions,
	createSplTransferInstruction,
	createSyncNativeInstruction,
	createTransferAllAndCloseInstruction,
	decentralizeClientSwapInstructions,
	getAddressLookupTableAccounts,
	getAnchorInstructionData,
	solMint,
	validateJupSwap, validateJupSwapInstructionData
} from './utils';
import { swapFromSolana } from './solanaSwap';

export async function createMonoChainFromSolanaInstructions(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	connection: Connection,
	options: {
		allowSwapperOffCurve?: boolean;
		separateSwapTx?: boolean;
	} = {}
): Promise<{
	instructions: TransactionInstruction[];
	signers: Keypair[];
	lookupTables: AddressLookupTableAccount[];
	swapMessageV0Params: SwapMessageV0Params | null;
}> {
	if (quote.type !== 'MONO_CHAIN') {
		throw new Error('Unsupported quote type for mono chain: ' + quote.type);
	}
	if (quote.fromChain !== 'solana') {
		throw new Error(
			'Unsupported destination chain for mono chain: ' + quote.fromChain
		);
	}
	if (quote.toChain !== 'solana') {
		throw new Error(
			'Unsupported destination chain for mono chain: ' + quote.toChain
		);
	}
	if (quote.fromToken.contract === quote.toToken.contract) {
		throw new Error(
			'From token and to token are the same: ' + quote.fromToken.contract
		);
	}
	if (destinationAddress.startsWith('0x')) {
		throw new Error('Destination address should not be EVM address');
	}
	try {
		new PublicKey(destinationAddress);
	} catch (e) {
		throw new Error('Invalid destination address: ' + destinationAddress);
	}

	let instructions: TransactionInstruction[] = [];
	let lookupTables: AddressLookupTableAccount[] = [];

	let _lookupTablesAddress: string[] = [];

	const swapper = new PublicKey(swapperAddress);
	const destination = new PublicKey(destinationAddress);

	const toMint = quote.toToken.contract === ZeroAddress ? solMint : new PublicKey(quote.toToken.contract);
	const destAcc = getAssociatedTokenAddress(
		toMint,
		destination,
		true,
		quote.toToken.standard === 'spl2022' ? new PublicKey(addresses.TOKEN_2022_PROGRAM_ID) : new PublicKey(addresses.TOKEN_PROGRAM_ID)
	);

	const expectedAmountOut64 = getAmountOfFractionalAmount(
		quote.expectedAmountOut, quote.toToken.decimals
	);
	const clientSwapRaw = await getSwapSolana({
		userWallet: swapperAddress,
		destinationWallet: destinationAddress,
		slippageBps: quote.slippageBps,
		fromToken: quote.fromToken.contract,
		middleToken: quote.toToken.contract,
		amountIn64: quote.effectiveAmountIn64,
		expectedAmountOut64: String(expectedAmountOut64),
		depositMode: 'MONO_CHAIN',
		referrerAddress: referrerAddress,
	});
	const clientSwap = decentralizeClientSwapInstructions(
		clientSwapRaw,
		connection
	);
	validateJupSwap(clientSwap, destAcc, swapper, destination, swapper.equals(destination));
	validateJupSwapInstructionData(clientSwap.swapInstruction, quote);
	instructions.push(...clientSwap.computeBudgetInstructions);
	if (clientSwap.setupInstructions) {
		instructions.push(...clientSwap.setupInstructions);
	}
	instructions.push(clientSwap.swapInstruction);
	if (clientSwap.cleanupInstruction) {
		instructions.push(clientSwap.cleanupInstruction);
	}
	_lookupTablesAddress.push(...clientSwap.addressLookupTableAddresses);

	return { instructions, signers: [], lookupTables, swapMessageV0Params: null };
}
