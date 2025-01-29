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
import { Quote, ReferrerAddresses, SolanaTransactionSigner, JitoBundleOptions, SwapMessageV0Params } from '../types';
import {
	getAmountOfFractionalAmount,
	getAssociatedTokenAddress, getGasDecimalsInSolana,
	getWormholeChainIdByName,
	hexToUint8Array,
	nativeAddressToHexString,
	getSafeU64Blob,
	getQuoteSuitableReferrerAddress,
} from '../utils';
import {Buffer} from 'buffer';
import addresses from '../addresses'
import {ZeroAddress} from 'ethers';
import { submitSwiftSolanaSwap } from '../api';
import {
	createAssociatedTokenAccountInstruction,
	createSyncNativeInstruction,
	createApproveInstruction,
	submitTransactionWithRetry,
	decideRelayer,
	getJitoTipTransfer,
	sendJitoBundle,
	confirmJitoBundleId,
	broadcastJitoBundleId
} from './utils';
import { createMctpFromSolanaInstructions } from "./solanaMctp";
import { createSwiftFromSolanaInstructions } from './solanaSwift';
import bs58 from 'bs58';


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
	referrerAddresses: ReferrerAddresses | null | undefined,
	connection?: Connection, options: {
		allowSwapperOffCurve?: boolean,
		forceSkipCctpInstructions?: boolean,
		separateSwapTx?: boolean,
	} = {}
): Promise<{
	instructions: Array<TransactionInstruction>,
	signers: Array<Keypair>,
	lookupTables: Array<AddressLookupTableAccount>,
	swapMessageV0Params: SwapMessageV0Params | null,
}> {

	const referrerAddress = getQuoteSuitableReferrerAddress(quote, referrerAddresses);

	if (quote.type === 'MCTP') {
		return createMctpFromSolanaInstructions(quote, swapperWalletAddress, destinationAddress, referrerAddress, connection, options);
	}
	if (quote.type === 'SWIFT') {
		return createSwiftFromSolanaInstructions(quote, swapperWalletAddress, destinationAddress, referrerAddress, connection, options);
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

	const [
		[fromAccountData, toAccountData],
		stateRent,
		relayer,
	] = await Promise.all([
		solanaConnection.getMultipleAccountsInfo([fromAccount, toAccount], 'finalized'),
		solanaConnection.getMinimumBalanceForRentExemption(STATE_SIZE),
		decideRelayer(),
	])

	if (!fromAccountData || fromAccountData.data.length === 0) {
		instructions.push(createAssociatedTokenAccountInstruction(
			swapper, fromAccount, swapper, fromMint
		));
	}


	if (!toAccountData || toAccountData.data.length === 0) {
		instructions.push(createAssociatedTokenAccountInstruction(
			swapper, toAccount, state, fromMint
		));
	}

	if (quote.fromToken.contract === ZeroAddress) {
		instructions.push(SystemProgram.transfer({
			fromPubkey: swapper,
			toPubkey: fromAccount,
			lamports: BigInt(quote.effectiveAmountIn64),
		}));
		instructions.push(createSyncNativeInstruction(fromAccount));
	}

	const amount = BigInt(quote.effectiveAmountIn64);

	const delegate = Keypair.generate();
	instructions.push(createApproveInstruction(
		fromAccount, delegate.publicKey, swapper, amount
	));


	instructions.push(SystemProgram.transfer({
		fromPubkey: swapper,
		toPubkey: delegate.publicKey,
		lamports: stateRent,
	}));

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


	if (!Number(quote.deadline64)) {
		throw new Error('Deadline is not valid');
	}
	const deadline = BigInt(quote.deadline64);

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
		swapMessageV0Params: null,
	};
}

export async function swapFromSolana(
	quote: Quote, swapperWalletAddress: string, destinationAddress: string,
	referrerAddresses: ReferrerAddresses | null | undefined,
	signTransaction: SolanaTransactionSigner,
	connection?: Connection,
	extraRpcs?: string[],
	sendOptions?: SendOptions,
	jitoOptions?: JitoBundleOptions,
	instructionOptions?: {
		allowSwapperOffCurve?: boolean,
		forceSkipCctpInstructions?: boolean,
	}
): Promise<{
	signature: string,
	serializedTrx: Uint8Array | null,
}> {
	const solanaConnection = connection ??
		new Connection('https://rpc.ankr.com/solana');

	const jitoEnabled = !!(
		!quote.gasless &&
		jitoOptions &&
		jitoOptions.tipLamports > 0  &&
		jitoOptions.signAllTransactions
	);

	const {
		instructions,
		signers,
		lookupTables,
		swapMessageV0Params,
	} = await createSwapFromSolanaInstructions(
		quote, swapperWalletAddress, destinationAddress,
		referrerAddresses, connection, {
			allowSwapperOffCurve: instructionOptions?.allowSwapperOffCurve,
			forceSkipCctpInstructions: instructionOptions?.forceSkipCctpInstructions,
			separateSwapTx: jitoEnabled && jitoOptions?.separateSwapTx,
		}
	);

	const swapper = new PublicKey(swapperWalletAddress);

	const feePayer = quote.gasless ? new PublicKey(quote.relayer) : swapper;

	const {blockhash, lastValidBlockHeight} = await connection.getLatestBlockhash();
	const message = MessageV0.compile({
		instructions,
		payerKey: feePayer,
		recentBlockhash: blockhash,
		addressLookupTableAccounts: lookupTables,
	});
	const transaction = new VersionedTransaction(message);
	transaction.sign(signers);
	let signedTrx: Transaction | VersionedTransaction;
	if (jitoEnabled) {
		const allTransactions: Array<Transaction | VersionedTransaction> = [];
		if (swapMessageV0Params) {
			const swapMessage = MessageV0.compile({
				...swapMessageV0Params,
				recentBlockhash: blockhash,
			});
			allTransactions.push(new VersionedTransaction(swapMessage));
		}
		const jitoTipTransfer = getJitoTipTransfer(swapperWalletAddress, blockhash, lastValidBlockHeight, jitoOptions);
		allTransactions.push(transaction);
		allTransactions.push(jitoTipTransfer);
		const signedTrxs = await jitoOptions.signAllTransactions(allTransactions);
		signedTrx = signedTrxs[signedTrxs.length - 2];
		let mayanTxHash = null;
		if (signedTrx instanceof Transaction && signedTrx?.signatures[0]?.publicKey) {
			mayanTxHash = bs58.encode(Uint8Array.from(signedTrx.signatures[0].signature));
		} else if (signedTrx instanceof VersionedTransaction && signedTrx?.signatures[0]) {
			mayanTxHash = bs58.encode(Uint8Array.from(signedTrx.signatures[0]));
		}

		if (mayanTxHash === null) {
			throw new Error('Failed to get mayan tx hash');
		}

		if (swapMessageV0Params) {
			const jitoBundleId = await sendJitoBundle(signedTrxs, jitoOptions, true);
			await confirmJitoBundleId(jitoBundleId, jitoOptions, lastValidBlockHeight, mayanTxHash, connection);
			broadcastJitoBundleId(jitoBundleId);
			return {
				signature: mayanTxHash,
				serializedTrx: null,
			};
		} else {
			sendJitoBundle(signedTrxs, jitoOptions)
				.then(() => { console.log('Jito bundle sent') })
				.catch(() => {});
		}
	} else {
		signedTrx = await signTransaction(transaction);
	}
	if (quote.gasless) {
		const serializedTrx = Buffer.from(signedTrx.serialize()).toString('base64');
		const { orderHash } = await submitSwiftSolanaSwap(serializedTrx);
		return { signature: orderHash, serializedTrx: null };
	}

	return await submitTransactionWithRetry({
		trx: signedTrx.serialize(),
		connection: solanaConnection,
		extraRpcs: extraRpcs ?? [],
		errorChance: 2,
		options: sendOptions,
	});
}

