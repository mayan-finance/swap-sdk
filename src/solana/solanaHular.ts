import {
	AddressLookupTableAccount,
	ComputeBudgetProgram,
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Buffer } from 'buffer';
import addresses from '../addresses';
import type { ChainReferrers, Quote, ReferrerAddresses, SwapMessageV0Params } from '../types';
import { getAssociatedTokenAddress, hexToUint8Array } from '../utils';
import { fetchHularOrder, isHularSourceSwap } from '../hular/order';
import type { HularOrder, HularSvmInstruction, HularSvmSwap } from '../hular/types';
import { getAddressLookupTableAccounts, getAnchorInstructionData, solMint } from './utils';

const TOKEN_PROGRAM_ID = new PublicKey(addresses.TOKEN_PROGRAM_ID);
const TOKEN_2022_PROGRAM_ID = new PublicKey(addresses.TOKEN_2022_PROGRAM_ID);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(addresses.ASSOCIATED_TOKEN_PROGRAM_ID);
const DEFAULT_SWAP_PROGRAMS = [new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')];

const SPL_TOKEN_ACCOUNT_RENT_LAMPORTS = BigInt(2039280);
const SWAP_LAMPORTS_ALLOWANCE = BigInt(3) * SPL_TOKEN_ACCOUNT_RENT_LAMPORTS;

const TOKEN_INITIALIZE_ACCOUNT = 1;
const TOKEN_TRANSFER = 3;
const TOKEN_CLOSE_ACCOUNT = 9;
const TOKEN_TRANSFER_CHECKED = 12;
const TOKEN_INITIALIZE_ACCOUNT2 = 16;
const TOKEN_SYNC_NATIVE = 17;
const TOKEN_INITIALIZE_ACCOUNT3 = 18;

const SYSTEM_CREATE_ACCOUNT = 0;
const SYSTEM_TRANSFER = 2;
const SYSTEM_CREATE_ACCOUNT_WITH_SEED = 3;

const TOKEN_ACCOUNT_LEN = 165;
const TOKEN_2022_ACCOUNT_TYPE_ACCOUNT = 2;

const DEPOSIT_COMPUTE_UNIT_LIMIT = 50000;
const DEPOSIT_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 10000;

const JUPITER_SLIPPAGE_EXCEEDED = 6001;

function isNativeSvmToken(address: string): boolean {
	return address === SystemProgram.programId.toBase58();
}

function isTokenProgram(programId: PublicKey): boolean {
	return programId.equals(TOKEN_PROGRAM_ID) || programId.equals(TOKEN_2022_PROGRAM_ID);
}

async function tokenProgramOf(connection: Connection, mint: PublicKey): Promise<PublicKey> {
	const info = await connection.getAccountInfo(mint);
	if (!info) {
		throw new Error(`mint ${mint.toBase58()} not found`);
	}
	return info.owner;
}

function escrowAuthority(programId: PublicKey): PublicKey {
	return PublicKey.findProgramAddressSync([Buffer.from('escrow')], programId)[0];
}

function depositData(name: string, quoteHash: string, amount: bigint): Buffer {
	const out = Buffer.alloc(48);
	getAnchorInstructionData(name).copy(out, 0);
	out.set(hexToUint8Array(quoteHash), 8);
	out.writeBigUInt64LE(amount, 40);
	return out;
}

function depositNativeInstruction(programId: PublicKey, owner: PublicKey, quoteHash: string, amount: bigint): TransactionInstruction {
	return new TransactionInstruction({
		programId,
		keys: [
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: escrowAuthority(programId), isSigner: false, isWritable: true },
			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
		],
		data: depositData('deposit_native', quoteHash, amount),
	});
}

async function depositTokenInstruction(
	connection: Connection,
	programId: PublicKey,
	owner: PublicKey,
	mint: PublicKey,
	quoteHash: string,
	amount: bigint
): Promise<TransactionInstruction> {
	const escrow = escrowAuthority(programId);
	const tokenProgram = await tokenProgramOf(connection, mint);
	return new TransactionInstruction({
		programId,
		keys: [
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: mint, isSigner: false, isWritable: false },
			{ pubkey: getAssociatedTokenAddress(mint, owner, true, tokenProgram), isSigner: false, isWritable: true },
			{ pubkey: escrow, isSigner: false, isWritable: false },
			{ pubkey: getAssociatedTokenAddress(mint, escrow, true, tokenProgram), isSigner: false, isWritable: true },
			{ pubkey: tokenProgram, isSigner: false, isWritable: false },
		],
		data: depositData('deposit_token', quoteHash, amount),
	});
}

async function buildDepositInstructions(
	connection: Connection,
	order: HularOrder,
	owner: PublicKey
): Promise<TransactionInstruction[]> {
	const params = order.quote.orderParams;
	const programId = new PublicKey(params.routerAddress);
	const amount = BigInt(params.amountIn);
	const instruction = isNativeSvmToken(params.srcToken)
		? depositNativeInstruction(programId, owner, order.quote.quoteHash, amount)
		: await depositTokenInstruction(connection, programId, owner, new PublicKey(params.srcToken), order.quote.quoteHash, amount);
	return [
		ComputeBudgetProgram.setComputeUnitLimit({ units: DEPOSIT_COMPUTE_UNIT_LIMIT }),
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports: DEPOSIT_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS }),
		instruction,
	];
}

function toInstruction(ix: HularSvmInstruction): TransactionInstruction {
	return new TransactionInstruction({
		programId: new PublicKey(ix.programId),
		keys: ix.accounts.map((meta) => ({
			pubkey: new PublicKey(meta.pubkey),
			isSigner: meta.isSigner,
			isWritable: meta.isWritable,
		})),
		data: Buffer.from(ix.data, 'base64'),
	});
}

function rejectSwap(reason: string): never {
	throw new Error(`Hular swap instructions rejected: ${reason}`);
}

async function resolveSwapPrograms(chain: string, swap: HularSvmSwap, expectedSigner: string): Promise<PublicKey[]> {
	if (swap.allowedSwapPrograms.length === 0) {
		return DEFAULT_SWAP_PROGRAMS;
	}
	if (!expectedSigner) {
		rejectSwap('swap program allowlist has no expected signer to verify against');
	}
	if (!swap.swapProgramsSignature) {
		rejectSwap('swap program allowlist is unsigned');
	}
	const message = Buffer.from(`hular-swap-programs:${chain}:${swap.allowedSwapPrograms.join(',')}`);
	const signer = new Ed25519PublicKey(new PublicKey(expectedSigner).toBytes());
	const valid = await signer.verify(message, hexToUint8Array(swap.swapProgramsSignature));
	if (!valid) {
		rejectSwap('swap program allowlist signature is invalid');
	}
	return swap.allowedSwapPrograms.map((program) => new PublicKey(program));
}

function dataU64(data: Buffer, offset: number): bigint {
	if (data.length < offset + 8) {
		rejectSwap('truncated instruction data');
	}
	return data.readBigUInt64LE(offset);
}

function metaPubkey(ix: HularSvmInstruction, index: number): PublicKey {
	const meta = ix.accounts[index];
	if (!meta) {
		rejectSwap(`instruction is missing account ${index}`);
	}
	return new PublicKey(meta.pubkey);
}

type SwapBudgets = {
	tokenIn: bigint;
	lamportsIn: bigint;
};

function checkSwapMetas(authority: PublicKey, ix: HularSvmInstruction, writable: PublicKey[]): void {
	for (const meta of ix.accounts) {
		const pubkey = new PublicKey(meta.pubkey);
		if (meta.isSigner && !pubkey.equals(authority)) {
			rejectSwap(`instruction requires signature from ${pubkey.toBase58()}, only the depositor may sign`);
		}
		if (meta.isWritable) {
			writable.push(pubkey);
		}
	}
}

function checkTokenInstruction(
	authority: PublicKey,
	inputAccount: PublicKey,
	ix: HularSvmInstruction,
	data: Buffer,
	budgets: SwapBudgets
): void {
	const tag = data[0];
	switch (tag) {
		case TOKEN_INITIALIZE_ACCOUNT:
		case TOKEN_INITIALIZE_ACCOUNT2:
		case TOKEN_INITIALIZE_ACCOUNT3:
		case TOKEN_SYNC_NATIVE:
			return;
		case TOKEN_CLOSE_ACCOUNT: {
			const destination = metaPubkey(ix, 1);
			const owner = metaPubkey(ix, 2);
			if (!destination.equals(authority) || !owner.equals(authority)) {
				rejectSwap('close account must return funds to the depositor');
			}
			return;
		}
		case TOKEN_TRANSFER:
		case TOKEN_TRANSFER_CHECKED: {
			const source = metaPubkey(ix, 0);
			const owner = metaPubkey(ix, tag === TOKEN_TRANSFER ? 2 : 3);
			if (!source.equals(inputAccount)) {
				rejectSwap(`token transfer from ${source.toBase58()} is not the swap input account`);
			}
			if (!owner.equals(authority)) {
				rejectSwap('token transfer authority is not the depositor');
			}
			const amount = dataU64(data, 1);
			if (amount > budgets.tokenIn) {
				rejectSwap('token transfers exceed the swap input amount');
			}
			budgets.tokenIn -= amount;
			return;
		}
		default:
			rejectSwap(`token instruction tag ${tag} is not permitted`);
	}
}

function checkSystemInstruction(authority: PublicKey, ix: HularSvmInstruction, data: Buffer, budgets: SwapBudgets): void {
	if (data.length < 4) {
		rejectSwap('truncated system instruction');
	}
	const tag = data.readUInt32LE(0);
	let lamports: bigint;
	let ownerOffset: number | null;
	switch (tag) {
		case SYSTEM_TRANSFER:
			lamports = dataU64(data, 4);
			ownerOffset = null;
			break;
		case SYSTEM_CREATE_ACCOUNT:
			lamports = dataU64(data, 4);
			ownerOffset = 20;
			break;
		case SYSTEM_CREATE_ACCOUNT_WITH_SEED: {
			const seedLen = Number(dataU64(data, 36));
			lamports = dataU64(data, 44 + seedLen);
			ownerOffset = 60 + seedLen;
			break;
		}
		default:
			rejectSwap(`system instruction tag ${tag} is not permitted`);
	}
	const funder = metaPubkey(ix, 0);
	if (!funder.equals(authority)) {
		rejectSwap(`system lamport spend from ${funder.toBase58()} is not the depositor`);
	}
	if (ownerOffset !== null) {
		const ownerBytes = data.subarray(ownerOffset, ownerOffset + 32);
		if (ownerBytes.length !== 32) {
			rejectSwap('truncated system create instruction');
		}
		const owner = new PublicKey(ownerBytes);
		if (!isTokenProgram(owner)) {
			rejectSwap(`created account owner ${owner.toBase58()} is not a token program`);
		}
	}
	if (lamports > budgets.lamportsIn) {
		rejectSwap('lamport spends exceed the swap budget');
	}
	budgets.lamportsIn -= lamports;
}

function checkSupportInstruction(
	authority: PublicKey,
	inputAccount: PublicKey,
	ix: HularSvmInstruction,
	budgets: SwapBudgets,
	writable: PublicKey[]
): void {
	checkSwapMetas(authority, ix, writable);
	const program = new PublicKey(ix.programId);
	const data = Buffer.from(ix.data, 'base64');
	if (isTokenProgram(program)) {
		checkTokenInstruction(authority, inputAccount, ix, data, budgets);
	} else if (program.equals(SystemProgram.programId)) {
		checkSystemInstruction(authority, ix, data, budgets);
	} else if (program.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
		if (data.length > 1 || (data.length === 1 && data[0] > 1)) {
			rejectSwap('associated token instruction is not a create');
		}
	} else {
		rejectSwap(`setup or cleanup instruction targets disallowed program ${program.toBase58()}`);
	}
}

function checkSwapInstructions(
	authority: PublicKey,
	inputAccount: PublicKey,
	maxTokenIn: bigint,
	maxLamportsIn: bigint,
	swap: HularSvmSwap,
	allowedSwapPrograms: PublicKey[]
): PublicKey[] {
	const writable: PublicKey[] = [];
	const budgets: SwapBudgets = { tokenIn: maxTokenIn, lamportsIn: maxLamportsIn };
	for (const ix of [...swap.setup, ...swap.cleanup]) {
		checkSupportInstruction(authority, inputAccount, ix, budgets, writable);
	}
	const program = new PublicKey(swap.swap.programId);
	if (!allowedSwapPrograms.some((allowed) => allowed.equals(program))) {
		rejectSwap(`swap instruction targets non-allowlisted program ${program.toBase58()}`);
	}
	checkSwapMetas(authority, swap.swap, writable);
	return writable;
}

function isDepositorTokenAccount(owner: PublicKey, programId: PublicKey, data: Uint8Array): boolean {
	if (!isTokenProgram(programId)) {
		return false;
	}
	if (data.length < TOKEN_ACCOUNT_LEN) {
		return false;
	}
	if (data.length > TOKEN_ACCOUNT_LEN && data[TOKEN_ACCOUNT_LEN] !== TOKEN_2022_ACCOUNT_TYPE_ACCOUNT) {
		return false;
	}
	return new PublicKey(data.slice(32, 64)).equals(owner);
}

function tokenAccountAmount(data: Uint8Array): bigint {
	return Buffer.from(data.buffer, data.byteOffset, data.byteLength).readBigUInt64LE(64);
}

function describeSimulationError(err: unknown, logs: string[]): string {
	for (let i = logs.length - 1; i >= 0; i--) {
		const anchor = logs[i].match(/Error Message: (.+?)\.?$/);
		if (anchor) {
			return `swap would fail on-chain: ${anchor[1]}`;
		}
	}
	const custom = JSON.stringify(err).match(/"Custom":(\d+)/);
	if (custom && Number(custom[1]) === JUPITER_SLIPPAGE_EXCEEDED) {
		return 'swap would fail on-chain: price moved beyond the slippage tolerance, try again';
	}
	return `swap would fail on-chain (${JSON.stringify(err)})`;
}

type WatchedAccount = {
	pubkey: PublicKey;
	preAmount: bigint;
};

async function collectDepositorTokenAccounts(
	connection: Connection,
	writable: PublicKey[],
	authority: PublicKey
): Promise<WatchedAccount[]> {
	const unique = [...new Map(writable.map((key) => [key.toBase58(), key])).values()];
	const watched: WatchedAccount[] = [];
	for (let i = 0; i < unique.length; i += 100) {
		const chunk = unique.slice(i, i + 100);
		const accounts = await connection.getMultipleAccountsInfo(chunk);
		for (let j = 0; j < chunk.length; j++) {
			const account = accounts[j];
			if (!account) {
				continue;
			}
			const data = new Uint8Array(account.data);
			if (isDepositorTokenAccount(authority, account.owner, data)) {
				watched.push({ pubkey: chunk[j], preAmount: tokenAccountAmount(data) });
			}
		}
	}
	return watched;
}

async function assertSwapBalances(
	connection: Connection,
	owner: PublicKey,
	instructions: TransactionInstruction[],
	lookupTables: AddressLookupTableAccount[],
	watched: WatchedAccount[],
	inputAccount: PublicKey,
	maxInputSpend: bigint
): Promise<void> {
	if (watched.length === 0) {
		return;
	}
	const message = new TransactionMessage({
		payerKey: owner,
		recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
		instructions,
	}).compileToV0Message(lookupTables);
	const sim = await connection.simulateTransaction(new VersionedTransaction(message), {
		sigVerify: false,
		replaceRecentBlockhash: true,
		accounts: {
			encoding: 'base64',
			addresses: watched.map((w) => w.pubkey.toBase58()),
		},
	});
	if (sim.value.err) {
		rejectSwap(describeSimulationError(sim.value.err, sim.value.logs ?? []));
	}
	const postAccounts = sim.value.accounts ?? [];
	for (let i = 0; i < watched.length; i++) {
		const { pubkey, preAmount } = watched[i];
		const post = postAccounts[i];
		let postAmount = BigInt(0);
		if (post && Array.isArray(post.data)) {
			const data = Buffer.from(post.data[0], 'base64');
			if (isTokenProgram(new PublicKey(post.owner)) && data.length >= TOKEN_ACCOUNT_LEN) {
				postAmount = tokenAccountAmount(data);
			}
		}
		const floor = pubkey.equals(inputAccount)
			? preAmount - (preAmount < maxInputSpend ? preAmount : maxInputSpend)
			: preAmount;
		if (postAmount < floor) {
			rejectSwap(
				`simulated balance of depositor token account ${pubkey.toBase58()} drops from ${preAmount} to ${postAmount}, beyond the swap input`
			);
		}
	}
}

function swapDepositData(
	quoteHash: string,
	srcMint: PublicKey,
	srcAmount: bigint,
	minBridgeOut: bigint,
	swapData: Buffer
): Buffer {
	const out = Buffer.alloc(92 + swapData.length);
	getAnchorInstructionData('deposit_swap').copy(out, 0);
	out.set(hexToUint8Array(quoteHash), 8);
	out.set(srcMint.toBytes(), 40);
	out.writeBigUInt64LE(srcAmount, 72);
	out.writeBigUInt64LE(minBridgeOut, 80);
	out.writeUInt32LE(swapData.length, 88);
	swapData.copy(out, 92);
	return out;
}

async function buildSwapDepositInstructions(
	connection: Connection,
	order: HularOrder,
	owner: PublicKey
): Promise<{ instructions: TransactionInstruction[]; lookupTables: AddressLookupTableAccount[] }> {
	const params = order.quote.orderParams;
	const swap = order.swap?.svm;
	if (!order.swap || !swap) {
		throw new Error('Hular returned swap instructions that are not for Solana');
	}
	if (!order.chain.treasury) {
		throw new Error('Hular swap deposits are unavailable on solana');
	}
	const amount = BigInt(params.amountIn);
	const bridgeMint = new PublicKey(params.bridgeTokenSrc);
	const programId = new PublicKey(order.swap.routerAddress);
	const escrow = escrowAuthority(programId);
	const tokenProgram = await tokenProgramOf(connection, bridgeMint);
	const nativeSrc = isNativeSvmToken(params.srcToken);
	const srcMint = new PublicKey(params.srcToken);
	const inputAccount = nativeSrc
		? getAssociatedTokenAddress(solMint, owner, true, TOKEN_PROGRAM_ID)
		: getAssociatedTokenAddress(srcMint, owner, true, await tokenProgramOf(connection, srcMint));
	const swapPrograms = await resolveSwapPrograms(params.srcChain, swap, order.chain.treasury);
	const writable = checkSwapInstructions(
		owner,
		inputAccount,
		amount,
		(nativeSrc ? amount : BigInt(0)) + SWAP_LAMPORTS_ALLOWANCE,
		swap,
		swapPrograms
	);
	const depositIx = new TransactionInstruction({
		programId,
		keys: [
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: bridgeMint, isSigner: false, isWritable: false },
			{ pubkey: escrow, isSigner: false, isWritable: false },
			{ pubkey: getAssociatedTokenAddress(bridgeMint, escrow, true, tokenProgram), isSigner: false, isWritable: true },
			{ pubkey: new PublicKey(swap.swap.programId), isSigner: false, isWritable: false },
			{ pubkey: tokenProgram, isSigner: false, isWritable: false },
			...swap.swap.accounts.map((meta) => ({
				pubkey: new PublicKey(meta.pubkey),
				isSigner: meta.isSigner,
				isWritable: meta.isWritable,
			})),
		],
		data: swapDepositData(
			order.quote.quoteHash,
			srcMint,
			amount,
			BigInt(params.minBridgeOut),
			Buffer.from(swap.swap.data, 'base64')
		),
	});
	const instructions = [...swap.setup.map(toInstruction), depositIx, ...swap.cleanup.map(toInstruction)];
	const tableAddresses = swap.lookupTables.map((table) => table.address);
	const lookupTables = await getAddressLookupTableAccounts(tableAddresses, connection);
	if (lookupTables.length !== tableAddresses.length) {
		throw new Error('Hular swap lookup table not found');
	}
	const watched = await collectDepositorTokenAccounts(connection, writable, owner);
	await assertSwapBalances(connection, owner, instructions, lookupTables, watched, inputAccount, amount);
	return { instructions, lookupTables };
}

export async function createHularFromSolanaInstructions(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	connection: Connection,
	options: {
		apiKey?: string;
	} = {}
): Promise<{
	instructions: TransactionInstruction[];
	signers: Keypair[];
	lookupTables: AddressLookupTableAccount[];
	swapMessageV0Params: SwapMessageV0Params | null;
}> {
	if (quote.type !== 'HULAR') {
		throw new Error('Unsupported quote type for hular: ' + quote.type);
	}
	if (quote.fromChain !== 'solana') {
		throw new Error('Unsupported source chain for hular: ' + quote.fromChain);
	}
	const order = await fetchHularOrder(quote, swapperAddress, destinationAddress, referrerAddresses, options.apiKey);
	const owner = new PublicKey(swapperAddress);
	if (!isHularSourceSwap(order.quote.orderParams)) {
		const instructions = await buildDepositInstructions(connection, order, owner);
		return { instructions, signers: [], lookupTables: [], swapMessageV0Params: null };
	}
	const { instructions, lookupTables } = await buildSwapDepositInstructions(connection, order, owner);
	return { instructions, signers: [], lookupTables, swapMessageV0Params: null };
}
