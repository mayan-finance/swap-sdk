import {
	AccountMeta,
	Connection,
	Keypair,
	PublicKey,
	SendOptions,
	SystemProgram,
	SYSVAR_RENT_PUBKEY,
	Transaction,
	TransactionInstruction,
	AddressLookupTableAccount,
	VersionedTransaction,
} from '@solana/web3.js';
import {getAmountOfFractionalAmount, getAssociatedTokenAddress, getSafeU64Blob, wait} from '../utils';
import {InstructionInfo, SolanaClientSwap, SolanaTransactionSigner, JitoBundleOptions} from '../types';
import addresses from "../addresses";
import {Buffer} from "buffer";
import {blob, struct, u8} from "@solana/buffer-layout";
import { sha256 } from 'js-sha256';
import bs58 from 'bs58';
import { getSuggestedRelayer } from '../api';

const cachedConnections: Record<string, Connection> = {};

function getConnection(rpcUrl: string) {
	cachedConnections[rpcUrl] ??= new Connection(rpcUrl);
	return new Connection(rpcUrl);
}
export async function submitTransactionWithRetry(
	{
		trx,
		connection,
		errorChance,
		extraRpcs,
		options,
		rate = 8,
	}: {
		trx: Uint8Array;
		connection: Connection;
		errorChance: number;
		extraRpcs: string[];
		options?: SendOptions;
		rate?: number;
	}): Promise<{
	signature: string,
	serializedTrx: Uint8Array,
}> {
	let signature: string | null = null;
	let errorNumber = 0;
	const connections = [connection].concat(extraRpcs.map(getConnection));
	for (let i = 0; i < rate; i++) {
		if (signature) {
			try {
				const status = await Promise.any(connections.map((c) => c.getSignatureStatus(signature!)));
				if (status && status.value) {
					if (status.value.err) {
						if (errorNumber >= errorChance) {
							return {
								signature,
								serializedTrx: trx,
							};
						}
						errorNumber++;
					} else if (status.value.confirmationStatus === 'confirmed') {
						return {
							signature,
							serializedTrx: trx,
						};
					}
				}
			} catch (err) {
				console.error(err)
			}
		}
		const sendRequests = connections.map((c) => c.sendRawTransaction(trx, options));
		if (!signature) {
			try {
				signature = await Promise.any(sendRequests);
			} catch (err) {
				console.error('Transaction not submitted, remaining attempts:', rate - i - 1, err);
			}
		}
		await wait(1000);
	}

	if (!signature) {
		throw new Error('Failed to send transaction');
	}

	return {
		signature,
		serializedTrx: trx,
	};
}

export function createAssociatedTokenAccountInstruction(
	payer: PublicKey,
	associatedToken: PublicKey,
	owner: PublicKey,
	mint: PublicKey,
	programId = new PublicKey(addresses.TOKEN_PROGRAM_ID),
	associatedTokenProgramId = new PublicKey(addresses.ASSOCIATED_TOKEN_PROGRAM_ID)
): TransactionInstruction {
	const keys = [
		{pubkey: payer, isSigner: true, isWritable: true},
		{pubkey: associatedToken, isSigner: false, isWritable: true},
		{pubkey: owner, isSigner: false, isWritable: false},
		{pubkey: mint, isSigner: false, isWritable: false},
		{pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
		{pubkey: programId, isSigner: false, isWritable: false},
		{pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
	];

	return new TransactionInstruction({
		keys,
		programId: associatedTokenProgramId,
		data: Buffer.alloc(0),
	});
}

const ApproveInstructionData = struct<any>([
	u8('instruction'), blob(8, 'amount')
]);

export function createApproveInstruction(
	account: PublicKey,
	delegate: PublicKey,
	owner: PublicKey,
	amount: bigint,
	programId = new PublicKey(addresses.TOKEN_PROGRAM_ID)
): TransactionInstruction {
	const keys: Array<AccountMeta> = [
		{pubkey: account, isSigner: false, isWritable: true},
		{pubkey: delegate, isSigner: false, isWritable: false},
		{pubkey: owner, isSigner: true, isWritable: false},
	];

	const data = Buffer.alloc(ApproveInstructionData.span);
	ApproveInstructionData.encode(
		{
			instruction: 4,
			amount: getSafeU64Blob(amount),
		},
		data
	);
	return new TransactionInstruction({keys, programId, data});
}

const SyncNativeInstructionData = struct<any>([u8('instruction')]);

export function createSyncNativeInstruction(
	account: PublicKey): TransactionInstruction {
	const keys = [{pubkey: account, isSigner: false, isWritable: true}];

	const data = Buffer.alloc(SyncNativeInstructionData.span);
	SyncNativeInstructionData.encode({instruction: 17}, data);

	return new TransactionInstruction({
		keys,
		programId: new PublicKey(addresses.TOKEN_PROGRAM_ID),
		data
	});
}

const CloseAccountInstructionData = struct<any>([
	u8('instruction')
]);

export function createCloseAccountInstruction(
	account: PublicKey,
	destination: PublicKey,
	owner: PublicKey,
	programId = new PublicKey(addresses.TOKEN_PROGRAM_ID)
): TransactionInstruction {
	const keys: Array<AccountMeta> = [
		{pubkey: account, isSigner: false, isWritable: true},
		{pubkey: destination, isSigner: false, isWritable: true},
		{pubkey: owner, isSigner: true, isWritable: false},
	];

	const data = Buffer.alloc(CloseAccountInstructionData.span);
	CloseAccountInstructionData.encode(
		{
			instruction: 9,
		},
		data
	);
	return new TransactionInstruction({keys, programId, data});
}

const SplTransferInstructionData = struct<any>([
	u8('instruction'), blob(8, 'amount')
]);

export function createSplTransferInstruction(
	source: PublicKey,
	destination: PublicKey,
	owner: PublicKey,
	amount: bigint,
	programId = new PublicKey(addresses.TOKEN_PROGRAM_ID)
): TransactionInstruction {
	const keys: Array<AccountMeta> = [
		{pubkey: source, isSigner: false, isWritable: true},
		{pubkey: destination, isSigner: false, isWritable: true},
		{pubkey: owner, isSigner: true, isWritable: false},
	];

	const data = Buffer.alloc(SplTransferInstructionData.span);
	SplTransferInstructionData.encode(
		{
			instruction: 3,
			amount: getSafeU64Blob(amount),
		},
		data
	);
	return new TransactionInstruction({keys, programId, data});
}

export const solMint = new PublicKey('So11111111111111111111111111111111111111112');

export async function wrapSol(
	owner: PublicKey, amount: number,
	signTransaction: SolanaTransactionSigner, connection?: Connection
): Promise<{
	signature: string,
	serializedTrx: Uint8Array,
}> {
	const solanaConnection = connection ?? new Connection('https://rpc.ankr.com/solana');
	const toAccount = getAssociatedTokenAddress(solMint, owner, false);

	const {
		blockhash,
		lastValidBlockHeight
	} = await solanaConnection.getLatestBlockhash();
	const trx = new Transaction({
		feePayer: owner,
		blockhash,
		lastValidBlockHeight,
	});

	const toAccountData = await solanaConnection.getAccountInfo(toAccount, 'finalized');
	if (!toAccountData || toAccountData.data.length === 0) {
		trx.add(createAssociatedTokenAccountInstruction(
			owner, toAccount, owner, solMint
		));
	}

	trx.add(SystemProgram.transfer({
		fromPubkey: owner,
		toPubkey: toAccount,
		lamports: getAmountOfFractionalAmount(amount, 9),
	}));

	trx.add(createSyncNativeInstruction(toAccount));


	const signedTrx = await signTransaction(trx);
	return await submitTransactionWithRetry({
		trx: signedTrx.serialize(),
		connection: solanaConnection,
		errorChance: 1,
		extraRpcs: [],
	});
}

export async function unwrapSol(
	owner: PublicKey, amount: number,
	signTransaction: SolanaTransactionSigner, connection?: Connection
): Promise<{
	signature: string,
	serializedTrx: Uint8Array,
}> {
	const solanaConnection = connection ??
		new Connection('https://rpc.ankr.com/solana');
	const fromAccount = getAssociatedTokenAddress(solMint, owner, false);
	const delegate = Keypair.generate();

	const {
		blockhash,
		lastValidBlockHeight,
	} = await solanaConnection.getLatestBlockhash();
	const trx = new Transaction({
		feePayer: owner,
		blockhash,
		lastValidBlockHeight,
	});

	const toAccount = getAssociatedTokenAddress(
		solMint, delegate.publicKey, false);
	trx.add(createAssociatedTokenAccountInstruction(
		owner, toAccount, delegate.publicKey, solMint
	));

	trx.add(createSplTransferInstruction(
		fromAccount, toAccount, owner,
		getAmountOfFractionalAmount(amount, 9)
	));

	trx.add(createCloseAccountInstruction(
		toAccount, owner, delegate.publicKey
	));


	trx.partialSign(delegate);
	const signedTrx = await signTransaction(trx);
	return await submitTransactionWithRetry({
		trx: signedTrx.serialize(),
		connection: solanaConnection,
		errorChance: 1,
		extraRpcs: [],
	});
}

export function deserializeInstructionInfo(instruction: InstructionInfo) {
	return new TransactionInstruction({
		programId: new PublicKey(instruction.programId),
		keys: instruction.accounts.map((key) => ({
			pubkey: new PublicKey(key.pubkey),
			isSigner: key.isSigner,
			isWritable: key.isWritable,
		})),
		data: Buffer.from(instruction.data, "base64"),
	});
}

export async function getAddressLookupTableAccounts(
	keys: string[],
	connection: Connection,
): Promise<AddressLookupTableAccount[]> {
	const addressLookupTableAccountInfos =
		await connection.getMultipleAccountsInfo(
			keys.map((key) => new PublicKey(key))
		);

	return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
		const addressLookupTableAddress = keys[index];
		if (accountInfo) {
			const addressLookupTableAccount = new AddressLookupTableAccount({
				key: new PublicKey(addressLookupTableAddress),
				state: AddressLookupTableAccount.deserialize(accountInfo.data),
			});
			acc.push(addressLookupTableAccount);
		}

		return acc;
	}, new Array<AddressLookupTableAccount>());
}


export function decentralizeClientSwapInstructions(params: SolanaClientSwap, connection: Connection) {
	const swapInstruction = deserializeInstructionInfo(params.swapInstruction);
	const cleanupInstruction = params.cleanupInstruction ?
		deserializeInstructionInfo(params.cleanupInstruction) : null;
	const computeBudgetInstructions = params.computeBudgetInstructions ?
		params.computeBudgetInstructions.map(deserializeInstructionInfo) : [];
	const setupInstructions = params.setupInstructions ?
		params.setupInstructions.map(deserializeInstructionInfo) : [];

	return {
		swapInstruction,
		cleanupInstruction,
		computeBudgetInstructions,
		setupInstructions,
		addressLookupTableAddresses: params.addressLookupTableAddresses,
	};
}

export function getAnchorInstructionData(name: string): Buffer {
	let preimage = `global:${name}`;
	return Buffer.from(sha256.digest(preimage)).slice(0, 8);
}

export async function decideRelayer(): Promise<PublicKey> {
	let relayer: PublicKey;
	try {
		const suggestedRelayer = await getSuggestedRelayer();
		relayer = new PublicKey(suggestedRelayer);
	} catch (err) {
		console.log('Relayer not found, using system program');
		relayer = SystemProgram.programId;
	}
	return relayer;
}

export function getJitoTipTransfer(
	swapper: string,
	blockhash: string,
	lastValidBlockHeight: number,
	options: JitoBundleOptions
): Transaction {
	const jitoAccount = options.jitoAccount || 'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY';
	return new Transaction({
		feePayer: new PublicKey(swapper),
		blockhash,
		lastValidBlockHeight,
	}).add(SystemProgram.transfer({
		fromPubkey: new PublicKey(swapper),
		toPubkey: new PublicKey(jitoAccount),
		lamports: options.tipLamports,
	}));
}

export async function sendJitoBundle(
	singedTrxs: Array<Transaction | VersionedTransaction>,
	options: JitoBundleOptions
) {
	try {
		let signedTrxs: Uint8Array[] = [];
		for (let trx of singedTrxs) {
			signedTrxs.push(trx.serialize());
		}
		const bundle = {
			jsonrpc: '2.0',
			id: 1,
			method: 'sendBundle',
			params: [signedTrxs.map((trx) => bs58.encode(trx))],
		};
		await fetch(options.jitoSendUrl || 'https://mainnet.block-engine.jito.wtf/api/v1/bundles', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(bundle),
		});
		console.log('Send Jito bundle success');
	} catch (err) {
		console.error('Send Jito bundle failed', err);
	}
}
