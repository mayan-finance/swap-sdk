import {
	type AccountMeta,
	AddressLookupTableAccount,
	ComputeBudgetProgram,
	Connection,
	Keypair,
	PACKET_DATA_SIZE,
	PublicKey,
	SystemProgram,
	Transaction,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js';
import { blob, struct, u32 } from '@solana/buffer-layout';
import { Buffer } from 'buffer';
import addresses from '../addresses';
import type {
	BlinkOrder,
	BlinkSvmSwap,
	ChainReferrers,
	InstructionInfo,
	Quote,
	ReferrerAddresses,
	SolanaTransactionSigner,
	SwapMessageV0Params,
} from '../types';
import { getAssociatedTokenAddress, getSafeU64Blob, hexToUint8Array } from '../utils';
import { getBlinkPriorityFee, submitBlinkGaslessOrder } from '../api';
import { resolveBlinkOrder, needsBlinkSourceSwap } from '../blink/order';
import {
	createAssociatedTokenAccountInstruction,
	createSplTransferCheckInstruction,
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
const TOKEN_ACCOUNT_OWNER_OFFSET = 32;
const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64;

const DEPOSIT_COMPUTE_UNIT_LIMIT = 50_000;
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
const SWAP_COMPUTE_UNIT_HEADROOM = 1.3;
const GASLESS_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = BigInt(10_000);
// the most SOL the depositor lends the swap authority for rent a route pays (0.004 SOL)
const MAX_SWAP_AUTHORITY_LAMPORTS = BigInt(4_000_000);

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

const DepositLayout = struct<any>([blob(8, 'instruction'), blob(32, 'quoteHash'), blob(8, 'amount')]);

function depositData(name: string, quoteHash: string, amount: bigint): Buffer {
	const data = Buffer.alloc(DepositLayout.span);
	DepositLayout.encode(
		{
			instruction: getAnchorInstructionData(name),
			quoteHash: Buffer.from(hexToUint8Array(quoteHash)),
			amount: getSafeU64Blob(amount),
		},
		data
	);
	return data;
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
	programId: PublicKey,
	owner: PublicKey,
	mint: PublicKey,
	quoteHash: string,
	amount: bigint,
	tokenProgram: PublicKey,
): Promise<TransactionInstruction> {
	const escrow = escrowAuthority(programId);
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

async function depositInstruction(quote: Quote, order: BlinkOrder, owner: PublicKey): Promise<TransactionInstruction> {
	const params = order.quote.orderParams;
	const programId = new PublicKey(params.routerAddress);
	const amount = BigInt(params.expectedAmountIn);
	if (isNativeBlinkSvmToken(params.srcToken)) {
		return depositNativeInstruction(programId, owner, order.quote.quoteHash, amount);
	}
	const tokenProgram = quote?.blinkInputContractStandard === 'spl2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
	return depositTokenInstruction(programId, owner, new PublicKey(params.srcToken), order.quote.quoteHash, amount, tokenProgram);
}

function rejectSwap(reason: string): never {
	throw new Error(`Blink swap instructions rejected: ${reason}`);
}

function metaPubkey(ix: InstructionInfo, index: number): PublicKey {
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
	ix: InstructionInfo
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
	swapIx: InstructionInfo,
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
	const ownerBytes = data.slice(TOKEN_ACCOUNT_OWNER_OFFSET, TOKEN_ACCOUNT_OWNER_OFFSET + 32);
	return new PublicKey(ownerBytes).equals(owner);
}

function tokenAccountAmount(data: Uint8Array): bigint {
	return Buffer.from(data).readBigUInt64LE(TOKEN_ACCOUNT_AMOUNT_OFFSET);
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
	const unique: PublicKey[] = [];
	for (const ix of instructions) {
		for (const key of ix.keys) {
			if (key.isWritable && !unique.some((known) => known.equals(key.pubkey))) {
				unique.push(key.pubkey);
			}
		}
	}
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

const SwapAccountLayout = struct<any>([blob(8, 'instruction'), blob(32, 'quoteHash')]);

function swapAccountData(name: string, quoteHash: string): Buffer {
	const data = Buffer.alloc(SwapAccountLayout.span);
	SwapAccountLayout.encode(
		{
			instruction: getAnchorInstructionData(name),
			quoteHash: Buffer.from(hexToUint8Array(quoteHash)),
		},
		data
	);
	return data;
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
		data: swapAccountData('close_swap_account', quoteHash),
	});
}

function sweepAuthorityAccount(
	programId: PublicKey,
	quoteHash: string,
	depositor: PublicKey,
	authority: PublicKey,
	account: AuthorityTokenAccount,
	depositorAta: PublicKey
): TransactionInstruction {
	return new TransactionInstruction({
		programId,
		keys: [
			{ pubkey: depositor, isSigner: true, isWritable: true },
			{ pubkey: account.mint, isSigner: false, isWritable: true },
			{ pubkey: authority, isSigner: false, isWritable: false },
			{ pubkey: account.address, isSigner: false, isWritable: true },
			{ pubkey: depositorAta, isSigner: false, isWritable: true },
			{ pubkey: account.tokenProgram, isSigner: false, isWritable: false },
		],
		data: swapAccountData('sweep_swap_account', quoteHash),
	});
}

// close_swap_account only closes an empty account and fails on a Token-2022 account holding withheld
// transfer fees, so every mint but WSOL (whose close returns all its lamports) is swept instead: the
// sweep moves any leftover to the depositor's token account, harvests the fees, then closes
function releaseAuthorityAccount(
	programId: PublicKey,
	quoteHash: string,
	depositor: PublicKey,
	authority: PublicKey,
	account: AuthorityTokenAccount,
	sourceMint: PublicKey
): TransactionInstruction[] {
	if (account.mint.equals(solMint)) {
		return [closeAuthorityAccount(programId, quoteHash, depositor, authority, account)];
	}
	const depositorAta = getAssociatedTokenAddress(account.mint, depositor, true, account.tokenProgram);
	const sweep = sweepAuthorityAccount(programId, quoteHash, depositor, authority, account, depositorAta);
	if (account.mint.equals(sourceMint)) {
		// the depositor funded the swap from this account, so it exists
		return [sweep];
	}
	return [
		createAssociatedTokenAccountInstruction(depositor, depositorAta, depositor, account.mint, account.tokenProgram),
		sweep,
	];
}

const DepositSwapLayout = struct<any>([
	blob(8, 'instruction'),
	blob(32, 'quoteHash'),
	blob(8, 'srcAmount'),
	blob(8, 'minLockAmount'),
	u32('swapDataLength'),
]);

function swapDepositData(
	quoteHash: string,
	srcAmount: bigint,
	minLockAmount: bigint,
	swapData: Buffer
): Buffer {
	const header = Buffer.alloc(DepositSwapLayout.span);
	DepositSwapLayout.encode(
		{
			instruction: getAnchorInstructionData('deposit_swap'),
			quoteHash: Buffer.from(hexToUint8Array(quoteHash)),
			srcAmount: getSafeU64Blob(srcAmount),
			minLockAmount: getSafeU64Blob(minLockAmount),
			swapDataLength: swapData.length,
		},
		header
	);
	return Buffer.concat([header, swapData]);
}

function uniqueAuthorityAccounts(accounts: AuthorityTokenAccount[]): AuthorityTokenAccount[] {
	const unique: AuthorityTokenAccount[] = [];
	for (const account of accounts) {
		if (!unique.some((known) => known.address.equals(account.address))) {
			unique.push(account);
		}
	}
	return unique;
}

// a Solana transaction holds at most PACKET_DATA_SIZE (1232) bytes; web3.js fails with
// "encoding overruns Uint8Array" when the message alone is already bigger than that
function assertFitsInOneTransaction(transaction: VersionedTransaction): void {
	let size: number;
	try {
		size = transaction.serialize().length;
	} catch {
		rejectSwap('route is too large to fit in one Solana transaction, request a new quote');
	}
	if (size > PACKET_DATA_SIZE) {
		rejectSwap(
			`route is too large to fit in one Solana transaction (${size} bytes, limit ${PACKET_DATA_SIZE}), request a new quote`
		);
	}
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
	const transaction = new VersionedTransaction(message);
	assertFitsInOneTransaction(transaction);
	return transaction;
}

async function buildSwapDepositInstructions(
	quote: Quote,
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
	const amount = BigInt(params.expectedAmountIn);
	const programId = new PublicKey(order.swap.routerAddress);
	const authority = blinkSvmSwapAuthority(programId, owner, quoteHash);
	const lockMint = new PublicKey(params.lockToken);
	const escrow = escrowAuthority(programId);
	const nativeSrc = isNativeBlinkSvmToken(params.srcToken);
	const sourceMint = nativeSrc ? solMint : new PublicKey(params.srcToken);
	const tokenProgram = quote?.blinkInputContractStandard === 'spl2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
	const sourceTokenProgram = quote.fromToken.standard === 'spl2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
	const authorityInput = getAssociatedTokenAddress(sourceMint, authority, true, sourceTokenProgram);
	const swapPrograms = order.contracts.swapPrograms.map((p) => new PublicKey(p));
	const created = checkSwapInstructions(owner, authority, swap, swapPrograms);
	const authorityLamports = BigInt(swap.swapAuthorityLamports);
	if (authorityLamports > MAX_SWAP_AUTHORITY_LAMPORTS) {
		rejectSwap(`swap authority asks for ${authorityLamports} lamports, above the ${MAX_SWAP_AUTHORITY_LAMPORTS} cap`);
	}

	// move the input from the depositor into the swap authority's token account
	let fundingInstructions: TransactionInstruction[];
	let spend: TokenSpend | undefined;
	if (nativeSrc) {
		fundingInstructions = [
			SystemProgram.transfer({ fromPubkey: owner, toPubkey: authorityInput, lamports: amount }),
			createSyncNativeInstruction(authorityInput),
		];
	} else {
		const depositorInput = getAssociatedTokenAddress(sourceMint, owner, true, sourceTokenProgram);
		fundingInstructions = [
			createSplTransferCheckInstruction(
				depositorInput,
				sourceMint,
				authorityInput,
				owner,
				amount,
				quote.fromToken.decimals,
				sourceTokenProgram
			),
		];
		spend = { account: depositorInput, amount };
	}
	// some venues pay rent from the swap authority; deposit_swap returns whatever the route did not spend
	if (authorityLamports > BigInt(0)) {
		fundingInstructions.push(SystemProgram.transfer({ fromPubkey: owner, toPubkey: authority, lamports: authorityLamports }));
	}
	const authorityAccounts = uniqueAuthorityAccounts([
		{ address: authorityInput, mint: sourceMint, tokenProgram: sourceTokenProgram },
		...created,
	]);
	const depositIx = new TransactionInstruction({
		programId,
		keys: [
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: lockMint, isSigner: false, isWritable: false },
			{ pubkey: escrow, isSigner: false, isWritable: false },
			{ pubkey: getAssociatedTokenAddress(lockMint, escrow, true, tokenProgram), isSigner: false, isWritable: true },
			{ pubkey: authority, isSigner: false, isWritable: true },
			{ pubkey: new PublicKey(swap.swap.programId), isSigner: false, isWritable: false },
			{ pubkey: tokenProgram, isSigner: false, isWritable: false },
			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
			// src_mint, recorded in the deposit event; native sources pass the system program
			{ pubkey: nativeSrc ? SystemProgram.programId : sourceMint, isSigner: false, isWritable: false },
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
			amount,
			BigInt(params.minLockAmount),
			Buffer.from(swap.swap.data, 'base64')
		),
	});
	// the SDK creates the swap authority's input account itself (first instruction below), so drop the
	// aggregator's copy of that create, which Jupiter sends for a native SOL input
	const setupInstructions = swap.setup
		.map(deserializeInstructionInfo)
		.filter((ix) => !ix.keys[1].pubkey.equals(authorityInput));
	const body = [
		createAssociatedTokenAccountInstruction(owner, authorityInput, authority, sourceMint, sourceTokenProgram),
		...fundingInstructions,
		...setupInstructions,
		depositIx,
		...authorityAccounts.flatMap((account) =>
			releaseAuthorityAccount(programId, quoteHash, owner, authority, account, sourceMint)
		),
	];
	const watched = await collectDepositorTokenAccounts(connection, body, owner, spend);
	const tableAddresses = swap.lookupTables.map((table) => table.address);
	const lookupTables = await getAddressLookupTableAccounts(tableAddresses, connection);
	if (lookupTables.length !== tableAddresses.length) {
		throw new Error('Blink swap lookup table not found');
	}
	// same compute budget instructions as the final transaction, so the size check above is exact
	const probe = await compileSwapDeposit(
		connection,
		owner,
		[...computeBudgetInstructions(MAX_COMPUTE_UNIT_LIMIT, computeUnitPriceMicroLamports), ...body],
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
	refundAddress?: string
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
		resolveBlinkOrder(quote, refundAddress ?? swapperAddress, destinationAddress, referrerAddresses),
		getBlinkPriorityFee(quote.fromChain),
	]);
	const owner = new PublicKey(swapperAddress);
	if (!needsBlinkSourceSwap(order.quote.orderParams)) {
		const instructions = [
			...computeBudgetInstructions(DEPOSIT_COMPUTE_UNIT_LIMIT, computeUnitPrice),
			await depositInstruction(quote, order, owner),
		];
		return { instructions, signers: [], lookupTables: [], swapMessageV0Params: null };
	}
	const { instructions, lookupTables } = await buildSwapDepositInstructions(quote, connection, order, owner, computeUnitPrice);
	return { instructions, signers: [], lookupTables, swapMessageV0Params: null };
}

export async function swapBlinkGaslessFromSolana(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	signTransaction: SolanaTransactionSigner,
	connection: Connection,
	refundAddress?: string
): Promise<{ signature: string; serializedTrx: Uint8Array | null }> {
	assertBlinkSolanaQuote(quote);
	if (!quote.gasless) {
		throw new Error('Quote is not a gasless BLINK quote');
	}
	const order = await resolveBlinkOrder(quote, refundAddress ?? swapperAddress, destinationAddress, referrerAddresses);
	if (needsBlinkSourceSwap(order.quote.orderParams)) {
		throw new Error('Gasless Blink swap deposits are unavailable on solana');
	}
	const sponsor = order.quote.sponsorAddress;
	if (!sponsor) {
		throw new Error('Gasless Blink deposits are unavailable on solana');
	}
	const owner = new PublicKey(swapperAddress);
	const transaction = new Transaction().add(
		...computeBudgetInstructions(DEPOSIT_COMPUTE_UNIT_LIMIT, GASLESS_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS),
		await depositInstruction(quote, order, owner)
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
	await submitBlinkGaslessOrder({ quoteHash: order.quote.quoteHash, svm: { txBase64 } });
	return { signature: order.quote.quoteHash, serializedTrx: null };
}
