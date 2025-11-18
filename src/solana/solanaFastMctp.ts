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
import {blob, struct, u16, u8, u32} from '@solana/buffer-layout';
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
import { getCCTPV2BridgePDAs, CCTP_TOKEN_DECIMALS, getCCTPDomain } from '../cctp';
import {
	createAssociatedTokenAccountInstruction,
	createInitializeRandomTokenAccountInstructions,
	createPayloadWriterCloseInstruction,
	createPayloadWriterCreateInstruction,
	createSplTransferInstruction,
	createTransferAllAndCloseInstruction,
	decentralizeClientSwapInstructions,
	getAddressLookupTableAccounts,
	getAnchorInstructionData,
	getLookupTableAddress,
	sandwichInstructionInCpiProxy,
	validateJupSwap
} from './utils';

const FastMctpBridgeLayout = struct<any>([
	blob(8, 'instruction'),
]);

export function createFastMctpBridgeInstruction(
	ledger: PublicKey, trader: PublicKey, toChain: ChainName, mintAddress: string,
	relayerAddress: string, feeSolana: bigint, fromChain: ChainName
): {
	instruction: TransactionInstruction;
	signers: Keypair[];
} {

	const TOKEN_PROGRAM_ID = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	const cctpCoreProgramId = new PublicKey(addresses.CCTPV2_CORE_PROGRAM_ID);
	const cctpTokenProgramId = new PublicKey(addresses.CCTPV2_TOKEN_PROGRAM_ID);
	const mctpProgram = new PublicKey(addresses.FAST_MCTP_PROGRAM_ID);

	const relayer = new PublicKey(relayerAddress);
	const mint = new PublicKey(mintAddress);

	const ledgerAccount = getAssociatedTokenAddress(
		mint, ledger, true
	);

	let relayerAccount: PublicKey;
	if (feeSolana && feeSolana > BigInt(0)) {
		relayerAccount = getAssociatedTokenAddress(mint, relayer, false);
	} else {
		relayerAccount = new PublicKey(addresses.FAST_MCTP_PROGRAM_ID);
	}

	const cctpV2BridgePdas = getCCTPV2BridgePDAs(
		mint, toChain, ledger, trader
	);

	const cctpMessage = Keypair.generate();

	const accounts: AccountMeta[] = [
		{pubkey: ledger, isWritable: true, isSigner: false},
		{pubkey: ledgerAccount, isWritable: true, isSigner: false},
		{pubkey: relayer, isWritable: true, isSigner: true},
		{pubkey: relayerAccount, isWritable: true, isSigner: false},
		{pubkey: mint, isWritable: true, isSigner: false},

		{pubkey: cctpV2BridgePdas.realDenyListAccount, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.senderAuthority, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.cctpDenyListAccount, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.tokenMessenger, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.remoteTokenMessengerKey, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.tokenMinter, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.localToken, isWritable: true, isSigner: false},
		{pubkey: cctpV2BridgePdas.eventAuthToken, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.messageTransmitter, isWritable: true, isSigner: false},
		{pubkey: cctpMessage.publicKey, isWritable: true, isSigner: true},
		{pubkey: cctpCoreProgramId, isWritable: false, isSigner: false},
		{pubkey: cctpTokenProgramId, isWritable: false, isSigner: false},
		{pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const data = Buffer.alloc(FastMctpBridgeLayout.span);

	FastMctpBridgeLayout.encode(
		{
			instruction: getAnchorInstructionData('bridge'),
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

const FastMctpInitOrderLayout = struct<any>([
	blob(8, 'instruction'),
]);
function createFastMctpInitOrderInstruction(
	ledger: PublicKey, trader: PublicKey, toChain: ChainName, mintAddress: string,
	relayerAddress: string, feeSolana: bigint,
): {
	instruction: TransactionInstruction;
	signer: Keypair;
} {
	const TOKEN_PROGRAM_ID = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	const cctpCoreProgramId = new PublicKey(addresses.CCTPV2_CORE_PROGRAM_ID);
	const cctpTokenProgramId = new PublicKey(addresses.CCTPV2_TOKEN_PROGRAM_ID);
	const mctpProgram = new PublicKey(addresses.FAST_MCTP_PROGRAM_ID);


	const relayer = new PublicKey(relayerAddress);
	const mint = new PublicKey(mintAddress);

	const ledgerAccount = getAssociatedTokenAddress(
		mint, ledger, true
	);

	const cctpV2BridgePdas = getCCTPV2BridgePDAs(
		mint, toChain, ledger, trader
	);

	const cctpMessage = Keypair.generate();

	let relayerAccount: PublicKey;
	if (feeSolana && feeSolana > BigInt(0)) {
		relayerAccount = getAssociatedTokenAddress(mint, relayer, false);
	} else {
		relayerAccount = new PublicKey(addresses.FAST_MCTP_PROGRAM_ID);
	}

	const accounts: AccountMeta[] = [
		{pubkey: ledger, isWritable: false, isSigner: false},
		{pubkey: ledgerAccount, isWritable: true, isSigner: false},
		{pubkey: relayer, isWritable: true, isSigner: true},
		{pubkey: relayerAccount, isWritable: true, isSigner: false},
		{pubkey: mint, isWritable: true, isSigner: false},

		{pubkey: cctpV2BridgePdas.realDenyListAccount, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.senderAuthority, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.cctpDenyListAccount, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.tokenMessenger, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.remoteTokenMessengerKey, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.tokenMinter, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.localToken, isWritable: true, isSigner: false},
		{pubkey: cctpV2BridgePdas.eventAuthToken, isWritable: false, isSigner: false},
		{pubkey: cctpV2BridgePdas.messageTransmitter, isWritable: true, isSigner: false},
		{pubkey: cctpMessage.publicKey, isWritable: true, isSigner: true},
		{pubkey: cctpCoreProgramId, isWritable: false, isSigner: false},
		{pubkey: cctpTokenProgramId, isWritable: false, isSigner: false},

		{pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const data = Buffer.alloc(FastMctpInitOrderLayout.span);

	FastMctpInitOrderLayout.encode(
		{
			instruction: getAnchorInstructionData('create_order'),
		},
		data
	);

	const initOrderIns = new TransactionInstruction({
		keys: accounts,
		data,
		programId: mctpProgram,
	});

	return {instruction: initOrderIns, signer: cctpMessage};
}

const MctpBridgeLedgerLayout = struct<any>([
	blob(8, 'instruction'),
	blob(32, 'destAddress'),
	blob(8, 'amountInMin'),
	blob(8, 'gasDrop'),
	blob(8, 'feeRedeem'),
	blob(8, 'feeSolana'),
	u32('destDomain'),
	blob(32, 'refAddress'),
	u8('feeRateRef'),
	u16('keyRnd'),
	blob(8, 'maxCircleFee'),
	u32('minFinalityThreshold'),
	u8('mode'),
]);

type CreateMctpBridgeLedgerInstructionParams = {
	ledger: PublicKey,
	swapperAddress: string,
	mintAddress: string,
	randomKey: number,
	toChain: ChainName,
	destinationAddress: string,
	feeSolana: bigint,
	feeRedeem: bigint,
	gasDrop: number,
	amountInMin64: bigint,
	referrerAddress?: string | null | undefined,
	feeRateRef: number,
	customPayload?: PublicKey | null,
	relayerAddress: string,
	maxCircleFee: bigint,
	minFinalityThreshold: number,
}

export function createFastMctpBridgeLedgerInstruction(params: CreateMctpBridgeLedgerInstructionParams): TransactionInstruction {
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
	const feeRedeem = getSafeU64Blob(params.feeRedeem);
	const feeSolana = getSafeU64Blob(params.feeSolana);
	const maxCircleFee = getSafeU64Blob(params.maxCircleFee);

	const refAddress = params.referrerAddress ?
		Buffer.from(hexToUint8Array(
			nativeAddressToHexString(params.referrerAddress, destinationChainId)
		)) : SystemProgram.programId.toBuffer();
	const destinationChainDomain = getCCTPDomain(params.toChain);

	const accounts: AccountMeta[] = [
		{pubkey: user, isWritable: true, isSigner: true},
		{pubkey: params.ledger, isWritable: true, isSigner: false},
		{pubkey: relayer, isWritable: true, isSigner: true},
		{pubkey: ledgerAccount, isWritable: false, isSigner: false},
		{pubkey: params.customPayload || new PublicKey(addresses.FAST_MCTP_PROGRAM_ID), isWritable: false, isSigner: false},
		{pubkey: mint, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];
	const data = Buffer.alloc(MctpBridgeLedgerLayout.span);
	MctpBridgeLedgerLayout.encode(
		{
			instruction: getAnchorInstructionData('init_bridge_ledger'),
			destAddress,
			amountInMin,
			gasDrop,
			feeRedeem,
			feeSolana,
			destDomain: destinationChainDomain,
			refAddress,
			feeRateRef: params.feeRateRef ?? 0,
			keyRnd: params.randomKey,
			maxCircleFee,
			minFinalityThreshold: params.minFinalityThreshold,
			mode: 1, // Bridge Mode
		},
		data
	);
	return new TransactionInstruction({
		keys: accounts,
		data,
		programId: new PublicKey(addresses.FAST_MCTP_PROGRAM_ID),
	});
}

const FastMctpOrderLedgerLayout = struct<any>([
	blob(8, 'instruction'),
	blob(32, 'destAddress'),
	blob(8, 'amountInMin'),
	blob(8, 'gasDrop'),
	blob(8, 'feeRedeem'),
	blob(8, 'feeRefund'),
	blob(8, 'feeSolana'),
	u16('destDomain'),
	u16('keyRnd'),
	blob(8, 'maxCircleFee'),
	u32('minFinalityThreshold'),
	u8('mode'),
	blob(32, 'tokenOut'),
	blob(8, 'amountOutMin'),
	blob(8, 'deadline'),
	blob(32, 'refAddress'),
	u8('feeRateRef'),
]);

type CreateFastMctpOrderLedgerInstructionParams = {
	ledger: PublicKey,
	swapperAddress: string,
	mintAddress: string,
	randomKey: number,
	toChain: ChainName,
	destinationAddress: string,
	feeSolana: bigint,
	feeRedeem: bigint,
	feeRefund: bigint,
	gasDrop: number,
	amountInMin64?: bigint,
	tokenOut: string,
	tokenOutDecimals: number,
	referrerAddress: string,
	amountOutMin: number,
	deadline: bigint,
	feeRateRef: number,
	relayerAddress: string,
	maxCircleFee: bigint,
	minFinalityThreshold: number,
}
function createFastMctpOrderLedgerInstruction(params: CreateFastMctpOrderLedgerInstructionParams): TransactionInstruction {
	const user = new PublicKey(params.swapperAddress);
	const relayer =  new PublicKey(params.relayerAddress);
	const mint = new PublicKey(params.mintAddress);
	const ledgerAccount = getAssociatedTokenAddress(mint, params.ledger, true);
	const destinationChainId = getWormholeChainIdByName(params.toChain);
	const destinationChainDomain = getCCTPDomain(params.toChain);
	const destAddress = Buffer.from(
		hexToUint8Array(
			nativeAddressToHexString(params.destinationAddress, destinationChainId)
		)
	);
	const amountInMin = getSafeU64Blob(params.amountInMin64);
	const gasDrop = getSafeU64Blob(
		getAmountOfFractionalAmount(params.gasDrop, Math.min(getGasDecimal(params.toChain), 8))
	);
	const feeRedeem = getSafeU64Blob(params.feeRedeem);
	const feeRefund = getSafeU64Blob(params.feeRefund);
	const feeSolana = getSafeU64Blob(params.feeSolana);
	const maxCircleFee = getSafeU64Blob(params.maxCircleFee);

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
		{pubkey: relayer, isWritable: true, isSigner: true},
		{pubkey: ledgerAccount, isWritable: false, isSigner: false},
		{pubkey: mint, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];
	const data = Buffer.alloc(FastMctpOrderLedgerLayout.span);

	FastMctpOrderLedgerLayout.encode(
		{
			instruction: getAnchorInstructionData('init_order_ledger'),
			destAddress,
			amountInMin,
			gasDrop,
			feeRedeem,
			feeRefund,
			feeSolana,
			destDomain: destinationChainDomain,
			keyRnd: params.randomKey,
			maxCircleFee,
			minFinalityThreshold: params.minFinalityThreshold,
			mode: 2, // Order Mode
			tokenOut,
			amountOutMin,
			deadline,
			refAddress,
			feeRateRef: params.feeRateRef,
		},
		data
	);
	return new TransactionInstruction({
		keys: accounts,
		data,
		programId: new PublicKey(addresses.FAST_MCTP_PROGRAM_ID),
	});
}

export async function createFastMctpFromSolanaInstructions(
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

	_lookupTablesAddress.push(getLookupTableAddress(quote.fromChain));

	const fastMctpProgram = new PublicKey(addresses.FAST_MCTP_PROGRAM_ID);
	const user = new PublicKey(swapperAddress);
	const relayer = new PublicKey(relayerAddress);

	const randomKey = Math.floor(Math.random() * 65000);

	const deadline = quote.deadline64 ? BigInt(quote.deadline64) : BigInt(0);
	if (quote.hasAuction && !Number(quote.deadline64)) {
		throw new Error('Swap mode requires a timeout');
	}

	const ledgerSeedPrefix = quote.hasAuction ? 'LEDGER_ORDER' : 'LEDGER_BRIDGE';
	const [ledger] = PublicKey.findProgramAddressSync(
		[
			Buffer.from(ledgerSeedPrefix),
			user.toBytes(),
			(() => {
				const buf = Buffer.alloc(2);
				buf.writeUInt16LE(randomKey, 0);
				return buf;
			})(),
		],
		fastMctpProgram,
	);
	const ledgerAccount = getAssociatedTokenAddress(
		new PublicKey(quote.fastMctpInputContract), ledger, true
	);

	if (quote.toChain === 'sui' && !quote.toToken.verifiedAddress) {
		throw new Error('Missing verified address for SUI coin');
	}

	const tokenOut = quote.toChain === 'sui' ? quote.toToken.verifiedAddress : quote.toToken.contract;

	if (quote.toChain === 'sui') {
		throw new Error('Fast MCTP does not support SUI as destination chain');
	}

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

	if (quote.fromToken.contract === quote.fastMctpInputContract) {
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
			instructions.push(sandwichInstructionInCpiProxy(createFastMctpOrderLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: BigInt(quote.redeemRelayerFee64),
				feeRefund: BigInt(quote.refundRelayerFee64),
				gasDrop: quote.gasDrop,
				amountInMin64: BigInt(quote.effectiveAmountIn64),
				tokenOut,
				tokenOutDecimals: quote.toToken.decimals,
				referrerAddress: referrerAddress,
				amountOutMin: quote.minAmountOut,
				deadline,
				feeRateRef: quote.referrerBps,
				relayerAddress,
				maxCircleFee: BigInt(quote.circleMaxFee64),
				minFinalityThreshold: quote.fastMctpMinFinality,
			}), options.skipProxyMayanInstructions));
			if (!forceSkipCctpInstructions) {
				const {
					instruction: _instruction,
					signer: _signer
				} = createFastMctpInitOrderInstruction(
					ledger, user, quote.toChain, quote.fastMctpInputContract, relayerAddress, feeSolana
				);
				instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
				signers.push(_signer);
			}
		}
		else {
			instructions.push(sandwichInstructionInCpiProxy(createFastMctpBridgeLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: BigInt(quote.redeemRelayerFee64),
				gasDrop: quote.gasDrop,
				amountInMin64: BigInt(quote.effectiveAmountIn64),
				referrerAddress,
				relayerAddress,
				customPayload: customPayloadAccount,
				feeRateRef: quote.referrerBps,
				maxCircleFee: BigInt(quote.circleMaxFee64),
				minFinalityThreshold: quote.fastMctpMinFinality,
			}), options.skipProxyMayanInstructions));
			if (!forceSkipCctpInstructions) {
				const {
					instruction: _instruction,
					signers: _signers
				} = createFastMctpBridgeInstruction(
					ledger, user, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana, quote.fromChain
				);
				instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
				signers.push(..._signers);
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
			depositMode: quote.hasAuction ? 'FAST_MCTP_ORDER' : 'FAST_MCTP_BRIDGE',
			fillMaxAccounts: options?.separateSwapTx || false,
			tpmTokenAccount: options?.separateSwapTx ? tmpSwapTokenAccount.publicKey.toString() : null,
			referrerAddress: referrerAddress || null,
			chainName: quote.fromChain,
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
			instructions.push(sandwichInstructionInCpiProxy(createFastMctpOrderLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: BigInt(quote.redeemRelayerFee64),
				feeRefund: BigInt(quote.refundRelayerFee64),
				gasDrop: quote.gasDrop,
				amountInMin64: getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS),
				tokenOut,
				tokenOutDecimals: quote.toToken.decimals,
				referrerAddress: referrerAddress,
				amountOutMin: quote.minAmountOut,
				deadline,
				feeRateRef: quote.referrerBps,
				relayerAddress,
				maxCircleFee: BigInt(quote.circleMaxFee64),
				minFinalityThreshold: quote.fastMctpMinFinality,
			}), options.skipProxyMayanInstructions));
			if (swapInstructions.length > 0) {
				const {
					instruction: _instruction,
					signer: _signer
				} = createFastMctpInitOrderInstruction(
					ledger, user, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana
				);
				instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
				signers.push(_signer);
			}
		}
		else {
			instructions.push(sandwichInstructionInCpiProxy(createFastMctpBridgeLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: BigInt(quote.redeemRelayerFee64),
				gasDrop: quote.gasDrop,
				amountInMin64: getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS),
				referrerAddress,
				feeRateRef: quote.referrerBps,
				relayerAddress,
				customPayload: customPayloadAccount,
				maxCircleFee: BigInt(quote.circleMaxFee64),
				minFinalityThreshold: quote.fastMctpMinFinality,
			}), options.skipProxyMayanInstructions));
			if (swapInstructions.length > 0) {
				const {
					instruction: _instruction,
					signers: _signers
				} = createFastMctpBridgeInstruction(
					ledger, user, quote.toChain, quote.mctpInputContract, relayerAddress, feeSolana, quote.fromChain
				);
				instructions.push(sandwichInstructionInCpiProxy(_instruction, options.skipProxyMayanInstructions));
				signers.push(..._signers);
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

