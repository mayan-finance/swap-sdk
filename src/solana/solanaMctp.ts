import {
	AccountMeta,
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	SYSVAR_CLOCK_PUBKEY,
	SYSVAR_RENT_PUBKEY,
	TransactionInstruction,
	ComputeBudgetProgram,
	AddressLookupTableAccount,
} from '@solana/web3.js';
import {blob, struct, u16, u8} from '@solana/buffer-layout';
import { Quote, ChainName, SwapMessageV0Params } from '../types';
import {
	getAmountOfFractionalAmount,
	getAssociatedTokenAddress,
	getWormholeChainIdByName,
	hexToUint8Array,
	nativeAddressToHexString,
	getSafeU64Blob, getGasDecimal,
} from '../utils';
import {Buffer} from 'buffer';
import addresses from '../addresses'
import { getSwapSolana } from '../api';
import {getWormholePDAs} from '../wormhole';
import {getCCTPBridgePDAs, CCTP_TOKEN_DECIMALS} from "../cctp";
import {
	createAssociatedTokenAccountInstruction,
	createInitializeRandomTokenAccountInstructions, createPayloadWriterCloseInstruction,
	createPayloadWriterCreateInstruction,
	createSplTransferInstruction,
	createTransferAllAndCloseInstruction,
	decentralizeClientSwapInstructions,
	getAddressLookupTableAccounts,
	getAnchorInstructionData,
	sandwichInstructionInCpiProxy,
	validateJupSwap
} from './utils';

const MCTPBridgeWithFeeLayout = struct<any>([
	blob(8, 'instruction'),
]);

export function createMctpBridgeWithFeeInstruction(
	ledger: PublicKey, toChain: ChainName, mintAddress: string,
	relayerAddress: string, feeSolana: bigint,
): {
	instruction: TransactionInstruction;
	signers: Keypair[];
} {

	const wormholeProgramId = new PublicKey(addresses.WORMHOLE_PROGRAM_ID);
	const wormholeShimProgramId = new PublicKey(addresses.WORMHOLE_SHIM_POST_MESSAGE_PROGRAM_ID);
	const TOKEN_PROGRAM_ID = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	const cctpCoreProgramId = new PublicKey(addresses.CCTP_CORE_PROGRAM_ID);
	const cctpTokenProgramId = new PublicKey(addresses.CCTP_TOKEN_PROGRAM_ID);
	const mctpProgram = new PublicKey(addresses.MCTP_PROGRAM_ID);

	const relayer = new PublicKey(relayerAddress);
	const mint = new PublicKey(mintAddress);

	const ledgerAccount = getAssociatedTokenAddress(
		mint, ledger, true
	);

	let relayerAccount: PublicKey;
	if (feeSolana && feeSolana > BigInt(0)) {
		relayerAccount = getAssociatedTokenAddress(mint, relayer, false);
	} else {
		relayerAccount = new PublicKey(addresses.MCTP_PROGRAM_ID);
	}

	const cctpBridgePdas = getCCTPBridgePDAs(mint, toChain);
	const wormholePDAs = getWormholePDAs(addresses.MCTP_PROGRAM_ID);

	const cctpMessage = Keypair.generate();

	const accounts: AccountMeta[] = [
		{pubkey: ledger, isWritable: true, isSigner: false},
		{pubkey: ledgerAccount, isWritable: true, isSigner: false},
		{pubkey: relayer, isWritable: true, isSigner: true},
		{pubkey: relayerAccount, isWritable: true, isSigner: false},
		{pubkey: mint, isWritable: true, isSigner: false},

		{pubkey: cctpBridgePdas.senderAuthority, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.tokenMessenger, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.remoteTokenMessengerKey, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.tokenMinter, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.localToken, isWritable: true, isSigner: false},
		{pubkey: cctpBridgePdas.eventAuthToken, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.messageTransmitter, isWritable: true, isSigner: false},
		{pubkey: cctpMessage.publicKey, isWritable: true, isSigner: true},
		{pubkey: cctpTokenProgramId, isWritable: false, isSigner: false},
		{pubkey: cctpCoreProgramId, isWritable: false, isSigner: false},

		{pubkey: wormholePDAs.emitter, isWritable: false, isSigner: false},
		{pubkey: wormholePDAs.bridgeConfig, isWritable: true, isSigner: false},
		{pubkey: wormholePDAs.sequenceKey, isWritable: true, isSigner: false},
		{pubkey: wormholePDAs.feeCollector, isWritable: true, isSigner: false},
		{pubkey: wormholePDAs.shimMessage, isWritable: true, isSigner: false},
		{pubkey: wormholeProgramId, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: wormholePDAs.shimEventAuth, isWritable: false, isSigner: false},
		{pubkey: wormholeShimProgramId, isWritable: false, isSigner: false},

		{pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const data = Buffer.alloc(MCTPBridgeWithFeeLayout.span);

	MCTPBridgeWithFeeLayout.encode(
		{
			instruction: getAnchorInstructionData('bridge_with_fee_shim'),
		},
		data
	);

	const bridgeIns = new TransactionInstruction({
		keys: accounts,
		data,
		programId: mctpProgram,
	});

	return {instruction: bridgeIns, signers: [cctpMessage]};
}

const MctpBridgeLockFeeLayout = struct<any>([
	blob(8, 'instruction'),
]);

function createMctpBridgeLockFeeInstruction(
	ledger: PublicKey, toChain: ChainName, mintAddress: string,
	relayerAddress: string, feeSolana: bigint,
): {
	instructions: [TransactionInstruction, TransactionInstruction];
	signer: Keypair;
} {

	const instructions: [TransactionInstruction | null, TransactionInstruction | null] = [null, null];

	const TOKEN_PROGRAM_ID = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(addresses.ASSOCIATED_TOKEN_PROGRAM_ID);
	const cctpCoreProgramId = new PublicKey(addresses.CCTP_CORE_PROGRAM_ID);
	const cctpTokenProgramId = new PublicKey(addresses.CCTP_TOKEN_PROGRAM_ID);
	const mctpProgram = new PublicKey(addresses.MCTP_PROGRAM_ID);


	const relayer = new PublicKey(relayerAddress);
	const mint = new PublicKey(mintAddress);

	const ledgerAccount = getAssociatedTokenAddress(
		mint, ledger, true
	);

	const cctpBridgePdas = getCCTPBridgePDAs(mint, toChain);

	const cctpMessage = Keypair.generate();

	const [feeState] = PublicKey.findProgramAddressSync(
		[Buffer.from('LOCKED_FEE'), mint.toBuffer(), cctpMessage.publicKey.toBytes()],
		mctpProgram,
	);

	let relayerAccount: PublicKey;
	if (feeSolana && feeSolana > BigInt(0)) {
		relayerAccount = getAssociatedTokenAddress(mint, relayer, false);
	} else {
		relayerAccount = new PublicKey(addresses.MCTP_PROGRAM_ID);
	}

	const feeStateAccount = getAssociatedTokenAddress(
		mint, feeState, true
	);

	instructions[0] = createAssociatedTokenAccountInstruction(
		relayer, feeStateAccount, feeState, mint
	);

	const accounts: AccountMeta[] = [
		{pubkey: ledger, isWritable: true, isSigner: false},
		{pubkey: ledgerAccount, isWritable: true, isSigner: false},
		{pubkey: relayer, isWritable: true, isSigner: true},
		{pubkey: relayerAccount, isWritable: true, isSigner: false},
		{pubkey: feeState, isWritable: true, isSigner: false},
		{pubkey: feeStateAccount, isWritable: true, isSigner: false},
		{pubkey: mint, isWritable: true, isSigner: false},

		{pubkey: cctpBridgePdas.senderAuthority, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.tokenMessenger, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.remoteTokenMessengerKey, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.tokenMinter, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.localToken, isWritable: true, isSigner: false},
		{pubkey: cctpBridgePdas.eventAuthToken, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.messageTransmitter, isWritable: true, isSigner: false},
		{pubkey: cctpMessage.publicKey, isWritable: true, isSigner: true},
		{pubkey: cctpTokenProgramId, isWritable: false, isSigner: false},
		{pubkey: cctpCoreProgramId, isWritable: false, isSigner: false},

		{pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false},
		{pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const data = Buffer.alloc(MctpBridgeLockFeeLayout.span);

	MctpBridgeLockFeeLayout.encode(
		{
			instruction: getAnchorInstructionData('bridge_locked_fee'),
		},
		data
	);

	const bridgeIns = new TransactionInstruction({
		keys: accounts,
		data,
		programId: mctpProgram,
	});
	instructions[1] = bridgeIns;

	return {instructions, signer: cctpMessage};
}

const MctpInitSwapLayout = struct<any>([
	blob(8, 'instruction'),
]);
function createMctpInitSwapInstruction(
	ledger: PublicKey, toChain: ChainName, mintAddress: string,
	relayerAddress: string, feeSolana: bigint,
): {
	instruction: TransactionInstruction;
	signer: Keypair;
} {
	const TOKEN_PROGRAM_ID = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	const cctpCoreProgramId = new PublicKey(addresses.CCTP_CORE_PROGRAM_ID);
	const cctpTokenProgramId = new PublicKey(addresses.CCTP_TOKEN_PROGRAM_ID);
	const mctpProgram = new PublicKey(addresses.MCTP_PROGRAM_ID);


	const relayer = new PublicKey(relayerAddress);
	const mint = new PublicKey(mintAddress);

	const ledgerAccount = getAssociatedTokenAddress(
		mint, ledger, true
	);

	const cctpBridgePdas = getCCTPBridgePDAs(mint, toChain);

	const cctpMessage = Keypair.generate();

	const [swapState] = PublicKey.findProgramAddressSync(
		[Buffer.from('ORDER_SOLANA_SOURCE'), ledger.toBuffer()],
		mctpProgram,
	);

	let relayerAccount: PublicKey;
	if (feeSolana && feeSolana > BigInt(0)) {
		relayerAccount = getAssociatedTokenAddress(mint, relayer, false);
	} else {
		relayerAccount = new PublicKey(addresses.MCTP_PROGRAM_ID);
	}

	const accounts: AccountMeta[] = [
		{pubkey: ledger, isWritable: false, isSigner: false},
		{pubkey: ledgerAccount, isWritable: true, isSigner: false},
		{pubkey: relayer, isWritable: true, isSigner: true},
		{pubkey: relayerAccount, isWritable: true, isSigner: false},
		{pubkey: mint, isWritable: true, isSigner: false},
		{pubkey: swapState, isWritable: true, isSigner: false},

		{pubkey: cctpBridgePdas.senderAuthority, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.tokenMessenger, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.remoteTokenMessengerKey, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.tokenMinter, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.localToken, isWritable: true, isSigner: false},
		{pubkey: cctpBridgePdas.eventAuthToken, isWritable: false, isSigner: false},
		{pubkey: cctpBridgePdas.messageTransmitter, isWritable: true, isSigner: false},
		{pubkey: cctpMessage.publicKey, isWritable: true, isSigner: true},
		{pubkey: cctpTokenProgramId, isWritable: false, isSigner: false},
		{pubkey: cctpCoreProgramId, isWritable: false, isSigner: false},

		{pubkey: new PublicKey(addresses.FEE_MANAGER_PROGRAM_ID), isWritable: false, isSigner: false},
		{pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const data = Buffer.alloc(MctpInitSwapLayout.span);

	MctpInitSwapLayout.encode(
		{
			instruction: getAnchorInstructionData('create_order'),
		},
		data
	);

	const initSwapIns = new TransactionInstruction({
		keys: accounts,
		data,
		programId: mctpProgram,
	});

	return {instruction: initSwapIns, signer: cctpMessage};
}

const MctpBridgeLedgerLayout = struct<any>([
	blob(8, 'instruction'),
	blob(32, 'destAddress'),
	blob(8, 'amountInMin'),
	blob(8, 'gasDrop'),
	blob(8, 'feeRedeem'),
	blob(8, 'feeSolana'),
	u16('destinationChain'),
	blob(32, 'keyRnd'),
	u8('mode'),
]);

type CreateMctpBridgeLedgerInstructionParams = {
	ledger: PublicKey,
	swapperAddress: string,
	mintAddress: string,
	randomKey: PublicKey,
	toChain: ChainName,
	destinationAddress: string,
	feeSolana: bigint,
	feeRedeem: number,
	gasDrop: number,
	amountInMin64: bigint,
	referrerAddress?: string | null | undefined,
	mode: 'WITH_FEE' | 'LOCK_FEE',
	customPayload?: PublicKey | null,
	relayerAddress: string,
}
export function createMctpBridgeLedgerInstruction(params: CreateMctpBridgeLedgerInstructionParams): TransactionInstruction {
	if (params.mode !== 'WITH_FEE' && params.mode !== 'LOCK_FEE') {
		throw new Error('Invalid mode: ' + params.mode);
	}

	if (params.customPayload && params.mode !== 'WITH_FEE') {
		throw new Error('Custom payload is only supported in WITH_FEE mode');
	}

	const user = new PublicKey(params.swapperAddress);
	const relayer =  new PublicKey(params.relayerAddress);
	const mint = new PublicKey(params.mintAddress);
	const ledgerAccount = getAssociatedTokenAddress(mint, params.ledger, true);
	const destinationChainId = getWormholeChainIdByName(params.toChain);
	const destAddress = Buffer.from(
		hexToUint8Array(
			nativeAddressToHexString(params.destinationAddress, destinationChainId)
		)
	);
	const amountInMin = getSafeU64Blob(params.amountInMin64);
	const gasDrop = getSafeU64Blob(
		getAmountOfFractionalAmount(params.gasDrop, Math.min(getGasDecimal(params.toChain), 8))
	);
	const feeRedeem = getSafeU64Blob(
		getAmountOfFractionalAmount(params.feeRedeem, CCTP_TOKEN_DECIMALS)
	);
	const feeSolana = getSafeU64Blob(params.feeSolana);

	const refAddress = params.referrerAddress ?
		Buffer.from(hexToUint8Array(
			nativeAddressToHexString(params.referrerAddress, destinationChainId)
		)) : SystemProgram.programId.toBuffer();

	const accounts: AccountMeta[] = [
		{pubkey: user, isWritable: true, isSigner: true},
		{pubkey: params.ledger, isWritable: true, isSigner: false},
		{pubkey: ledgerAccount, isWritable: false, isSigner: false},
		{pubkey: params.customPayload || new PublicKey(addresses.MCTP_PROGRAM_ID), isWritable: false, isSigner: false},
		{pubkey: mint, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
		{pubkey: relayer, isWritable: true, isSigner: true},
		{pubkey: new PublicKey(refAddress), isWritable: false, isSigner: false},
	];
	const data = Buffer.alloc(MctpBridgeLedgerLayout.span);
	MctpBridgeLedgerLayout.encode(
		{
			instruction: getAnchorInstructionData('init_bridge_ledger_gasless'),
			destAddress,
			amountInMin,
			gasDrop,
			feeRedeem,
			feeSolana,
			destinationChain: destinationChainId,
			keyRnd: params.randomKey.toBuffer(),
			mode: params.mode === 'WITH_FEE' ? 1 : 2,
		},
		data
	);
	return new TransactionInstruction({
		keys: accounts,
		data,
		programId: new PublicKey(addresses.MCTP_PROGRAM_ID),
	});
}

const MctpSwapLedgerLayout = struct<any>([
	blob(8, 'instruction'),
	blob(32, 'destAddress'),
	blob(8, 'amountInMin'),
	blob(8, 'gasDrop'),
	blob(8, 'feeRedeem'),
	blob(8, 'feeSolana'),
	u16('destinationChain'),
	blob(32, 'keyRnd'),
	u8('mode'),
	blob(32, 'tokenOut'),
	blob(8, 'amountOutMin'),
	blob(8, 'deadline'),
	blob(32, 'refAddress'),
	u8('feeRateRef'),
]);

type CreateMctpSwapLedgerInstructionParams = {
	ledger: PublicKey,
	swapperAddress: string,
	mintAddress: string,
	randomKey: PublicKey,
	toChain: ChainName,
	destinationAddress: string,
	feeSolana: bigint,
	feeRedeem: number,
	gasDrop: number,
	amountInMin64?: bigint,
	tokenOut: string,
	tokenOutDecimals: number,
	referrerAddress: string,
	amountOutMin: number,
	deadline: bigint,
	feeRateRef: number,
	relayerAddress: string,
}
function createMctpSwapLedgerInstruction(params: CreateMctpSwapLedgerInstructionParams): TransactionInstruction {
	const user = new PublicKey(params.swapperAddress);
	const relayer =  new PublicKey(params.relayerAddress);
	const mint = new PublicKey(params.mintAddress);
	const ledgerAccount = getAssociatedTokenAddress(mint, params.ledger, true);
	const destinationChainId = getWormholeChainIdByName(params.toChain);
	const destAddress = Buffer.from(
		hexToUint8Array(
			nativeAddressToHexString(params.destinationAddress, destinationChainId)
		)
	);
	const amountInMin = getSafeU64Blob(params.amountInMin64);
	const gasDrop = getSafeU64Blob(
		getAmountOfFractionalAmount(params.gasDrop, Math.min(getGasDecimal(params.toChain), 8))
	);
	const feeRedeem = getSafeU64Blob(
		getAmountOfFractionalAmount(params.feeRedeem, CCTP_TOKEN_DECIMALS)
	);
	const feeSolana = getSafeU64Blob(params.feeSolana);

	const tokenOut = Buffer.from(hexToUint8Array(
		nativeAddressToHexString(params.tokenOut, destinationChainId)
	));
	const refAddress = params.referrerAddress ?
		Buffer.from(hexToUint8Array(
			nativeAddressToHexString(params.referrerAddress, destinationChainId)
		)) : SystemProgram.programId.toBuffer();
	const amountOutMin = getSafeU64Blob(
		getAmountOfFractionalAmount(params.amountOutMin, Math.min(8, params.tokenOutDecimals))
	);
	const deadline = getSafeU64Blob(params.deadline);

	const accounts: AccountMeta[] = [
		{pubkey: user, isWritable: true, isSigner: true},
		{pubkey: params.ledger, isWritable: true, isSigner: false},
		{pubkey: ledgerAccount, isWritable: false, isSigner: false},
		{pubkey: mint, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
		{pubkey: relayer, isWritable: true, isSigner: true},
	];
	const data = Buffer.alloc(MctpSwapLedgerLayout.span);
	MctpSwapLedgerLayout.encode(
		{
			instruction: getAnchorInstructionData('init_order_ledger_gasless'),
			destAddress,
			amountInMin,
			gasDrop,
			feeRedeem,
			feeSolana,
			destinationChain: destinationChainId,
			keyRnd: params.randomKey.toBuffer(),
			mode: 3,
			tokenOut,
			refAddress,
			amountOutMin,
			deadline,
			feeRateRef: params.feeRateRef,
		},
		data
	);
	return new TransactionInstruction({
		keys: accounts,
		data,
		programId: new PublicKey(addresses.MCTP_PROGRAM_ID),
	});
}

export async function createMctpFromSolanaInstructions(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined,
	connection: Connection, options: {
		allowSwapperOffCurve?: boolean,
		forceSkipCctpInstructions?: boolean,
		separateSwapTx?: boolean,
		skipProxyMayanInstructions?: boolean,
		customPayload?: Buffer | Uint8Array | null,
	} = {}
): Promise<{
	instructions: TransactionInstruction[],
	signers: Keypair[],
	lookupTables:  AddressLookupTableAccount[],
	swapMessageV0Params: SwapMessageV0Params | null,
}> {

	const forceSkipCctpInstructions = options?.forceSkipCctpInstructions || false;
	const allowSwapperOffCurve = options?.allowSwapperOffCurve || false;

	if (quote.toChain === 'solana') {
		throw new Error('Unsupported destination chain: ' + quote.toChain);
	}

	const relayerAddress = quote.relayer || swapperAddress;

	let _lookupTablesAddress: string[] = [];

	let instructions: TransactionInstruction[] = [];
	let signers: Keypair[] = [];
	let lookupTables: AddressLookupTableAccount[] = [];

	// using for the swap via Jito Bundle
	let _swapAddressLookupTables: string[] = [];
	let swapInstructions: TransactionInstruction[] = [];
	let createSwapTpmTokenAccountInstructions: TransactionInstruction[] = [];
	const tmpSwapTokenAccount: Keypair = Keypair.generate();
	let swapMessageV0Params: SwapMessageV0Params | null = null;

	_lookupTablesAddress.push(addresses.LOOKUP_TABLE);

	const mctpProgram = new PublicKey(addresses.MCTP_PROGRAM_ID);
	const user = new PublicKey(swapperAddress);
	const relayer = new PublicKey(relayerAddress);

	const randomKey = Keypair.generate();

	const deadline = quote.deadline64 ? BigInt(quote.deadline64) : BigInt(0);
	if (quote.hasAuction && !Number(quote.deadline64)) {
		throw new Error('Swap mode requires a timeout');
	}

	const ledgerSeedPrefix = quote.hasAuction ? 'LEDGER_ORDER' : 'LEDGER_BRIDGE';
	const [ledger] = PublicKey.findProgramAddressSync(
		[Buffer.from(ledgerSeedPrefix), user.toBytes(), randomKey.publicKey.toBytes()],
		mctpProgram,
	);
	const ledgerAccount = getAssociatedTokenAddress(
		new PublicKey(quote.mctpInputContract), ledger, true
	);

	const mode = quote.cheaperChain === 'solana' ? 'LOCK_FEE' : 'WITH_FEE';
	const tokenOut = quote.toChain === 'sui' ? quote.toToken.verifiedAddress : quote.toToken.contract;

	if (options.customPayload && quote.hasAuction) {
		throw new Error('Cannot use customPayload with create Mctp swap');
	}

	let customPayloadAccount: PublicKey | null = null;
	const customPayloadNonce = Math.floor(Math.random() * 65000);

	if (options.customPayload) {
		customPayloadAccount = PublicKey.findProgramAddressSync(
			[
				Buffer.from('PAYLOAD'),
				relayer.toBuffer(),
				(() => {
					const buf = Buffer.alloc(2);
					buf.writeUInt16LE(customPayloadNonce, 0);
					return buf;
				})(),
			],
			new PublicKey(addresses.PAYLOAD_WRITER_PROGRAM_ID)
		)[0];
		instructions.push(
			sandwichInstructionInCpiProxy(createPayloadWriterCreateInstruction(
				relayer,
				customPayloadAccount,
				Buffer.from(options.customPayload),
				customPayloadNonce
			))
		);
	}

	if (quote.fromToken.contract === quote.mctpInputContract) {
		// If forceSkip is false then user will execute the cctp instructions by themselves
		const feeSolana: bigint = forceSkipCctpInstructions ? BigInt(quote.solanaRelayerFee64) : BigInt(0);
		if (quote.suggestedPriorityFee > 0) {
			instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
				microLamports: quote.suggestedPriorityFee,
			}))
		}
		instructions.push(
			sandwichInstructionInCpiProxy(createAssociatedTokenAccountInstruction(relayer, ledgerAccount, ledger, new PublicKey(quote.mctpInputContract)))
		);
		instructions.push(
			sandwichInstructionInCpiProxy(createSplTransferInstruction(
				getAssociatedTokenAddress(
					new PublicKey(quote.mctpInputContract), user, allowSwapperOffCurve
				),
				ledgerAccount,
				user,
				BigInt(quote.effectiveAmountIn64),
			))
		);
		if (quote.hasAuction) {
			instructions.push(sandwichInstructionInCpiProxy(createMctpSwapLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey: randomKey.publicKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				amountInMin64: BigInt(quote.effectiveAmountIn64),
				tokenOut,
				tokenOutDecimals: quote.toToken.decimals,
				referrerAddress: referrerAddress,
				amountOutMin: quote.minAmountOut,
				deadline,
				feeRateRef: quote.referrerBps,
				relayerAddress,
			}), options.skipProxyMayanInstructions));
			if (!forceSkipCctpInstructions) {
				const {
					instruction: _instruction,
					signer: _signer
				} = createMctpInitSwapInstruction(
					ledger, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana
				);
				instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
				signers.push(_signer);
			}
		}
		else {
			instructions.push(sandwichInstructionInCpiProxy(createMctpBridgeLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey: randomKey.publicKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				amountInMin64: BigInt(quote.effectiveAmountIn64),
				mode,
				referrerAddress,
				relayerAddress,
				customPayload: customPayloadAccount,
			}), options.skipProxyMayanInstructions));
			if (!forceSkipCctpInstructions) {
				if (mode === 'WITH_FEE') {
					const {
						instruction: _instruction,
						signers: _signers
					} = createMctpBridgeWithFeeInstruction(
						ledger, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana
					);
					instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
					signers.push(..._signers);
				} else {
					const {
						instructions: _instructions,
						signer: _signer
					} = createMctpBridgeLockFeeInstruction(
						ledger, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana
					);
					instructions.push(sandwichInstructionInCpiProxy(_instructions[0]));
					instructions.push(sandwichInstructionInCpiProxy(_instructions[1], options.skipProxyMayanInstructions));
					signers.push(_signer);
				}
			}
		}
	}
	else {
		const clientSwapRaw = await getSwapSolana({
			minMiddleAmount: quote.minMiddleAmount,
			middleToken: quote.mctpInputContract,
			userWallet: swapperAddress,
			userLedger: ledger.toString(),
			slippageBps: quote.slippageBps,
			fromToken: quote.fromToken.contract,
			amountIn64: quote.effectiveAmountIn64,
			depositMode: quote.hasAuction ? 'SWAP' : mode,
			fillMaxAccounts: options?.separateSwapTx || false,
			tpmTokenAccount: options?.separateSwapTx ? tmpSwapTokenAccount.publicKey.toString() : null,
		});

		const clientSwap = decentralizeClientSwapInstructions(clientSwapRaw, connection, relayer);

		if (options?.separateSwapTx && clientSwapRaw.maxAccountsFilled) {
			validateJupSwap(clientSwap, tmpSwapTokenAccount.publicKey, user);
			createSwapTpmTokenAccountInstructions = await createInitializeRandomTokenAccountInstructions(
				connection,
				relayer,
				new PublicKey(quote.mctpInputContract),
				user,
				tmpSwapTokenAccount,
			);
			swapInstructions.push(...clientSwap.computeBudgetInstructions);
			if (clientSwap.setupInstructions) {
				swapInstructions.push(...clientSwap.setupInstructions);
			}
			swapInstructions.push(clientSwap.swapInstruction);
			if (clientSwap.cleanupInstruction) {
				swapInstructions.push(clientSwap.cleanupInstruction);
			}
			_swapAddressLookupTables.push(...clientSwap.addressLookupTableAddresses);
			instructions.push(sandwichInstructionInCpiProxy(createAssociatedTokenAccountInstruction(
				relayer, ledgerAccount, ledger, new PublicKey(quote.mctpInputContract)
			)));
			instructions.push(sandwichInstructionInCpiProxy(createTransferAllAndCloseInstruction(
				user,
				new PublicKey(quote.mctpInputContract),
				tmpSwapTokenAccount.publicKey,
				ledgerAccount,
				relayer,
			)));
		} else {
			validateJupSwap(clientSwap, ledgerAccount, user);
			instructions.push(...clientSwap.computeBudgetInstructions);
			if (clientSwap.setupInstructions) {
				instructions.push(...(clientSwap.setupInstructions.map(ins => sandwichInstructionInCpiProxy(ins))));
			}
			instructions.push(sandwichInstructionInCpiProxy(clientSwap.swapInstruction));
			if (clientSwap.cleanupInstruction) {
				instructions.push(sandwichInstructionInCpiProxy(clientSwap.cleanupInstruction));
			}
			_lookupTablesAddress.push(...clientSwap.addressLookupTableAddresses);
		}

		const feeSolana: bigint = swapInstructions.length > 0 ? BigInt(0) : BigInt(quote.solanaRelayerFee64);


		if (quote.hasAuction) {
			instructions.push(sandwichInstructionInCpiProxy(createMctpSwapLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey: randomKey.publicKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				amountInMin64: getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS),
				tokenOut,
				tokenOutDecimals: quote.toToken.decimals,
				referrerAddress: referrerAddress,
				amountOutMin: quote.minAmountOut,
				deadline,
				feeRateRef: quote.referrerBps,
				relayerAddress,
			}), options.skipProxyMayanInstructions));
			if (swapInstructions.length > 0) {
				const {
					instruction: _instruction,
					signer: _signer
				} = createMctpInitSwapInstruction(
					ledger, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana
				);
				instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
				signers.push(_signer);
			}
		}
		else {
			instructions.push(sandwichInstructionInCpiProxy(createMctpBridgeLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey: randomKey.publicKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				amountInMin64: getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS),
				mode,
				referrerAddress,
				relayerAddress,
				customPayload: customPayloadAccount,
			}), options.skipProxyMayanInstructions));
			if (swapInstructions.length > 0) {
				if (mode === 'WITH_FEE') {
					const {
						instruction: _instruction,
						signers: _signers
					} = createMctpBridgeWithFeeInstruction(
						ledger, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana
					);
					instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
					signers.push(..._signers);
				} else {
					const {
						instructions: _instructions,
						signer: _signer
					} = createMctpBridgeLockFeeInstruction(
						ledger, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana
					);
					instructions.push(sandwichInstructionInCpiProxy(_instructions[0]));
					instructions.push(sandwichInstructionInCpiProxy(_instructions[1], options.skipProxyMayanInstructions));
					signers.push(_signer);
				}
			}
		}
	}
	if (customPayloadAccount) {
		instructions.push(sandwichInstructionInCpiProxy(createPayloadWriterCloseInstruction(
			relayer,
			customPayloadAccount,
			customPayloadNonce,
		)));
	}

	const totalLookupTables = await getAddressLookupTableAccounts(_lookupTablesAddress.concat(_swapAddressLookupTables), connection);
	lookupTables = totalLookupTables.slice(0, _lookupTablesAddress.length);
	if (swapInstructions.length > 0) {
		const swapLookupTables = totalLookupTables.slice(_lookupTablesAddress.length);
		swapMessageV0Params = {
			messageV0: {
				payerKey: user,
				instructions: swapInstructions,
				addressLookupTableAccounts: swapLookupTables,
			},
			createTmpTokenAccountIxs: createSwapTpmTokenAccountInstructions,
			tmpTokenAccount: tmpSwapTokenAccount,
		};
	}

	return { instructions, signers, lookupTables, swapMessageV0Params };
}

