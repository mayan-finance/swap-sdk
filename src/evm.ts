import { ethers, Overrides, Signer, BigNumber } from 'ethers';
import { PublicKey, SystemProgram } from '@solana/web3.js';

import { TransactionResponse, TransactionRequest } from '@ethersproject/abstract-provider';
import type { Quote } from './types';
import {
	getCurrentEvmTime,
	getAssociatedTokenAddress,
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById, getGasDecimal, GetBlockProvider
} from './utils';
import { getCurrentSolanaTime } from './api';
import MayanSwapArtifact from './MayanSwapArtifact';
import addresses  from './addresses';
import { Buffer } from 'buffer';

export type ContractRelayerFees = {
	swapFee: ethers.BigNumber,
	redeemFee: ethers.BigNumber,
	refundFee: ethers.BigNumber,
}

export type Criteria = {
	transferDeadline: ethers.BigNumber,
	swapDeadline: ethers.BigNumber,
	amountOutMin: ethers.BigNumber,
	gasDrop: ethers.BigNumber,
	unwrap: boolean,
	customPayload: string,
}

export type Recipient = {
	mayanAddr: string,
	auctionAddr: string,
	referrer: string,
	destAddr: string,
	mayanChainId: number,
	destChainId: number,
	refundAddr: string,
};

export type EvmSwapParams = {
	contractAddress: string,
	relayerFees: ContractRelayerFees,
	recipient: Recipient,
	tokenOut: string,
	tokenOutWChainId: number,
	criteria: Criteria,
	tokenIn: string,
	amountIn: BigNumber,
}
async function getEvmSwapParams(
	quote: Quote, destinationAddress: string,
	timeout: number, referrerAddress: string | null | undefined,
	provider: GetBlockProvider, signerAddress: string,
	signerChainId: string | number, payload?: Uint8Array | Buffer | null
) : Promise<EvmSwapParams> {
	const mayanProgram = new PublicKey(addresses.MAYAN_PROGRAM_ID);
	const [mayanMainAccount] = await PublicKey.findProgramAddress(
		[Buffer.from('MAIN')], mayanProgram);
	const recipient = await getAssociatedTokenAddress(
		new PublicKey(quote.fromToken.mint),
		mayanMainAccount,
		true,
	);
	const amountIn = getAmountOfFractionalAmount(
		quote.effectiveAmountIn, quote.fromToken.decimals);
	const recipientHex = nativeAddressToHexString(recipient.toString(), 1);
	const auctionHex = nativeAddressToHexString(
		addresses.AUCTION_PROGRAM_ID, 1
	);
	let referrerHex: string;
	if (referrerAddress) {
		referrerHex = nativeAddressToHexString(
			referrerAddress, 1
		);
	} else {
		referrerHex = nativeAddressToHexString(
			SystemProgram.programId.toString(), 1
		);
	}
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const fromChainId = getWormholeChainIdByName(quote.fromChain);
	const destinationChainId = getWormholeChainIdByName(quote.toChain);
	if (fromChainId !== signerWormholeChainId) {
		throw new Error('Signer chain id and quote from chain are not same!');
	}

	const contractAddress = addresses.MAYAN_EVM_CONTRACT;

	const recipientStruct : Recipient = {
		mayanAddr: recipientHex,
		mayanChainId: 1,
		destAddr: nativeAddressToHexString(destinationAddress, destinationChainId),
		destChainId: destinationChainId,
		auctionAddr: auctionHex,
		referrer: referrerHex,
		refundAddr: nativeAddressToHexString(signerAddress, signerWormholeChainId),
	};
	// Times are in seconds
	const currentEvmTime = await getCurrentEvmTime(provider);
	const currentSolanaTime = await getCurrentSolanaTime();

	const unwrapRedeem =
		quote.toToken.contract === ethers.constants.AddressZero;

	const criteria: Criteria = {
		transferDeadline: ethers.BigNumber.from(currentEvmTime + timeout),
		swapDeadline: ethers.BigNumber.from(currentSolanaTime + timeout),
		amountOutMin: getAmountOfFractionalAmount(
			quote.minAmountOut, Math.min(8, quote.toToken.decimals)
		),
		gasDrop: getAmountOfFractionalAmount(
			quote.gasDrop, Math.min(8, getGasDecimal(quote.toChain))
		),
		unwrap: unwrapRedeem,
		customPayload: payload ? `0x${Buffer.from(payload).toString('hex')}` : '0x',
	};

	const contractRelayerFees: ContractRelayerFees = {
		swapFee: getAmountOfFractionalAmount(quote.swapRelayerFee,
			Math.min(8, quote.fromToken.decimals)),
		redeemFee: getAmountOfFractionalAmount(quote.redeemRelayerFee,
			Math.min(8, quote.toToken.decimals)),
		refundFee: getAmountOfFractionalAmount(quote.refundRelayerFee,
			Math.min(8, quote.fromToken.decimals)),
	}
	const tokenOut = nativeAddressToHexString(
		quote.toToken.realOriginContractAddress, quote.toToken.realOriginChainId
	);
	return {
		amountIn,
		tokenIn: quote.fromToken.contract,
		tokenOut,
		tokenOutWChainId: quote.toToken.realOriginChainId,
		criteria,
		recipient: recipientStruct,
		relayerFees: contractRelayerFees,
		contractAddress,
	}
}

export async function getSwapFromEvmTxPayload(
	quote: Quote, destinationAddress: string,
	timeout: number, referrerAddress: string | null | undefined,
	signerAddress: string, signerChainId: number | string,
	provider: GetBlockProvider, payload?: Uint8Array | Buffer | null
) : Promise<TransactionRequest> {
	const {
		relayerFees, recipient, tokenOut, tokenOutWChainId,
		criteria, tokenIn, amountIn, contractAddress
	} = await getEvmSwapParams(
		quote, destinationAddress, timeout, referrerAddress,
		provider, signerAddress, signerChainId, payload
	);
	const mayanSwap = new ethers.Contract(contractAddress, MayanSwapArtifact.abi);
	let data: string;
	let value: string | null;
	if (tokenIn === ethers.constants.AddressZero) {
		data = mayanSwap.interface.encodeFunctionData(
			"wrapAndSwapETH",
			[relayerFees, recipient, tokenOut, tokenOutWChainId, criteria]
		);
		value = ethers.utils.hexlify(amountIn);
	} else {
		data = mayanSwap.interface.encodeFunctionData(
			"swap",
			[relayerFees, recipient, tokenOut, tokenOutWChainId,
				criteria, tokenIn, amountIn]
		)
		value = null;
	}
	return {
		to: contractAddress,
		data,
		value,
	}
}
export async function swapFromEvm(
	quote: Quote, destinationAddress: string,
	timeout: number, referrerAddress: string | null | undefined,
	provider: GetBlockProvider,
	signer: Signer, overrides?: Overrides, payload?: Uint8Array | Buffer | null
): Promise<TransactionResponse> {
	const signerAddress = await signer.getAddress();
	const signerChainId = await signer.getChainId();
	const swapParams =
		await getEvmSwapParams(
			quote, destinationAddress, timeout, referrerAddress,
			provider, signerAddress, signerChainId, payload
		);

	if(swapParams.tokenIn === ethers.constants.AddressZero) {
		return wrapAndSwapETH(swapParams, signer, overrides);
	} else {
		return swap(swapParams, signer, overrides);
	}
}

async function swap(
	swapData: EvmSwapParams,
	signer: ethers.Signer,
	overrides?: Overrides
): Promise<TransactionResponse> {
	const {
		relayerFees, recipient, tokenOut, contractAddress,
		tokenOutWChainId, criteria, tokenIn, amountIn
	} = swapData;
	const mayanSwap =
		new ethers.Contract(contractAddress, MayanSwapArtifact.abi, signer);

	if (overrides) {
		return  mayanSwap.swap(relayerFees, recipient, tokenOut, tokenOutWChainId,
			criteria, tokenIn, amountIn, overrides);
	} else {
		return  mayanSwap.swap(relayerFees, recipient, tokenOut, tokenOutWChainId,
			criteria, tokenIn, amountIn);
	}
}


async function wrapAndSwapETH(
	swapParams: EvmSwapParams,
	signer: ethers.Signer,
	overrides?: Overrides,
): Promise<TransactionResponse> {
	const {
		relayerFees, recipient, tokenOut,
		contractAddress, tokenOutWChainId, criteria,
		amountIn
	} = swapParams;
	const mayanSwap =
		new ethers.Contract(contractAddress, MayanSwapArtifact.abi, signer);
	return  mayanSwap.wrapAndSwapETH(
		relayerFees, recipient, tokenOut, tokenOutWChainId, criteria,
		overrides ? { value: amountIn, ...overrides } :  { value: amountIn });
}

