import {
	Contract,
	formatUnits,
	toBeHex,
	TransactionRequest,
	ZeroAddress,
} from 'ethers';
import {
	EvmForwarderParams,
	HyperCoreWithdrawCircleTypedData,
	Quote,
} from '../types';
import {
	getWormholeChainIdByName,
	getWormholeChainIdById,
	getHyperCoreUSDCDepositCustomPayload,
	createHyperCoreClonedQuote, ZeroPermit, getAmountOfFractionalAmount,
} from '../utils';

import addresses from '../addresses';
import { Buffer } from 'buffer';
import { Erc20Permit } from '../types';
import {
	getEvmSwiftParams,
	getSwiftFromEvmGasLessParams,
	getSwiftFromEvmTxPayload,
	SwiftEvmGasLessParams,
} from './evmSwift';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import MayanHCDepositHyperEVMArtifact from './MayanHCDepositHyperEVMArtifact';
import { CCTP_TOKEN_DECIMALS, getCCTPDomain } from '../cctp';

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

export function getHyperCoreWithdrawParams(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	payload: Buffer | Uint8Array | null | undefined,
): HyperCoreWithdrawCircleTypedData {
	if (quote.type !== 'SWIFT') {
		throw new Error('Unsupported quote type for HyperCore withdraw: ' + quote.type);
	}

	let sourceDex: 'spot' | '';
	if (quote.fromToken.name === 'USDC (perps)') {
		sourceDex = '';
	} else if (quote.fromToken.name === 'USDC (spot)') {
		sourceDex = 'spot';
	} else {
		throw new Error('Unsupported to token for HyperCore withdraw: ' + quote.fromToken.name);
	}

	if (!quote.hcSwiftWithdraw) {
		throw new Error('HyperCore parameters are required for this quote');
	}

	if (Number.isNaN(Number(quote.fromToken.contract))) {
		throw new Error('Invalid from token contract for HyperCore withdraw USDC: ' + quote.fromToken.contract);
	}

	const customPayload = payload ? Buffer.from(payload) : null;
	const hookDataLength = 255 + (customPayload ? customPayload.length : 0);
	const hookData= Buffer.alloc(hookDataLength);

	const swiftParams = getEvmSwiftParams(quote, swapperAddress, destinationAddress, referrerAddress, 65000, payload);
	let offset = 0;
	hookData.writeUInt8(swiftParams.order.payloadType);
	offset += 1;
	Buffer.from(swiftParams.order.trader.slice(2), 'hex').copy(hookData, offset);
	offset += 32;
	Buffer.from(swiftParams.order.destAddr.slice(2), 'hex').copy(hookData, offset);
	offset += 32;
	hookData.writeUInt16BE(swiftParams.order.destChainId, offset);
	offset += 2;
	Buffer.from(swiftParams.order.tokenOut.slice(2), 'hex').copy(hookData, offset);
	offset += 32;
	hookData.writeBigUInt64BE(swiftParams.order.minAmountOut, offset);
	offset += 8;
	hookData.writeBigUInt64BE(swiftParams.order.gasDrop, offset);
	offset += 8;
	hookData.writeBigUInt64BE(swiftParams.order.cancelFee, offset);
	offset += 8;
	hookData.writeBigUInt64BE(swiftParams.order.refundFee, offset);
	offset += 8;
	hookData.writeBigUInt64BE(BigInt(swiftParams.order.deadline), offset);
	offset += 8;
	Buffer.from(swiftParams.order.referrerAddr.slice(2), 'hex').copy(hookData, offset);
	offset += 32;
	hookData.writeUInt8(swiftParams.order.referrerBps, offset);
	offset += 1;
	hookData.writeUInt8(swiftParams.order.auctionMode, offset);
	offset += 1;
	Buffer.from(swiftParams.order.random.slice(2), 'hex').copy(hookData, offset);
	offset += 32;
	if (customPayload) {
		hookData.writeUInt16BE(customPayload.length, offset);
		offset += 2;
		customPayload.copy(hookData, offset);
		offset += customPayload.length;
	} else {
		hookData.writeUInt16BE(0, offset);
		offset += 2;
	}
	hookData.writeUInt32BE(Number(quote.fromToken.contract), offset);
	offset += 4;
	Buffer.from(new Array(24).fill(0)).copy(hookData, offset);
	offset += 24;
	hookData.writeBigUInt64BE(BigInt(quote.hcSwiftWithdraw.maxFee64), offset);
	offset += 8;
	hookData.writeUInt32BE(quote.hcSwiftWithdraw.minFinalityThreshold, offset);
	offset += 4;
	hookData.writeBigUInt64BE(BigInt(quote.hcSwiftWithdraw.relayerFee64), offset);
	offset += 8;
	if (offset !== hookDataLength) {
		throw new Error(`Invalid hook data length: expected ${hookDataLength}, got ${offset}`);
	}
	return {
		domain: {
			name: 'HyperliquidSignTransaction',
			version: '1',
			chainId: 42161,
			verifyingContract: '0x0000000000000000000000000000000000000000',
		},
		types: {
			'HyperliquidTransaction:SendToEvmWithData': [
				{ name: 'hyperliquidChain', type: 'string' },
				{ name: 'token', type: 'string' },
				{ name: 'amount', type: 'string' },
				{ name: 'sourceDex', type: 'string' },
				{ name: 'destinationRecipient', type: 'string' },
				{ name: 'addressEncoding', type: 'string' },
				{ name: 'destinationChainId', type: 'uint32' },
				{ name: 'gasLimit', type: 'uint64' },
				{ name: 'data', type: 'bytes' },
				{ name: 'nonce', type: 'uint64' },
			],
		},
		value: {
			hyperliquidChain: 'Mainnet',
			token: 'USDC',
			amount: formatUnits(BigInt(quote.effectiveAmountIn64), CCTP_TOKEN_DECIMALS),
			sourceDex: sourceDex,
			destinationRecipient: addresses.HC_ARBITRUM_WITHDRAW_PROCESSOR,
			addressEncoding: 'hex',
			destinationChainId: getCCTPDomain('arbitrum'),
			gasLimit: quote.hcSwiftWithdraw.gasLimit,
			data: '0x' + hookData.toString('hex'),
			nonce: new Date().getTime(),
		}
	};
}
