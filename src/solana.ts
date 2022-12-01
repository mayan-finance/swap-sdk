import {
	AccountMeta,
	clusterApiUrl,
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	SYSVAR_CLOCK_PUBKEY,
	SYSVAR_RENT_PUBKEY,
	Transaction,
	TransactionInstruction,
} from '@solana/web3.js';
import { blob, nu64, struct, u16, u8 } from '@solana/buffer-layout';
import { Quote, SolanaTransactionSigner } from './types';
import {
	getAmountOfFractionalAmount,
	getAssociatedTokenAddress,
	getWormholeChainIdByName,
	hexToUint8Array,
	nativeAddressToHexString
} from './utils';
import { Buffer } from 'buffer';
import addresses  from './addresses'
import { ethers } from 'ethers';
import { getCurrentSolanaTime } from './api';

const STATE_SIZE = 307;

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

const ApproveInstructionData = struct<any>([
	u8('instruction'), nu64('amount')
]);
function createApproveInstruction(
	account: PublicKey,
	delegate: PublicKey,
	owner: PublicKey,
	amount: ethers.BigNumber,
	programId = new PublicKey(addresses.TOKEN_PROGRAM_ID)
): TransactionInstruction {
	const keys: Array<AccountMeta> = [
		{ pubkey: account, isSigner: false, isWritable: true },
		{ pubkey: delegate, isSigner: false, isWritable: false },
		{ pubkey: owner, isSigner: true, isWritable: false },
	];

	const data = Buffer.alloc(ApproveInstructionData.span);
	ApproveInstructionData.encode(
		{
			instruction: 4,
			amount,
		},
		data
	);
	return new TransactionInstruction({ keys, programId, data });
}

const SyncNativeInstructionData = struct<any>([u8('instruction')]);
function createSyncNativeInstruction(
	account: PublicKey): TransactionInstruction {
	const keys = [{ pubkey: account, isSigner: false, isWritable: true }];

	const data = Buffer.alloc(SyncNativeInstructionData.span);
	SyncNativeInstructionData.encode({ instruction: 17 }, data);

	return new TransactionInstruction({
		keys,
		programId: new PublicKey(addresses.TOKEN_PROGRAM_ID),
		data
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
	timeout: number, signTransaction: SolanaTransactionSigner, connection?: Connection
) : Promise<string> {
	const solanaConnection = connection ?? new Connection('https://rpc.ankr.com/solana');
	const mayanProgram = new PublicKey(addresses.MAYAN_PROGRAM_ID);
	const tokenProgram = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	const swapper = new PublicKey(swapperWalletAddress);

	const auctionAddr = new PublicKey(addresses.AUCTION_PROGRAM_ID);

	const [main, mainNonce] = PublicKey.findProgramAddressSync(
		[Buffer.from('MAIN')],
		mayanProgram,
	);
	const msg1 = Keypair.generate().publicKey;
	const msg2 = Keypair.generate().publicKey;
	const [state, stateNonce] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('V2STATE'),
			Buffer.from(msg1.toBytes()),
			Buffer.from(msg2.toBytes()),
		],
		mayanProgram,
	);
	const fromMint = new PublicKey(quote.fromToken.mint);
	const toMint = new PublicKey(quote.toToken.mint);
	const fromAccount = getAssociatedTokenAddress(fromMint, swapper);
	const toAccount = getAssociatedTokenAddress(fromMint, main, true);

	const trx = new Transaction({
		feePayer: swapper,
	});

	const fromAccountData = await solanaConnection.getAccountInfo(fromAccount, 'finalized');
	if (!fromAccountData || fromAccountData.data.length === 0) {
		trx.add(createAssociatedTokenAccountInstruction(
			swapper, fromAccount, swapper, fromMint
		));
	}

	const toAccountData = await solanaConnection.getAccountInfo(toAccount, 'finalized');
	if (!toAccountData || toAccountData.data.length === 0) {
		trx.add(createAssociatedTokenAccountInstruction(
			swapper, toAccount, main, fromMint
		));
	}

	if (quote.fromToken.contract === ethers.constants.AddressZero) {
		trx.add(SystemProgram.transfer({
			fromPubkey: swapper,
			toPubkey: fromAccount,
			lamports: getAmountOfFractionalAmount(
				quote.effectiveAmountIn, 9).toBigInt(),
		}));
		trx.add(createSyncNativeInstruction(fromAccount));
	}

	const amount = getAmountOfFractionalAmount(
		quote.effectiveAmountIn, quote.mintDecimals.from);

	const delegate = Keypair.generate();
	trx.add(createApproveInstruction(
		fromAccount, delegate.publicKey, swapper, amount
	));

	const stateRent =
		await solanaConnection.getMinimumBalanceForRentExemption(STATE_SIZE);
	trx.add(SystemProgram.transfer({
		fromPubkey: swapper,
		toPubkey: delegate.publicKey,
		lamports: stateRent,
	}));

	const swapKeys: Array<AccountMeta> = [
		{pubkey: delegate.publicKey, isWritable: false, isSigner: true},
		{pubkey: main, isWritable: false, isSigner: false},
		{pubkey: msg1, isWritable: false, isSigner: false},
		{pubkey: msg2, isWritable: false, isSigner: false},
		{pubkey: state, isWritable: true, isSigner: false},
		{pubkey: fromAccount, isWritable: true, isSigner: false},
		{pubkey: swapper, isWritable: false, isSigner: false},
		{pubkey: toAccount, isWritable: true, isSigner: false},
		{pubkey: fromMint, isWritable: false, isSigner: false},
		{pubkey: toMint, isWritable: false, isSigner: false},
		{pubkey: auctionAddr, isWritable: false, isSigner: false},
		{pubkey: delegate.publicKey, isWritable: false, isSigner: true},
		{pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: tokenProgram, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const solanaTime = await getCurrentSolanaTime();
	const destinationChainId = getWormholeChainIdByName(quote.toChain);

	if (destinationChainId === 1) { //destination address safety check!
		const destinationAccount =
			await solanaConnection.getAccountInfo(new PublicKey(destinationAddress));
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

	const minAmountOut = getAmountOfFractionalAmount(
		quote.minAmountOut, quote.mintDecimals.to);
	const feeSwap = getAmountOfFractionalAmount(
		quote.swapRelayerFee, quote.mintDecimals.from);
	const feeReturn = getAmountOfFractionalAmount(
		quote.redeemRelayerFee, quote.mintDecimals.to);
	const feeCancel = getAmountOfFractionalAmount(
		quote.refundRelayerFee, quote.mintDecimals.from)

	const swapData = Buffer.alloc(SwapLayout.span);
	const swapFields = {
		instruction: 101,
		mainNonce,
		stateNonce,
		amount,
		minAmountOut,
		deadline: solanaTime + timeout,
		feeSwap,
		feeReturn,
		feeCancel,
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
	const { blockhash } = await solanaConnection.getLatestBlockhash();
	trx.recentBlockhash = blockhash;
	trx.partialSign(delegate);
	const signedTrx = await signTransaction(trx);
	return await solanaConnection.sendRawTransaction(signedTrx.serialize(), { skipPreflight: true });
}
