import {
	Contract,
	toBeHex,
	ZeroAddress,
	TransactionRequest,
} from 'ethers';
import { SystemProgram } from '@solana/web3.js';
import type { EvmForwarderParams, Quote } from '../types';
import {
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById, getGasDecimal, ZeroPermit, MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD, MCTP_PAYLOAD_TYPE_DEFAULT
} from '../utils';

import MayanCircleArtifact from './MayanCircleArtifact';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import addresses from '../addresses';
import { Buffer } from 'buffer';
import { getCCTPDomain, CCTP_TOKEN_DECIMALS } from '../cctp';
import { Erc20Permit } from '../types';

type EvmMctpBridgeParams = {
	lockFee: boolean,
	tokenIn: string,
	amountIn: bigint,
	redeemFee: bigint,
	gasDrop: bigint,
	destAddr: string,
	customPayload: string,
	payloadType: number,
	destDomain: number,
	bridgeFee: bigint,
	contractAddress: string,
}
function getEvmMctpBridgeParams(
	quote: Quote, destinationAddress: string, signerChainId: number | string, customPayload?: Uint8Array | Buffer | null
): EvmMctpBridgeParams {
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const destChainId = getWormholeChainIdByName(quote.toChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}
	const lockFee: boolean = quote.cheaperChain === quote.fromChain;
	if (lockFee && !!customPayload) {
		throw new Error('Bridge lock fee cannot have custom payload');
	}
	const destinationAddressHex = nativeAddressToHexString(destinationAddress, destChainId);
	const redeemFee = getAmountOfFractionalAmount(quote.redeemRelayerFee, CCTP_TOKEN_DECIMALS);
	const gasDrop = getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8));
	const amountIn = BigInt(quote.effectiveAmountIn64);
	const destDomain = getCCTPDomain(quote.toChain);

	if (!quote.mctpMayanContract) {
		throw new Error('MCTP contract address is missing');
	}
	const contractAddress = quote.mctpMayanContract;

	if (quote.toChain === 'solana' && lockFee) {
		throw new Error('Cannot lock fee for transfer to solana');
	}

	let bridgeFee = getAmountOfFractionalAmount(
		quote.bridgeFee, getGasDecimal(quote.fromChain)
	);
	if (lockFee) {
		bridgeFee = BigInt(0);
	}



	return {
		lockFee,
		tokenIn: quote.mctpInputContract,
		amountIn,
		redeemFee,
		gasDrop,
		destAddr: destinationAddressHex,
		destDomain,
		payloadType: customPayload ? MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD : MCTP_PAYLOAD_TYPE_DEFAULT,
		customPayload: customPayload ? `0x${Buffer.from(customPayload).toString('hex')}` : '0x',
		bridgeFee,
		contractAddress,
	};
}

function getEvmMctpBridgeTxPayload(
	quote: Quote, destinationAddress: string, signerChainId: number | string,
	payload: Uint8Array | Buffer | null | undefined
): TransactionRequest & { _params: EvmMctpBridgeParams } {
	const params = getEvmMctpBridgeParams(
		quote, destinationAddress, signerChainId, payload
	);
	const {
		contractAddress, tokenIn, amountIn, destAddr,
		lockFee, redeemFee, gasDrop,
		destDomain, customPayload, payloadType, bridgeFee
	} = params;

	const mctpContract = new Contract(contractAddress, MayanCircleArtifact.abi);
	let data: string;
	let value: string | null;
	if (lockFee) {
		data = mctpContract.interface.encodeFunctionData(
			'bridgeWithLockedFee',
			[tokenIn, amountIn, gasDrop, redeemFee, destDomain, destAddr]
		);
	} else {
		data = mctpContract.interface.encodeFunctionData(
			'bridgeWithFee',
			[tokenIn, amountIn, redeemFee, gasDrop, destAddr, destDomain, payloadType, customPayload]
		);
	}
	value = toBeHex(bridgeFee);

	return {
		to: contractAddress,
		data,
		value,
		_params: params
	};
}


type EvmMctpCreateOrderParams = {
	params: {
		tokenIn: string,
		amountIn: bigint,
		gasDrop: bigint,
		destAddr: string,
		destChain: number,
		tokenOut: string,
		minAmountOut: bigint,
		deadline: bigint,
		redeemFee: bigint,
		referrerAddr: string,
		referrerBps: number,
	},
	bridgeFee: bigint,
	contractAddress: string,
}

function getEvmMctpCreateOrderParams(
	quote: Quote, destinationAddress: string,
	referrerAddress: string | null | undefined, signerChainId: string | number
): EvmMctpCreateOrderParams {
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const destChainId = getWormholeChainIdByName(quote.toChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}
	if (!quote.mctpMayanContract) {
		throw new Error('MCTP contract address is missing');
	}
	const contractAddress = quote.mctpMayanContract;

	const destinationAddressHex = nativeAddressToHexString(destinationAddress, destChainId);
	let referrerHex: string;
	if (referrerAddress) {
		referrerHex = nativeAddressToHexString(
			referrerAddress, destChainId
		);
	} else {
		referrerHex = nativeAddressToHexString(
			SystemProgram.programId.toString(), getWormholeChainIdByName('solana')
		);
	}

	const redeemFee = getAmountOfFractionalAmount(quote.redeemRelayerFee, CCTP_TOKEN_DECIMALS);
	const gasDrop = getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8));

	let amountIn = BigInt(quote.effectiveAmountIn64);
	const minAmountOut = getAmountOfFractionalAmount(
		quote.minAmountOut, Math.min(8, quote.toToken.decimals)
	);

	const deadline = BigInt(quote.deadline64);

	const tokenOut =
		quote.toToken.contract === ZeroAddress ?
			nativeAddressToHexString(SystemProgram.programId.toString(), getWormholeChainIdByName('solana')) :
			nativeAddressToHexString(
				quote.toChain === 'sui' ? quote.toToken.verifiedAddress : quote.toToken.contract,
				quote.toToken.wChainId,
			);

	return {
		params: {
			tokenIn: quote.mctpInputContract,
			amountIn,
			gasDrop,
			destAddr: destinationAddressHex,
			destChain: destChainId,
			tokenOut,
			minAmountOut,
			deadline,
			redeemFee,
			referrerAddr: referrerHex,
			referrerBps: quote.referrerBps || 0
		},
		bridgeFee: getAmountOfFractionalAmount(quote.bridgeFee, getGasDecimal(quote.fromChain)),
		contractAddress,
	};
}

function getEvmMctpCreateOrderTxPayload(
	quote: Quote, destinationAddress: string,
	referrerAddress: string | null | undefined, signerChainId: string | number
): TransactionRequest & { _params: EvmMctpCreateOrderParams } {
	const orderParams = getEvmMctpCreateOrderParams(
		quote, destinationAddress, referrerAddress, signerChainId
	);
	const {
		contractAddress, params, bridgeFee
	} = orderParams;
	const mctpContract = new Contract(contractAddress, MayanCircleArtifact.abi);
	const data = mctpContract.interface.encodeFunctionData(
		'createOrder',
		[params]
	);
	const value = toBeHex(bridgeFee);

	return {
		to: contractAddress,
		data,
		value,
		_params: orderParams,
	};
}

export function getMctpFromEvmTxPayload(
	quote: Quote, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null, payload: Uint8Array | Buffer | null | undefined,
): TransactionRequest & { _forwarder: EvmForwarderParams } {

	if (quote.type !== 'MCTP') {
		throw new Error('Quote type is not MCTP');
	}

	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	signerChainId = Number(signerChainId);

	const _permit = permit || ZeroPermit;
	const forwarder = new Contract(addresses.MAYAN_FORWARDER_CONTRACT, MayanForwarderArtifact.abi);

	const bridgeFee = getAmountOfFractionalAmount(
		quote.bridgeFee, getGasDecimal(quote.fromChain)
	);

	let value = toBeHex(bridgeFee);

	if (quote.fromToken.contract === quote.mctpInputContract) {
		if (quote.hasAuction) {
			if (!Number(quote.deadline64)) {
				throw new Error('MCTP order requires timeout');
			}
			const mctpPayloadIx = getEvmMctpCreateOrderTxPayload(
				quote, destinationAddress, referrerAddress, signerChainId
			);

			const forwarderMethod = 'forwardERC20';
			const forwarderParams = [
				quote.fromToken.contract,
				mctpPayloadIx._params.params.amountIn,
				_permit,
				mctpPayloadIx._params.contractAddress,
				mctpPayloadIx.data,
			];
			const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
			return {
				data,
				to: addresses.MAYAN_FORWARDER_CONTRACT,
				value: toBeHex(value),
				chainId: signerChainId,
				_forwarder: {
					method: forwarderMethod,
					params: forwarderParams,
				}
			}
		} else {
			const mctpPayloadIx = getEvmMctpBridgeTxPayload(
				quote, destinationAddress, signerChainId, payload
			);
			const forwarderMethod = 'forwardERC20';
			const forwarderParams = [
				quote.fromToken.contract,
				mctpPayloadIx._params.amountIn,
				_permit,
				mctpPayloadIx._params.contractAddress,
				mctpPayloadIx.data,
			];
			const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
			return {
				data,
				to: addresses.MAYAN_FORWARDER_CONTRACT,
				value: toBeHex(value),
				chainId: signerChainId,
				_forwarder: {
					method: forwarderMethod,
					params: forwarderParams,
				}
			}
		}
	} else {
		const { minMiddleAmount, evmSwapRouterAddress, evmSwapRouterCalldata } = quote;
		if (!minMiddleAmount || !evmSwapRouterAddress || !evmSwapRouterCalldata) {
			throw new Error('MCTP swap requires middle amount, router address and calldata');
		}
		if (quote.hasAuction) {
			if (!Number(quote.deadline64)) {
				throw new Error('MCTP order requires timeout');
			}
			const mctpPayloadIx = getEvmMctpCreateOrderTxPayload(
				quote, destinationAddress, referrerAddress, signerChainId
			);
			const minMiddleAmount = getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS);

			if (quote.fromToken.contract === ZeroAddress) {

				let amountIn = mctpPayloadIx._params.params.amountIn;
				if (amountIn <= bridgeFee) {
					throw new Error('Amount in is less than bridge fee');
				}
				if (bridgeFee !== BigInt(0)) {
					amountIn -= bridgeFee;
				}

				value = toBeHex(mctpPayloadIx._params.params.amountIn);

				const forwarderMethod = 'swapAndForwardEth';
				const forwarderParams = [
					amountIn,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.mctpInputContract,
					minMiddleAmount,
					mctpPayloadIx._params.contractAddress,
					mctpPayloadIx.data,
				];
				const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(value),
					chainId: signerChainId,
					_forwarder: {
						method: forwarderMethod,
						params: forwarderParams,
					}
				}
			} else {
				const forwarderMethod = 'swapAndForwardERC20';
				const forwarderParams = [
					quote.fromToken.contract,
					mctpPayloadIx._params.params.amountIn,
					_permit,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.mctpInputContract,
					minMiddleAmount,
					mctpPayloadIx._params.contractAddress,
					mctpPayloadIx.data,
				];
				const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(value),
					chainId: signerChainId,
					_forwarder: {
						method: forwarderMethod,
						params: forwarderParams,
					}
				}
			}
		} else {
			const mctpPayloadIx = getEvmMctpBridgeTxPayload(
				quote, destinationAddress, signerChainId, payload
			);
			const minMiddleAmount = getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS);

			if (quote.fromToken.contract === ZeroAddress) {
				let amountIn = mctpPayloadIx._params.amountIn;
				if (amountIn <= bridgeFee) {
					throw new Error('Amount in is less than bridge fee');
				}
				if (bridgeFee !== BigInt(0)) {
					amountIn -= bridgeFee;
				}

				value = toBeHex(mctpPayloadIx._params.amountIn);

				const forwarderMethod = 'swapAndForwardEth';
				const forwarderParams = [
					amountIn,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.mctpInputContract,
					minMiddleAmount,
					mctpPayloadIx._params.contractAddress,
					mctpPayloadIx.data,
				];
				const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(value),
					chainId: signerChainId,
					_forwarder: {
						method: forwarderMethod,
						params: forwarderParams,
					}
				}
			} else {
				const forwarderMethod = 'swapAndForwardERC20';
				const forwarderParams = [
					quote.fromToken.contract,
					mctpPayloadIx._params.amountIn,
					_permit,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.mctpInputContract,
					minMiddleAmount,
					mctpPayloadIx._params.contractAddress,
					mctpPayloadIx.data,
				]
				const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(value),
					chainId: signerChainId,
					_forwarder: {
						method: forwarderMethod,
						params: forwarderParams,
					}
				}
			}
		}
	}
}
