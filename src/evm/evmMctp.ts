import {
	Contract,
	Signer,
	toBeHex,
	Overrides,
	ZeroAddress,
	TransactionResponse,
	TransactionRequest,
} from 'ethers';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import type { Quote } from '../types';
import {
	getAssociatedTokenAddress,
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById, getGasDecimal, ZeroPermit
} from '../utils';
import { getCurrentChainTime } from '../api';
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
	recipient: {
		destDomain: number,
		mintRecipient: string,
		callerAddr: string,
	},
	bridgeFee: bigint,
	contractAddress: string,
}
function getEvmMctpBridgeParams(
	quote: Quote, destinationAddress: string, signerChainId: number | string
): EvmMctpBridgeParams {
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const destChainId = getWormholeChainIdByName(quote.toChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}
	const lockFee: boolean = quote.cheaperChain === quote.fromChain;
	const destinationAddressHex = nativeAddressToHexString(destinationAddress, destChainId);
	const redeemFee = getAmountOfFractionalAmount(quote.redeemRelayerFee, CCTP_TOKEN_DECIMALS);
	const gasDrop = getAmountOfFractionalAmount(quote.gasDrop, Math.min(getGasDecimal(quote.toChain), 8));
	const amountIn = getAmountOfFractionalAmount(quote.effectiveAmountIn, quote.fromToken.decimals);
	const destDomain = getCCTPDomain(quote.toChain);

	if (!quote.mctpMayanContract) {
		throw new Error('MCTP contract address is missing');
	}
	const contractAddress = quote.mctpMayanContract;

	let mintRecipient: string;
	let callerAddr: string;
	if (quote.toChain === 'solana') {
		if (lockFee) {
			throw new Error('Cannot lock fee for transfer to solana');
		}
		const [caller] = PublicKey.findProgramAddressSync(
			[Buffer.from('CALLER')], new PublicKey(addresses.MCTP_PROGRAM_ID)
		);
		const [main] = PublicKey.findProgramAddressSync(
			[Buffer.from('MAIN')], new PublicKey(addresses.MCTP_PROGRAM_ID)
		);
		const cctpOutputMint = new PublicKey(quote.mctpOutputContract);
		const mainAccount = getAssociatedTokenAddress(
			cctpOutputMint,
			main,
			true
		);

		mintRecipient = nativeAddressToHexString(mainAccount.toString(), getWormholeChainIdByName('solana'));
		callerAddr = nativeAddressToHexString(caller.toString(), getWormholeChainIdByName('solana'));
	} else {
		callerAddr = nativeAddressToHexString(contractAddress, destChainId);
		if (lockFee) {
			mintRecipient = destinationAddressHex;
		} else {
			mintRecipient = callerAddr;
		}
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
		recipient: {
			destDomain,
			mintRecipient,
			callerAddr
		},
		bridgeFee,
		contractAddress,
	};
}

function getEvmMctpBridgeTxPayload(
	quote: Quote, destinationAddress: string, signerChainId: number | string,
): TransactionRequest & { _params: EvmMctpBridgeParams } {
	const params = getEvmMctpBridgeParams(
		quote, destinationAddress, signerChainId
	);
	const {
		contractAddress, tokenIn, amountIn, destAddr,
		lockFee, redeemFee, gasDrop,
		recipient, bridgeFee
	} = params;

	const mctpContract = new Contract(contractAddress, MayanCircleArtifact.abi);
	let data: string;
	let value: string | null;
	if (lockFee) {
		data = mctpContract.interface.encodeFunctionData(
			'bridgeWithLockedFee',
			[tokenIn, amountIn, gasDrop, redeemFee, recipient]
		);
	} else {
		data = mctpContract.interface.encodeFunctionData(
			'bridgeWithFee',
			[tokenIn, amountIn, redeemFee, gasDrop, destAddr, recipient]
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
	recipient: {
		destDomain: number,
		mintRecipient: string,
		callerAddr: string,
	},
	bridgeFee: bigint,
	contractAddress: string,
}

async function getEvmMctpCreateOrderParams(
	quote: Quote, destinationAddress: string, timeout: number,
	referrerAddress: string | null | undefined, signerChainId: string | number
): Promise<EvmMctpCreateOrderParams> {
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


	let mintRecipient: string;
	let callerAddr: string;
	if (quote.toChain === 'solana') {
		const [caller] = PublicKey.findProgramAddressSync(
			[Buffer.from('CALLER')], new PublicKey(addresses.MCTP_PROGRAM_ID)
		);
		const [main] = PublicKey.findProgramAddressSync(
			[Buffer.from('MAIN')], new PublicKey(addresses.MCTP_PROGRAM_ID)
		);
		const cctpOutputMint = new PublicKey(quote.mctpOutputContract);
		const mainAccount = getAssociatedTokenAddress(
			cctpOutputMint,
			main,
			true
		);
		mintRecipient = nativeAddressToHexString(mainAccount.toString(), getWormholeChainIdByName('solana'));
		callerAddr = nativeAddressToHexString(caller.toString(), getWormholeChainIdByName('solana'));
	} else {
		mintRecipient = nativeAddressToHexString(contractAddress, destChainId);
		callerAddr = nativeAddressToHexString(contractAddress, destChainId);
	}
	const destDomain = getCCTPDomain(quote.toChain);

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

	let amountIn = getAmountOfFractionalAmount(quote.effectiveAmountIn, quote.fromToken.decimals);
	const minAmountOut = getAmountOfFractionalAmount(
		quote.minAmountOut, Math.min(8, quote.toToken.decimals)
	);

	const destChainTime = await getCurrentChainTime(quote.toChain);
	const deadline = BigInt(destChainTime + timeout);

	const tokenOut =
		quote.toToken.contract === ZeroAddress ?
			nativeAddressToHexString(SystemProgram.programId.toString(), getWormholeChainIdByName('solana')) :
			nativeAddressToHexString(quote.toToken.contract, quote.toToken.wChainId);

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
		recipient: {
			destDomain,
			mintRecipient,
			callerAddr
		},
		bridgeFee: getAmountOfFractionalAmount(quote.bridgeFee, getGasDecimal(quote.fromChain)),
		contractAddress,
	};
}

async function getEvmMctpCreateOrderTxPayload(
	quote: Quote, destinationAddress: string, timeout: number,
	referrerAddress: string | null | undefined, signerChainId: string | number
): Promise<TransactionRequest & { _params: EvmMctpCreateOrderParams }> {
	const orderParams = await getEvmMctpCreateOrderParams(
		quote, destinationAddress, timeout, referrerAddress, signerChainId
	);
	const {
		contractAddress, params, bridgeFee, recipient
	} = orderParams;
	const mctpContract = new Contract(contractAddress, MayanCircleArtifact.abi);
	const data = mctpContract.interface.encodeFunctionData(
		'createOrder',
		[params, recipient]
	);
	const value = toBeHex(bridgeFee);

	return {
		to: contractAddress,
		data,
		value,
		_params: orderParams,
	};
}

export async function getMctpFromEvmTxPayload(
	quote: Quote, destinationAddress: string, timeout: number | null, referrerAddress: string | null | undefined,
	signerChainId: number | string, permit: Erc20Permit | null
): Promise<TransactionRequest>{

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
			if (!timeout) {
				throw new Error('MCTP order requires timeout');
			}
			const mctpPayloadIx = await getEvmMctpCreateOrderTxPayload(
				quote, destinationAddress, timeout, referrerAddress, signerChainId
			);

			const data = forwarder.interface.encodeFunctionData('forwardERC20', [
				quote.fromToken.contract,
				mctpPayloadIx._params.params.amountIn,
				_permit,
				mctpPayloadIx._params.contractAddress,
				mctpPayloadIx.data,
			]);
			return {
				data,
				to: addresses.MAYAN_FORWARDER_CONTRACT,
				value: toBeHex(value),
				chainId: signerChainId,
			}
		} else {
			const mctpPayloadIx = getEvmMctpBridgeTxPayload(
				quote, destinationAddress, signerChainId
			);
			const data = forwarder.interface.encodeFunctionData('forwardERC20', [
				quote.fromToken.contract,
				mctpPayloadIx._params.amountIn,
				_permit,
				mctpPayloadIx._params.contractAddress,
				mctpPayloadIx.data,
			]);
			return {
				data,
				to: addresses.MAYAN_FORWARDER_CONTRACT,
				value: toBeHex(value),
				chainId: signerChainId,
			}
		}
	} else {
		const { minMiddleAmount, evmSwapRouterAddress, evmSwapRouterCalldata } = quote;
		if (!minMiddleAmount || !evmSwapRouterAddress || !evmSwapRouterCalldata) {
			throw new Error('MCTP swap requires middle amount, router address and calldata');
		}
		if (quote.hasAuction) {
			if (!timeout) {
				throw new Error('MCTP order requires timeout');
			}
			const mctpPayloadIx = await getEvmMctpCreateOrderTxPayload(quote, destinationAddress, timeout, referrerAddress, signerChainId);
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

				const data = forwarder.interface.encodeFunctionData('swapAndForwardEth', [
					amountIn,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.mctpInputContract,
					minMiddleAmount,
					mctpPayloadIx._params.contractAddress,
					mctpPayloadIx.data,
				]);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(value),
					chainId: signerChainId,
				}
			} else {
				const data = forwarder.interface.encodeFunctionData('swapAndForwardERC20', [
					quote.fromToken.contract,
					mctpPayloadIx._params.params.amountIn,
					_permit,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.mctpInputContract,
					minMiddleAmount,
					mctpPayloadIx._params.contractAddress,
					mctpPayloadIx.data,
				]);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(value),
					chainId: signerChainId,
				}
			}
		} else {
			const mctpPayloadIx = getEvmMctpBridgeTxPayload(quote, destinationAddress, signerChainId);
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

				const data = forwarder.interface.encodeFunctionData('swapAndForwardEth', [
					amountIn,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.mctpInputContract,
					minMiddleAmount,
					mctpPayloadIx._params.contractAddress,
					mctpPayloadIx.data,
				]);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(value),
					chainId: signerChainId,
				}
			} else {
				const data = forwarder.interface.encodeFunctionData('swapAndForwardERC20', [
					quote.fromToken.contract,
					mctpPayloadIx._params.amountIn,
					_permit,
					evmSwapRouterAddress,
					evmSwapRouterCalldata,
					quote.mctpInputContract,
					minMiddleAmount,
					mctpPayloadIx._params.contractAddress,
					mctpPayloadIx.data,
				]);
				return {
					data,
					to: addresses.MAYAN_FORWARDER_CONTRACT,
					value: toBeHex(value),
					chainId: signerChainId,
				}
			}
		}
	}
}

export async function mctpFromEvm(
	quote: Quote, destinationAddress: string, timeout: number | null, referrerAddress: string | null | undefined,
	signer: Signer, signerChainId: number, permit: Erc20Permit | null, overrides?: Overrides
): Promise<TransactionResponse>{

	if (quote.type !== 'MCTP') {
		throw new Error('Quote type is not MCTP');
	}

	const txPayload = await getMctpFromEvmTxPayload(
		quote, destinationAddress, timeout, referrerAddress, signerChainId, permit
	);
	if (overrides?.gasLimit) {
		txPayload.gasLimit = overrides.gasLimit;
	}
	return signer.sendTransaction(txPayload);
}
