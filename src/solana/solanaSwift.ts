import {
	AccountMeta,
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	SYSVAR_RENT_PUBKEY,
	TransactionInstruction, AddressLookupTableAccount, ComputeBudgetProgram
} from '@solana/web3.js';
import { blob, struct, u16, u8 } from '@solana/buffer-layout';
import { Quote } from '../types';
import {
	hexToUint8Array,
	nativeAddressToHexString,
	getSafeU64Blob, getAmountOfFractionalAmount, getAssociatedTokenAddress, getWormholeChainIdByName, getGasDecimal
} from '../utils';
import {Buffer} from 'buffer';
import addresses from '../addresses'
import { ethers, ZeroAddress } from 'ethers';
import { getSwapSolana } from '../api';
import {
	createAssociatedTokenAccountInstruction,
	createSplTransferInstruction, createSyncNativeInstruction,
	decentralizeClientSwapInstructions, getAddressLookupTableAccounts, getAnchorInstructionData, solMint
} from './utils';

export function createSwiftOrderHash(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined, randomKeyHex: string
): Buffer {
	const orderDataSize = 239;
	const data = Buffer.alloc(orderDataSize);
	let offset = 0;

	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const trader = Buffer.from(hexToUint8Array(nativeAddressToHexString(swapperAddress, sourceChainId)));
	data.set(trader, 0);
	offset += 32;


	data.writeUInt16BE(sourceChainId, offset);
	offset += 2;

	const _tokenIn = quote.swiftInputContract === ZeroAddress ?
		nativeAddressToHexString(SystemProgram.programId.toString(), getWormholeChainIdByName('solana')) :
		nativeAddressToHexString(quote.swiftInputContract, sourceChainId);
	const tokenIn = Buffer.from(hexToUint8Array(_tokenIn));
	data.set(tokenIn, offset);
	offset += 32;

	const destinationChainId = getWormholeChainIdByName(quote.toChain);
	const destAddress = Buffer.from(hexToUint8Array(nativeAddressToHexString(destinationAddress, destinationChainId)));
	data.set(destAddress, offset);
	offset += 32;

	data.writeUInt16BE(destinationChainId, offset);
	offset += 2;

	const _tokenOut =
		quote.toToken.contract === ZeroAddress ?
			nativeAddressToHexString(SystemProgram.programId.toString(), getWormholeChainIdByName('solana')) :
			nativeAddressToHexString(quote.toToken.contract, destinationChainId);
	const tokenOut = Buffer.from(hexToUint8Array(_tokenOut));
	data.set(tokenOut, offset);
	offset += 32;

	data.writeBigUInt64BE(getAmountOfFractionalAmount(quote.minAmountOut, Math.min(quote.toToken.decimals, 8)), offset);
	offset += 8;

	data.writeBigUInt64BE(getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8)), offset);
	offset += 8;

	data.writeBigUInt64BE(BigInt(quote.cancelRelayerFee64), offset);
	offset += 8;

	data.writeBigUInt64BE(BigInt(quote.refundRelayerFee64), offset);
	offset += 8;

	data.writeBigUInt64BE(BigInt(quote.deadline64), offset);
	offset += 8;

	const refAddress = referrerAddress ?
		Buffer.from(hexToUint8Array(nativeAddressToHexString(referrerAddress, destinationChainId))) :
		SystemProgram.programId.toBuffer();
	data.set(refAddress, offset);
	offset += 32;

	data.writeUInt8(quote.referrerBps, offset);
	offset += 1;

	const feeRateMayan = quote.protocolBps;
	data.writeUInt8(feeRateMayan, offset);
	offset += 1;

	data.writeUInt8(quote.swiftAuctionMode, offset);
	offset += 1;

	const _randomKey = Buffer.from(hexToUint8Array(randomKeyHex));
	data.set(_randomKey, offset);
	offset += 32;

	if (offset !== orderDataSize) {
		throw new Error(`Invalid order data size: ${offset}`);
	}

	const hash = ethers.keccak256(data);
	return Buffer.from(hexToUint8Array(hash));
}

type CreateInitSwiftInstructionParams = {
	quote: Quote,
	state: PublicKey,
	trader: PublicKey,
	relayer: PublicKey,
	stateAccount: PublicKey,
	relayerAccount: PublicKey,
	randomKey: PublicKey,
	destinationAddress: string,
	deadline: bigint,
	referrerAddress: string | null | undefined,
}

const InitSwiftLayout = struct<any>([
	blob(8, 'instruction'),
	blob(8, 'amountInMin'),
	u8('nativeInput'),
	blob(8, 'feeSubmit'),
	blob(32, 'destAddress'),
	u16('destinationChain'),
	blob(32, 'tokenOut'),
	blob(8, 'amountOutMin'),
	blob(8, 'gasDrop'),
	blob(8, 'feeCancel'),
	blob(8, 'feeRefund'),
	blob(8, 'deadline'),
	blob(32, 'refAddress'),
	u8('feeRateRef'),
	u8('feeRateMayan'),
	u8('auctionMode'),
	blob(32, 'randomKey'),
]);

function createSwiftInitInstruction(
	params: CreateInitSwiftInstructionParams,
): TransactionInstruction {
	const { quote } = params;
	const mint = quote.swiftInputContract === ZeroAddress ?
		solMint : new PublicKey(quote.swiftInputContract);
	const destinationChainId = getWormholeChainIdByName(quote.toChain);

	if (destinationChainId !== quote.toToken.wChainId) {
		throw new Error(`Destination chain ID mismatch: ${destinationChainId} != ${quote.toToken.wChainId}`);
	}
	const accounts: AccountMeta[] = [
		{ pubkey: params.trader, isWritable: false, isSigner: true },
		{ pubkey: params.relayer, isWritable: true, isSigner: true },
		{ pubkey: params.state, isWritable: true, isSigner: false },
		{ pubkey: params.stateAccount, isWritable: true, isSigner: false },
		{ pubkey: params.relayerAccount, isWritable: true, isSigner: false },
		{ pubkey: mint, isWritable: false, isSigner: false },
		{ pubkey: new PublicKey(addresses.FEE_MANAGER_PROGRAM_ID), isWritable: false, isSigner: false },
		{ pubkey: new PublicKey(addresses.TOKEN_PROGRAM_ID), isWritable: false, isSigner: false },
		{ pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
	];

	const data = Buffer.alloc(InitSwiftLayout.span);

	const refAddress = params.referrerAddress ?
		Buffer.from(hexToUint8Array(nativeAddressToHexString(params.referrerAddress, destinationChainId))) :
		SystemProgram.programId.toBuffer();

	const minMiddleAmount = quote.fromToken.contract === quote.swiftInputContract ? quote.effectiveAmountIn : quote.minMiddleAmount;

	InitSwiftLayout.encode({
		instruction: getAnchorInstructionData('init_order'),
		amountInMin: getSafeU64Blob(getAmountOfFractionalAmount(minMiddleAmount, quote.swiftInputDecimals)),
		nativeInput: quote.swiftInputContract === ZeroAddress ? 1 : 0,
		feeSubmit: getSafeU64Blob(BigInt(quote.submitRelayerFee64)),
		destAddress: Buffer.from(hexToUint8Array(nativeAddressToHexString(params.destinationAddress, destinationChainId))),
		destinationChain: destinationChainId,
		tokenOut: Buffer.from(hexToUint8Array(nativeAddressToHexString(quote.toToken.contract, destinationChainId))),
		amountOutMin: getSafeU64Blob(getAmountOfFractionalAmount(quote.minAmountOut, Math.min(quote.toToken.decimals, 8))),
		gasDrop: getSafeU64Blob(getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8))),
		feeCancel: getSafeU64Blob(BigInt(quote.cancelRelayerFee64)),
		feeRefund: getSafeU64Blob(BigInt(quote.refundRelayerFee64)),
		deadline: getSafeU64Blob(params.deadline),
		refAddress: refAddress,
		feeRateRef: quote.referrerBps,
		feeRateMayan: quote.protocolBps,
		auctionMode: quote.swiftAuctionMode,
		randomKey: params.randomKey.toBuffer(),
	}, data);

	return new TransactionInstruction({
		keys: accounts,
		data,
		programId: new PublicKey(addresses.SWIFT_PROGRAM_ID)
	});
}

export async function createSwiftFromSolanaInstructions(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined,
	connection: Connection,
): Promise<{
	instructions: TransactionInstruction[],
	signers: Keypair[],
	lookupTables:  AddressLookupTableAccount[],
}> {

	if (quote.type !== 'SWIFT') {
		throw new Error('Unsupported quote type for Swift: ' + quote.type);
	}
	if (quote.toChain === 'solana') {
		throw new Error('Unsupported destination chain: ' + quote.toChain);
	}

	let instructions: TransactionInstruction[] = [];
	let lookupTables: AddressLookupTableAccount[] = [];

	let _lookupTablesAddress: string[] = [];

	_lookupTablesAddress.push(addresses.LOOKUP_TABLE);


	const swiftProgram = new PublicKey(addresses.SWIFT_PROGRAM_ID);
	const trader = new PublicKey(swapperAddress);

	const randomKey = Keypair.generate();

	if (!Number(quote.deadline64)) {
		throw new Error('Swift mode requires a timeout');
	}
	const deadline = BigInt(quote.deadline64);

	const hash = createSwiftOrderHash(
		quote, swapperAddress, destinationAddress,
		referrerAddress, randomKey.publicKey.toBuffer().toString('hex')
	);
	const [state] = PublicKey.findProgramAddressSync(
		[Buffer.from('STATE_SOURCE'), hash],
		swiftProgram,
	);

	const stateAccount = getAssociatedTokenAddress(
		new PublicKey(quote.swiftInputContract), state, true
	);

	const swiftInputMint = quote.swiftInputContract === ZeroAddress ? solMint : new PublicKey(quote.swiftInputContract);
	const relayer = quote.gasless ? new PublicKey(quote.relayer) : trader;
	const relayerAccount = getAssociatedTokenAddress(swiftInputMint, relayer, false);
	if (quote.fromToken.contract === quote.swiftInputContract) {
		if (quote.suggestedPriorityFee > 0) {
			instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
				microLamports: quote.suggestedPriorityFee,
			}))
		}
		instructions.push(
			createAssociatedTokenAccountInstruction(relayer, stateAccount, state, swiftInputMint)
		);
		if (quote.swiftInputContract === ZeroAddress) {
			instructions.push(
				SystemProgram.transfer({
					fromPubkey: trader,
					toPubkey: stateAccount,
					lamports: getAmountOfFractionalAmount(quote.effectiveAmountIn, quote.fromToken.decimals),
				}),
				createSyncNativeInstruction(stateAccount),
			);
		} else {
			instructions.push(
				createSplTransferInstruction(
					getAssociatedTokenAddress(
						swiftInputMint, trader, false
					),
					stateAccount,
					trader,
					getAmountOfFractionalAmount(quote.effectiveAmountIn, quote.fromToken.decimals),
				)
			);
		}
	} else {
		const clientSwapRaw = await getSwapSolana({
			minMiddleAmount: quote.minMiddleAmount,
			middleToken: quote.swiftInputContract,
			userWallet: swapperAddress,
			slippageBps: quote.slippageBps,
			fromToken: quote.fromToken.contract,
			amountIn: quote.effectiveAmountIn,
			depositMode: quote.gasless ? 'SWIFT_GASLESS' : 'SWIFT',
			orderHash: `0x${hash.toString('hex')}`,
		});

		const clientSwap = decentralizeClientSwapInstructions(clientSwapRaw, connection);
		instructions.push(...clientSwap.computeBudgetInstructions);
		if (clientSwap.setupInstructions) {
			instructions.push(...clientSwap.setupInstructions);
		}
		instructions.push(clientSwap.swapInstruction);
		if (clientSwap.cleanupInstruction) {
			instructions.push(clientSwap.cleanupInstruction);
		}
		_lookupTablesAddress.push(...clientSwap.addressLookupTableAddresses);
	}
	instructions.push(createSwiftInitInstruction({
		quote,
		state,
		trader,
		stateAccount,
		randomKey: randomKey.publicKey,
		relayerAccount,
		relayer,
		destinationAddress,
		deadline,
		referrerAddress,
	}));

	lookupTables = await getAddressLookupTableAccounts(_lookupTablesAddress, connection)

	return {instructions, signers: [], lookupTables};
}






