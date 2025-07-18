import { Contract, toBeHex, ZeroAddress, TransactionRequest } from 'ethers';
import { SystemProgram } from '@solana/web3.js';
import type { EvmForwarderParams, Quote } from '../types';
import {
	nativeAddressToHexString,
	getAmountOfFractionalAmount,
	getWormholeChainIdByName,
	getWormholeChainIdById,
	ZeroPermit,
} from '../utils';

import MayanMonoChainArtifact from './MayanMonoChainArtifact';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import addresses from '../addresses';
import { Erc20Permit } from '../types';

function getEvmMonoChainTxPayload(
	quote: Quote,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
): TransactionRequest & { _params: { amountIn: bigint; tokenIn: string } } {
	const amountOut = getAmountOfFractionalAmount(
		quote.expectedAmountOut,
		quote.toToken.decimals
	);
	const monoChainContract = new Contract(
		quote.monoChainMayanContract,
		MayanMonoChainArtifact.abi
	);
	const referrerBps = referrerAddress ? quote.referrerBps || 0 : 0;

	let data: string;
	let value: string | null;
	if (quote.toToken.contract === ZeroAddress) {
		data = monoChainContract.interface.encodeFunctionData('transferEth', [
			destinationAddress,
			referrerAddress || ZeroAddress,
			referrerBps,
		]);
	} else {
		data = monoChainContract.interface.encodeFunctionData('transferToken', [
			quote.toToken.contract,
			amountOut,
			destinationAddress,
			referrerAddress || ZeroAddress,
			referrerBps,
		]);
	}
	if (quote.fromToken.contract === ZeroAddress) {
		value = toBeHex(quote.effectiveAmountIn64);
	} else {
		value = toBeHex(0);
	}

	return {
		to: quote.monoChainMayanContract,
		data,
		value,
		_params: {
			amountIn: BigInt(quote.effectiveAmountIn64),
			tokenIn: quote.fromToken.contract,
		},
	};
}

export function getMonoChainFromEvmTxPayload(
	quote: Quote,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	signerChainId: number | string,
	permit: Erc20Permit | null,
): TransactionRequest & { _forwarder: EvmForwarderParams } {
	if (quote.type !== 'MONO_CHAIN') {
		throw new Error('Quote type is not MONO_CHAIN');
	}
	if (quote.fromChain !== quote.toChain) {
		throw new Error('Quote chains are not equal');
	}
	if (quote.fromToken.contract.toLowerCase() === quote.toToken.contract.toLowerCase()) {
		throw new Error(
			`From token and to token are the same: ${quote.fromToken.contract}`
		);
	}

	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(
			`Signer chain id(${Number(
				signerChainId
			)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`
		);
	}
	signerChainId = Number(signerChainId);

	const _permit = permit || ZeroPermit;
	const forwarder = new Contract(
		addresses.MAYAN_FORWARDER_CONTRACT,
		MayanForwarderArtifact.abi
	);

	const { evmSwapRouterAddress, evmSwapRouterCalldata } = quote;
	if (!evmSwapRouterAddress || !evmSwapRouterCalldata) {
		throw new Error(
			'Mono chain swap requires router address and calldata'
		);
	}

	const monoChainPayloadIx = getEvmMonoChainTxPayload(
		quote,
		destinationAddress,
		referrerAddress,
	);
	const minMiddleAmount = getAmountOfFractionalAmount(
		quote.minAmountOut,
		quote.toToken.decimals
	);

	if (quote.fromToken.contract === ZeroAddress) {
		const forwarderMethod = 'swapAndForwardEth';
		const forwarderParams = [
			monoChainPayloadIx._params.amountIn,
			evmSwapRouterAddress,
			evmSwapRouterCalldata,
			quote.toToken.contract,
			minMiddleAmount,
			quote.monoChainMayanContract,
			monoChainPayloadIx.data,
		];
		const data = forwarder.interface.encodeFunctionData(
			forwarderMethod,
			forwarderParams
		);
		return {
			data,
			to: addresses.MAYAN_FORWARDER_CONTRACT,
			value: toBeHex(monoChainPayloadIx._params.amountIn),
			chainId: signerChainId,
			_forwarder: {
				method: forwarderMethod,
				params: forwarderParams,
			},
		};
	} else {
		const forwarderMethod = 'swapAndForwardERC20';
		const forwarderParams = [
			quote.fromToken.contract,
			monoChainPayloadIx._params.amountIn,
			_permit,
			evmSwapRouterAddress,
			evmSwapRouterCalldata,
			quote.toToken.contract,
			minMiddleAmount,
			quote.monoChainMayanContract,
			monoChainPayloadIx.data,
		];
		const data = forwarder.interface.encodeFunctionData(
			forwarderMethod,
			forwarderParams
		);
		return {
			data,
			to: addresses.MAYAN_FORWARDER_CONTRACT,
			value: toBeHex(0),
			chainId: signerChainId,
			_forwarder: {
				method: forwarderMethod,
				params: forwarderParams,
			},
		};
	}
}
