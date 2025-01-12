import {
	AccountMeta,
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	SYSVAR_CLOCK_PUBKEY,
	SYSVAR_RENT_PUBKEY,
	TransactionInstruction, ComputeBudgetProgram, AddressLookupTableAccount
} from '@solana/web3.js';
import {blob, struct, u16, u8} from '@solana/buffer-layout';
import {Quote, ChainName} from '../types';
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
	createSplTransferInstruction,
	decentralizeClientSwapInstructions,
	getAddressLookupTableAccounts,
	getAnchorInstructionData
} from './utils';

const MCTPBridgeWithFeeLayout = struct<any>([
	blob(8, 'instruction'),
]);

function createMctpBridgeWithFeeInstruction(
	ledger: PublicKey, toChain: ChainName, mintAddress: string,
	relayerAddress: string, feeSolana: bigint,
): {
	instruction: TransactionInstruction;
	signers: Keypair[];
} {

	const wormholeProgramId = new PublicKey(addresses.WORMHOLE_PROGRAM_ID);
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
	const wormholeMessage = Keypair.generate();

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
		{pubkey: wormholeMessage.publicKey, isWritable: true, isSigner: true},
		{pubkey: wormholeProgramId, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false},
		{pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false},

		{pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	const data = Buffer.alloc(MCTPBridgeWithFeeLayout.span);

	MCTPBridgeWithFeeLayout.encode(
		{
			instruction: getAnchorInstructionData('bridge_with_fee'),
		},
		data
	);

	const bridgeIns = new TransactionInstruction({
		keys: accounts,
		data,
		programId: mctpProgram,
	});

	return {instruction: bridgeIns, signers: [cctpMessage, wormholeMessage]};
}

const MctpBridgeLockFeeLayout = struct<any>([
	blob(8, 'instruction'),
]);

function createMctpBridgeLockFeeInstruction(
	ledger: PublicKey, toChain: ChainName, mintAddress: string,
	relayerAddress: string, feeSolana: bigint,
): {
	instructions: TransactionInstruction[];
	signer: Keypair;
} {
	const instructions: TransactionInstruction[] = [];

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

	instructions.push(createAssociatedTokenAccountInstruction(
		relayer, feeStateAccount, feeState, mint
	));

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
	instructions.push(bridgeIns);

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
	amountInMin: number,
	referrerAddress?: string | null | undefined,
	mode: 'WITH_FEE' | 'LOCK_FEE',
	customPayload?: PublicKey | null,
}
function createMctpBridgeLedgerInstruction(params: CreateMctpBridgeLedgerInstructionParams): TransactionInstruction {
	if (params.mode !== 'WITH_FEE' && params.mode !== 'LOCK_FEE') {
		throw new Error('Invalid mode: ' + params.mode);
	}
	const user = new PublicKey(params.swapperAddress);
	const mint = new PublicKey(params.mintAddress);
	const ledgerAccount = getAssociatedTokenAddress(mint, params.ledger, true);
	const destinationChainId = getWormholeChainIdByName(params.toChain);
	const destAddress = Buffer.from(
		hexToUint8Array(
			nativeAddressToHexString(params.destinationAddress, destinationChainId)
		)
	);
	const amountInMin = getSafeU64Blob(
		getAmountOfFractionalAmount(params.amountInMin, CCTP_TOKEN_DECIMALS)
	);
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
		{pubkey: new PublicKey(refAddress), isWritable: false, isSigner: false},
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
	amountInMin: number,
	tokenOut: string,
	tokenOutDecimals: number,
	referrerAddress: string,
	amountOutMin: number,
	deadline: bigint,
	feeRateRef: number,
}
function createMctpSwapLedgerInstruction(params: CreateMctpSwapLedgerInstructionParams): TransactionInstruction {
	const user = new PublicKey(params.swapperAddress);
	const mint = new PublicKey(params.mintAddress);
	const ledgerAccount = getAssociatedTokenAddress(mint, params.ledger, true);
	const destinationChainId = getWormholeChainIdByName(params.toChain);
	const destAddress = Buffer.from(
		hexToUint8Array(
			nativeAddressToHexString(params.destinationAddress, destinationChainId)
		)
	);
	const amountInMin = getSafeU64Blob(
		getAmountOfFractionalAmount(params.amountInMin, CCTP_TOKEN_DECIMALS)
	);
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
	];
	const data = Buffer.alloc(MctpSwapLedgerLayout.span);
	MctpSwapLedgerLayout.encode(
		{
			instruction: getAnchorInstructionData('init_order_ledger'),
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
	} = {}
): Promise<{
	instructions: TransactionInstruction[],
	signers: Keypair[],
	lookupTables:  AddressLookupTableAccount[],
}> {

	const forceSkipCctpInstructions = options?.forceSkipCctpInstructions || false;
	const allowSwapperOffCurve = options?.allowSwapperOffCurve || false;

	if (quote.toChain === 'solana') {
		throw new Error('Unsupported destination chain: ' + quote.toChain);
	}

	let _lookupTablesAddress: string[] = [];

	let instructions: TransactionInstruction[] = [];
	let signers: Keypair[] = [];
	let lookupTables: AddressLookupTableAccount[] = [];

	_lookupTablesAddress.push(addresses.LOOKUP_TABLE);

	const mctpProgram = new PublicKey(addresses.MCTP_PROGRAM_ID);
	const user = new PublicKey(swapperAddress);

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

	if (quote.fromToken.contract === quote.mctpInputContract) {
		// If forceSkip is false then user will execute the cctp instructions by themselves
		const feeSolana: bigint = forceSkipCctpInstructions ? BigInt(quote.solanaRelayerFee64) : BigInt(0);
		if (quote.suggestedPriorityFee > 0) {
			instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
				microLamports: quote.suggestedPriorityFee,
			}))
		}
		instructions.push(
			createAssociatedTokenAccountInstruction(user, ledgerAccount, ledger, new PublicKey(quote.mctpInputContract))
		);
		instructions.push(
			createSplTransferInstruction(
				getAssociatedTokenAddress(
					new PublicKey(quote.mctpInputContract), user, allowSwapperOffCurve
				),
				ledgerAccount,
				user,
				getAmountOfFractionalAmount(quote.effectiveAmountIn, CCTP_TOKEN_DECIMALS)
			)
		);
		if (quote.hasAuction) {
			instructions.push(createMctpSwapLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey: randomKey.publicKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				amountInMin: quote.effectiveAmountIn,
				tokenOut,
				tokenOutDecimals: quote.toToken.decimals,
				referrerAddress: referrerAddress,
				amountOutMin: quote.minAmountOut,
				deadline,
				feeRateRef: quote.referrerBps,
			}));
			if (!forceSkipCctpInstructions) {
				const {
					instruction: _instruction,
					signer: _signer
				} = createMctpInitSwapInstruction(
					ledger, quote.toChain, quote.mctpInputContract, swapperAddress, feeSolana
				);
				instructions.push(_instruction);
				signers.push(_signer);
			}
		}
		else {
			instructions.push(createMctpBridgeLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey: randomKey.publicKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				amountInMin: quote.effectiveAmountIn,
				mode,
				referrerAddress,
			}));
			if (!forceSkipCctpInstructions) {
				if (mode === 'WITH_FEE') {
					const {
						instruction: _instruction,
						signers: _signers
					} = createMctpBridgeWithFeeInstruction(
						ledger, quote.toChain, quote.mctpInputContract, swapperAddress, feeSolana
					);
					instructions.push(_instruction);
					signers.push(..._signers);
				} else {
					const {
						instructions: _instructions,
						signer: _signer
					} = createMctpBridgeLockFeeInstruction(
						ledger, quote.toChain, quote.mctpInputContract, swapperAddress, feeSolana
					);
					instructions.push(..._instructions);
					signers.push(_signer);
				}
			}
		}
	}
	else {
		const feeSolana: bigint = BigInt(quote.solanaRelayerFee64);
		const clientSwapRaw = await getSwapSolana({
			minMiddleAmount: quote.minMiddleAmount,
			middleToken: quote.mctpInputContract,
			userWallet: swapperAddress,
			userLedger: ledger.toString(),
			slippageBps: quote.slippageBps,
			fromToken: quote.fromToken.contract,
			amountIn: quote.effectiveAmountIn,
			depositMode: quote.hasAuction ? 'SWAP' : mode,
		});
		const clientSwap = decentralizeClientSwapInstructions(clientSwapRaw, connection);
		instructions.push(...clientSwap.computeBudgetInstructions);
		if (clientSwap.setupInstructions) {
			instructions.push(...clientSwap.setupInstructions);
		}
		instructions.push(clientSwap.swapInstruction);
		if (clientSwap.cleanupInstruction) {
			instructions.push(clientSwap.cleanupInstruction);
		}
		_lookupTablesAddress.push(...clientSwap.addressLookupTableAddresses);
		if (quote.hasAuction) {
			instructions.push(createMctpSwapLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey: randomKey.publicKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				amountInMin: quote.minMiddleAmount,
				tokenOut,
				tokenOutDecimals: quote.toToken.decimals,
				referrerAddress: referrerAddress,
				amountOutMin: quote.minAmountOut,
				deadline,
				feeRateRef: quote.referrerBps,
			}));
		}
		else {
			instructions.push(createMctpBridgeLedgerInstruction({
				ledger,
				swapperAddress,
				mintAddress: quote.mctpInputContract,
				randomKey: randomKey.publicKey,
				toChain: quote.toChain,
				destinationAddress,
				feeSolana,
				feeRedeem: quote.redeemRelayerFee,
				gasDrop: quote.gasDrop,
				amountInMin: quote.minMiddleAmount,
				mode,
				referrerAddress,
			}));
		}
	}

	lookupTables = await getAddressLookupTableAccounts(_lookupTablesAddress, connection)
	return {instructions, signers, lookupTables};
}

