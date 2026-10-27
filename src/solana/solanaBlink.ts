import {
	type AccountMeta,
	AddressLookupTableAccount,
	ComputeBudgetProgram,
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	Transaction,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import addresses from '../addresses';
import type {
	ChainReferrers,
	Quote,
	ReferrerAddresses,
	SolanaTransactionSigner,
	SwapMessageV0Params,
} from '../types';
import { getAssociatedTokenAddress, hexToUint8Array } from '../utils';
import { getBlinkPriorityFee } from '../blink/api';
import { submitAndTrackBlinkGaslessOrder } from '../blink/gasless';
import { fetchBlinkOrder, isBlinkSourceSwap } from '../blink/order';
import type { BlinkOrder, BlinkSvmInstruction, BlinkSvmSwap } from '../blink/types';
import {
	createAssociatedTokenAccountInstruction,
	createSplTransferInstruction,
	createSyncNativeInstruction,
	deserializeInstructionInfo,
	getAddressLookupTableAccounts,
	getAnchorInstructionData,
	solMint,
	TOKEN_ACCOUNT_LEN,
} from './utils';

const TOKEN_PROGRAM_ID = new PublicKey(addresses.TOKEN_PROGRAM_ID);
const TOKEN_2022_PROGRAM_ID = new PublicKey(addresses.TOKEN_2022_PROGRAM_ID);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(addresses.ASSOCIATED_TOKEN_PROGRAM_ID);

const TOKEN_2022_ACCOUNT_TYPE_ACCOUNT = 2;

const DEPOSIT_COMPUTE_UNIT_LIMIT = 50_000;
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
const SWAP_COMPUTE_UNIT_HEADROOM = 1.3;
const GASLESS_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = BigInt(10_000);

const JUPITER_SLIPPAGE_EXCEEDED = 6001;

export function isNativeBlinkSvmToken(address: string): boolean {
	return address === SystemProgram.programId.toBase58();
}

function isTokenProgram(program: PublicKey): boolean {
	return program.equals(TOKEN_PROGRAM_ID) || program.equals(TOKEN_2022_PROGRAM_ID);
}

function computeBudgetInstructions(units: number, microLamports: bigint): TransactionInstruction[] {
	return [
		ComputeBudgetProgram.setComputeUnitLimit({ units }),
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
	];
}

function swapComputeUnitLimit(simulatedUnits: number): number {
	return Math.min(MAX_COMPUTE_UNIT_LIMIT, Math.ceil(simulatedUnits * SWAP_COMPUTE_UNIT_HEADROOM));
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

function eventAuthority(programId: PublicKey): PublicKey {
	return PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], programId)[0];
}

function eventCpiAccounts(programId: PublicKey): AccountMeta[] {
	return [
		{ pubkey: eventAuthority(programId), isSigner: false, isWritable: false },
		{ pubkey: programId, isSigner: false, isWritable: false },
	];
}

export function blinkSvmSwapAuthority(programId: PublicKey, owner: PublicKey, quoteHash: string): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('swap_authority'), owner.toBytes(), hexToUint8Array(quoteHash)],
		programId
	)[0];
}

function depositData(name: string, quoteHash: string, amount: bigint): Buffer {
	const out = Buffer.alloc(48);
	getAnchorInstructionData(name).copy(out, 0);
	out.set(hexToUint8Array(quoteHash), 8);
	out.writeBigUInt64LE(amount, 40);
	return out;
}

function depositNativeInstruction(
	programId: PublicKey,
	owner: PublicKey,
	quoteHash: string,
	amount: bigint
): TransactionInstruction {
	return new TransactionInstruction({
		programId,
		keys: [
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: escrowAuthority(programId), isSigner: false, isWritable: true },
			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
			...eventCpiAccounts(programId),
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
			...eventCpiAccounts(programId),
		],
		data: depositData('deposit_token', quoteHash, amount),
	});
}

async function depositInstruction(connection: Connection, order: BlinkOrder, owner: PublicKey): Promise<TransactionInstruction> {
	const params = order.quote.orderParams;
	const programId = new PublicKey(params.routerAddress);
	const amount = BigInt(params.amountIn);
	if (isNativeBlinkSvmToken(params.srcToken)) {
		return depositNativeInstruction(programId, owner, order.quote.quoteHash, amount);
	}
	return depositTokenInstruction(connection, programId, owner, new PublicKey(params.srcToken), order.quote.quoteHash, amount);
}

function rejectSwap(reason: string): never {
	throw new Error(`Blink swap instructions rejected: ${reason}`);
}

function metaPubkey(ix: BlinkSvmInstruction, index: number): PublicKey {
	const meta = ix.accounts[index];
	if (!meta) {
		rejectSwap(`instruction is missing account ${index}`);
	}
	return new PublicKey(meta.pubkey);
}

type AuthorityTokenAccount = {
	address: PublicKey;
	mint: PublicKey;
	tokenProgram: PublicKey;
};

function authorityTokenAccountCreated(
	depositor: PublicKey,
	authority: PublicKey,
	ix: BlinkSvmInstruction
): AuthorityTokenAccount {
	const program = new PublicKey(ix.programId);
	if (!program.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
		rejectSwap(`setup instruction targets disallowed program ${program.toBase58()}`);
	}
	const data = Buffer.from(ix.data, 'base64');
	if (data.length > 1 || (data.length === 1 && data[0] > 1)) {
		rejectSwap('associated token instruction is not a create');
	}
	ix.accounts.forEach((meta, index) => {
		if (meta.isSigner && index !== 0) {
			rejectSwap(`setup instruction requires signature from ${meta.pubkey}`);
		}
	});
	const funder = metaPubkey(ix, 0);
	const address = metaPubkey(ix, 1);
	const wallet = metaPubkey(ix, 2);
	const mint = metaPubkey(ix, 3);
	const tokenProgram = metaPubkey(ix, 5);
	if (!funder.equals(depositor)) {
		rejectSwap(`token account rent is paid by ${funder.toBase58()}, not the depositor`);
	}
	if (!wallet.equals(authority)) {
		rejectSwap(`setup creates a token account for ${wallet.toBase58()}, not the swap authority`);
	}
	if (!isTokenProgram(tokenProgram)) {
		rejectSwap(`setup creates a token account under ${tokenProgram.toBase58()}`);
	}
	if (!address.equals(getAssociatedTokenAddress(mint, authority, true, tokenProgram))) {
		rejectSwap(`setup creates ${address.toBase58()}, not the swap authority's associated token account`);
	}
	return { address, mint, tokenProgram };
}

function checkSwapStep(
	depositor: PublicKey,
	authority: PublicKey,
	swapIx: BlinkSvmInstruction,
	allowedSwapPrograms: PublicKey[]
): void {
	const program = new PublicKey(swapIx.programId);
	if (!allowedSwapPrograms.some((p) => p.equals(program))) {
		rejectSwap(`swap instruction targets non-allowlisted program ${program.toBase58()}`);
	}
	for (const meta of swapIx.accounts) {
		const pubkey = new PublicKey(meta.pubkey);
		if (pubkey.equals(depositor)) {
			rejectSwap('swap instruction is handed the depositor');
		}
		if (meta.isSigner && !pubkey.equals(authority)) {
			rejectSwap(`swap instruction requires signature from ${pubkey.toBase58()}, only the swap authority may sign`);
		}
	}
}

function checkSwapInstructions(
	depositor: PublicKey,
	authority: PublicKey,
	swap: BlinkSvmSwap,
	allowedSwapPrograms: PublicKey[]
): AuthorityTokenAccount[] {
	if (swap.cleanup.length > 0) {
		rejectSwap('aggregator cleanup instructions are not permitted');
	}
	const created = swap.setup.map((ix) => authorityTokenAccountCreated(depositor, authority, ix));
	checkSwapStep(depositor, authority, swap.swap, allowedSwapPrograms);
	return created;
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
	maxDrop: bigint;
};

type TokenSpend = {
	account: PublicKey;
	amount: bigint;
};

async function collectDepositorTokenAccounts(
	connection: Connection,
	instructions: TransactionInstruction[],
	depositor: PublicKey,
	spend: TokenSpend | undefined
): Promise<WatchedAccount[]> {
	const writable = instructions.flatMap((ix) => ix.keys.filter((k) => k.isWritable).map((k) => k.pubkey));
	const unique = [...new Map(writable.map((k) => [k.toBase58(), k])).values()];
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
			if (isDepositorTokenAccount(depositor, account.owner, data)) {
				watched.push({
					pubkey: chunk[j],
					preAmount: tokenAccountAmount(data),
					maxDrop: spend && chunk[j].equals(spend.account) ? spend.amount : BigInt(0),
				});
			}
		}
	}
	return watched;
}

async function simulateSwapDeposit(
	connection: Connection,
	transaction: VersionedTransaction,
	watched: WatchedAccount[]
): Promise<number> {
	const sim = await connection.simulateTransaction(transaction, {
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
		const { pubkey, preAmount, maxDrop } = watched[i];
		const post = postAccounts[i];
		let postAmount = BigInt(0);
		if (post && Array.isArray(post.data)) {
			const data = Buffer.from(post.data[0], 'base64');
			if (isTokenProgram(new PublicKey(post.owner)) && data.length >= TOKEN_ACCOUNT_LEN) {
				postAmount = tokenAccountAmount(data);
			}
		}
		const floor = preAmount - (preAmount < maxDrop ? preAmount : maxDrop);
		if (postAmount < floor) {
			rejectSwap(
				`simulated balance of depositor token account ${pubkey.toBase58()} drops from ${preAmount} to ${postAmount}, beyond the swap input`
			);
		}
	}
	if (sim.value.unitsConsumed === undefined) {
		throw new Error('Blink swap deposit simulation did not report compute units');
	}
	return sim.value.unitsConsumed;
}

type TokenMint = {
	address: PublicKey;
	tokenProgram: PublicKey;
};

async function loadMint(connection: Connection, address: PublicKey): Promise<TokenMint> {
	return { address, tokenProgram: await tokenProgramOf(connection, address) };
}

type AuthorityFunding = {
	instructions: TransactionInstruction[];
	spend?: TokenSpend;
};

function fundAuthorityWithLamports(depositor: PublicKey, authorityInput: PublicKey, amount: bigint): AuthorityFunding {
	return {
		instructions: [
			SystemProgram.transfer({
				fromPubkey: depositor,
				toPubkey: authorityInput,
				lamports: amount,
			}),
			createSyncNativeInstruction(authorityInput),
		],
	};
}

function fundAuthorityWithTokens(
	depositor: PublicKey,
	authorityInput: PublicKey,
	source: TokenMint,
	amount: bigint
): AuthorityFunding {
	const depositorInput = getAssociatedTokenAddress(source.address, depositor, true, source.tokenProgram);
	return {
		instructions: [
			createSplTransferInstruction(depositorInput, authorityInput, depositor, amount, source.tokenProgram),
		],
		spend: { account: depositorInput, amount },
	};
}

function closeSwapAccountData(quoteHash: string): Buffer {
	const out = Buffer.alloc(40);
	getAnchorInstructionData('close_swap_account').copy(out, 0);
	out.set(hexToUint8Array(quoteHash), 8);
	return out;
}

function closeAuthorityAccount(
	programId: PublicKey,
	quoteHash: string,
	depositor: PublicKey,
	authority: PublicKey,
	account: AuthorityTokenAccount
): TransactionInstruction {
	return new TransactionInstruction({
		programId,
		keys: [
			{ pubkey: depositor, isSigner: true, isWritable: true },
			{ pubkey: authority, isSigner: false, isWritable: false },
			{ pubkey: account.address, isSigner: false, isWritable: true },
			{ pubkey: account.tokenProgram, isSigner: false, isWritable: false },
		],
		data: closeSwapAccountData(quoteHash),
	});
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

function uniqueAuthorityAccounts(accounts: AuthorityTokenAccount[]): AuthorityTokenAccount[] {
	return [...new Map(accounts.map((a) => [a.address.toBase58(), a])).values()];
}

async function compileSwapDeposit(
	connection: Connection,
	owner: PublicKey,
	instructions: TransactionInstruction[],
	lookupTables: AddressLookupTableAccount[]
): Promise<VersionedTransaction> {
	const message = new TransactionMessage({
		payerKey: owner,
		recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
		instructions,
	}).compileToV0Message(lookupTables);
	return new VersionedTransaction(message);
}

async function buildSwapDepositInstructions(
	connection: Connection,
	order: BlinkOrder,
	owner: PublicKey,
	computeUnitPriceMicroLamports: bigint
): Promise<{ instructions: TransactionInstruction[]; lookupTables: AddressLookupTableAccount[] }> {
	const params = order.quote.orderParams;
	const swap = order.swap?.svm;
	if (!order.swap || !swap) {
		throw new Error('Blink returned swap instructions that are not for Solana');
	}
	const quoteHash = order.quote.quoteHash;
	const amount = BigInt(params.amountIn);
	const programId = new PublicKey(order.swap.routerAddress);
	const authority = blinkSvmSwapAuthority(programId, owner, quoteHash);
	const bridgeMint = new PublicKey(params.bridgeTokenSrc);
	const escrow = escrowAuthority(programId);
	const tokenProgram = await tokenProgramOf(connection, bridgeMint);
	const nativeSrc = isNativeBlinkSvmToken(params.srcToken);
	const source = await loadMint(connection, nativeSrc ? solMint : new PublicKey(params.srcToken));
	const authorityInput = getAssociatedTokenAddress(source.address, authority, true, source.tokenProgram);
	const swapPrograms = order.contracts.swapPrograms.map((p) => new PublicKey(p));
	const created = checkSwapInstructions(owner, authority, swap, swapPrograms);
	const funding = nativeSrc
		? fundAuthorityWithLamports(owner, authorityInput, amount)
		: fundAuthorityWithTokens(owner, authorityInput, source, amount);
	const authorityAccounts = uniqueAuthorityAccounts([
		{ address: authorityInput, mint: source.address, tokenProgram: source.tokenProgram },
		...created,
	]);
	const depositIx = new TransactionInstruction({
		programId,
		keys: [
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: bridgeMint, isSigner: false, isWritable: false },
			{ pubkey: escrow, isSigner: false, isWritable: false },
			{ pubkey: getAssociatedTokenAddress(bridgeMint, escrow, true, tokenProgram), isSigner: false, isWritable: true },
			{ pubkey: authority, isSigner: false, isWritable: false },
			{ pubkey: new PublicKey(swap.swap.programId), isSigner: false, isWritable: false },
			{ pubkey: tokenProgram, isSigner: false, isWritable: false },
			...eventCpiAccounts(programId),
			...swap.swap.accounts.map((meta) => {
				const pubkey = new PublicKey(meta.pubkey);
				return {
					pubkey,
					isSigner: meta.isSigner && !pubkey.equals(authority),
					isWritable: meta.isWritable,
				};
			}),
		],
		data: swapDepositData(
			quoteHash,
			new PublicKey(params.srcToken),
			amount,
			BigInt(params.minBridgeOut),
			Buffer.from(swap.swap.data, 'base64')
		),
	});
	const body = [
		createAssociatedTokenAccountInstruction(owner, authorityInput, authority, source.address, source.tokenProgram),
		...funding.instructions,
		...swap.setup.map(deserializeInstructionInfo),
		depositIx,
		...authorityAccounts.map((account) => closeAuthorityAccount(programId, quoteHash, owner, authority, account)),
	];
	const watched = await collectDepositorTokenAccounts(connection, body, owner, funding.spend);
	const tableAddresses = swap.lookupTables.map((table) => table.address);
	const lookupTables = await getAddressLookupTableAccounts(tableAddresses, connection);
	if (lookupTables.length !== tableAddresses.length) {
		throw new Error('Blink swap lookup table not found');
	}
	const probe = await compileSwapDeposit(
		connection,
		owner,
		[ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNIT_LIMIT }), ...body],
		lookupTables
	);
	const simulatedUnits = await simulateSwapDeposit(connection, probe, watched);
	return {
		instructions: [
			...computeBudgetInstructions(swapComputeUnitLimit(simulatedUnits), computeUnitPriceMicroLamports),
			...body,
		],
		lookupTables,
	};
}

function assertBlinkSolanaQuote(quote: Quote): void {
	if (quote.type !== 'BLINK') {
		throw new Error('Unsupported quote type for Blink: ' + quote.type);
	}
	if (quote.fromChain !== 'solana') {
		throw new Error('Unsupported source chain for Blink: ' + quote.fromChain);
	}
}

export async function createBlinkFromSolanaInstructions(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	connection: Connection,
	apiKey?: string
): Promise<{
	instructions: TransactionInstruction[];
	signers: Keypair[];
	lookupTables: AddressLookupTableAccount[];
	swapMessageV0Params: SwapMessageV0Params | null;
}> {
	assertBlinkSolanaQuote(quote);
	if (quote.gasless) {
		throw new Error('Gasless Blink quotes are submitted through swapFromSolana');
	}
	const [order, computeUnitPrice] = await Promise.all([
		fetchBlinkOrder(quote, swapperAddress, destinationAddress, referrerAddresses, apiKey),
		getBlinkPriorityFee(quote.fromChain),
	]);
	const owner = new PublicKey(swapperAddress);
	if (!isBlinkSourceSwap(order.quote.orderParams)) {
		const instructions = [
			...computeBudgetInstructions(DEPOSIT_COMPUTE_UNIT_LIMIT, computeUnitPrice),
			await depositInstruction(connection, order, owner),
		];
		return { instructions, signers: [], lookupTables: [], swapMessageV0Params: null };
	}
	const { instructions, lookupTables } = await buildSwapDepositInstructions(connection, order, owner, computeUnitPrice);
	return { instructions, signers: [], lookupTables, swapMessageV0Params: null };
}

export async function swapBlinkGaslessFromSolana(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	signTransaction: SolanaTransactionSigner,
	connection: Connection,
	apiKey?: string
): Promise<{ signature: string; serializedTrx: Uint8Array | null }> {
	assertBlinkSolanaQuote(quote);
	if (!quote.gasless) {
		throw new Error('Quote is not a gasless BLINK quote');
	}
	const order = await fetchBlinkOrder(quote, swapperAddress, destinationAddress, referrerAddresses, apiKey);
	if (isBlinkSourceSwap(order.quote.orderParams)) {
		throw new Error('Gasless Blink swap deposits are unavailable on solana');
	}
	const sponsor = order.quote.sponsorAddress;
	if (!sponsor) {
		throw new Error('Gasless Blink deposits are unavailable on solana');
	}
	const owner = new PublicKey(swapperAddress);
	const transaction = new Transaction().add(
		...computeBudgetInstructions(DEPOSIT_COMPUTE_UNIT_LIMIT, GASLESS_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS),
		await depositInstruction(connection, order, owner)
	);
	transaction.feePayer = new PublicKey(sponsor);
	transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
	const signed = await signTransaction(transaction);
	const txBase64 = Buffer.from(
		signed.serialize({
			requireAllSignatures: false,
			verifySignatures: false,
		})
	).toString('base64');
	await submitAndTrackBlinkGaslessOrder({ quoteHash: order.quote.quoteHash, svm: { txBase64 } });
	return { signature: order.quote.quoteHash, serializedTrx: null };
}
