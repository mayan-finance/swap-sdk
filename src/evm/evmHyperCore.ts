import { Contract, toBeHex, TransactionRequest, ZeroAddress } from 'ethers';
import  { EvmForwarderParams, Quote } from '../types';
import {
	getWormholeChainIdByName,
	getWormholeChainIdById,
	getEvmChainIdByName,
	getHyperCoreUSDCDepositCustomPayload,
	createHyperCoreClonedQuote, ZeroPermit, getAmountOfFractionalAmount,
} from '../utils';

import addresses from '../addresses';
import { Buffer } from 'buffer';
import { Erc20Permit } from '../types';
import {
	getSwiftFromEvmGasLessParams,
	getSwiftFromEvmTxPayload,
	SwiftEvmGasLessParams,
} from './evmSwift';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import MayanHCDepositHyperEVMArtifact from './MayanHCDepositHyperEVMArtifact';
import { CCTP_TOKEN_DECIMALS } from '../cctp';

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

	if (payload) {
		throw new Error('HyperCore deposit does not support payload');
	}

	if (Number.isNaN(Number(quote.toToken.contract))) {
		throw new Error('Invalid to token contract for HyperCore deposit USDC: ' + quote.toToken.contract);
	}

	if (quote.type === 'MONO_CHAIN') {
		if (quote.fromChain !== 'hyperevm') {
			throw new Error('Unsupported from chain for HyperCore deposit via mono-chain quote: ' + quote.fromChain);
		}
		return getHyperCoreDepositFromHyperEVMTxPayload(
			quote,
			destinationAddress,
			referrerAddress,
			signerChainId,
			permit,
			options,
		);
	}

	if (quote.type !== 'SWIFT') {
		throw new Error('Unsupported quote type for HC deposit: ' + quote.type);
	}

	if (!quote.hcSwiftDeposit) {
		throw new Error('HyperCore parameters are required for this quote');
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

function getHCDepositHyperEVMTxPayload(
	quote: Quote,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
): TransactionRequest & { _params: { amountIn: bigint; tokenIn: string } } {
	const amountIn = BigInt(quote.effectiveAmountIn64);
	const monoChainContract = new Contract(
		quote.monoChainMayanContract,
		MayanHCDepositHyperEVMArtifact.abi
	);
	const referrerBps = referrerAddress ? quote.referrerBps || 0 : 0;

	let data: string;
	let value: string | null;
	data = monoChainContract.interface.encodeFunctionData('depositToHyperCore', [
		addresses.HYPEREVM_USDC_CONTRACT,
		amountIn,
		referrerBps,
		referrerAddress || ZeroAddress,
		destinationAddress,
		Number(quote.toToken.contract),
	]);
	value = toBeHex(0);

	return {
		to: quote.monoChainMayanContract,
		data,
		value,
		_params: {
			amountIn,
			tokenIn: quote.fromToken.contract,
		},
	};
}

function getHyperCoreDepositFromHyperEVMTxPayload(
	quote: Quote, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null | undefined, options: {
		apiKey?: string;
	}
): TransactionRequest & { _forwarder: EvmForwarderParams } {
	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}

	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName('hyperevm');
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(
			`Signer chain id(${Number(
				signerChainId
			)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`
		);
	}

	const _permit = permit || ZeroPermit;
	const forwarder = new Contract(
		addresses.MAYAN_FORWARDER_CONTRACT,
		MayanForwarderArtifact.abi
	);

	const hcDepositHyperEVMPayloadTx = getHCDepositHyperEVMTxPayload(
		quote,
		destinationAddress,
		referrerAddress,
	);

	if (quote.fromToken.contract === addresses.HYPEREVM_USDC_CONTRACT) {
		const forwarderMethod = 'forwardERC20';
		const forwarderParams = [
			addresses.HYPEREVM_USDC_CONTRACT,
			hcDepositHyperEVMPayloadTx._params.amountIn,
			_permit,
			quote.monoChainMayanContract,
			hcDepositHyperEVMPayloadTx.data,
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
		const { evmSwapRouterAddress, evmSwapRouterCalldata } = quote;
		if (!evmSwapRouterAddress || !evmSwapRouterCalldata) {
			throw new Error(
				'Mono chain swap requires router address and calldata'
			);
		}
		const minMiddleAmount = getAmountOfFractionalAmount(
			quote.minAmountOut,
			CCTP_TOKEN_DECIMALS,
		);
		if (quote.fromToken.contract === ZeroAddress) {
			const forwarderMethod = 'swapAndForwardEth';
			const forwarderParams = [
				hcDepositHyperEVMPayloadTx._params.amountIn,
				evmSwapRouterAddress,
				evmSwapRouterCalldata,
				addresses.HYPEREVM_USDC_CONTRACT,
				minMiddleAmount,
				quote.monoChainMayanContract,
				hcDepositHyperEVMPayloadTx.data,
			];
			const data = forwarder.interface.encodeFunctionData(
				forwarderMethod,
				forwarderParams
			);
			return {
				data,
				to: addresses.MAYAN_FORWARDER_CONTRACT,
				value: toBeHex(hcDepositHyperEVMPayloadTx._params.amountIn),
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
				hcDepositHyperEVMPayloadTx._params.amountIn,
				_permit,
				evmSwapRouterAddress,
				evmSwapRouterCalldata,
				addresses.HYPEREVM_USDC_CONTRACT,
				minMiddleAmount,
				quote.monoChainMayanContract,
				hcDepositHyperEVMPayloadTx.data,
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
}
