import {Transaction, TransactionResult, TransactionObjectArgument} from '@mysten/sui/transactions';
import {SUI_TYPE_ARG, SUI_CLOCK_OBJECT_ID} from '@mysten/sui/utils';
import {SuiClient} from '@mysten/sui/client';
import {
	Quote,
	SuiFunctionParameter,
	SuiFunctionNestedResult,
	ComposableSuiMoveCallsOptions,
} from '../types';
import {
	assertArgumentIsImmutable,
	fetchAllCoins,
	fetchMayanSuiPackageId, resolveInputCoin,
} from './utils';
import {
	getAmountOfFractionalAmount,
	getGasDecimal,
	getWormholeChainIdByName, hexToUint8Array,
	nativeAddressToHexString, SWIFT_PAYLOAD_TYPE_CUSTOM_PAYLOAD, SWIFT_PAYLOAD_TYPE_DEFAULT,
} from '../utils';
import addresses from '../addresses';
import {Buffer} from 'buffer';
import {SystemProgram, Keypair as SolanaKeypair} from '@solana/web3.js';
import {getSwapSui} from '../api';
import {ethers, ZeroAddress} from 'ethers';

export async function createSwiftFromSuiMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	payload: Uint8Array | Buffer | null | undefined,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions & { randomKey?: Uint8Array }
): Promise<Transaction> {
	if (!quote.fromToken.verifiedAddress || !quote.swiftVerifiedInputAddress) {
		throw new Error('from token or swift input verified address is not provided');
	}
	const [swiftPackageId, feeManagerPackageId] = await Promise.all([
		fetchMayanSuiPackageId(addresses.SUI_SWIFT_STATE, suiClient),
		fetchMayanSuiPackageId(addresses.SUI_SWIFT_FEE_MANAGER_STATE, suiClient),
	]);

	let tx: Transaction;
	let inputCoin:
		| TransactionResult
		| SuiFunctionNestedResult
		| { $kind: 'Input'; Input: number; type?: 'object' };

	// Setup tx based on we should have client swap or not
	if (quote.fromToken.contract === quote.swiftInputContract) {
		tx = options?.builtTransaction ?? new Transaction();
		inputCoin = await resolveInputCoin(
			BigInt(quote.effectiveAmountIn64),
			swapperAddress,
			quote.swiftInputContract,
			suiClient,
			tx,
			options?.inputCoin
		);
	} else {
		const {
			tx: serializedTx,
			outCoin,
		} = await getSwapSui({
			amountIn64: quote.effectiveAmountIn64,
			inputCoinType: quote.fromToken.contract,
			middleCoinType: quote.swiftInputContract,
			userWallet: swapperAddress,
			withWhFee: false,
			referrerAddress,
			inputCoin: options?.inputCoin,
			transaction: options?.builtTransaction ? (await options.builtTransaction.toJSON()) : undefined,
			slippageBps: quote.slippageBps,
			chainName: quote.fromChain,
		});
		tx = Transaction.from(serializedTx);
		inputCoin = outCoin;
	}

	await addInitSwiftOrderMoveCalls(
		quote,
		swapperAddress,
		destinationAddress,
		referrerAddress,
		swiftPackageId,
		feeManagerPackageId,
		payload,
		suiClient,
		{
			inputCoin: {result: inputCoin},
			builtTransaction: tx,
			randomKey: options?.randomKey,
		}
	);

	// Log initial coin and amount
	const amountIn = BigInt(quote.effectiveAmountIn64);

	const _payload = payload ? Uint8Array.from(payload) : Uint8Array.from([]);
	tx.moveCall({
		package: swiftPackageId,
		module: 'init_order',
		function: 'log_initialize_order',
		typeArguments: [quote.fromToken.contract],
		arguments: [
			tx.pure.u64(amountIn),
			tx.object(quote.fromToken.verifiedAddress),
			tx.pure.vector('u8', _payload),
		]
	});
	return tx;
}


export async function addInitSwiftOrderMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	swiftPackageId: string,
	feeManagerPackageId: string,
	payload: Uint8Array | Buffer | null | undefined,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions & { randomKey?: Uint8Array }
): Promise<Transaction> {
	const destChainId = getWormholeChainIdByName(quote.toChain);
	const tx = options?.builtTransaction ?? new Transaction();

	const amountInMin = quote.fromToken.contract === quote.swiftInputContract ?
		BigInt(quote.effectiveAmountIn64) :
		getAmountOfFractionalAmount(
			quote.minMiddleAmount,
			quote.swiftInputDecimals,
		);

	const [inputCoin] = await Promise.all([
		resolveInputCoin(
			BigInt(quote.effectiveAmountIn64),
			swapperAddress,
			quote.swiftInputContract,
			suiClient,
			tx,
			options?.inputCoin
		),
		assertArgumentIsImmutable(
			{
				package: feeManagerPackageId,
				module: 'calculate_swift_fee',
				function: 'prepare_calc_swift_fee',
				argumentIndex: 3,
			},
			suiClient
		),
	]);

	const tokenOut =
		quote.toToken.contract === ZeroAddress ?
			nativeAddressToHexString(SystemProgram.programId.toString(), getWormholeChainIdByName('solana')) :
			nativeAddressToHexString(quote.toToken.contract, quote.toToken.wChainId);

	const amountOutMin = getAmountOfFractionalAmount(
		quote.minAmountOut, Math.min(8, quote.toToken.decimals)
	);

	const addrDest = nativeAddressToHexString(destinationAddress, destChainId);

	const gasDrop = getAmountOfFractionalAmount(
		quote.gasDrop,
		Math.min(getGasDecimal(quote.toChain), 8)
	);
	const cancelFee = BigInt(quote.cancelRelayerFee64);
	const refundFee = BigInt(quote.refundRelayerFee64);
	const deadline = BigInt(quote.deadline64);
	let referrerHex: string;
	if (referrerAddress) {
		referrerHex = nativeAddressToHexString(referrerAddress, getWormholeChainIdByName('sui'));
	} else {
		referrerHex = nativeAddressToHexString(
			SystemProgram.programId.toString(),
			getWormholeChainIdByName('solana')
		);
	}

	const payloadType = payload ? SWIFT_PAYLOAD_TYPE_CUSTOM_PAYLOAD : SWIFT_PAYLOAD_TYPE_DEFAULT;

	let customPayloadHash: Buffer;
	if (payload) {
		customPayloadHash = Buffer.from(hexToUint8Array(ethers.keccak256(Buffer.from(payload))));
	} else {
		customPayloadHash = SystemProgram.programId.toBuffer();
	}

	const commonArguments = [
		tx.pure.u8(payloadType),
		tx.pure.address(swapperAddress),
		tx.object(quote.swiftVerifiedInputAddress),
		inputCoin,
		tx.pure.address(addrDest),
		tx.pure.u16(destChainId),
		tx.pure.address(tokenOut),
		tx.pure.u64(amountOutMin),
		tx.pure.u64(gasDrop),
		tx.pure.u64(cancelFee),
		tx.pure.u64(refundFee),
		tx.pure.u64(deadline),
		tx.pure.address(referrerHex),
		tx.pure.u8(quote.referrerBps),
		tx.pure.u8(quote.swiftAuctionMode),
	];

	const [feeManagerInitOrderParamsTicket] = tx.moveCall({
		package: feeManagerPackageId,
		module: 'calculate_swift_fee',
		function: 'prepare_calc_swift_fee',
		typeArguments: [quote.swiftInputContract],
		arguments: commonArguments,
	});

	const [feeManagerInitOrderParams] = tx.moveCall({
		package: feeManagerPackageId,
		module: 'calculate_swift_fee',
		function: 'calculate_swift_fee',
		arguments: [
			tx.object(addresses.SUI_SWIFT_FEE_MANAGER_STATE),
			feeManagerInitOrderParamsTicket,
		],
	});

	const randomKey: Buffer = options?.randomKey ? Buffer.from(options.randomKey) : SolanaKeypair.generate().publicKey.toBuffer();

	const [initOrderTicket] = tx.moveCall({
		package: swiftPackageId,
		module: 'init_order',
		function: 'prepare_initialize_order',
		typeArguments: [quote.swiftInputContract],
		arguments: [
			commonArguments[0], //payloadType
			commonArguments[1], //swapperAddress
			commonArguments[3], //inputCoin
			tx.pure.u64(amountInMin),
			...commonArguments.slice(4),
			tx.pure.address('0x' + randomKey.toString('hex')),
			tx.pure.address('0x' + customPayloadHash.toString('hex')),
		],
	});

	const [burnRequest, depositTicket] = tx.moveCall({
		package: swiftPackageId,
		module: 'init_order',
		function: 'initialize_order',
		typeArguments: [quote.swiftInputContract],
		arguments: [
			tx.object(addresses.SUI_SWIFT_STATE),
			tx.object(quote.swiftVerifiedInputAddress),
			initOrderTicket,
			feeManagerInitOrderParams,
		],
	});

	return tx;
}


