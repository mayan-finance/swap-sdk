import { ethers, Overrides, Signer, BigNumber } from 'ethers';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

import { TransactionResponse } from '@ethersproject/abstract-provider';
import type { Quote } from './types';
import {
	getCurrentSolanaTime,
	getCurrentEvmTime,
	getAssociatedTokenAddress,
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById,
} from './utils';
import MayanSwapArtifact from './MayanSwapArtifact';
import addresses  from './addresses';



export type ContractRelayerFees = {
	fee1: ethers.BigNumber,
	fee2: ethers.BigNumber,
	fee3: ethers.BigNumber,
}

export type Criteria = {
	transferDeadline: ethers.BigNumber,
	swapDeadline: ethers.BigNumber,
	amountOutMin: ethers.BigNumber,
	nonce: number,
}

export type Recipient = {
	mayan: string,
	destAddr: string,
	destChainId: number,
};

export async function swapFromEvm(
	quote: Quote, destinationAddress: string,
	timeout: number,provider: ethers.providers.BaseProvider,
	signer: Signer, overrides?: Overrides): Promise<TransactionResponse> {
	const mayanProgram = new PublicKey(addresses.MAYAN_PROGRAM_ID);
	const [mayanMainAccount] = await PublicKey.findProgramAddress(
		[Buffer.from('MAIN')], mayanProgram);
	const recipient = getAssociatedTokenAddress(
		new PublicKey(quote.fromToken.mint),
		mayanMainAccount,
		true,
	);
	const amountIn = getAmountOfFractionalAmount(
		quote.effectiveAmountIn, quote.fromToken.decimals);
	const recipientHex = nativeAddressToHexString(recipient.toString(), 1);

	const signerChainId = await signer.getChainId();
	const signerWormholeChainId = getWormholeChainIdById(signerChainId);
	const fromChainId = getWormholeChainIdByName(quote.fromChain);
	const destinationChainId = getWormholeChainIdByName(quote.toChain);
	if (fromChainId !== signerWormholeChainId) {
		throw new Error('Signer chain id and quote from chain are not same!');
	}

	const recipientStruct : Recipient = {
		mayan: recipientHex,
		destAddr: nativeAddressToHexString(destinationAddress, destinationChainId),
		destChainId: destinationChainId,
	};

	const connection = new Connection('https://solana-api.projectserum.com');
	// Times are in seconds
	const currentEvmTime = await getCurrentEvmTime(provider);
	const currentSolanaTime = await getCurrentSolanaTime(connection);

	const criteria: Criteria = {
		transferDeadline: ethers.BigNumber.from(currentEvmTime + timeout),
		swapDeadline: ethers.BigNumber.from(currentSolanaTime + timeout),
		amountOutMin: getAmountOfFractionalAmount(
			quote.minAmountOut, Math.min(8, quote.toToken.decimals)
		),
		nonce: createNonce().readUInt32LE(0),
	};
	const contractRelayerFees: ContractRelayerFees = {
		fee1: getAmountOfFractionalAmount(quote.swapRelayerFee,
			Math.min(8, quote.fromToken.decimals)),
		fee2: getAmountOfFractionalAmount(quote.redeemRelayerFee,
			Math.min(8, quote.toToken.decimals)),
		fee3: getAmountOfFractionalAmount(quote.refundRelayerFee,
			Math.min(8, quote.fromToken.decimals)),
	}
	const tokenOut = nativeAddressToHexString(
		quote.toToken.realOriginContractAddress, quote.toToken.realOriginChainId
	);
	if(quote.fromToken.contract === ethers.constants.AddressZero) {
		return wrapAndSwapETH(
			addresses.MAYAN_EVM_CONTRACT, contractRelayerFees, recipientStruct,
			tokenOut, quote.toToken.realOriginChainId, criteria, amountIn, signer);
	} else {
		return swap(
			addresses.MAYAN_EVM_CONTRACT, contractRelayerFees, recipientStruct,
			tokenOut, quote.toToken.realOriginChainId, criteria,
			quote.fromToken.contract, amountIn, signer);
	}
}

async function swap(
	contractAddress: string,
	relayerFees: ContractRelayerFees,
	recipient: Recipient,
	tokenOut: string,
	tokenOutWChainId: number,
	criteria: Criteria,
	tokenIn: string,
	amountIn: BigNumber,
	signer: ethers.Signer,
): Promise<TransactionResponse> {
	const mayanSwap = new ethers.Contract(contractAddress, MayanSwapArtifact.abi, signer);
	return  mayanSwap.swap(relayerFees, recipient, tokenOut, tokenOutWChainId, criteria, tokenIn, amountIn);
}


async function wrapAndSwapETH(
	contractAddress: string,
	relayerFees: ContractRelayerFees,
	recipient: Recipient,
	tokenOut: string,
	tokenOutWChainId: number,
	criteria: Criteria,
	amountIn: BigNumber,
	signer: ethers.Signer,
): Promise<TransactionResponse> {
	const mayanSwap = new ethers.Contract(contractAddress, MayanSwapArtifact.abi, signer);
	return  mayanSwap.wrapAndSwapETH(relayerFees, recipient, tokenOut, tokenOutWChainId, criteria, { value: amountIn });
}

function createNonce() {
	const nonceConst = Math.random() * 100000;
	const nonceBuffer = Buffer.alloc(4);
	nonceBuffer.writeUInt32LE(nonceConst, 0);
	return nonceBuffer;
}
