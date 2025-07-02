import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import {
	Quote,
	SuiFunctionParameter,
	SuiFunctionNestedResult,
	ComposableSuiMoveCallsOptions
} from '../types';
import {
	fetchMayanSuiPackageId,
	resolveInputCoin,
} from './utils';
import {
	getAmountOfFractionalAmount, getDisplayAmount,
	getHyperCoreUSDCDepositCustomPayload,
	getWormholeChainIdByName,
	nativeAddressToHexString
} from '../utils';
import addresses from '../addresses';
import { CCTP_TOKEN_DECIMALS } from '../cctp';
import { SystemProgram } from '@solana/web3.js';
import { getSwapSui } from '../api';
import { addBridgeWithFeeMoveCalls2 } from './suiMctp';

export async function createHyperCoreDepositFromSuiMoveCalls(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	suiClient: SuiClient,
	options?: ComposableSuiMoveCallsOptions
): Promise<Transaction> {
	if (
		quote.toToken.contract.toLowerCase() !== addresses.ARBITRUM_USDC_CONTRACT.toLowerCase() ||
		quote.type !== 'MCTP'
	) {
		throw new Error('Unsupported quote type for USDC deposit: ' + quote.type);
	}
	if (!quote.hyperCoreParams) {
		throw new Error('HyperCore parameters are required for this quote');
	}
	if (!options?.usdcPermitSignature) {
		throw new Error('USDC permit signature is required for this quote');
	}
	if (!Number(quote.deadline64)) {
		throw new Error('HyperCore deposit requires timeout');
	}

	const [mctpPackageId] = await Promise.all([
		fetchMayanSuiPackageId(addresses.SUI_MCTP_STATE, suiClient),
	]);

	const amountInMin = getAmountOfFractionalAmount(
		quote.minMiddleAmount,
		CCTP_TOKEN_DECIMALS
	);
	let tx: Transaction;
	let inputCoin:
		| TransactionResult
		| SuiFunctionNestedResult
		| { $kind: 'Input'; Input: number; type?: 'object' };
	let whFeeCoin: SuiFunctionParameter;

	// Setup tx based on we should have client swap or not
	if (quote.fromToken.contract === quote.hyperCoreParams.initiateTokenContract) {
		tx = options?.builtTransaction ?? new Transaction();
		inputCoin = await resolveInputCoin(
			BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
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
			middleCoinType: quote.hyperCoreParams.initiateTokenContract,
			userWallet: swapperAddress,
			withWhFee: true,
			referrerAddress,
			inputCoin: options?.inputCoin,
			transaction: options?.builtTransaction ? (await options.builtTransaction.toJSON()) : undefined,
		});
		tx = Transaction.from(serializedTx);
		const [initiateCoin] = tx.splitCoins(
			outCoin,
			[ BigInt(quote.hyperCoreParams.bridgeAmountUSDC64) ]
		);

		tx.transferObjects(
			[ outCoin ],
			tx.pure.address(swapperAddress)
		);

		inputCoin = initiateCoin;
		whFeeCoin = suiSplitViaSwap ? { result: suiSplitViaSwap } : null;
	}

	const payload = getHyperCoreUSDCDepositCustomPayload(quote, destinationAddress, options.usdcPermitSignature);
	await addBridgeWithFeeMoveCalls2({
		swapperAddress,
		destinationAddress: addresses.HC_ARBITRUM_DEPOSIT_PROCESSOR,
		mctpPackageId,
		toChain: 'arbitrum',
		minMiddleAmount: getDisplayAmount(quote.hyperCoreParams.bridgeAmountUSDC64, CCTP_TOKEN_DECIMALS),
		bridgeFee: quote.bridgeFee,
		gasDrop: quote.hyperCoreParams.failureGasDrop,
		mctpInputContract: quote.mctpInputContract,
		mctpInputTreasury: quote.mctpInputTreasury,
		mctpVerifiedInputAddress: quote.mctpVerifiedInputAddress,
		redeemRelayerFee: 0,
		payload,
		suiClient,
		options: {
			inputCoin: { result: inputCoin },
			whFeeCoin,
			builtTransaction: tx,
		},
	});


	// Log initial coin and amount
	const amountIn = BigInt(quote.effectiveAmountIn64);
	const _payload = Uint8Array.from(payload);
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
