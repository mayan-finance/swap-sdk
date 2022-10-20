import {
	PublicKey, clusterApiUrl, Connection, Transaction,
	TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY, AccountMeta,
	SYSVAR_CLOCK_PUBKEY
} from '@solana/web3.js';
import {blob, struct, u8, nu64, u16} from "@solana/buffer-layout";
import { Quote, SolanaTransactionSigner } from './types';
import {
	getAmountOfFractionalAmount,
	getAssociatedTokenAddress,
	getCurrentSolanaTime,
	getWormholeChainIdByName, hexToUint8Array, nativeAddressToHexString
} from './utils';
import { Buffer } from 'buffer';

const addresses = require('./addresses.json');

function createAssociatedTokenAccountInstruction(
	payer: PublicKey,
	associatedToken: PublicKey,
	owner: PublicKey,
	mint: PublicKey,
	programId = new PublicKey(addresses.TOKEN_PROGRAM_ID),
	associatedTokenProgramId = new PublicKey(addresses.ASSOCIATED_TOKEN_PROGRAM_ID)
): TransactionInstruction {
	const keys = [
		{ pubkey: payer, isSigner: true, isWritable: true },
		{ pubkey: associatedToken, isSigner: false, isWritable: true },
		{ pubkey: owner, isSigner: false, isWritable: false },
		{ pubkey: mint, isSigner: false, isWritable: false },
		{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
		{ pubkey: programId, isSigner: false, isWritable: false },
		{ pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
	];

	return new TransactionInstruction({
		keys,
		programId: associatedTokenProgramId,
		data: Buffer.alloc(0),
	});
}

const SwapLayout = struct<any>([
	u8('instruction'),
	u8('mainNonce'),
	u8('stateNonce'),
	nu64('amount'),
	nu64('minAmountOut'),
	nu64('deadline'),
	nu64('feeSwap'),
	nu64('feeReturn'),
	nu64('feeCancel'),
	u16('destinationChain'),
	blob(32, 'destinationAddress'),

]);
export async function swapFromSolana(
	quote: Quote, swapperWalletAddress: string, destinationAddress: string,
	timeout: number, signTransaction: SolanaTransactionSigner,
) : Promise<string> {
	const connection = new Connection(clusterApiUrl('mainnet-beta'));
	const mayanProgram = new PublicKey(addresses.MAYAN_PROGRAM_ID);
	const tokenProgram = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	const swapper = new PublicKey(swapperWalletAddress);
	const fromMint = new PublicKey(quote.fromToken.mint);
	const toMint = new PublicKey(quote.toToken.mint);

	const [main, mainNonce] = PublicKey.findProgramAddressSync(
		[Buffer.from('MAIN')],
		mayanProgram,
	);
	const msg1 = PublicKey.unique();
	const msg2 = PublicKey.unique();
	const [state, stateNonce] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('V2STATE'),
			Buffer.from(msg1.toBytes()),
			Buffer.from(msg2.toBytes()),
		],
		mayanProgram,
	);
	const fromAccount = getAssociatedTokenAddress(fromMint, swapper);
	const toAccount = getAssociatedTokenAddress(toMint, main, true);

	const trx = new Transaction({
		feePayer: swapper,
	});

	const toAccountData = await connection.getAccountInfo(toAccount, 'finalized');
	if (toAccountData.data.length === 0) {
		trx.add(createAssociatedTokenAccountInstruction(
			swapper, toAccount, main, fromMint
		));
	}

	const swapKeys: Array<AccountMeta> = [
		{pubkey: swapper, isWritable: false, isSigner: true},
		{pubkey: main, isWritable: false, isSigner: false},
		{pubkey: msg1, isWritable: false, isSigner: false},
		{pubkey: msg2, isWritable: false, isSigner: false},
		{pubkey: state, isWritable: true, isSigner: false},
		{pubkey: fromAccount, isWritable: true, isSigner: false},
		{pubkey: toAccount, isWritable: true, isSigner: false},
		{pubkey: fromMint, isWritable: false, isSigner: false},
		{pubkey: toMint, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: tokenProgram, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const solanaTime = await getCurrentSolanaTime(connection);
	const destinationChainId = getWormholeChainIdByName(quote.toChain);

	if (destinationChainId === 1) { //destination address safety check!
		const destinationAccount =
			await connection.getAccountInfo(new PublicKey(destinationAddress));
		if (destinationAccount.owner.equals(tokenProgram)) {
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

	const feeReturn =quote.toChain === 'solana' ?
		getAmountOfFractionalAmount(quote.redeemRelayerFee, quote.toToken.decimals) :
		getAmountOfFractionalAmount(quote.redeemRelayerFee,
			Math.min(quote.toToken.decimals, 8));
	const minAmountOut =quote.toChain === 'solana' ?
		getAmountOfFractionalAmount(quote.minAmountOut, quote.toToken.decimals) :
		getAmountOfFractionalAmount(quote.minAmountOut,
			Math.min(quote.toToken.decimals, 8));

	const swapData = Buffer.alloc(SwapLayout.span);
	const swapFields = {
		instruction: 101,
		mainNonce,
		stateNonce,
		amount: getAmountOfFractionalAmount(quote.effectiveAmountIn,
			quote.fromToken.decimals),
		minAmountOut,
		deadline: solanaTime + timeout,
		feeSwap: getAmountOfFractionalAmount(quote.swapRelayerFee,
			quote.fromToken.decimals),
		feeReturn,
		feeCancel: getAmountOfFractionalAmount(quote.refundRelayerFee,
			quote.fromToken.decimals),
		destinationChain: destinationChainId,
		destinationAddress: destAddress,
	}
	SwapLayout.encode(swapFields, swapData);
	const swapInstruction = new TransactionInstruction({
		keys: swapKeys,
		data: swapData,
		programId: mayanProgram,
	});
	trx.add(swapInstruction);
	const { blockhash } = await connection.getLatestBlockhash();
	trx.recentBlockhash = blockhash;
	const signedTrx = await signTransaction(trx);
	const signature = await connection.sendRawTransaction(signedTrx.serialize());
	await connection.confirmTransaction(signature, 'finalized');
	return signature;
}
