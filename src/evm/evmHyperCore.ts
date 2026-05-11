import {
	TransactionRequest,
} from 'ethers';
import  { EvmForwarderParams, Quote } from '../types';
import {
	getWormholeChainIdByName,
	getWormholeChainIdById,
	getEvmChainIdByName,
	getHyperCoreUSDCDepositCustomPayload,
	createHyperCoreClonedQuote,
} from '../utils';

import addresses from '../addresses';
import { Buffer } from 'buffer';
import { Erc20Permit } from '../types';
import {
	getSwiftFromEvmGasLessParams,
	getSwiftFromEvmTxPayload,
	SwiftEvmGasLessParams,
} from './evmSwift';

export async function getHyperCoreDepositFromEvmTxPayload(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null | undefined, payload: Uint8Array | Buffer | null | undefined,
	options: {
		apiKey?: string;
	} = {}
): Promise<TransactionRequest & { _forwarder: EvmForwarderParams }> {

	if (quote.toToken.name !== 'USDC (perps)' && quote.toToken.name !== 'USDC (spot)') {
		throw new Error('Unsupported to token for HyperCore deposit: ' + quote.toToken.name);
	}

	if (Number.isNaN(Number(quote.toToken.contract))) {
		throw new Error('Invalid to token contract for HyperCore deposit USDC: ' + quote.toToken.contract);
	}

	if (quote.type !== 'SWIFT') {
		throw new Error('Unsupported quote type for HC deposit: ' + quote.type);
	}

	if (!quote.hcSwiftDeposit) {
		throw new Error('HyperCore parameters are required for this quote');
	}
	if (payload) {
		throw new Error('HyperCore deposit does not support payload');
	}

	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}
	if (!Number(quote.deadline64)) {
		throw new Error('HyperCore deposit requires timeout');
	}
	if (quote.type === 'SWIFT') {
		if (quote.swiftVersion !== 'V2') {
			throw new Error('Invalid quote swift version for EVM: ' + quote.swiftVersion);
		}
		const hcDepositDex = Number(quote.toToken.contract)
		const clonedQuote = createHyperCoreClonedQuote(quote);
		return getSwiftFromEvmTxPayload(
			clonedQuote,
			swapperAddress,
			addresses.HC_HYPEREVM_DEPOSIT_PROCESSOR,
			referrerAddress,
			signerChainId,
			permit,
			getHyperCoreUSDCDepositCustomPayload(clonedQuote, destinationAddress, hcDepositDex),
			options?.apiKey
		);
	} else {
		throw new Error('Unsupported quote type for HyperCore deposit: ' + quote.type);
	}
}

export function getHyperCoreSwiftFromEvmGasLessParams(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null | undefined, customPayload: Buffer | Uint8Array | null | undefined,
): SwiftEvmGasLessParams {
	if (quote.type !== 'SWIFT') {
		throw new Error('Unsupported quote type for USDC deposit: ' + quote.type);
	}

	if (quote.toToken.name !== 'USDC (perps)' && quote.toToken.name !== 'USDC (spot)') {
		throw new Error('Unsupported to token for HyperCore deposit: ' + quote.toToken.name);
	}

	if (Number.isNaN(Number(quote.toToken.contract))) {
		throw new Error('Invalid to token contract for HyperCore deposit USDC: ' + quote.toToken.contract);
	}

	if (!quote.hcSwiftDeposit) {
		throw new Error('HyperCore parameters are required for this quote');
	}
	if (customPayload) {
		throw new Error('HyperCore deposit does not support custom payload');
	}
	const hcDepositDex = Number(quote.toToken.contract)
	const clonedQuote = createHyperCoreClonedQuote(quote);
	return getSwiftFromEvmGasLessParams(
		clonedQuote,
		swapperAddress,
		addresses.HC_HYPEREVM_DEPOSIT_PROCESSOR, //destinationAddress
		referrerAddress,
		signerChainId,
		permit,
		getHyperCoreUSDCDepositCustomPayload(clonedQuote, destinationAddress, hcDepositDex),
	);
}
