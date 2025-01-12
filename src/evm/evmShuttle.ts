import {
	Contract,
	toBeHex,
	ZeroAddress,
	TransactionRequest
} from 'ethers';
import { Erc20Permit, EvmForwarderParams, Quote } from '../types';
import {
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById, getGasDecimal, ZeroPermit
} from '../utils';
import addresses from '../addresses';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import { Buffer } from 'buffer';
import ShuttleArtifact from './ShuttleArtifact';


const shuttleConstants = {
	FAST_MODE_FLAG: 1,
	RELAY_REDEEM_MODE: 2,
	EXACT_IN_FLAG: 1,
	USDC_INPUT_TOKEN_TYPE: 0,
	PRE_APPROVED_ACQUIRE_MODE: 0,
	OUTPUT_USDC_MODE: 0,
	OUTPUT_NATIVE_MODE: 1,
	OUTPUT_OTHER_MODE: 2,
}

function writeBigIntTo16BytesBuffer(value: bigint): Buffer {
	// Validate the range of the BigInt
	const maxUint128 = (1n << 128n) - 1n; // 2^128 - 1
	if (value < 0n || value > maxUint128) {
		throw new RangeError("Value must fit in an unsigned 128-bit integer (0 <= value < 2^128)");
	}

	const buffer = Buffer.alloc(16);

	for (let i = 15; i >= 0; i--) {
		buffer[i] = Number(value & 0xFFn);
		value >>= 8n;
	}

	return buffer;
}

export function getShuttleParams(
	quote: Quote, destinationAddress: string, signerChainId: string | number
): {
	destAddr: string;
	destChainId: number;
	serializedParams: string;
	contractAddress: string;
	amountIn: bigint;
	bridgeFee: bigint;
} {
	const { shuttleParams } = quote;
	if (!shuttleParams) {
		throw new Error('Swap layer params are missing in quote response');
	}
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const destChainId = getWormholeChainIdByName(quote.toChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}

	let bytes = [];

	bytes.push(shuttleConstants.FAST_MODE_FLAG); // [0]

	const maxLLFeeBuffer8Bytes = Buffer.alloc(8);
	maxLLFeeBuffer8Bytes.writeBigUInt64BE(BigInt(shuttleParams.maxLLFee));
	const maxLLFeeBytes = maxLLFeeBuffer8Bytes.subarray(2);
	bytes.push(...maxLLFeeBytes); // [1..6]

	const deadLineBuffer = Buffer.alloc(4);
	deadLineBuffer.writeUInt32BE(shuttleParams.fastTransferDeadline);
	bytes.push(...deadLineBuffer); // [7..10]

	bytes.push(shuttleConstants.RELAY_REDEEM_MODE); // [11]

	const gasDrop = getAmountOfFractionalAmount(
		quote.gasDrop,
		Math.min(6, getGasDecimal(quote.toChain))
	);
	const gasDropBuffer8Bytes = Buffer.alloc(8);
	gasDropBuffer8Bytes.writeBigUInt64BE(gasDrop);
	const gasDropBytes = gasDropBuffer8Bytes.subarray(4);
	bytes.push(...gasDropBytes); // [12..15]

	const maxRelayerFeeBuffer8Bytes = Buffer.alloc(8);
	maxRelayerFeeBuffer8Bytes.writeBigUInt64BE(BigInt(shuttleParams.maxRelayingFee));
	const maxRelayerFeeBytes = maxRelayerFeeBuffer8Bytes.subarray(2);
	bytes.push(...maxRelayerFeeBytes); // [16..21]

	bytes.push(shuttleConstants.EXACT_IN_FLAG); // [22]
	bytes.push(shuttleConstants.USDC_INPUT_TOKEN_TYPE); // [23]

	// <input amount> we are sure because of the input token is USDC the amount in will be fit in 8 bytes
	bytes.push(0, 0, 0, 0, 0, 0, 0, 0); // offset of amount_in (8 bytes)
	const amountIn = getAmountOfFractionalAmount(quote.effectiveAmountIn, quote.fromToken.decimals);
	const amountInBuffer = Buffer.alloc(8);
	amountInBuffer.writeBigUInt64BE(amountIn);
	bytes.push(...amountInBuffer);
	// <input amount />

	bytes.push(shuttleConstants.PRE_APPROVED_ACQUIRE_MODE);

	if (shuttleParams.hasDestSwap) {
		if (quote.toToken.contract === ZeroAddress) {
			bytes.push(shuttleConstants.OUTPUT_NATIVE_MODE);
		} else {
			bytes.push(shuttleConstants.OUTPUT_OTHER_MODE);
			const tokenOut = Buffer.from(nativeAddressToHexString(quote.toToken.contract, destChainId).slice(2), 'hex');
			bytes.push(...tokenOut);
		}
		const swapDeadlineBuffer = Buffer.alloc(4);
		swapDeadlineBuffer.writeUInt32BE(Number(BigInt(quote.deadline64)));
		bytes.push(...swapDeadlineBuffer);

		const minAmountOut = getAmountOfFractionalAmount(quote.minAmountOut, quote.toToken.decimals);
		if (quote.toChain === 'solana') { // limit_amount should be 8 bytes (u64)
			bytes.push(0, 0, 0, 0, 0, 0, 0, 0);
			const minAmountOutBuffer = Buffer.alloc(8);
			minAmountOutBuffer.writeBigUInt64BE(minAmountOut);
			bytes.push(...minAmountOutBuffer);
		} else {
			const minAmountOutBuffer = writeBigIntTo16BytesBuffer(minAmountOut);
			bytes.push(...minAmountOutBuffer);
		}
		const swapPath = Buffer.from(shuttleParams.path.slice(2), 'hex');
		bytes.push(...swapPath);

	} else {
		bytes.push(shuttleConstants.OUTPUT_USDC_MODE);
	}

	const destinationAddressHex = nativeAddressToHexString(destinationAddress, destChainId);

	return {
		destAddr: destinationAddressHex,
		destChainId,
		serializedParams: `0x${Buffer.from(bytes).toString('hex')}`,
		contractAddress: quote.shuttleContract,
		amountIn,
		bridgeFee: getAmountOfFractionalAmount(quote.bridgeFee, getGasDecimal(quote.fromChain)),
	}
}

export function getShuttleFromEvmTxPayload(
	quote: Quote, destinationAddress: string,
	signerChainId: number | string, permit: Erc20Permit | null
): TransactionRequest & { _forwarder: EvmForwarderParams } {
	if (quote.type !== 'SHUTTLE') {
		throw new Error('Quote type is not SHUTTLE');
	}

	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	signerChainId = Number(signerChainId);

	const _permit = permit || ZeroPermit;
	const forwarder = new Contract(addresses.MAYAN_FORWARDER_CONTRACT, MayanForwarderArtifact.abi);

	const {
		destAddr,
		destChainId,
		serializedParams,
		contractAddress: shuttleContractAddress,
		amountIn,
		bridgeFee,
	} = getShuttleParams(quote, destinationAddress, signerChainId);

	let shuttleCallData: string;
	const shuttleContract = new Contract(shuttleContractAddress, ShuttleArtifact.abi);

	shuttleCallData = shuttleContract.interface.encodeFunctionData(
		'initiate',
		[destAddr, amountIn, destChainId, serializedParams]
	);

	let forwarderMethod: string;
	let forwarderParams: any[];
	let value: string | null;

	if (quote.fromToken.contract === quote.shuttleInputContract) {
		forwarderMethod = 'forwardERC20';
		forwarderParams = [quote.shuttleInputContract, amountIn, _permit, shuttleContractAddress, shuttleCallData];
		value = toBeHex(bridgeFee);
	} else {
		const { evmSwapRouterAddress, evmSwapRouterCalldata } = quote;
		if (!quote.minMiddleAmount || !evmSwapRouterAddress || !evmSwapRouterCalldata) {
			throw new Error('Shuttle source chain swap requires middle amount, router address and calldata');
		}
		const tokenIn = quote.fromToken.contract;

		const minMiddleAmount = getAmountOfFractionalAmount(quote.minMiddleAmount, quote.shuttleInputDecimals);

		if (quote.fromToken.contract === ZeroAddress) {
			forwarderMethod = 'swapAndForwardEth';
			forwarderParams = [
				amountIn,
				evmSwapRouterAddress,
				evmSwapRouterCalldata,
				quote.shuttleInputContract,
				minMiddleAmount,
				shuttleContractAddress,
				shuttleCallData,
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
				quote.shuttleInputContract,
				minMiddleAmount,
				shuttleContractAddress,
				shuttleCallData,
			];
			value = toBeHex(bridgeFee);
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
