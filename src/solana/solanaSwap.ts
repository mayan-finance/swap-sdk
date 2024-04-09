import {
	AccountMeta,
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	SYSVAR_CLOCK_PUBKEY,
	SYSVAR_RENT_PUBKEY,
	Transaction,
	SendOptions,
	TransactionInstruction,
	ComputeBudgetProgram, AddressLookupTableAccount, MessageV0, VersionedTransaction
} from '@solana/web3.js';
import {blob, struct, u16, u8} from '@solana/buffer-layout';
import {Quote, SolanaTransactionSigner} from '../types';
import {
	getAmountOfFractionalAmount,
	getAssociatedTokenAddress, getGasDecimalsInSolana,
	getWormholeChainIdByName,
	hexToUint8Array,
	nativeAddressToHexString,
	getSafeU64Blob,
} from '../utils';
import {Buffer} from 'buffer';
import addresses from '../addresses'
import {ZeroAddress} from 'ethers';
import {getCurrentChainTime, getSuggestedRelayer} from '../api';
import {
	createAssociatedTokenAccountInstruction,
	createSyncNativeInstruction,
	createApproveInstruction,
	submitTransactionWithRetry,
} from './utils';
import { createMctpFromSolanaInstructions } from "./solanaMctp";


const STATE_SIZE = 420;

const SwapLayout = struct<any>([
	u8('instruction'),
	u8('stateNonce'),
	blob(8, 'amount'),
	blob(8, 'minAmountOut'),
	blob(8, 'deadline'),
	blob(8, 'feeSwap'),
	blob(8, 'feeReturn'),
	blob(8, 'feeCancel'),
	blob(8, 'gasDrop'),
	u16('destinationChain'),
	blob(32, 'destinationAddress'),
	u8('unwrapRedeem'),
	u8('unwrapRefund'),
	u8('mayanFeeNonce'),
	u8('referrerFeeNonce'),
]);

export async function createSwapFromSolanaInstructions(
	quote: Quote, swapperWalletAddress: string, destinationAddress: string,
	timeout: number, referrerAddress: string | null | undefined,
	connection?: Connection,
): Promise<{
	instructions: Array<TransactionInstruction>,
	signers: Array<Keypair>,
	lookupTables: Array<AddressLookupTableAccount>,
}> {

	if (quote.type === 'MCTP') {
		return createMctpFromSolanaInstructions(quote, swapperWalletAddress, destinationAddress, timeout, referrerAddress, connection)
	}

	let instructions: Array<TransactionInstruction> = [];
	const solanaConnection = connection ??
		new Connection('https://rpc.ankr.com/solana');
	const mayanProgram = new PublicKey(addresses.MAYAN_PROGRAM_ID);
	const tokenProgram = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	const swapper = new PublicKey(swapperWalletAddress);

	const auctionAddr = new PublicKey(addresses.AUCTION_PROGRAM_ID);

	if (quote.suggestedPriorityFee > 0) {
		instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
			microLamports: quote.suggestedPriorityFee,
		}))
	}

	let referrerAddr: PublicKey;
	if (referrerAddress) {
		referrerAddr = new PublicKey(referrerAddress);
	} else {
		referrerAddr = SystemProgram.programId;
	}

	const [mayanFee, mayanFeeNonce] = PublicKey.findProgramAddressSync(
		[Buffer.from('MAYANFEE')],
		mayanProgram,
	);
	const [referrerFee, referrerFeeNonce] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('REFERRERFEE'),
			referrerAddr.toBuffer(),
		],
		mayanProgram,
	);

	const msg1 = Keypair.generate();
	const msg2 = Keypair.generate();
	const [state, stateNonce] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('V2STATE'),
			Buffer.from(msg1.publicKey.toBytes()),
			Buffer.from(msg2.publicKey.toBytes()),
		],
		mayanProgram,
	);
	const fromMint = new PublicKey(quote.fromToken.mint);
	const toMint = new PublicKey(quote.toToken.mint);
	const fromAccount = getAssociatedTokenAddress(fromMint, swapper);
	const toAccount = getAssociatedTokenAddress(fromMint, state, true);


	const fromAccountData = await solanaConnection.getAccountInfo(
		fromAccount, 'finalized');
	if (!fromAccountData || fromAccountData.data.length === 0) {
		instructions.push(createAssociatedTokenAccountInstruction(
			swapper, fromAccount, swapper, fromMint
		));
	}

	const toAccountData = await solanaConnection.getAccountInfo(
		toAccount, 'finalized');
	if (!toAccountData || toAccountData.data.length === 0) {
		instructions.push(createAssociatedTokenAccountInstruction(
			swapper, toAccount, state, fromMint
		));
	}

	if (quote.fromToken.contract === ZeroAddress) {
		instructions.push(SystemProgram.transfer({
			fromPubkey: swapper,
			toPubkey: fromAccount,
			lamports: getAmountOfFractionalAmount(
				quote.effectiveAmountIn, 9),
		}));
		instructions.push(createSyncNativeInstruction(fromAccount));
	}

	const amount = getAmountOfFractionalAmount(
		quote.effectiveAmountIn, quote.mintDecimals.from);

	const delegate = Keypair.generate();
	instructions.push(createApproveInstruction(
		fromAccount, delegate.publicKey, swapper, amount
	));

	const stateRent =
		await solanaConnection.getMinimumBalanceForRentExemption(STATE_SIZE);
	instructions.push(SystemProgram.transfer({
		fromPubkey: swapper,
		toPubkey: delegate.publicKey,
		lamports: stateRent,
	}));

	let relayer: PublicKey;
	try {
		const suggestedRelayer = await getSuggestedRelayer();
		relayer = new PublicKey(suggestedRelayer);
	} catch (err) {
		console.log('Relayer not found, using system program');
		relayer = SystemProgram.programId;
	}

	const swapKeys: Array<AccountMeta> = [
		{pubkey: delegate.publicKey, isWritable: false, isSigner: true},
		{pubkey: msg1.publicKey, isWritable: false, isSigner: true},
		{pubkey: msg2.publicKey, isWritable: false, isSigner: true},
		{pubkey: state, isWritable: true, isSigner: false},
		{pubkey: fromAccount, isWritable: true, isSigner: false},
		{pubkey: swapper, isWritable: false, isSigner: false},
		{pubkey: toAccount, isWritable: true, isSigner: false},
		{pubkey: fromMint, isWritable: false, isSigner: false},
		{pubkey: toMint, isWritable: false, isSigner: false},
		{pubkey: auctionAddr, isWritable: false, isSigner: false},
		{pubkey: referrerAddr, isWritable: false, isSigner: false},
		{pubkey: mayanFee, isWritable: false, isSigner: false},
		{pubkey: referrerFee, isWritable: false, isSigner: false},
		{pubkey: delegate.publicKey, isWritable: true, isSigner: true},
		{pubkey: relayer, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: tokenProgram, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const solanaTime = await getCurrentChainTime('solana');
	const destinationChainId = getWormholeChainIdByName(quote.toChain);

	if (destinationChainId === 1) { //destination address safety check!
		const destinationAccount =
			await solanaConnection.getAccountInfo(new PublicKey(destinationAddress));
		if (destinationAccount && destinationAccount.owner &&
			destinationAccount.owner.equals(tokenProgram)) {
			throw new Error(
				'Destination address is not about token account.' +
				' It should be a owner address'
			);
		}
	}
	const destAddress = Buffer.from(
		hexToUint8Array(
			nativeAddressToHexString(destinationAddress, destinationChainId)
		)
	);

	const minAmountOut = getAmountOfFractionalAmount(
		quote.minAmountOut, quote.mintDecimals.to);
	const feeSwap = getAmountOfFractionalAmount(
		quote.swapRelayerFee, quote.mintDecimals.from);
	const feeReturn = getAmountOfFractionalAmount(
		quote.redeemRelayerFee, quote.mintDecimals.to);
	const feeCancel = getAmountOfFractionalAmount(
		quote.refundRelayerFee, quote.mintDecimals.from);
	const gasDrop = getAmountOfFractionalAmount(
		quote.gasDrop, getGasDecimalsInSolana(quote.toChain));

	const unwrapRedeem =
		quote.toToken.contract === ZeroAddress;
	const unwrapRefund =
		quote.fromToken.contract === ZeroAddress;


	const deadline = BigInt(solanaTime + timeout);

	const swapData = Buffer.alloc(SwapLayout.span);
	const swapFields = {
		instruction: 101,
		stateNonce,
		amount: getSafeU64Blob(amount),
		minAmountOut: getSafeU64Blob(minAmountOut),
		deadline: getSafeU64Blob(deadline),
		feeSwap: getSafeU64Blob(feeSwap),
		feeReturn: getSafeU64Blob(feeReturn),
		feeCancel: getSafeU64Blob(feeCancel),
		gasDrop: getSafeU64Blob(gasDrop),
		destinationChain: destinationChainId,
		destinationAddress: destAddress,
		unwrapRedeem: unwrapRedeem ? 1 : 0,
		unwrapRefund: unwrapRefund ? 1 : 0,
		mayanFeeNonce,
		referrerFeeNonce,
	}
	SwapLayout.encode(swapFields, swapData);
	const swapInstruction = new TransactionInstruction({
		keys: swapKeys,
		data: swapData,
		programId: mayanProgram,
	});
	instructions.push(swapInstruction);

	return {
		instructions,
		signers: [delegate, msg1, msg2],
		lookupTables: [],
	};
}

export async function swapFromSolana2(
	quote: Quote, swapperWalletAddress: string, destinationAddress: string,
	timeout: number, referrerAddress: string | null | undefined,
	signTransaction: SolanaTransactionSigner,
	connection?: Connection, extraRpcs?: string[], sendOptions?: SendOptions
): Promise<{
	signature: string,
	serializedTrx: Uint8Array,
}> {
	const solanaConnection = connection ??
		new Connection('https://rpc.ankr.com/solana');

	const {
		instructions,
		signers,
		lookupTables
	} = await createSwapFromSolanaInstructions(
		quote, swapperWalletAddress, destinationAddress,
		timeout, referrerAddress, connection);

	const swapper = new PublicKey(swapperWalletAddress);

	const {blockhash} = await connection.getLatestBlockhash();
	const message = MessageV0.compile({
		instructions,
		payerKey: swapper,
		recentBlockhash: blockhash,
		addressLookupTableAccounts: lookupTables,
	});
	const transaction = new VersionedTransaction(message);
	transaction.sign(signers);
	const signedTrx = await signTransaction(transaction);
	const simulate = await connection.simulateTransaction(signedTrx);
	console.log({ simulate });
	return await submitTransactionWithRetry({
		trx: signedTrx.serialize(),
		connection: solanaConnection,
		extraRpcs: extraRpcs ?? [],
		errorChance: 2,
		options: sendOptions,
	});
}

/**
 * @deprecated Use swapFromSolana2 instead
 */
export async function swapFromSolana(
	quote: Quote, swapperWalletAddress: string, destinationAddress: string,
	timeout: number, referrerAddress: string | null | undefined,
	signTransaction: SolanaTransactionSigner,
	connection?: Connection, extraRpcs?: string[], sendOptions?: SendOptions
): Promise<string> {
	const solanaConnection = connection ??
		new Connection('https://rpc.ankr.com/solana');
	const {instructions, signers} = await createSwapFromSolanaInstructions(
		quote, swapperWalletAddress, destinationAddress,
		timeout, referrerAddress, connection);

	const swapper = new PublicKey(swapperWalletAddress);
	const {blockhash, lastValidBlockHeight} = await solanaConnection.getLatestBlockhash();

	const trx = new Transaction({
		feePayer: swapper,
		blockhash: blockhash,
		lastValidBlockHeight,
	});

	trx.add(...instructions);
	trx.recentBlockhash = blockhash;
	signers.forEach(signer => trx.partialSign(signer));
	const signedTrx = await signTransaction(trx);
	return await connection.sendRawTransaction(signedTrx.serialize(), sendOptions);
}

















