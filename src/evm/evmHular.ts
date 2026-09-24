import { evmOrderDepositCall, isNativeEvmToken, type EvmDepositSignature } from '@mayanfinance/hular-sdk';
import type { TransactionRequest } from 'ethers';
import type { ChainReferrers, Erc20Permit, EvmForwarderParams, Quote, ReferrerAddresses } from '../types';
import { getWormholeChainIdById, getWormholeChainIdByName } from '../utils';
import { fetchHularOrder } from '../hular/order';

export const HULAR_EVM_DEPOSIT_GAS_UNITS = BigInt(400000);

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
	const params = order.quote.orderParams!;
	const usePermit =
		!!permit && !isNativeEvmToken(params.srcToken) && permit.value >= BigInt(params.amountIn);
	const signature: EvmDepositSignature | undefined = usePermit
		? {
				kind: 'permit',
				deadline: BigInt(permit!.deadline),
				signature: { v: permit!.v, r: permit!.r as `0x${string}`, s: permit!.s as `0x${string}` },
		  }
		: undefined;
	const call = evmOrderDepositCall(order, signature);

	return {
		to: call.to,
		data: call.data,
		value: call.value,
		chainId: signerChainId,
		_forwarder: {
			method: 'hular',
			params: [],
		},
	};
}
