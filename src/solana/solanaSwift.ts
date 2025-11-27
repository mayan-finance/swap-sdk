import {
	AccountMeta,
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	TransactionInstruction, AddressLookupTableAccount, ComputeBudgetProgram
} from '@solana/web3.js';
import { blob, struct, u16, u8 } from '@solana/buffer-layout';
import { Quote, SwapMessageV0Params } from '../types';
import {
	hexToUint8Array,
	nativeAddressToHexString,
	getSafeU64Blob,
	getAmountOfFractionalAmount,
	getAssociatedTokenAddress,
	getWormholeChainIdByName,
	getGasDecimal,
	SWIFT_PAYLOAD_TYPE_DEFAULT,
	SWIFT_PAYLOAD_TYPE_CUSTOM_PAYLOAD,
	getSwiftToTokenHexString,
	getNormalizeFactor,
	createSwiftRandomKey
} from '../utils';
import {Buffer} from 'buffer';
import addresses from '../addresses'
import { ethers, ZeroAddress } from 'ethers';
import { getSwapSolana } from '../api';
import {
	createAssociatedTokenAccountInstruction,
	createInitializeRandomTokenAccountInstructions,
	createSplTransferInstruction,
	createSyncNativeInstruction,
	createTransferAllAndCloseInstruction,
	decentralizeClientSwapInstructions,
	getAddressLookupTableAccounts,
	getAnchorInstructionData,
	getLookupTableAddress,
	sandwichInstructionInCpiProxy,
	solMint,
	validateJupSwap
} from './utils';

export function createSwiftOrderHash(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined, randomKeyHex: string,
	customPayload: undefined | null | Uint8Array | Buffer
): Buffer {
	const orderDataSize = quote.swiftVersion === 'V2' ? 272 : 239;
	const data = Buffer.alloc(orderDataSize);
	let offset = 0;

	if (quote.swiftVersion === 'V2') {
		const payload_type = customPayload ? SWIFT_PAYLOAD_TYPE_CUSTOM_PAYLOAD : SWIFT_PAYLOAD_TYPE_DEFAULT;
		data.writeUInt8(payload_type, offset);
		offset += 1;
	}

	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const trader = Buffer.from(hexToUint8Array(nativeAddressToHexString(swapperAddress, sourceChainId)));
	data.set(trader, offset);
	offset += 32;


	data.writeUInt16BE(sourceChainId, offset);
	offset += 2;

	const fromTokenContract = quote.fromChain === 'sui' ? quote.swiftVerifiedInputAddress : quote.swiftInputContract;
	const _tokenIn =
		fromTokenContract === ZeroAddress ?
			nativeAddressToHexString(SystemProgram.programId.toString(), getWormholeChainIdByName('solana')) :
			nativeAddressToHexString(fromTokenContract, sourceChainId);
	const tokenIn = Buffer.from(hexToUint8Array(_tokenIn));
	data.set(tokenIn, offset);
	offset += 32;

	const destinationChainId = getWormholeChainIdByName(quote.toChain);
	const destAddress = Buffer.from(hexToUint8Array(nativeAddressToHexString(destinationAddress, destinationChainId)));
	data.set(destAddress, offset);
	offset += 32;

	data.writeUInt16BE(destinationChainId, offset);
	offset += 2;

	if (quote.toChain === 'sui' && !quote.toToken.verifiedAddress) {
		throw new Error('Missing verified address for SUI coin');
	}
	const _tokenOut = getSwiftToTokenHexString(quote);
	const tokenOut = Buffer.from(hexToUint8Array(_tokenOut));
	data.set(tokenOut, offset);
	offset += 32;

	data.writeBigUInt64BE(getAmountOfFractionalAmount(
		quote.minAmountOut, Math.min(quote.toToken.decimals, getNormalizeFactor(quote.toChain, quote.type)
		)), offset);
	offset += 8;

	data.writeBigUInt64BE(getAmountOfFractionalAmount(
		quote.gasDrop, Math.min(getGasDecimal(quote.toChain), getNormalizeFactor(quote.toChain, quote.type)
		)), offset);
	offset += 8;

	if (!quote.cancelRelayerFee64 || !quote.refundRelayerFee64) {
		throw new Error('Missing relayer fees');
	}

	data.writeBigUInt64BE(BigInt(quote.cancelRelayerFee64), offset);
	offset += 8;

	data.writeBigUInt64BE(BigInt(quote.refundRelayerFee64), offset);
	offset += 8;

	data.writeBigUInt64BE(BigInt(quote.deadline64), offset);
	offset += 8;

	const referrerChainId = quote.swiftVersion === 'V2' ? sourceChainId : destinationChainId
	const refAddress = referrerAddress ?
		Buffer.from(hexToUint8Array(nativeAddressToHexString(referrerAddress, referrerChainId))) :
		SystemProgram.programId.toBuffer();
	data.set(refAddress, offset);
	offset += 32;

	data.writeUInt8(quote.referrerBps || 0, offset);
	offset += 1;

	const feeRateMayan = quote.protocolBps || 0;
	data.writeUInt8(feeRateMayan, offset);
	offset += 1;

	if (!quote.swiftAuctionMode) {
		throw new Error('Missing swift auction mode');
	}

	data.writeUInt8(quote.swiftAuctionMode, offset);
	offset += 1;

	const _randomKey = Buffer.from(hexToUint8Array(randomKeyHex));
	if (_randomKey.length !== 32) {
		throw new Error('Invalid random key length');
	}
	data.set(_randomKey, offset);
	offset += 32;

	if (quote.swiftVersion === 'V2') {
		let customPayloadHash: Buffer;
		if (customPayload) {
			customPayloadHash = Buffer.from(hexToUint8Array(ethers.keccak256(Buffer.from(customPayload))));
		} else {
			customPayloadHash = SystemProgram.programId.toBuffer();
		}

		data.set(customPayloadHash, offset);
		offset += 32;
	}

	if (offset !== orderDataSize) {
		throw new Error(`Invalid order data size: ${offset}`);
	}

	const hash = ethers.keccak256(data);
	return Buffer.from(hexToUint8Array(hash));
}

type CreateInitSwiftInstructionParams = {
	quote: Quote,
	state: PublicKey,
	trader: PublicKey,
	relayer: PublicKey,
	stateAccount: PublicKey,
	relayerAccount: PublicKey,
	randomKey: PublicKey,
	destinationAddress: string,
	deadline: bigint,
	referrerAddress: string | null | undefined,
	customPayload?: Buffer | Uint8Array | null,
	customPayloadAccount?: PublicKey | null,
	tokenProgramId: PublicKey,
}

const InitSwiftLayout = struct<any>([
	blob(8, 'instruction'),
	blob(8, 'amountInMin'),
	u8('nativeInput'),
	blob(8, 'feeSubmit'),
	blob(32, 'destAddress'),
	u16('destinationChain'),
	blob(32, 'tokenOut'),
	blob(8, 'amountOutMin'),
	blob(8, 'gasDrop'),
	blob(8, 'feeCancel'),
	blob(8, 'feeRefund'),
	blob(8, 'deadline'),
	blob(32, 'refAddress'),
	u8('feeRateRef'),
	u8('feeRateMayan'),
	u8('auctionMode'),
	blob(32, 'randomKey'),
]);


function createSwiftInitInstruction(
	params: CreateInitSwiftInstructionParams,
): TransactionInstruction {
	const { quote } = params;
	const mint = quote.swiftInputContract === ZeroAddress ?
		solMint : new PublicKey(quote.swiftInputContract);
	const destinationChainId = getWormholeChainIdByName(quote.toChain);

	if (destinationChainId !== quote.toToken.wChainId) {
		throw new Error(`Destination chain ID mismatch: ${destinationChainId} != ${quote.toToken.wChainId}`);
	}

	if (params.customPayload && !params.customPayloadAccount) {
		throw new Error('Custom payload account is required when custom payload is provided');
	}

	const accounts: AccountMeta[] = quote.swiftVersion === 'V2' ? [
		{pubkey: params.trader, isWritable: false, isSigner: false},
		{pubkey: params.relayer, isWritable: true, isSigner: true},
		{pubkey: params.state, isWritable: true, isSigner: false},
		{pubkey: params.stateAccount, isWritable: true, isSigner: false},
		{pubkey: params.relayerAccount, isWritable: true, isSigner: false},
		{
			pubkey: params.customPayloadAccount || new PublicKey(addresses.SWIFT_V2_PROGRAM_ID),
			isWritable: false,
			isSigner: false
		},
		{pubkey: mint, isWritable: false, isSigner: false},
		{pubkey: new PublicKey(addresses.FEE_MANAGER_PROGRAM_ID), isWritable: false, isSigner: false},
		{pubkey: params.tokenProgramId, isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	] : [
		{pubkey: params.trader, isWritable: false, isSigner: true},
		{pubkey: params.relayer, isWritable: true, isSigner: true},
		{pubkey: params.state, isWritable: true, isSigner: false},
		{pubkey: params.stateAccount, isWritable: true, isSigner: false},
		{pubkey: params.relayerAccount, isWritable: true, isSigner: false},
		{pubkey: mint, isWritable: false, isSigner: false},
		{pubkey: new PublicKey(addresses.FEE_MANAGER_PROGRAM_ID), isWritable: false, isSigner: false},
		{pubkey: new PublicKey(addresses.TOKEN_PROGRAM_ID), isWritable: false, isSigner: false},
		{pubkey: SystemProgram.programId, isWritable: false, isSigner: false},
	];

	accounts.forEach((account, index) => {
		console.log(index, account.pubkey);
	});
	const data = Buffer.alloc(InitSwiftLayout.span);

	const referrerChainId = quote.swiftVersion === 'V2' ? getWormholeChainIdByName('solana') : destinationChainId;
	const refAddress = params.referrerAddress ?
		Buffer.from(hexToUint8Array(nativeAddressToHexString(params.referrerAddress, referrerChainId))) :
		SystemProgram.programId.toBuffer();

	if (!quote.minMiddleAmount) {
		throw new Error('Missing min middle amount');
	}

	const minMiddleAmount: bigint =
		quote.fromToken.contract === quote.swiftInputContract ?
			BigInt(quote.effectiveAmountIn64) :
			getAmountOfFractionalAmount(quote.minMiddleAmount, quote.swiftInputDecimals);


	if (quote.toChain === 'sui' && !quote.toToken.verifiedAddress) {
		throw new Error('Missing verified address for SUI coin');
	}

	if (!quote.cancelRelayerFee64 || !quote.refundRelayerFee64) {
		throw new Error('Missing relayer fees');
	}

	const _tokenOut = getSwiftToTokenHexString(quote);

	if (!quote.submitRelayerFee64) {
		throw new Error('Missing submit relayer fee');
	}

	InitSwiftLayout.encode({
		instruction: getAnchorInstructionData('init_order'),
		amountInMin: getSafeU64Blob(minMiddleAmount),
		nativeInput: quote.swiftInputContract === ZeroAddress ? 1 : 0,
		feeSubmit: getSafeU64Blob(BigInt(quote.submitRelayerFee64)),
		destAddress: Buffer.from(hexToUint8Array(nativeAddressToHexString(params.destinationAddress, destinationChainId))),
		destinationChain: destinationChainId,
		tokenOut: Buffer.from(hexToUint8Array(_tokenOut)),
		amountOutMin: getSafeU64Blob(getAmountOfFractionalAmount(
			quote.minAmountOut, Math.min(quote.toToken.decimals, getNormalizeFactor(quote.toChain, quote.type))
		)),
		gasDrop: getSafeU64Blob(getAmountOfFractionalAmount(
			quote.gasDrop, Math.min(getGasDecimal(quote.toChain), getNormalizeFactor(quote.toChain, quote.type))
		)),
		feeCancel: getSafeU64Blob(BigInt(quote.cancelRelayerFee64)),
		feeRefund: getSafeU64Blob(BigInt(quote.refundRelayerFee64)),
		deadline: getSafeU64Blob(params.deadline),
		refAddress: refAddress,
		feeRateRef: quote.referrerBps,
		feeRateMayan: quote.protocolBps,
		auctionMode: quote.swiftAuctionMode,
		randomKey: params.randomKey.toBuffer(),
	}, data);

	return new TransactionInstruction({
		keys: accounts,
		data,
		programId: new PublicKey(quote.swiftVersion === 'V2' ? addresses.SWIFT_V2_PROGRAM_ID : addresses.SWIFT_PROGRAM_ID),
	});
}

export async function createSwiftFromSolanaInstructions(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined,
	connection: Connection, options: {
		allowSwapperOffCurve?: boolean,
		separateSwapTx?: boolean,
    skipProxyMayanInstructions?: boolean,
	} = {},
	customPayload?: Buffer | Uint8Array | null,
	customPayloadAccount?: string | null,
): Promise<{
	instructions: TransactionInstruction[],
	signers: Keypair[],
	lookupTables: AddressLookupTableAccount[],
	swapMessageV0Params: SwapMessageV0Params | null,
}> {

	if (quote.type !== 'SWIFT') {
		throw new Error('Unsupported quote type for Swift: ' + quote.type);
	}
	if (quote.toChain === 'solana') {
		throw new Error('Unsupported destination chain: ' + quote.toChain);
	}
	if (quote.swiftVersion !== 'V2' && (quote.toChain === 'sui' || quote.toChain === 'ton')) {
		throw new Error('Swift V2 is required for SUI and TON chain');
	}
	const quoteSwiftVersion = quote.swiftVersion;

	const allowSwapperOffCurve = options.allowSwapperOffCurve || false;

	let instructions: TransactionInstruction[] = [];
	let lookupTables: AddressLookupTableAccount[] = [];

	let _lookupTablesAddress: string[] = [];

	_lookupTablesAddress.push(getLookupTableAddress(quote.fromChain));

	// using for the swap via Jito Bundle
	let _swapAddressLookupTables: string[] = [];
	let swapInstructions: TransactionInstruction[] = [];
	let createSwapTpmTokenAccountInstructions: TransactionInstruction[] = [];
	const tmpSwapTokenAccount: Keypair = Keypair.generate();
	let swapMessageV0Params: SwapMessageV0Params | null = null;

	const trader = new PublicKey(swapperAddress);

	const randomKey = new PublicKey(createSwiftRandomKey(quote));

	if (!Number(quote.deadline64)) {
		throw new Error('Swift mode requires a timeout');
	}
	const deadline = BigInt(quote.deadline64);

	if (customPayload && !customPayloadAccount) {
		throw new Error('Custom payload account is required when custom payload is provided');
	}

	const hash = createSwiftOrderHash(
		quote, swapperAddress, destinationAddress,
		referrerAddress, randomKey.toBuffer().toString('hex'),
		customPayload
	);

	const chainDestBuffer = Buffer.alloc(2);
	chainDestBuffer.writeUInt16LE(getWormholeChainIdByName(quote.toChain));
	const [state] = quote.swiftVersion === 'V2' ?
		PublicKey.findProgramAddressSync(
			[Buffer.from('STATE_SOURCE'), hash, chainDestBuffer],
			new PublicKey(addresses.SWIFT_V2_PROGRAM_ID),
		) : PublicKey.findProgramAddressSync(
			[Buffer.from('STATE_SOURCE'), hash],
			new PublicKey(addresses.SWIFT_PROGRAM_ID),
		);

	let tokenProgramId: PublicKey;
	if (quote.swiftVersion === 'V2') {
		tokenProgramId = quote.swiftInputContractStandard === 'spl2022' ?
			new PublicKey(addresses.TOKEN_2022_PROGRAM_ID) :
			new PublicKey(addresses.TOKEN_PROGRAM_ID);
	} else {
		tokenProgramId = new PublicKey(addresses.TOKEN_PROGRAM_ID);
	}
	console.log({tokenProgramId})

	const swiftInputMint = quote.swiftInputContract === ZeroAddress ? solMint : new PublicKey(quote.swiftInputContract);

	const stateAccount = getAssociatedTokenAddress(
		swiftInputMint, state, true, tokenProgramId
	);

	const relayer = quote.gasless ? new PublicKey(quote.relayer) : trader;
	const relayerAccount = getAssociatedTokenAddress(swiftInputMint, relayer, false, tokenProgramId);
	if (quote.fromToken.contract === quote.swiftInputContract) {
		if (quote.suggestedPriorityFee > 0) {
			instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
				microLamports: quote.suggestedPriorityFee,
			}))
		}
		instructions.push(
			sandwichInstructionInCpiProxy(createAssociatedTokenAccountInstruction(relayer, stateAccount, state, swiftInputMint, tokenProgramId))
		);
		if (quote.swiftInputContract === ZeroAddress) {
			instructions.push(
				sandwichInstructionInCpiProxy(SystemProgram.transfer({
					fromPubkey: trader,
					toPubkey: stateAccount,
					lamports: BigInt(quote.effectiveAmountIn64),
				})),
				sandwichInstructionInCpiProxy(createSyncNativeInstruction(stateAccount)),
			);
		} else {
			instructions.push(
				sandwichInstructionInCpiProxy(createSplTransferInstruction(
					getAssociatedTokenAddress(
						swiftInputMint, trader, allowSwapperOffCurve, tokenProgramId
					),
					stateAccount,
					trader,
					BigInt(quote.effectiveAmountIn64),
          tokenProgramId,
				))
			);
		}
	} else {
		if (!quote.minMiddleAmount) {
			throw new Error('Missing min middle amount for swap');
		}
		const clientSwapRaw = await getSwapSolana({
			minMiddleAmount: quote.minMiddleAmount,
			middleToken: quote.swiftInputContract,
			userWallet: swapperAddress,
			slippageBps: quote.slippageBps,
			fromToken: quote.fromToken.contract,
			amountIn64: quote.effectiveAmountIn64,
			depositMode: quote.gasless ? 'SWIFT_GASLESS' : 'SWIFT',
			orderHash: `0x${hash.toString('hex')}`,
			fillMaxAccounts: options?.separateSwapTx || false,
			tpmTokenAccount: options?.separateSwapTx ? tmpSwapTokenAccount.publicKey.toString() : null,
			referrerAddress: referrerAddress || undefined,
			chainName: quote.fromChain,
		});
		if (quote.swiftVersion !== quoteSwiftVersion) {
			throw new Error('Quote mutation is not allowed');
		}
		const clientSwap = decentralizeClientSwapInstructions(clientSwapRaw, connection, relayer);
		if (options?.separateSwapTx && clientSwapRaw.maxAccountsFilled) {
			validateJupSwap(clientSwap, tmpSwapTokenAccount.publicKey, trader);
			createSwapTpmTokenAccountInstructions = await createInitializeRandomTokenAccountInstructions(
				connection,
				relayer,
				swiftInputMint,
				trader,
				tmpSwapTokenAccount,
				tokenProgramId,
			);
			if (quote.swiftVersion !== quoteSwiftVersion) {
				throw new Error('Quote mutation is not allowed');
			}
			swapInstructions.push(...clientSwap.computeBudgetInstructions);
			if (clientSwap.setupInstructions) {
				swapInstructions.push(...clientSwap.setupInstructions);
			}
			swapInstructions.push(clientSwap.swapInstruction);
			if (clientSwap.cleanupInstruction) {
				swapInstructions.push(clientSwap.cleanupInstruction);
			}
			_swapAddressLookupTables.push(...clientSwap.addressLookupTableAddresses);
			instructions.push(sandwichInstructionInCpiProxy(
				createAssociatedTokenAccountInstruction(relayer, stateAccount, state, swiftInputMint, tokenProgramId)
			));
			instructions.push(sandwichInstructionInCpiProxy(createTransferAllAndCloseInstruction(
				trader,
				swiftInputMint,
				tmpSwapTokenAccount.publicKey,
				stateAccount,
				relayer,
        tokenProgramId,
			)));
		} else {
			validateJupSwap(clientSwap, stateAccount, trader);
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
	}

	instructions.push(sandwichInstructionInCpiProxy(createSwiftInitInstruction({
		quote,
		state,
		trader,
		stateAccount,
		randomKey: randomKey,
		relayerAccount,
		relayer,
		destinationAddress,
		deadline,
		referrerAddress,
    tokenProgramId,
    customPayload,
    customPayloadAccount: customPayloadAccount ? new PublicKey(customPayloadAccount) : undefined,
	}), options.skipProxyMayanInstructions));

	const totalLookupTables = await getAddressLookupTableAccounts(_lookupTablesAddress.concat(_swapAddressLookupTables), connection);
	lookupTables = totalLookupTables.slice(0, _lookupTablesAddress.length);

	if (swapInstructions.length > 0) {
		const swapLookupTables = totalLookupTables.slice(_lookupTablesAddress.length);
		swapMessageV0Params = {
			messageV0: {
				payerKey: relayer,
				instructions: swapInstructions,
				addressLookupTableAccounts: swapLookupTables,
			},
			createTmpTokenAccountIxs: createSwapTpmTokenAccountInstructions,
			tmpTokenAccount: tmpSwapTokenAccount,
		};
	}

  console.log({
    randomKey: randomKey.toBuffer().toString('hex'),
    hash: hash.toString('hex'),
  })

  if (quote.swiftVersion !== quoteSwiftVersion) {
    throw new Error('Quote mutation is not allowed');
  }

	return { instructions, signers: [], lookupTables, swapMessageV0Params };
}






