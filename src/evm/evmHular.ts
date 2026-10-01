import { Interface, toBeHex, type TransactionRequest } from 'ethers';
import type { ChainReferrers, Erc20Permit, EvmForwarderParams, Quote, ReferrerAddresses } from '../types';
import { getWormholeChainIdById, getWormholeChainIdByName } from '../utils';
import { fetchHularOrder, isHularSourceSwap } from '../hular/order';
import type { HularOrder } from '../hular/types';
import ERC20Artifact from './ERC20Artifact';

export const HULAR_EVM_DEPOSIT_GAS_UNITS = BigInt(400000);

const hularRouterInterface = new Interface([
	'function depositNative(bytes32 quoteHash)',
	'function depositToken(bytes32 quoteHash, address token, uint256 amount)',
	'function depositWithSwap(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address bridgeToken, uint256 minBridgeOut)',
	'function depositTokenWithPermit(bytes32 quoteHash, address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
	'function depositWithSwapAndPermit(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address bridgeToken, uint256 minBridgeOut, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
]);

const erc20Interface = new Interface(ERC20Artifact.abi);

function isNativeHularEvmToken(address: string): boolean {
	return /^0x0*$/i.test(address);
}

type HularEvmDepositCall = {
	to: string;
	data: string;
	value: bigint;
};

function getHularEvmDepositCall(order: HularOrder, permit: Erc20Permit | null): HularEvmDepositCall {
	const { quoteHash, orderParams: params } = order.quote;
	const amountIn = BigInt(params.amountIn);
	const native = isNativeHularEvmToken(params.srcToken);
	if (!permit && order.quote.directTransfer && !native && !isHularSourceSwap(params)) {
		return {
			to: params.srcToken,
			data: erc20Interface.encodeFunctionData('transfer', [params.routerAddress, amountIn]) + quoteHash.slice(2),
			value: BigInt(0),
		};
	}
	if (order.swap) {
		const swap = order.swap.evm;
		if (!swap) {
			throw new Error('Hular returned swap instructions that are not for EVM');
		}
		const swapArgs = [
			quoteHash,
			order.swap.srcToken,
			BigInt(order.swap.amountIn),
			swap.aggregator,
			swap.swapCalldata,
			order.swap.bridgeToken,
			BigInt(order.swap.minBridgeOut),
		];
		const data = permit
			? hularRouterInterface.encodeFunctionData('depositWithSwapAndPermit', [
					...swapArgs,
					permit.deadline,
					permit.v,
					permit.r,
					permit.s,
			  ])
			: hularRouterInterface.encodeFunctionData('depositWithSwap', swapArgs);
		return { to: order.swap.routerAddress, data, value: BigInt(swap.value) };
	}
	if (native) {
		return {
			to: params.routerAddress,
			data: hularRouterInterface.encodeFunctionData('depositNative', [quoteHash]),
			value: amountIn,
		};
	}
	if (permit) {
		if (!order.chain.router) {
			throw new Error('Hular permit deposits need the chain router');
		}
		return {
			to: order.chain.router,
			data: hularRouterInterface.encodeFunctionData('depositTokenWithPermit', [
				quoteHash,
				params.srcToken,
				amountIn,
				permit.deadline,
				permit.v,
				permit.r,
				permit.s,
			]),
			value: BigInt(0),
		};
	}
	return {
		to: params.routerAddress,
		data: hularRouterInterface.encodeFunctionData('depositToken', [quoteHash, params.srcToken, amountIn]),
		value: BigInt(0),
	};
}

export async function getHularFromEvmTxPayload(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	signerChainId: number | string,
	permit: Erc20Permit | null | undefined,
	apiKey?: string
): Promise<TransactionRequest & { _forwarder: EvmForwarderParams }> {
	if (quote.type !== 'HULAR') {
		throw new Error('Quote type is not HULAR');
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

	const order = await fetchHularOrder(quote, swapperAddress, destinationAddress, referrerAddresses, apiKey);
	const params = order.quote.orderParams;
	const usePermit =
		!!permit && !isNativeHularEvmToken(params.srcToken) && permit.value >= BigInt(params.amountIn);
	const call = getHularEvmDepositCall(order, usePermit ? permit : null);

	return {
		to: call.to,
		data: call.data,
		value: toBeHex(call.value),
		chainId: signerChainId,
		_forwarder: {
			method: 'hular',
			params: [],
		},
	};
}
