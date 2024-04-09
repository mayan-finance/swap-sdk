import {
	AccountMeta,
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	SYSVAR_CLOCK_PUBKEY,
	SYSVAR_RENT_PUBKEY,
	Transaction,
	TransactionInstruction,
} from '@solana/web3.js';
import {blob, struct, u16, u8} from '@solana/buffer-layout';
import { SolanaTransactionSigner } from '../types';
import {
	hexToUint8Array,
	nativeAddressToHexString,
	getSafeU64Blob,
} from '../utils';
import {Buffer} from 'buffer';
import addresses from '../addresses'
import {getWormholePDAs} from '../wormhole';

const SwiftCancelLayout = struct<any>([
	u8('instruction'),
	blob(32, 'unlockerAddr'),
]);

export function createSwiftCancelInstruction(
	orderState: string, destinationAddress: string,
	sourceChainId: number, unlockerAddress: string,
): TransactionInstruction {
	throw new Error('Swift not available yet!');
	const programId = new PublicKey(addresses.SWIFT_PROGRAM_ID);
	const unlockerAddr = Buffer.from(
		hexToUint8Array(
			nativeAddressToHexString(unlockerAddress, sourceChainId)
		)
	);
	const keys: Array<AccountMeta> = [
		{pubkey: new PublicKey(orderState), isWritable: true, isSigner: false},
		{pubkey: new PublicKey(destinationAddress), isWritable: false, isSigner: true},
	]
	const data = Buffer.alloc(SwiftCancelLayout.span);
	SwiftCancelLayout.encode(
		{
			instruction: 70,
			unlockerAddr,
		},
		data
	);
	return new TransactionInstruction({keys, programId, data});
}

export async function cancelSwiftSolana(
	orderState: string, destinationAddress: string, sourceChainId: number, unlockerAddress: string,
	signTransaction: SolanaTransactionSigner, connection?: Connection
): Promise<string> {
	throw new Error('Swift not available yet!');
	const solanaConnection = connection ??
		new Connection('https://rpc.ankr.com/solana');
	const {
		blockhash,
		lastValidBlockHeight,
	} = await solanaConnection.getLatestBlockhash();
	const trx = new Transaction({
		feePayer: new PublicKey(destinationAddress),
		blockhash,
		lastValidBlockHeight,
	});
	trx.add(createSwiftCancelInstruction(
		orderState, destinationAddress, sourceChainId, unlockerAddress
	));
	const signedTrx = await signTransaction(trx);
	return await solanaConnection.sendRawTransaction(signedTrx.serialize());
}

const PostSwiftLayout = struct<any>([
	u8('instruction'),
]);

export function createPostSwiftInstruction(
	swiftState: string, payer: string
): {
	instruction: TransactionInstruction,
	signer: Keypair,
} {
	throw new Error('Swift not available yet!');
	const programId = new PublicKey(addresses.SWIFT_PROGRAM_ID);
	const wormholeProgramId = new PublicKey(addresses.WORMHOLE_PROGRAM_ID);
	const swiftStateAddr = new PublicKey(swiftState);
	const payerAddr = new PublicKey(payer);
	const whPDAs = getWormholePDAs(addresses.SWIFT_PROGRAM_ID);
	const msg = Keypair.generate();
	const keys: Array<AccountMeta> = [
		{pubkey: swiftStateAddr, isWritable: true, isSigner: false},
		{pubkey: whPDAs.emitter, isWritable: false, isSigner: false},
		{pubkey: whPDAs.sequenceKey, isWritable: true, isSigner: false},
		{pubkey: msg.publicKey, isWritable: true, isSigner: true},
		{pubkey: whPDAs.bridgeConfig, isWritable: true, isSigner: false},
		{pubkey: whPDAs.feeCollector, isWritable: true, isSigner: false},
		{pubkey: payerAddr, isWritable: true, isSigner: true},
		{pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
		{pubkey: wormholeProgramId, isWritable: false, isSigner: false},
	];
	const data = Buffer.alloc(PostSwiftLayout.span);
	PostSwiftLayout.encode({instruction: 60}, data);
	const instruction = new TransactionInstruction({keys, data, programId});
	return {instruction, signer: msg};
}

export async function postSwiftSolana(
	swiftState: string, payer: string, signTransaction: SolanaTransactionSigner,
	connection?: Connection
): Promise<string> {
	throw new Error('Swift not available yet!');
	const solanaConnection = connection ??
		new Connection('https://rpc.ankr.com/solana');
	const {instruction, signer} = createPostSwiftInstruction(
		swiftState, payer);
	const {
		blockhash,
		lastValidBlockHeight,
	} = await solanaConnection.getLatestBlockhash();
	const trx = new Transaction({
		feePayer: new PublicKey(payer),
		blockhash,
		lastValidBlockHeight,
	});
	trx.add(instruction);
	trx.partialSign(signer);
	const signedTrx = await signTransaction(trx);
	return await solanaConnection.sendRawTransaction(signedTrx.serialize());
}

const RegisterSwiftLayout = struct<any>([
	u8('instruction'),
	blob(32, 'trader'),
	u16('chainSource'),
	blob(32, 'tokenIn'),
	blob(8, 'amountIn'),
	blob(32, 'tokenOut'),
	blob(8, 'amountOutMin'),
	blob(8, 'gasDrop'),
	blob(32, 'destAddr'),
	u16('chainDest'),
	blob(32, 'refAddr'),
	u8('feeRateRef'),
	u8('feeRateMayan'),
	u8('auctionMode'),
	blob(32, 'randomKey'),
	blob(32, 'hash'),
]);
type RegisterSwiftParams = {
	payer: string,
	orderState: string;
	trader: string;
	sourceChainId: number;
	tokenIn: string;
	tokenOut: string;
	amountIn: bigint;
	amountOutMin: bigint;
	gasDrop: bigint;
	destinationAddress: string;
	destinationChainId: number;
	referrerAddress: string | null | undefined;
	mayanFeeRate: number;
	referrerFeeRate: number;
	auctionMode: number;
	randomKey: string;
	orderHash: string;
};

export function createRegisterSwiftInstruction(params: RegisterSwiftParams): TransactionInstruction {
	throw new Error('Swift not available yet!');
	const programId = new PublicKey(addresses.SWIFT_PROGRAM_ID);
	const keys: Array<AccountMeta> = [
		{pubkey: new PublicKey(params.orderState), isWritable: true, isSigner: false},
		{pubkey: new PublicKey(params.payer), isWritable: true, isSigner: true},
		{pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];
	const traderAddr = Buffer.from(hexToUint8Array(
		nativeAddressToHexString(params.trader, params.sourceChainId)
	));
	const destAddr = Buffer.from(
		hexToUint8Array(
			nativeAddressToHexString(params.destinationAddress, params.destinationChainId)
		)
	);
	const tokenInAddr = Buffer.from(hexToUint8Array(
		nativeAddressToHexString(params.tokenIn, params.sourceChainId)
	));
	const tokenOutAddr = Buffer.from(hexToUint8Array(
		nativeAddressToHexString(params.tokenOut, params.destinationChainId)
	));
	const refAddr = params.referrerAddress ?
		Buffer.from(hexToUint8Array(
			nativeAddressToHexString(params.referrerAddress, params.destinationChainId)
		)) : SystemProgram.programId.toBuffer();
	const randomKeyBuf = Buffer.from(hexToUint8Array(params.randomKey));
	const hash = Buffer.from(hexToUint8Array(params.orderHash));
	const data = Buffer.alloc(RegisterSwiftLayout.span);
	RegisterSwiftLayout.encode(
		{
			instruction: 20,
			trader: traderAddr,
			chainSource: params.sourceChainId,
			tokenIn: tokenInAddr,
			amountIn: getSafeU64Blob(params.amountIn),
			tokenOut: tokenOutAddr,
			amountOutMin: getSafeU64Blob(params.amountOutMin),
			gasDrop: getSafeU64Blob(params.gasDrop),
			destAddr,
			chainDest: params.destinationChainId,
			refAddr,
			feeRateRef: params.referrerFeeRate,
			feeRateMayan: params.mayanFeeRate,
			auctionMode: params.auctionMode,
			randomKey: randomKeyBuf,
			hash,
		},
		data
	);
	return new TransactionInstruction({keys, data, programId});
}



