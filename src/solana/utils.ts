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
	VersionedTransaction, ComputeBudgetProgram
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
		data: Buffer.from([1]),
	});
}

const TOKEN_ACCOUNT_LEN = 165;
export async function createInitializeRandomTokenAccountInstructions(
	connection: Connection,
	payer: PublicKey,
	mint: PublicKey,
	owner: PublicKey,
	keyPair: Keypair,
	programId = new PublicKey(addresses.TOKEN_PROGRAM_ID),
): Promise<TransactionInstruction[]> {
	const instructions: TransactionInstruction[] = [];
	const rentLamports = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN);
	instructions.push(SystemProgram.createAccount({
		fromPubkey: payer,
		newAccountPubkey: keyPair.publicKey,
		lamports: rentLamports,
		space: TOKEN_ACCOUNT_LEN,
		programId,
	}));
	instructions.push(new TransactionInstruction({
		keys: [
			{ pubkey: keyPair.publicKey, isWritable: true, isSigner: false },
			{ pubkey: mint, isWritable: false, isSigner: false },
			{ pubkey: owner, isWritable: false, isSigner: false },
			{ pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
		],
		programId,
		data: Buffer.from([1]),
	}));
	return instructions;
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

type SolanaClientSwapInstructions = {
	swapInstruction: TransactionInstruction,
	cleanupInstruction: TransactionInstruction,
	computeBudgetInstructions: TransactionInstruction[],
	setupInstructions: TransactionInstruction[],
	addressLookupTableAddresses: string[]
};

export function decentralizeClientSwapInstructions(params: SolanaClientSwap, connection: Connection): SolanaClientSwapInstructions {
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
	return Buffer.from(sha256.digest(preimage)).subarray(0, 8);
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

const defaultJitoSendBundleUrls = [
	'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://london.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
	'https://slc.mainnet.block-engine.jito.wtf/api/v1/bundles',
]

async function postJitoBundle(
	url: string,
	body: string,
): Promise<any> {
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body,
	});
	if (res.status !== 200 && res.status !== 201) {
		console.error('Post Jito bundle failed', url, res.status, res.statusText);
		throw new Error('Send Jito bundle failed: ' + res.status + ' ' + res.statusText);
	} else {
		const result = await res.json();
		console.log('Post Jito bundle result', url, result.result);
		return result.result;
	}
}
export async function sendJitoBundle(
	singedTrxs: Array<Transaction | VersionedTransaction>,
	options: JitoBundleOptions,
	forceToBeSubmitted = false
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
		const urls: string[] = options.jitoSendUrl ? [options.jitoSendUrl] : defaultJitoSendBundleUrls;
		const body = JSON.stringify(bundle);
		const result = await Promise.any(urls.map(url => postJitoBundle(url, body)));
		return result;
	} catch (err) {
		console.error('Send Jito bundle failed', err);
		if (forceToBeSubmitted) {
			throw new Error(`Send Jito bundle failed`);
		}
	}
}

async function getJitoBundleStatuses(bundleIds: string[], jitoApiUrl: string) {
	const maxRetries = 5;
	let attempt = 0;

	while (attempt < maxRetries) {
		try {
			const response = await fetch(jitoApiUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'getBundleStatuses',
					params: [bundleIds],
				}),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! Status: ${response.status}`);
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(`Error getting bundle statuses: ${JSON.stringify(data.error, null, 2)}`);
			}

			return data.result;
		} catch (error) {
			attempt++;
			await wait(1000);
			if (attempt >= maxRetries) {
				throw new Error(`Failed to fetch bundle statuses after ${maxRetries} attempts: ${error.message}`);
			}
		}
	}
}


export async function confirmJitoBundleId(
	bundleId: string,
	options: JitoBundleOptions,
	lastValidBlockHeight: number,
	mayanTxSignature: string,
	connection: Connection,
) {
	const timeout = 30 * 3000;
	const startTime = Date.now();
	while (Date.now() - startTime < timeout && (await connection.getBlockHeight()) <= lastValidBlockHeight) {
		await wait(1050);
		const urls = options.jitoSendUrl ? [options.jitoSendUrl] : defaultJitoSendBundleUrls;
		const bundleStatuses = await Promise.any(urls.map(url => getJitoBundleStatuses([bundleId], url)));

		if (bundleStatuses && bundleStatuses.value && bundleStatuses.value.length > 0 && bundleStatuses.value[0]) {
			console.log('===>', bundleStatuses.value[0]);
			const status = bundleStatuses.value[0].confirmation_status;
			if (status === 'confirmed' || status === 'finalized') {
				const tx = await connection.getSignatureStatus(mayanTxSignature);
				if (!tx || !tx.value) {
					continue;
				}
				if (tx.value?.err) {
					throw new Error(`Bundle failed with error: ${tx.value.err}`);
				}
				return;
			}
		}
	}
	throw new Error('Bundle not confirmed, timeout');
}


export async function broadcastJitoBundleId(bundleId: string): Promise<void> {
	try {
		await fetch("https://explorer-api.mayan.finance/v3/submit/jito-bundle", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ bundleId }),
		});
	} catch {
		// Errors are silently ignored
	}
}

function validateJupCleanupInstruction(instruction: TransactionInstruction) {
	if (!instruction) {
		return;
	}
	if (
		!instruction.programId.equals(new PublicKey(addresses.TOKEN_PROGRAM_ID)) &&
		!instruction.programId.equals(new PublicKey(addresses.TOKEN_2022_PROGRAM_ID))
	) {
		throw new Error('Invalid cleanup instruction:: programId');
	}
	if (Uint8Array.from(instruction.data).length !== 1) {
		throw new Error('Invalid cleanup instruction:: data');
	}
	if (Uint8Array.from(instruction.data)[0] !== 9) {
		throw new Error('Invalid cleanup instruction:: data');
	}
}

function validateJupSetupInstructions(instructions: TransactionInstruction[], owner?: PublicKey) {
	if (instructions.length < 1) {
		return;
	}
	if (instructions.length > 6) {
		throw new Error('Invalid setup instruction:: too many instructions');
	}
	instructions.forEach((instruction) => {
		if (
			!instruction.programId.equals(new PublicKey(addresses.ASSOCIATED_TOKEN_PROGRAM_ID)) &&
			!instruction.programId.equals(SystemProgram.programId) &&
			!instruction.programId.equals(new PublicKey(addresses.TOKEN_PROGRAM_ID)) &&
			!instruction.programId.equals(new PublicKey(addresses.TOKEN_2022_PROGRAM_ID))
		) {
			throw new Error('Invalid setup instruction:: programId');
		}
		if (instruction.programId.equals(new PublicKey(addresses.ASSOCIATED_TOKEN_PROGRAM_ID))) {
			if (Uint8Array.from(instruction.data).length === 1) {
				if (Uint8Array.from(instruction.data)[0] !== 1) {
					throw new Error('Invalid setup instruction:: data');
				}
			} else if (Uint8Array.from(instruction.data).length !== 0) {
				throw new Error('Invalid setup instruction:: data');
			}
		} else if (instruction.programId.equals(SystemProgram.programId)) {
			if (!owner) {
				throw new Error('Invalid setup instruction:: unknown transfer');
			}
			const wSolAccount = getAssociatedTokenAddress(solMint, owner, true);
			if (instruction.data.readUint32LE() !== 2) {
				throw new Error('Invalid setup instruction:: invalid system program instruction');
			}
			if (!instruction.keys[1].pubkey.equals(wSolAccount)) {
				throw new Error('Invalid setup instruction:: invalid wrap transfer dest');
			}
		} else {
			if (instruction.data.toString('base64') !== 'EQ==') {
				throw new Error('Invalid setup instruction:: invalid token program instruction');
			}
		}
	});
}

function validateJupSwapInstruction(instruction: TransactionInstruction, validDestAccount: PublicKey) {
	if (!instruction.programId.equals(new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'))) {
		throw new Error('Invalid swap instruction:: programId');
	}
	if (instruction.data.subarray(0, 8).toString('hex') === getAnchorInstructionData('shared_accounts_route').toString('hex')) {
		if (!instruction.keys[6].pubkey.equals(validDestAccount)) {
			throw new Error(`Invalid swap instruction shared_accounts_route:: dest account`);
		}
	} else if (instruction.data.subarray(0, 8).toString('hex') === getAnchorInstructionData('route').toString('hex')) {
		if (!instruction.keys[4].pubkey.equals(validDestAccount)) {
			throw new Error('Invalid swap instruction route:: dest account');
		}
	} else {
		throw new Error('Invalid swap instruction:: ix id');
	}
}

function validateJupComputeBudgetInstructions(instructions: TransactionInstruction[]) {
	instructions.forEach((instruction) => {
		if (!instruction.programId.equals(ComputeBudgetProgram.programId)) {
			throw new Error('Invalid compute budget instruction:: programId');
		}
		if (
			Uint8Array.from(instruction.data)[0] === 3 &&
			instruction.data.readBigUInt64LE(1) > 100000000n
		) {
			throw new Error('Invalid compute budget instruction:: to high tx fee');
		}
	});
}

export function validateJupSwap(swap: SolanaClientSwapInstructions,  validDestAccount: PublicKey, validWrapOwner?: PublicKey,) {
	validateJupComputeBudgetInstructions(swap.computeBudgetInstructions);
	validateJupSetupInstructions(swap.setupInstructions, validWrapOwner);
	validateJupSwapInstruction(swap.swapInstruction, validDestAccount);
	validateJupCleanupInstruction(swap.cleanupInstruction);
}


export function createTransferAllAndCloseInstruction(
	owner: PublicKey,
	mint: PublicKey,
	tokenAccount: PublicKey,
	transferDestination: PublicKey,
	closeDestination: PublicKey,
	tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
): TransactionInstruction {
	return new TransactionInstruction({
		keys: [
			{pubkey: owner, isSigner: true, isWritable: false},
			{pubkey: tokenAccount, isSigner: false, isWritable: true},
			{pubkey: transferDestination, isSigner: false, isWritable: true},
			{pubkey: mint, isSigner: false, isWritable: false},
			{pubkey: closeDestination, isSigner: false, isWritable: true},
			{pubkey: tokenProgramId, isSigner: false, isWritable: false},
		],
		programId: new PublicKey('B96dV3Luxzo6SokJx3xt8i5y8Mb7HRR6Eec8hCjJDT69'),
		data: getAnchorInstructionData('transfer_all_and_close'),
	})
}

export function createPayloadWriterCreateInstruction(
		payer: PublicKey,
		payloadAccount: PublicKey,
		payload: Buffer,
		nonce: number,
): TransactionInstruction {
	const keys = [
		{pubkey: payer, isSigner: true, isWritable: true},
		{pubkey: payloadAccount, isSigner: false, isWritable: true},
		{pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
	];

	const dataLength =
		8 + // instruction discriminator
		2 + // nonce
		4 + // payload vector length
		payload.length;

	const insData = Buffer.alloc(dataLength);
	insData.set(getAnchorInstructionData('create_simple'), 0);
	insData.writeUint16LE(nonce, 8);
	insData.writeUint32LE(payload.length, 10);
	insData.set(payload, 14);

	return new TransactionInstruction({
		keys,
		programId: new PublicKey(addresses.PAYLOAD_WRITER_PROGRAM_ID),
		data: insData,
	});
}

export function createPayloadWriterCloseInstruction(
	payer: PublicKey,
	payloadAccount: PublicKey,
	nonce: number,
): TransactionInstruction {
	const keys = [
		{pubkey: payer, isSigner: true, isWritable: true},
		{pubkey: payloadAccount, isSigner: false, isWritable: true},
	];

	const dataLength =
		8 + // instruction discriminator
		2 // nonce;

	const insData = Buffer.alloc(dataLength);
	insData.set(getAnchorInstructionData('close'), 0);
	insData.writeUint16LE(nonce, 8);

	return new TransactionInstruction({
		keys,
		programId: new PublicKey(addresses.PAYLOAD_WRITER_PROGRAM_ID),
		data: insData,
	});
}
