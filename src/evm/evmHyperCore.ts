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
	hexToUint8Array
} from '../utils';

import HCDepositInitiatorArtifact from './HCDepositInitiatorArtifact';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import addresses from '../addresses';
import { Buffer } from 'buffer';
import { CCTP_TOKEN_DECIMALS } from '../cctp';
import { Erc20Permit } from '../types';
import { getSwapEvm } from '../api';

function getUsdcDepositInitiatorMctpTxPayload(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	usdcPermitSignature: string,
): TransactionRequest & { _params: { amountIn: bigint, contractAddress: string } } {
	if (!quote.hyperCoreParams) {
		throw new Error('HyperCore parameters are missing');
	}
	if (!quote.hyperCoreParams.initiateContractAddress) {
		throw new Error('HyperCore initiate contract address is missing');
	}
	if (quote.type !== 'MCTP') {
		throw new Error('Unsupported quote type for HyperCore deposit: ' + quote.type);
	}

	const initiatorContract = new Contract(
		quote.hyperCoreParams.initiateContractAddress,
		HCDepositInitiatorArtifact.abi
	);

	const signatureBuf = Buffer.from(hexToUint8Array(usdcPermitSignature));
	if (signatureBuf.length !== 65) {
		throw new Error('Invalid USDC permit signature length');
	}
	const r = '0x' + signatureBuf.subarray(0, 32).toString('hex');
	const s = '0x' + signatureBuf.subarray(32, 64).toString('hex');
	const v = signatureBuf[64];

	let data: string;
	let value: string | null;
	data = initiatorContract.interface.encodeFunctionData('deposit', [
		quote.hyperCoreParams.initiateTokenContract,
		BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
		swapperAddress,
		getAmountOfFractionalAmount(
			quote.hyperCoreParams.failureGasDrop,
			Math.min(getGasDecimal('arbitrum'), 8)
		),
		BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
		{
			relayerFee: getAmountOfFractionalAmount(quote.redeemRelayerFee, CCTP_TOKEN_DECIMALS),
			permit: {
				user: destinationAddress,
				usd: BigInt(quote.hyperCoreParams.depositAmountUSDC64),
				deadline: BigInt(quote.deadline64),
				signature: {
					r,
					s,
					v,
				},
			}
		},
	]);
	value = toBeHex(0);

	return {
		to: quote.hyperCoreParams.initiateContractAddress,
		data,
		value,
		_params: {
			amountIn: BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
			contractAddress: quote.hyperCoreParams.initiateContractAddress,
		},
	};
}

function getUsdcDepositInitiatorFastMctpTxPayload(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	usdcPermitSignature: string,
): TransactionRequest & { _params: { amountIn: bigint, contractAddress: string } } {
	const destChainId = getWormholeChainIdByName('arbitrum');
	if (!quote.hyperCoreParams) {
		throw new Error('HyperCore parameters are missing');
	}
	if (!quote.hyperCoreParams.initiateContractAddress) {
		throw new Error('HyperCore initiate contract address is missing');
	}
	if (quote.type !== 'FAST_MCTP') {
		throw new Error('Unsupported quote type for HyperCore deposit: ' + quote.type);
	}

	const initiatorContract = new Contract(
		quote.hyperCoreParams.initiateContractAddress,
		HCDepositInitiatorArtifact.abi
	);

	const signatureBuf = Buffer.from(hexToUint8Array(usdcPermitSignature));
	if (signatureBuf.length !== 65) {
		throw new Error('Invalid USDC permit signature length');
	}
	const r = '0x' + signatureBuf.subarray(0, 32).toString('hex');
	const s = '0x' + signatureBuf.subarray(32, 64).toString('hex');
	const v = signatureBuf[64];

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

	let data: string;
	let value: string | null;
	data = initiatorContract.interface.encodeFunctionData('fastDeposit', [
		quote.hyperCoreParams.initiateTokenContract,
		BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
		swapperAddress,
		BigInt(quote.circleMaxFee64),
		getAmountOfFractionalAmount(
			quote.hyperCoreParams.failureGasDrop,
			Math.min(getGasDecimal('arbitrum'), 8)
		),
		referrerHex,
		quote.referrerBps,
		Number(quote.fastMctpMinFinality),
		BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
		{
			relayerFee: getAmountOfFractionalAmount(quote.redeemRelayerFee, CCTP_TOKEN_DECIMALS),
			permit: {
				user: destinationAddress,
				usd: BigInt(quote.hyperCoreParams.depositAmountUSDC64),
				deadline: BigInt(quote.deadline64),
				signature: {
					r,
					s,
					v,
				},
			}
		},
	]);
	value = toBeHex(0);

	return {
		to: quote.hyperCoreParams.initiateContractAddress,
		data,
		value,
		_params: {
			amountIn: BigInt(quote.hyperCoreParams.bridgeAmountUSDC64),
			contractAddress: quote.hyperCoreParams.initiateContractAddress,
		},
	};
}

export async function getHyperCoreDepositFromEvmTxPayload(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null | undefined, payload: Uint8Array | Buffer | null | undefined,
	options: {
		usdcPermitSignature?: string;
	} = {}
): Promise<TransactionRequest & { _forwarder: EvmForwarderParams }> {

	if (
		quote.toToken.contract.toLowerCase() !== addresses.ARBITRUM_USDC_CONTRACT.toLowerCase() ||
		(quote.type !== 'MCTP' && quote.type !== 'FAST_MCTP')
	) {
		throw new Error('Unsupported quote type for USDC deposit: ' + quote.type);
	}
	if (!options?.usdcPermitSignature) {
		throw new Error('USDC permit signature is required for this quote');
	}
	if (!quote.hyperCoreParams) {
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
	const _permit = permit || ZeroPermit;
	const forwarder = new Contract(addresses.MAYAN_FORWARDER_CONTRACT, MayanForwarderArtifact.abi);

	let initiatorPayloadIx: TransactionRequest & { _params: { amountIn: bigint, contractAddress: string } };
	if (!Number(quote.deadline64)) {
		throw new Error('HyperCore deposit requires timeout');
	}
	if (quote.type === 'MCTP') {
		initiatorPayloadIx = getUsdcDepositInitiatorMctpTxPayload(
			quote, swapperAddress, destinationAddress, options.usdcPermitSignature
		);
	} else if (quote.type === 'FAST_MCTP') {
		initiatorPayloadIx = getUsdcDepositInitiatorFastMctpTxPayload(
			quote, swapperAddress, destinationAddress, referrerAddress, options.usdcPermitSignature
		);
	} else {
		throw new Error('Unsupported quote type for HyperCore deposit: ' + quote.type);
	}

	if (quote.fromToken.contract.toLowerCase() === quote.hyperCoreParams.initiateTokenContract.toLowerCase()) {
		const forwarderMethod = 'forwardERC20';
		const forwarderParams = [
			quote.fromToken.contract,
			BigInt(quote.effectiveAmountIn64),
			_permit,
			initiatorPayloadIx._params.contractAddress,
			initiatorPayloadIx.data,
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
		const { swapRouterCalldata, swapRouterAddress } = await getSwapEvm({
			fromToken: quote.fromToken.contract,
			middleToken: quote.hyperCoreParams.initiateTokenContract,
			chainName: quote.fromChain,
			amountIn64: quote.effectiveAmountIn64,
			referrerAddress: referrerAddress,
			slippageBps: quote.slippageBps,
			forwarderAddress: addresses.MAYAN_FORWARDER_CONTRACT,
		});
		if (!quote.minMiddleAmount) {
			throw new Error('Fast Mctp swap requires middle amount, router address and calldata');
		}
		const minMiddleAmount = getAmountOfFractionalAmount(quote.minMiddleAmount, CCTP_TOKEN_DECIMALS);

		if (quote.fromToken.contract === ZeroAddress) {
			const forwarderMethod = 'swapAndForwardEth';
			const forwarderParams = [
				BigInt(quote.effectiveAmountIn64),
				swapRouterAddress,
				swapRouterCalldata,
				quote.hyperCoreParams.initiateTokenContract,
				minMiddleAmount,
				initiatorPayloadIx._params.contractAddress,
				initiatorPayloadIx.data,
			];
			const data = forwarder.interface.encodeFunctionData(forwarderMethod, forwarderParams);
			return {
				data,
				to: addresses.MAYAN_FORWARDER_CONTRACT,
				value: toBeHex(BigInt(quote.effectiveAmountIn64)),
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
				BigInt(quote.effectiveAmountIn64),
				_permit,
				swapRouterAddress,
				swapRouterCalldata,
				quote.hyperCoreParams.initiateTokenContract,
				minMiddleAmount,
				initiatorPayloadIx._params.contractAddress,
				initiatorPayloadIx.data,
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
	}
}
