import { Transaction, TransactionResult, TransactionObjectArgument } from '@mysten/sui/transactions';
import { SUI_TYPE_ARG, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { SuiClient } from '@mysten/sui/client';
import {
	Quote,
	SuiFunctionParameter,
	SuiFunctionNestedResult,
	ComposableSuiMoveCallsOptions, ChainName, Token
} from '../types';
import {
	assertArgumentIsImmutable,
	fetchAllCoins,
	fetchMayanSuiPackageId,
	resolveInputCoin,
} from './utils';
import {
	getAmountOfFractionalAmount,
	getGasDecimal,
	getWormholeChainIdByName,
	MCTP_INIT_ORDER_PAYLOAD_ID,
	MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD,
	MCTP_PAYLOAD_TYPE_DEFAULT,
	nativeAddressToHexString,
} from '../utils';
import addresses from '../addresses';
import { Buffer } from 'buffer';
import { CCTP_TOKEN_DECIMALS, getCCTPDomain } from '../cctp';
import { SystemProgram } from '@solana/web3.js';
import { getSwapSui } from '../api';
import { ZeroAddress } from 'ethers';

export async function createMctpFromSuiMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	payload: Uint8Array | Buffer | null | undefined,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	if (!quote.fromToken.verifiedAddress) {
		throw new Error('from token verified address is not provided');
	}
	const [mctpPackageId, feeManagerPackageId] = await Promise.all([
		fetchMayanSuiPackageId(addresses.SUI_MCTP_STATE, suiClient),
		quote.hasAuction
			? fetchMayanSuiPackageId(addresses.SUI_MCTP_FEE_MANAGER_STATE, suiClient)
			: null,
	]);

	let tx: Transaction;
	let inputCoin:
		| TransactionResult
		| SuiFunctionNestedResult
		| { $kind: 'Input'; Input: number; type?: 'object' };
	let whFeeCoin: SuiFunctionParameter;

	// Setup tx based on we should have client swap or not
	if (quote.fromToken.contract === quote.mctpInputContract) {
		tx = options?.builtTransaction ?? new Transaction();
		inputCoin = await resolveInputCoin(
			BigInt(quote.effectiveAmountIn64),
			swapperAddress,
			quote.mctpInputContract,
			suiClient,
			tx,
			options?.inputCoin
		);
	} else {
		const {
			tx: serializedTx,
			outCoin,
			whFeeCoin: suiSplitViaSwap,
		} = await getSwapSui({
			amountIn64: quote.effectiveAmountIn64,
			inputCoinType: quote.fromToken.contract,
			middleCoinType: quote.mctpInputContract,
			userWallet: swapperAddress,
			withWhFee: quote.hasAuction || quote.cheaperChain !== 'sui',
			referrerAddress,
			inputCoin: options?.inputCoin,
			transaction: options?.builtTransaction ? (await options.builtTransaction.toJSON()) : undefined,
		});
		tx = Transaction.from(serializedTx);
		inputCoin = outCoin;
		whFeeCoin = suiSplitViaSwap ? { result: suiSplitViaSwap } : null;
	}

	// Adding move calls based on quote type
	if (quote.hasAuction) {
		await addInitOrderMoveCalls(
			quote,
			swapperAddress,
			destinationAddress,
			referrerAddress,
			mctpPackageId,
			feeManagerPackageId,
			suiClient,
			{
				inputCoin: { result: inputCoin },
				whFeeCoin,
				builtTransaction: tx,
			}
		);
	} else {
		if (quote.cheaperChain === 'sui') {
			await addBridgeLockedFeeMoveCalls(
				quote,
				swapperAddress,
				destinationAddress,
				mctpPackageId,
				suiClient,
				{
					inputCoin: { result: inputCoin },
					whFeeCoin,
					builtTransaction: tx,
				}
			);
		} else {
			await addBridgeWithFeeMoveCalls(
				quote,
				swapperAddress,
				destinationAddress,
				mctpPackageId,
				payload,
				suiClient,
				{
					inputCoin: { result: inputCoin },
					whFeeCoin,
					builtTransaction: tx,
				}
			);
		}
	}
	// Log initial coin and amount
	const amountIn = BigInt(quote.effectiveAmountIn64);
	const _payload = payload ? Uint8Array.from(payload) : Uint8Array.from([]);
	tx.moveCall({
		package: mctpPackageId,
		module: 'init_order',
		function: 'log_initialize_mctp',
		typeArguments: [quote.fromToken.contract],
		arguments: [
			tx.pure.u64(amountIn),
			tx.object(quote.fromToken.verifiedAddress),
			tx.pure.vector('u8', _payload),
		]
	});

	try {
		// Log referrer
		let referrerHex: string;
		if (referrerAddress) {
			referrerHex = nativeAddressToHexString(referrerAddress, getWormholeChainIdByName(quote.toChain));
		} else {
			referrerHex = nativeAddressToHexString(
				SystemProgram.programId.toString(),
				getWormholeChainIdByName('solana')
			);
		}
		tx.moveCall({
			package: addresses.SUI_LOGGER_PACKAGE_ID,
			module: 'referrer_logger',
			function: 'log_referrer',
			arguments: [
				tx.pure.address(referrerHex),
				tx.pure.u8(quote.referrerBps || 0),
			]
		})
	} catch (err) {
		console.error('Failed to log referrer', err);
	}
	return tx;
}

export async function addBridgeWithFeeMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	mctpPackageId: string,
	payload: Uint8Array | Buffer | null | undefined,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	return addBridgeWithFeeMoveCalls2({
		swapperAddress,
		destinationAddress,
		toChain: quote.toChain,
		effectiveAmountIn64: quote.effectiveAmountIn64,
		minMiddleAmount: quote.minMiddleAmount,
		mctpPackageId,
		fromToken: quote.fromToken,
		mctpInputContract: quote.mctpInputContract,
		gasDrop: quote.gasDrop,
		redeemRelayerFee: quote.redeemRelayerFee,
		mctpVerifiedInputAddress: quote.mctpVerifiedInputAddress,
		mctpInputTreasury: quote.mctpInputTreasury,
		bridgeFee: quote.bridgeFee,
		payload,
		suiClient,
		options
	});
}

export async function addBridgeLockedFeeMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	mctpPackageId: string,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	const destChainId = getWormholeChainIdByName(quote.toChain);
	const tx = options?.builtTransaction ?? new Transaction();

	const amountInMin = quote.fromToken.contract === quote.mctpInputContract ?
		BigInt(quote.effectiveAmountIn64) :
		getAmountOfFractionalAmount(
			quote.minMiddleAmount,
			CCTP_TOKEN_DECIMALS
		);
	const inputCoin = await resolveInputCoin(
		BigInt(quote.effectiveAmountIn64),
		swapperAddress,
		quote.mctpInputContract,
		suiClient,
		tx,
		options?.inputCoin
	);

	const addrDest = nativeAddressToHexString(destinationAddress, destChainId);
	const domainDest = getCCTPDomain(quote.toChain);
	const gasDrop = getAmountOfFractionalAmount(
		quote.gasDrop,
		Math.min(getGasDecimal(quote.toChain), 8)
	);
	const redeemFee = getAmountOfFractionalAmount(
		quote.redeemRelayerFee,
		CCTP_TOKEN_DECIMALS
	);

	const [bridgeLockedFeeTicket] = tx.moveCall({
		package: mctpPackageId,
		module: 'bridge_locked_fee',
		function: 'prepare_bridge_locked_fee',
		typeArguments: [quote.mctpInputContract],
		arguments: [
			inputCoin,
			tx.pure.u64(amountInMin),
			tx.pure.address(addrDest),
			tx.pure.u32(domainDest),
			tx.pure.u64(gasDrop),
			tx.pure.u64(redeemFee),
		],
	});

	const [burnRequest, depositTicket] = tx.moveCall({
		package: mctpPackageId,
		module: 'bridge_locked_fee',
		function: 'bridge_locked_fee',
		typeArguments: [quote.mctpInputContract],
		arguments: [
			tx.object(addresses.SUI_MCTP_STATE),
			tx.object(addresses.SUI_CCTP_CORE_STATE),
			tx.object(quote.mctpVerifiedInputAddress),
			bridgeLockedFeeTicket,
		],
	});

	const [_burnMessage, cctpMessage] = tx.moveCall({
		package: addresses.SUI_CCTP_TOKEN_PACKAGE_ID,
		module: 'deposit_for_burn',
		function: 'deposit_for_burn_with_caller_with_package_auth',
		typeArguments: [
			quote.mctpInputContract,
			`${mctpPackageId}::bridge_locked_fee::CircleAuth`,
		],
		arguments: [
			depositTicket,
			tx.object(addresses.SUI_CCTP_TOKEN_STATE),
			tx.object(addresses.SUI_CCTP_CORE_STATE),
			tx.object('0x403'),
			tx.object(quote.mctpInputTreasury),
		],
	});

	tx.moveCall({
		package: mctpPackageId,
		module: 'bridge_locked_fee',
		function: 'store_bridge_locked_fee',
		typeArguments: [quote.mctpInputContract],
		arguments: [
			tx.object(addresses.SUI_MCTP_STATE),
			tx.object(quote.mctpVerifiedInputAddress),
			burnRequest,
			cctpMessage,
		],
	});

	return tx;
}

export async function addInitOrderMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	mctpPackageId: string,
	feeManagerPackageId: string,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	const destChainId = getWormholeChainIdByName(quote.toChain);
	const tx = options?.builtTransaction ?? new Transaction();

	const amountInMin = quote.fromToken.contract === quote.mctpInputContract ?
		BigInt(quote.effectiveAmountIn64) :
		getAmountOfFractionalAmount(
			quote.minMiddleAmount,
			CCTP_TOKEN_DECIMALS
		);
	const [inputCoin] = await Promise.all([
		resolveInputCoin(
			BigInt(quote.effectiveAmountIn64),
			swapperAddress,
			quote.mctpInputContract,
			suiClient,
			tx,
			options?.inputCoin
		),
		assertArgumentIsImmutable(
			{
				package: feeManagerPackageId,
				module: 'calculate_mctp_fee',
				function: 'prepare_calc_mctp_fee',
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
	const domainDest = getCCTPDomain(quote.toChain);
	const gasDrop = getAmountOfFractionalAmount(
		quote.gasDrop,
		Math.min(getGasDecimal(quote.toChain), 8)
	);
	const redeemFee = getAmountOfFractionalAmount(
		quote.redeemRelayerFee,
		CCTP_TOKEN_DECIMALS
	);
	const deadline = BigInt(quote.deadline64);
	let referrerHex: string;
	if (referrerAddress) {
		referrerHex = nativeAddressToHexString(referrerAddress, destChainId);
	} else {
		referrerHex = nativeAddressToHexString(
			SystemProgram.programId.toString(),
			getWormholeChainIdByName('solana')
		);
	}

	const commonArguments = [
		tx.object(quote.mctpVerifiedInputAddress),
		tx.pure.u8(MCTP_INIT_ORDER_PAYLOAD_ID),
		tx.pure.address(swapperAddress),
		inputCoin,
		tx.pure.address(addrDest),
		tx.pure.u16(destChainId),
		tx.pure.address(tokenOut),
		tx.pure.u64(amountOutMin),
		tx.pure.u64(gasDrop),
		tx.pure.u64(redeemFee),
		tx.pure.u64(deadline),
		tx.pure.address(referrerHex),
		tx.pure.u8(quote.referrerBps),
	];

	const [feeManagerInitOrderParamsTicket] = tx.moveCall({
		package: feeManagerPackageId,
		module: 'calculate_mctp_fee',
		function: 'prepare_calc_mctp_fee',
		typeArguments: [quote.mctpInputContract],
		arguments: commonArguments,
	});

	const [feeManagerInitOrderParams] = tx.moveCall({
		package: feeManagerPackageId,
		module: 'calculate_mctp_fee',
		function: 'calculate_mctp_fee',
		arguments: [
			tx.object(addresses.SUI_MCTP_FEE_MANAGER_STATE),
			feeManagerInitOrderParamsTicket,
		],
	});

	const [initOrderTicket] = tx.moveCall({
		package: mctpPackageId,
		module: 'init_order',
		function: 'prepare_initialize_order',
		typeArguments: [quote.mctpInputContract],
		arguments: [
			...commonArguments.slice(1),
			tx.pure.u32(domainDest),
			tx.pure.u64(amountInMin),
		],
	});

	const [burnRequest, depositTicket] = tx.moveCall({
		package: mctpPackageId,
		module: 'init_order',
		function: 'initialize_order',
		typeArguments: [quote.mctpInputContract],
		arguments: [
			tx.object(addresses.SUI_MCTP_STATE),
			tx.object(addresses.SUI_CCTP_CORE_STATE),
			tx.object(quote.mctpVerifiedInputAddress),
			initOrderTicket,
			feeManagerInitOrderParams,
		],
	});

	const [_burnMessage, cctpMessage] = tx.moveCall({
		package: addresses.SUI_CCTP_TOKEN_PACKAGE_ID,
		module: 'deposit_for_burn',
		function: 'deposit_for_burn_with_caller_with_package_auth',
		typeArguments: [
			quote.mctpInputContract,
			`${mctpPackageId}::init_order::CircleAuth`,
		],
		arguments: [
			depositTicket,
			tx.object(addresses.SUI_CCTP_TOKEN_STATE),
			tx.object(addresses.SUI_CCTP_CORE_STATE),
			tx.object('0x403'),
			tx.object(quote.mctpInputTreasury),
		],
	});

	const [wormholeMessage] = tx.moveCall({
		package: mctpPackageId,
		module: 'init_order',
		function: 'publish_init_order',
		arguments: [tx.object(addresses.SUI_MCTP_STATE), burnRequest, cctpMessage],
	});

	await addPublishWormholeMessage(
		tx,
		wormholeMessage,
		suiClient,
		BigInt(quote.bridgeFee),
		swapperAddress,
		options?.whFeeCoin
	);

	return tx;
}

async function addPublishWormholeMessage(
	tx: Transaction,
	messageTicket: SuiFunctionNestedResult,
	suiClient: SuiClient,
	bridgeFee: bigint,
	feePayer: string,
	suiCoin?: SuiFunctionParameter
): Promise<Transaction> {
	let gasCoin:
		| TransactionResult
		| SuiFunctionNestedResult
		| { $kind: 'Input'; Input: number; type?: 'object' };
	if (suiCoin?.result) {
		gasCoin = suiCoin.result;
	} else if (suiCoin?.objectId) {
		gasCoin = tx.object(suiCoin.objectId);
	} else {
		if (bridgeFee > BigInt(0)) {
			const {coins, sum} = await fetchAllCoins(
				{
					walletAddress: feePayer,
					coinType: SUI_TYPE_ARG,
					coinAmount: bridgeFee,
				},
				suiClient
			);
			if (sum < bridgeFee) {
				throw new Error(`Insufficient funds to pay Wormhole message fee`);
			}
			if (coins.length > 1) {
				tx.mergeCoins(
					coins[0].coinObjectId,
					coins.slice(1).map((c) => c.coinObjectId)
				);
			}
			const [spitedCoin] = tx.splitCoins(coins[0].coinObjectId, [bridgeFee]);
			gasCoin = spitedCoin;
		} else {
			const [zeroSui] = tx.splitCoins(tx.gas, [tx.pure.u64(0)]);
			gasCoin = zeroSui;
		}
	}

	tx.moveCall({
		package: addresses.SUI_WORMHOLE_PACKAGE_ID,
		module: 'publish_message',
		function: 'publish_message',
		arguments: [
			tx.object(addresses.SUI_WORMHOLE_STATE),
			gasCoin,
			messageTicket,
			tx.object(SUI_CLOCK_OBJECT_ID),
		],
	});

	return tx;
}

export async function addBridgeWithFeeMoveCalls2(params:{
	swapperAddress: string,
	destinationAddress: string,
	toChain: ChainName,
	effectiveAmountIn64: string,
	minMiddleAmount: number,
	mctpPackageId: string,
	fromToken: Token,
	mctpInputContract: string,
	gasDrop: number,
	redeemRelayerFee: number,
	mctpVerifiedInputAddress: string,
	mctpInputTreasury: string,
	bridgeFee: number,
	payload: Uint8Array | Buffer | null | undefined,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions
}): Promise<Transaction> {
	const {
		swapperAddress,
		destinationAddress,
		mctpPackageId,
		payload,
		suiClient,
		options,
	} = params;
	const destChainId = getWormholeChainIdByName(params.toChain);
	const tx = options?.builtTransaction ?? new Transaction();

  const amountInMin = params.fromToken.contract === params.mctpInputContract ?
    BigInt(params.effectiveAmountIn64) :
    getAmountOfFractionalAmount(
      params.minMiddleAmount,
      CCTP_TOKEN_DECIMALS
    );
  const inputCoin = await resolveInputCoin(
    BigInt(params.effectiveAmountIn64),
    swapperAddress,
    params.mctpInputContract,
    suiClient,
    tx,
    options?.inputCoin
  );

	const payloadType = payload
		? MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD
		: MCTP_PAYLOAD_TYPE_DEFAULT;

	const addrDest = nativeAddressToHexString(destinationAddress, destChainId);
	const domainDest = getCCTPDomain(params.toChain);
	const gasDrop = getAmountOfFractionalAmount(
		params.gasDrop,
		Math.min(getGasDecimal(params.toChain), 8)
	);
	const redeemFee = getAmountOfFractionalAmount(
		params.redeemRelayerFee,
		CCTP_TOKEN_DECIMALS
	);
	const _payload = payload ? Uint8Array.from(payload) : Uint8Array.from([]);

	const [bridgeWithFeeTicket] = tx.moveCall({
		package: mctpPackageId,
		module: 'bridge_with_fee',
		function: 'prepare_bridge_with_fee',
		typeArguments: [params.mctpInputContract],
		arguments: [
			tx.pure.u8(payloadType),
			inputCoin,
			tx.pure.u64(amountInMin),
			tx.pure.address(addrDest),
			tx.pure.u32(domainDest),
			tx.pure.u64(gasDrop),
			tx.pure.u64(redeemFee),
			tx.pure.vector('u8', _payload),
		],
	});

	const [burnRequest, depositTicket] = tx.moveCall({
		package: mctpPackageId,
		module: 'bridge_with_fee',
		function: 'bridge_with_fee',
		typeArguments: [params.mctpInputContract],
		arguments: [
			tx.object(addresses.SUI_MCTP_STATE),
			tx.object(addresses.SUI_CCTP_CORE_STATE),
			tx.object(params.mctpVerifiedInputAddress),
			bridgeWithFeeTicket,
		],
	});

	const [_burnMessage, cctpMessage] = tx.moveCall({
		package: addresses.SUI_CCTP_TOKEN_PACKAGE_ID,
		module: 'deposit_for_burn',
		function: 'deposit_for_burn_with_caller_with_package_auth',
		typeArguments: [
			params.mctpInputContract,
			`${mctpPackageId}::bridge_with_fee::CircleAuth`,
		],
		arguments: [
			depositTicket,
			tx.object(addresses.SUI_CCTP_TOKEN_STATE),
			tx.object(addresses.SUI_CCTP_CORE_STATE),
			tx.object('0x403'),
			tx.object(params.mctpInputTreasury),
		],
	});

	const [wormholeMessage] = tx.moveCall({
		package: mctpPackageId,
		module: 'bridge_with_fee',
		function: 'publish_bridge_with_fee',
		arguments: [tx.object(addresses.SUI_MCTP_STATE), burnRequest, cctpMessage],
	});

	await addPublishWormholeMessage(
		tx,
		wormholeMessage,
		suiClient,
		BigInt(params.bridgeFee),
		swapperAddress,
		options?.whFeeCoin
	);

	return tx;
}

