import {
	Contract,
	toBeHex,
	ZeroAddress,
	TransactionRequest
} from 'ethers';
import { Keypair, SystemProgram } from '@solana/web3.js';
import { Erc20Permit, EvmForwarderParams, Quote, SwiftEvmOrderTypedData } from '../types';
import {
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById, getGasDecimal, ZeroPermit
} from '../utils';
import MayanSwiftArtifact from './MayanSwiftArtifact';
import addresses from '../addresses';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import { createSwiftOrderHash } from '../solana';


export type SwiftOrderParams = {
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
};

export function getEvmSwiftParams(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined, signerChainId: string | number
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
	const contractAddress = quote.swiftMayanContract;

	if (!Number(quote.deadline64)) {
		throw new Error('Swift order requires timeout');
	}

	const deadline = BigInt(quote.deadline64);

	const tokenIn = quote.swiftInputContract;
	const amountIn = BigInt(quote.effectiveAmountIn64);
	let referrerHex: string;
	if (referrerAddress) {
		referrerHex = nativeAddressToHexString(
			referrerAddress,
			destChainId
		);
	} else {
		referrerHex = nativeAddressToHexString(
			SystemProgram.programId.toString(),
			1
		);
	}

	const random = nativeAddressToHexString(Keypair.generate().publicKey.toString(), 1);

	const tokenOut = quote.toToken.contract === ZeroAddress ?
		nativeAddressToHexString(SystemProgram.programId.toString(), 1) :
		nativeAddressToHexString(quote.toToken.contract, destChainId);

	const minAmountOut = getAmountOfFractionalAmount(
		quote.minAmountOut, Math.min(8, quote.toToken.decimals)
	);

	const gasDrop = getAmountOfFractionalAmount(
		quote.gasDrop,
		Math.min(8, getGasDecimal(quote.toChain))
	);

	const destinationAddressHex = nativeAddressToHexString(destinationAddress, destChainId);
	const orderParams: SwiftOrderParams = {
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
		order: orderParams
	};
}

export function getSwiftFromEvmTxPayload(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null
): TransactionRequest & { _forwarder: EvmForwarderParams } {
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
		contractAddress: swiftContractAddress
	} = getEvmSwiftParams(quote, swapperAddress, destinationAddress, referrerAddress, signerChainId);

	let swiftCallData: string;
	const swiftContract = new Contract(swiftContractAddress, MayanSwiftArtifact.abi);

	if (quote.swiftInputContract === ZeroAddress) {
		swiftCallData = swiftContract.interface.encodeFunctionData(
			'createOrderWithEth',
			[order]
		);
	} else {
		swiftCallData = swiftContract.interface.encodeFunctionData(
			'createOrderWithToken',
			[swiftTokenIn, amountIn, order]
		);
	}

	let forwarderMethod: string;
	let forwarderParams: any[];
	let value: string | null;

	if (quote.fromToken.contract === quote.swiftInputContract) {
		if (quote.fromToken.contract === ZeroAddress) {
			forwarderMethod = 'forwardEth';
			forwarderParams = [swiftContractAddress, swiftCallData];
			value = toBeHex(amountIn);
		} else {
			forwarderMethod = 'forwardERC20';
			forwarderParams = [swiftTokenIn, amountIn, _permit, swiftContractAddress, swiftCallData];
			value = toBeHex(0);
		}
	} else {
		const { evmSwapRouterAddress, evmSwapRouterCalldata } = quote;
		if (!quote.minMiddleAmount || !evmSwapRouterAddress || !evmSwapRouterCalldata) {
			throw new Error('Swift swap requires middle amount, router address and calldata');
		}
		const tokenIn = quote.fromToken.contract;

		const minMiddleAmount = getAmountOfFractionalAmount(quote.minMiddleAmount, quote.swiftInputDecimals);

		if (quote.fromToken.contract === ZeroAddress) {
			forwarderMethod = 'swapAndForwardEth';
			forwarderParams = [
				amountIn,
				evmSwapRouterAddress,
				evmSwapRouterCalldata,
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
				evmSwapRouterAddress,
				evmSwapRouterCalldata,
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
	permitParams: Erc20Permit;
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
	orderTypedData: SwiftEvmOrderTypedData;
}

export function getSwiftFromEvmGasLessParams(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null
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

	const {
		tokenIn,
		amountIn,
		order,
	} = getEvmSwiftParams(
		quote, swapperAddress, destinationAddress,
		referrerAddress, Number(signerChainId)
	);
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);

	const orderHashBuf = createSwiftOrderHash(quote, swapperAddress, destinationAddress, referrerAddress, order.random);
	const orderHash = `0x${orderHashBuf.toString('hex')}`
	const orderTypedData = getSwiftOrderTypeData(quote, orderHash, signerChainId);

	return {
		permitParams: permit,
		orderParams: {
			...order,
			sourceChainId,
			amountIn,
			tokenIn,
			submissionFee: BigInt(quote.submitRelayerFee64),
		},
		orderHash,
		orderTypedData
	};
}
