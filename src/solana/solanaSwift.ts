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
	createSplTransferInstruction,
	decentralizeClientSwapInstructions
} from './utils';

function createOrderHash(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined, randomKey: PublicKey
): Buffer {
	const orderDataSize = 239;
	const data = Buffer.alloc(orderDataSize);
	let offset = 0;

	data.set(new PublicKey(swapperAddress).toBuffer(), 0);
	offset += 32;

	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	data.writeUInt16BE(sourceChainId, offset);
	offset += 2;

	data.set(new PublicKey(quote.swiftInputContract).toBuffer(), offset);
	offset += 32;

	const destinationChainId = getWormholeChainIdByName(quote.toChain);
	const destAddress = Buffer.from(hexToUint8Array(nativeAddressToHexString(destinationAddress, destinationChainId)));
	data.set(destAddress, offset);
	offset += 32;

	data.writeUInt16BE(destinationChainId, offset);
	offset += 2;

	const tokenOut = Buffer.from(hexToUint8Array(nativeAddressToHexString(quote.toToken.contract, destinationChainId)));
	data.set(tokenOut, offset);
	offset += 32;

	data.writeBigUInt64BE(getAmountOfFractionalAmount(quote.minAmountOut, Math.min(quote.toToken.decimals, 8)), offset);
	offset += 8;

	data.writeBigUInt64BE(getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8)));
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

	const feeRateMayan = quote.referrerBps;
	data.writeUInt8(feeRateMayan, offset);
	offset += 1;

	data.writeUInt8(quote.swiftAuctionMode, offset);
	offset += 1;

	data.set(randomKey.toBuffer(), offset);
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
	stateAccount: PublicKey,
	randomKey: PublicKey,
	destinationAddress: string,
	deadline: bigint,
	referrerAddress: string | null | undefined,
}

const InitSwiftLayout = struct<any>([
	u8('instruction'),
	blob(8, 'amountInMin'),
	u8('nativeInput'),
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
	u8('auctionMode'),
]);

function createSwiftInitInstruction(
	params: CreateInitSwiftInstructionParams,
): TransactionInstruction {
	const { quote } = params;
	const mint = new PublicKey(params.quote.swiftInputContract);
	const [ mayanFee ] = PublicKey.findProgramAddressSync(
		[Buffer.from('MAYANFEE')],
		new PublicKey(addresses.MAYAN_PROGRAM_ID),
	);
	const destinationChainId = getWormholeChainIdByName(quote.toChain);

	if (destinationChainId !== quote.toToken.wChainId) {
		throw new Error(`Destination chain ID mismatch: ${destinationChainId} != ${quote.toToken.wChainId}`);
	}
	const accounts: AccountMeta[] = [
		{ pubkey: params.state, isWritable: true, isSigner: false },
		{ pubkey: params.trader, isWritable: true, isSigner: true },
		{ pubkey: params.stateAccount, isWritable: true, isSigner: false },
		{ pubkey: mint, isWritable: false, isSigner: false },
		{ pubkey: params.randomKey, isWritable: true, isSigner: true },
		{ pubkey: mayanFee, isWritable: false, isSigner: true },
		{ pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
		{ pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
	];
	const data = Buffer.alloc(InitSwiftLayout.span);

	const refAddress = params.referrerAddress ?
		Buffer.from(hexToUint8Array(nativeAddressToHexString(params.referrerAddress, destinationChainId))) :
		SystemProgram.programId.toBuffer();

	const minMiddleAmount = quote.fromToken.contract === quote.swiftInputContract ? quote.effectiveAmountIn : quote.minMiddleAmount;

	InitSwiftLayout.encode({
		instruction: 10,
		amountInMin: getSafeU64Blob(getAmountOfFractionalAmount(minMiddleAmount, quote.swiftInputDecimals)),
		nativeInput: quote.swiftInputContract === ZeroAddress ? 1 : 0,
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
		auctionMode: quote.swiftAuctionMode,
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
	throw new Error('swift from solana not available in this version of sdk');
	if (quote.type !== 'SWIFT') {
		throw new Error('Unsupported quote type for Swift: ' + quote.type);
	}
	if (quote.toChain === 'solana') {
		throw new Error('Unsupported destination chain: ' + quote.toChain);
	}

	let instructions: TransactionInstruction[] = [];
	let signers: Keypair[] = [];
	let lookupTables: AddressLookupTableAccount[] = [];

	const mayanLookupTable = await connection.getAddressLookupTable(
		new PublicKey(addresses.LOOKUP_TABLE)
	);
	if (!mayanLookupTable || !mayanLookupTable.value) {
		throw new Error('Address lookup table not found');
	}
	lookupTables.push(mayanLookupTable.value);

	const swiftProgram = new PublicKey(addresses.SWIFT_PROGRAM_ID);
	const trader = new PublicKey(swapperAddress);

	const randomKey = Keypair.generate();
	signers.push(randomKey);

	if (!Number(quote.deadline64)) {
		throw new Error('Swift mode requires a timeout');
	}
	const deadline = BigInt(quote.deadline64);

	const hash = createOrderHash(quote, swapperAddress, destinationAddress, referrerAddress, randomKey.publicKey);
	const [state] = PublicKey.findProgramAddressSync(
		[Buffer.from('STATE'), randomKey.publicKey.toBuffer()],
		swiftProgram,
	);

	const stateAccount = getAssociatedTokenAddress(
		new PublicKey(quote.swiftInputContract), state, true
	);

	if (quote.fromToken.contract === quote.swiftInputContract) {
		if (quote.suggestedPriorityFee > 0) {
			instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
				microLamports: quote.suggestedPriorityFee,
			}))
		}
		instructions.push(
			createAssociatedTokenAccountInstruction(trader, stateAccount, state, new PublicKey(quote.swiftInputContract))
		);
		instructions.push(
			createSplTransferInstruction(
				getAssociatedTokenAddress(
					new PublicKey(quote.swiftInputContract), trader, false
				),
				stateAccount,
				trader,
				getAmountOfFractionalAmount(quote.effectiveAmountIn, quote.fromToken.decimals),
			)
		);
	} else {
		const clientSwapRaw = await getSwapSolana({
			minMiddleAmount: quote.minMiddleAmount,
			middleToken: quote.swiftInputContract,
			userWallet: swapperAddress,
			userLedger: stateAccount.toString(),
			slippageBps: quote.slippageBps,
			fromToken: quote.fromToken.contract,
			amountIn: quote.effectiveAmountIn,
			depositMode: 'SWIFT',
		});
		const clientSwap = await decentralizeClientSwapInstructions(clientSwapRaw, connection);
		instructions.push(...clientSwap.computeBudgetInstructions);
		if (clientSwap.setupInstructions) {
			instructions.push(...clientSwap.setupInstructions);
		}
		instructions.push(clientSwap.swapInstruction);
		if (clientSwap.cleanupInstruction) {
			instructions.push(clientSwap.cleanupInstruction);
		}
		lookupTables.push(...clientSwap.addressLookupTableAccounts);
	}
	instructions.push(createSwiftInitInstruction({
		quote,
		state,
		trader,
		stateAccount,
		randomKey: randomKey.publicKey,
		destinationAddress,
		deadline,
		referrerAddress,
	}));
	return {instructions, signers, lookupTables};
}






