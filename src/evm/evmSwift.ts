import {
	Contract,
	toBeHex,
	ZeroAddress,
	TransactionRequest
} from 'ethers';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Erc20Permit, EvmForwarderParams, Quote, SwiftEvmOrderTypedData } from '../types';
import {
	nativeAddressToHexString,
	getAmountOfFractionalAmount,
	getWormholeChainIdByName,
	getWormholeChainIdById,
	getGasDecimal,
	ZeroPermit,
	SWIFT_PAYLOAD_TYPE_CUSTOM_PAYLOAD,
	SWIFT_PAYLOAD_TYPE_DEFAULT,
	getNormalizeFactor, getSwiftToTokenHexString, createSwiftRandomKey
} from '../utils';
import MayanSwiftV2Artifact from './MayanSwiftV2Artifact';
import MayanSwiftV1Artifact from './MayanSwiftArtifact';
import addresses from '../addresses';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import { createSwiftOrderHash } from '../solana';
import {Buffer} from "buffer";
import { getSwapEvm } from '../api';


export type SwiftOrderParams = {
	payloadType: number;
	trader: string;
	tokenOut: string;
	minAmountOut: bigint;
	gasDrop: bigint;
	cancelFee: bigint;
	refundFee: bigint;
	deadline: bigint;
	destAddr: string;
	destChainId: number;
	referrerAddr: string;
	referrerBps: number;
	auctionMode: number;
	random: string;
};

export type EvmSwiftParams = {
	contractAddress: string;
	tokenIn: string;
	amountIn: bigint;
	order: SwiftOrderParams;
	customPayload: string;
};

export function getEvmSwiftParams(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined, signerChainId: string | number,
	customPayload: Buffer | Uint8Array | null | undefined
): EvmSwiftParams {
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const destChainId = getWormholeChainIdByName(quote.toChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}
	if (!quote.swiftMayanContract) {
		throw new Error('SWIFT contract address is missing');
	}

	if (quote.toToken.wChainId !== destChainId) {
		throw new Error(`Destination chain ID mismatch: ${destChainId} != ${quote.toToken.wChainId}`);
	}
	if (quote.swiftVersion !== 'V2' && quote.toChain === 'sui') {
		throw new Error('Swift V2 is required for SUI chain');
	}
	const contractAddress = quote.swiftMayanContract;

	if (!Number(quote.deadline64)) {
		throw new Error('Swift order requires timeout');
	}

	const deadline = BigInt(quote.deadline64);

	if (quote.swiftWrapAndLock && quote.swiftVersion !== 'V2') {
		throw new Error('Invalid wrap & lock');
	}

	const tokenIn = quote.swiftWrapAndLock ? ZeroAddress : quote.swiftInputContract;
	const amountIn = BigInt(quote.effectiveAmountIn64);
	let referrerHex: string;
	const referrerChainId = quote.swiftVersion === 'V2' ? sourceChainId : destChainId;
	if (referrerAddress) {
		referrerHex = nativeAddressToHexString(
			referrerAddress,
			referrerChainId
		);
	} else {
		referrerHex = nativeAddressToHexString(
			SystemProgram.programId.toString(),
			1
		);
	}

	const random = '0x' + createSwiftRandomKey(quote).toString('hex');

	if (quote.toChain === 'sui' && !quote.toToken.verifiedAddress) {
		throw new Error('Missing verified address for SUI coin');
	}
	const tokenOut = getSwiftToTokenHexString(quote);

	const minAmountOut = getAmountOfFractionalAmount(
		quote.minAmountOut, Math.min(quote.toToken.decimals, getNormalizeFactor(quote.toChain, quote.type))
	);

	const gasDrop = getAmountOfFractionalAmount(
		quote.gasDrop,
		Math.min(getGasDecimal(quote.toChain), getNormalizeFactor(quote.toChain, quote.type))
	);

	if (!quote.refundRelayerFee64 || !quote.cancelRelayerFee64) {
		throw new Error('Swift order requires refund and cancel fees');
	}

	const destinationAddressHex = nativeAddressToHexString(destinationAddress, destChainId);

	if (!quote.swiftAuctionMode) {
		throw new Error('Swift order requires auction mode');
	}

	const orderParams: SwiftOrderParams = {
		payloadType: customPayload ? SWIFT_PAYLOAD_TYPE_CUSTOM_PAYLOAD : SWIFT_PAYLOAD_TYPE_DEFAULT,
		trader: nativeAddressToHexString(swapperAddress, sourceChainId),
		tokenOut,
		minAmountOut,
		gasDrop,
		cancelFee: BigInt(quote.cancelRelayerFee64),
		refundFee: BigInt(quote.refundRelayerFee64),
		deadline,
		destAddr: destinationAddressHex,
		destChainId,
		referrerAddr: referrerHex,
		referrerBps: quote.referrerBps || 0,
		auctionMode: quote.swiftAuctionMode,
		random,
	};

	return {
		contractAddress,
		tokenIn,
		amountIn,
		order: orderParams,
		customPayload: customPayload ? `0x${Buffer.from(customPayload).toString('hex')}` : '0x',
	};
}

export async function getSwiftFromEvmTxPayload(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null | undefined, customPayload: Buffer | Uint8Array | null | undefined
): Promise<TransactionRequest & { _forwarder: EvmForwarderParams }> {
	if (quote.type !== 'SWIFT') {
		throw new Error('Quote type is not SWIFT');
	}

	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	if (!Number(quote.deadline64)) {
		throw new Error('Swift order requires timeout');
	}

	signerChainId = Number(signerChainId);

	const _permit = permit || ZeroPermit;
	const forwarder = new Contract(addresses.MAYAN_FORWARDER_CONTRACT, MayanForwarderArtifact.abi);

	const {
		tokenIn: swiftTokenIn,
		amountIn,
		order,
		contractAddress: swiftContractAddress,
		customPayload: swiftCustomPayload,
	} = getEvmSwiftParams(
		quote,
		swapperAddress,
		destinationAddress,
		referrerAddress,
		signerChainId,
		customPayload,
	);

	let swiftCallData: string;
	const swiftContract = new Contract(
		swiftContractAddress,
		quote.swiftVersion === 'V2' ? MayanSwiftV2Artifact.abi : MayanSwiftV1Artifact.abi
	);

	if (quote.swiftInputContract === ZeroAddress) {
		if (quote.swiftVersion === 'V2') {
			throw new Error(`Swift V2 doesn't support createOrderWithEth`);
		}
		swiftCallData = swiftContract.interface.encodeFunctionData(
			'createOrderWithEth',
			[order]
		);
	} else {
		swiftCallData = swiftContract.interface.encodeFunctionData(
			'createOrderWithToken',
			quote.swiftVersion === 'V2' ? [swiftTokenIn, amountIn, order, swiftCustomPayload] : [swiftTokenIn, amountIn, order]
		);
	}

	let forwarderMethod: string;
	let forwarderParams: any[];
	let value: string | null;

	if (quote.fromToken.contract === quote.swiftInputContract) {
		if (quote.fromToken.contract === ZeroAddress) {
			if (quote.swiftVersion === 'V2') {
				throw new Error(`Swift V2 doesn't support createOrderWithEth`);
			}
			forwarderMethod = 'forwardEth';
			forwarderParams = [swiftContractAddress, swiftCallData];
			value = toBeHex(amountIn);
		} else {
			forwarderMethod = 'forwardERC20';
			forwarderParams = [swiftTokenIn, amountIn, _permit, swiftContractAddress, swiftCallData];
			value = toBeHex(0);
		}
	} else {
		const { swapRouterCalldata, swapRouterAddress } = await getSwapEvm({
			forwarderAddress: addresses.MAYAN_FORWARDER_CONTRACT,
			slippageBps: quote.slippageBps,
			referrerAddress: referrerAddress,
			fromToken: quote.fromToken.contract,
			middleToken: quote.swiftInputContract,
			chainName: quote.fromChain,
			amountIn64: quote.effectiveAmountIn64,
		});
		if (!quote.minMiddleAmount) {
			throw new Error('Swift swap requires middle amount, router address and calldata');
		}
		const tokenIn = quote.fromToken.contract;

		const minMiddleAmount = getAmountOfFractionalAmount(quote.minMiddleAmount, quote.swiftInputDecimals);

		if (quote.fromToken.contract === ZeroAddress) {
			forwarderMethod = 'swapAndForwardEth';
			forwarderParams = [
				amountIn,
				swapRouterAddress,
				swapRouterCalldata,
				quote.swiftInputContract,
				minMiddleAmount,
				swiftContractAddress,
				swiftCallData
			];
			value = toBeHex(amountIn);
		} else {
			forwarderMethod = 'swapAndForwardERC20';
			forwarderParams = [
				tokenIn,
				amountIn,
				_permit,
				swapRouterAddress,
				swapRouterCalldata,
				quote.swiftInputContract,
				minMiddleAmount,
				swiftContractAddress,
				swiftCallData
			];
			value = toBeHex(0);
		}
	}
	const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);

	return {
		data,
		to: addresses.MAYAN_FORWARDER_CONTRACT,
		value,
		chainId: signerChainId,
		_forwarder: {
			method: forwarderMethod,
			params: forwarderParams
		}
	};
}


export function getSwiftOrderTypeData(
	quote: Quote, orderHash: string, signerChainId: number | string
): SwiftEvmOrderTypedData {
	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	if (!quote.submitRelayerFee64) {
		throw new Error('Swift gasless order requires submit relayer fee');
	}
	if (!quote.swiftMayanContract) {
		throw new Error('Swift contract address is missing in quote');
	}
	const totalAmountIn = BigInt(quote.effectiveAmountIn64);
	const submitFee = BigInt(quote.submitRelayerFee64);
	return {
		domain: {
			name: 'Mayan Swift',
			chainId: Number(signerChainId),
			verifyingContract: quote.swiftMayanContract,
		},
		types: {
			CreateOrder: [
				{ name: 'OrderId', type: 'bytes32' },
				{ name: 'InputAmount', type: 'uint256' },
				{ name: 'SubmissionFee', type: 'uint256' },
			],
		},
		value: {
			OrderId: orderHash,
			InputAmount:  totalAmountIn - submitFee,
			SubmissionFee: submitFee,
		}
	}
}

export type SwiftEvmGasLessParams = {
	swiftVersion: string;
	permitParams: Erc20Permit | null | undefined;
	orderHash: string;
	orderParams: {
		trader: string;
		sourceChainId: number;
		tokenIn: string;
		amountIn: bigint;
		destAddr: string;
		destChainId: number;
		tokenOut: string;
		minAmountOut: bigint;
		gasDrop: bigint;
		cancelFee: bigint;
		refundFee: bigint;
		deadline: bigint;
		referrerAddr: string;
		referrerBps: number;
		auctionMode: number;
		random: string;
		submissionFee: bigint;
	};
	customPayload: string;
	orderTypedData: SwiftEvmOrderTypedData;
}

export function getSwiftFromEvmGasLessParams(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null | undefined, customPayload: Buffer | Uint8Array | null | undefined
): SwiftEvmGasLessParams {
	if (quote.type !== 'SWIFT') {
		throw new Error('Quote type is not SWIFT');
	}

	if (!quote.gasless) {
		throw new Error('Quote does not support gasless');
	}

	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	if (!Number(quote.deadline64)) {
		throw new Error('Swift order requires timeout');
	}

	if (quote.fromToken.contract !== quote.swiftInputContract) {
		throw new Error('Swift gasless order creation does not support source swap');
	}

	if (!quote.submitRelayerFee64) {
		throw new Error('Swift gasless order requires submit relayer fee');
	}

	const {
		tokenIn,
		amountIn,
		order,
		customPayload: swiftCustomPayload,
	} = getEvmSwiftParams(
		quote, swapperAddress, destinationAddress,
		referrerAddress, Number(signerChainId), customPayload,
	);
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);

	const orderHashBuf = createSwiftOrderHash(
		quote, swapperAddress, destinationAddress, referrerAddress, order.random, customPayload
	);
	const orderHash = `0x${orderHashBuf.toString('hex')}`
	const orderTypedData = getSwiftOrderTypeData(quote, orderHash, signerChainId);

	return {
		swiftVersion: quote.swiftVersion,
		permitParams: permit,
		orderParams: {
			...order,
			sourceChainId,
			amountIn,
			tokenIn,
			submissionFee: BigInt(quote.submitRelayerFee64),
		},
		orderHash,
		customPayload: swiftCustomPayload,
		orderTypedData
	};
}
