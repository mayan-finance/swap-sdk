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
	getAmountOfFractionalAmount,
	getWormholeChainIdByName,
	getWormholeChainIdById,
	getGasDecimal,
	ZeroPermit,
	FAST_MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD, FAST_MCTP_PAYLOAD_TYPE_DEFAULT, FAST_MCTP_PAYLOAD_TYPE_ORDER
} from '../utils';

import MayanFastMctpArtifact from './MayanFastMctpArtifact';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import addresses from '../addresses';
import { Buffer } from 'buffer';
import { getCCTPDomain, CCTP_TOKEN_DECIMALS } from '../cctp';
import { Erc20Permit } from '../types';

type EvmFastMctpBridgeParams = {
	tokenIn: string,
	amountIn: bigint,
	redeemFee: bigint,
	gasDrop: bigint,
	destAddr: string,
	referrerAddr: string,
	referrerBps: number,
	customPayload: string,
	payloadType: number,
	destDomain: number,
	contractAddress: string,
	circleMaxFee: bigint,
	minFinalityThreshold: number,
}
function getEvmFastMctpBridgeParams(
	quote: Quote, destinationAddress: string,
	referrerAddress: string | null | undefined, signerChainId: number | string,
	customPayload?: Uint8Array | Buffer | null
): EvmFastMctpBridgeParams {
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const destChainId = getWormholeChainIdByName(quote.toChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}
	const destinationAddressHex = nativeAddressToHexString(destinationAddress, destChainId);
	const redeemFee = getAmountOfFractionalAmount(quote.redeemRelayerFee, CCTP_TOKEN_DECIMALS);
	const gasDrop = getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8));
	const circleMaxFee = BigInt(quote.circleMaxFee64);
	const amountIn = BigInt(quote.effectiveAmountIn64);
	const destDomain = getCCTPDomain(quote.toChain);
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

	if (!quote.fastMctpMayanContract) {
		throw new Error('FastMctp contract address is missing');
	}
	const contractAddress = quote.fastMctpMayanContract;

	return {
		tokenIn: quote.fastMctpInputContract,
		amountIn,
		redeemFee,
		gasDrop,
		destAddr: destinationAddressHex,
		destDomain,
		referrerAddr: referrerHex,
		referrerBps: quote.referrerBps,
		payloadType: customPayload ? FAST_MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD : FAST_MCTP_PAYLOAD_TYPE_DEFAULT,
		customPayload: customPayload ? `0x${Buffer.from(customPayload).toString('hex')}` : '0x',
		minFinalityThreshold: Number(quote.fastMctpMinFinality),
		circleMaxFee,
		contractAddress,
	};
}

function getEvmFastMctpBridgeTxPayload(
	quote: Quote, destinationAddress: string,
	referrerAddress: string | null | undefined, signerChainId: number | string,
	payload: Uint8Array | Buffer | null | undefined
): TransactionRequest & { _params: EvmFastMctpBridgeParams } {
	const params = getEvmFastMctpBridgeParams(
		quote, destinationAddress, referrerAddress, signerChainId, payload
	);
	const {
		contractAddress, tokenIn, amountIn, destAddr,
		redeemFee, gasDrop, circleMaxFee, referrerAddr, referrerBps,
		destDomain, customPayload, minFinalityThreshold, payloadType,
	} = params;

	const fastMctpContract = new Contract(contractAddress, MayanFastMctpArtifact.abi);
	let data: string;
	let value: string | null;
	data = fastMctpContract.interface.encodeFunctionData(
		'bridge',
		[
			tokenIn, amountIn, redeemFee, circleMaxFee, gasDrop, destAddr,
			destDomain, referrerAddr, referrerBps, payloadType, minFinalityThreshold, customPayload
		]
	);
	value = toBeHex(0);

	return {
		to: contractAddress,
		data,
		value,
		_params: params
	};
}


type EvmFastMctpCreateOrderParams = {
	tokenIn: string,
	amountIn: bigint,
	circleMaxFee: bigint,
	destDomain: number,
	minFinalityThreshold: number,
	orderPayload: {
		payloadType: number,
		destAddr: string,
		tokenOut: string,
		amountOutMin: bigint,
		gasDrop: bigint,
		redeemFee: bigint,
		refundFee: bigint,
		deadline: bigint,
		referrerAddr: string,
		referrerBps: number,
	},
	contractAddress: string,
}

function getEvmFastMctpCreateOrderParams(
	quote: Quote, destinationAddress: string,
	referrerAddress: string | null | undefined, signerChainId: string | number
): EvmFastMctpCreateOrderParams {
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const destChainId = getWormholeChainIdByName(quote.toChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}
	if (!quote.fastMctpMayanContract) {
		throw new Error('MCTP contract address is missing');
	}
	const contractAddress = quote.fastMctpMayanContract;

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
	const refundFee = BigInt(quote.refundRelayerFee64);
	const circleMaxFee = BigInt(quote.circleMaxFee64);
	const gasDrop = getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8));
	const destDomain = getCCTPDomain(quote.toChain);

	const amountIn = BigInt(quote.effectiveAmountIn64);
	const amountOutMin = getAmountOfFractionalAmount(
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
		tokenIn: quote.fastMctpInputContract,
		amountIn,
		circleMaxFee,
		destDomain,
		minFinalityThreshold: Number(quote.fastMctpMinFinality),
		orderPayload: {
			payloadType: FAST_MCTP_PAYLOAD_TYPE_ORDER,
			destAddr: destinationAddressHex,
			tokenOut,
			amountOutMin,
			gasDrop,
			redeemFee,
			refundFee,
			deadline,
			referrerAddr: referrerHex,
			referrerBps: quote.referrerBps || 0,
		},
		contractAddress,
	};
}

function getEvmFastMctpCreateOrderTxPayload(
	quote: Quote, destinationAddress: string,
	referrerAddress: string | null | undefined, signerChainId: string | number
): TransactionRequest & { _params: EvmFastMctpCreateOrderParams } {
	const orderParams = getEvmFastMctpCreateOrderParams(
		quote, destinationAddress, referrerAddress, signerChainId
	);
	const {
		contractAddress, orderPayload, tokenIn, amountIn, circleMaxFee, destDomain, minFinalityThreshold
	} = orderParams;
	const fastMctpContract = new Contract(contractAddress, MayanFastMctpArtifact.abi);
	const data = fastMctpContract.interface.encodeFunctionData(
		'createOrder',
		[tokenIn, amountIn, circleMaxFee, destDomain, minFinalityThreshold, orderPayload]
	);
	const value = toBeHex(0);

	return {
		to: contractAddress,
		data,
		value,
		_params: orderParams,
	};
}

export function getFastMctpFromEvmTxPayload(
	quote: Quote, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null, payload: Uint8Array | Buffer | null | undefined,
): TransactionRequest & { _forwarder: EvmForwarderParams } {

	if (quote.type !== 'FAST_MCTP') {
		throw new Error('Quote type is not FAST_MCTP');
	}

	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	signerChainId = Number(signerChainId);

	const _permit = permit || ZeroPermit;
	const forwarder = new Contract(addresses.MAYAN_FORWARDER_CONTRACT, MayanForwarderArtifact.abi);

	if (quote.fromToken.contract === quote.fastMctpInputContract) {
		if (quote.hasAuction) {
			if (!Number(quote.deadline64)) {
				throw new Error('Fast Mctp order requires timeout');
			}
			const fastMctpPayloadIx = getEvmFastMctpCreateOrderTxPayload(
				quote, destinationAddress, referrerAddress, signerChainId
			);

			const forwarderMethod = 'forwardERC20';
			const forwarderParams = [
				quote.fromToken.contract,
				fastMctpPayloadIx._params.amountIn,
				_permit,
				fastMctpPayloadIx._params.contractAddress,
				fastMctpPayloadIx.data,
			];
			const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
			return {
				data,
				to: addresses.MAYAN_FORWARDER_CONTRACT,
				value: toBeHex(0),
				chainId: signerChainId,
				_forwarder: {
					method: forwarderMethod,
					params: forwarderParams,
				}
			}
		} else {
			const fastMctpPayloadIx = getEvmFastMctpBridgeTxPayload(
				quote, destinationAddress, referrerAddress, signerChainId, payload
			);
			const forwarderMethod = 'forwardERC20';
			const forwarderParams = [
				quote.fromToken.contract,
				fastMctpPayloadIx._params.amountIn,
				_permit,
				fastMctpPayloadIx._params.contractAddress,
				fastMctpPayloadIx.data,
			];
			const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
			return {
				data,
				to: addresses.MAYAN_FORWARDER_CONTRACT,
				value: toBeHex(0),
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
			throw new Error('Fast Mctp swap requires middle amount, router address and calldata');
		}
		if (quote.hasAuction) {
			if (!Number(quote.deadline64)) {
				throw new Error('Fast Mctp order requires timeout');
			}
			const fastMctpPayloadIx = getEvmFastMctpCreateOrderTxPayload(
				quote, destinationAddress, referrerAddress, signerChainId
			);
			const minMiddleAmount = getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS);

			if (quote.fromToken.contract === ZeroAddress) {
				const forwarderMethod = 'swapAndForwardEth';
				const forwarderParams = [
					fastMctpPayloadIx._params.amountIn,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.fastMctpInputContract,
					minMiddleAmount,
					fastMctpPayloadIx._params.contractAddress,
					fastMctpPayloadIx.data,
				];
				const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(fastMctpPayloadIx._params.amountIn),
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
					fastMctpPayloadIx._params.amountIn,
					_permit,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.fastMctpInputContract,
					minMiddleAmount,
					fastMctpPayloadIx._params.contractAddress,
					fastMctpPayloadIx.data,
				];
				const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(0),
					chainId: signerChainId,
					_forwarder: {
						method: forwarderMethod,
						params: forwarderParams,
					}
				}
			}
		} else {
			const fastMctpPayloadIx = getEvmFastMctpBridgeTxPayload(
				quote, destinationAddress, referrerAddress, signerChainId, payload
			);
			const minMiddleAmount = getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS);

			if (quote.fromToken.contract === ZeroAddress) {
				const forwarderMethod = 'swapAndForwardEth';
				const forwarderParams = [
					fastMctpPayloadIx._params.amountIn,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.fastMctpInputContract,
					minMiddleAmount,
					fastMctpPayloadIx._params.contractAddress,
					fastMctpPayloadIx.data,
				];
				const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(fastMctpPayloadIx._params.amountIn),
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
					fastMctpPayloadIx._params.amountIn,
					_permit,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.fastMctpInputContract,
					minMiddleAmount,
					fastMctpPayloadIx._params.contractAddress,
					fastMctpPayloadIx.data,
				]
				const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(0),
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
