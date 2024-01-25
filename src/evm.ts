import { ethers, Signer, Overrides, TransactionResponse, TransactionRequest } from 'ethers';
import { PublicKey, SystemProgram } from '@solana/web3.js';

import type { Quote } from './types';
import {
	getCurrentEvmTime,
	getAssociatedTokenAddress,
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById, getGasDecimal,
} from './utils';
import { getCurrentSolanaTime } from './api';
import MayanSwapArtifact from './MayanSwapArtifact';
import addresses  from './addresses';
import { Buffer } from 'buffer';

export type ContractRelayerFees = {
	swapFee: bigint,
	redeemFee: bigint,
	refundFee: bigint,
}

export type Criteria = {
	transferDeadline: bigint,
	swapDeadline: bigint,
	amountOutMin: bigint,
	gasDrop: bigint,
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
	amountIn: bigint,
	bridgeFee: bigint,
}
async function getEvmSwapParams(
  provider: ethers.Provider,
	quote: Quote, destinationAddress: string,
	timeout: number, referrerAddress: string | null | undefined,
	signerAddress: string,
	signerChainId: ethers.BigNumberish, payload?: Uint8Array | Buffer | null
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
		quote.toToken.contract === ethers.ZeroAddress;

	const criteria: Criteria = {
		transferDeadline: BigInt(currentEvmTime + timeout),
		swapDeadline: BigInt(currentSolanaTime + timeout),
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

	const bridgeFee = getAmountOfFractionalAmount(
		quote.bridgeFee, 18
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
		bridgeFee,
	}
}

export async function getSwapFromEvmTxPayload(
  provider: ethers.Provider,
	quote: Quote, destinationAddress: string,
	timeout: number, referrerAddress: string | null | undefined,
	signerAddress: string, signerChainId: number | string,
	payload?: Uint8Array | Buffer | null
) : Promise<TransactionRequest> {
	const {
		relayerFees, recipient, tokenOut, tokenOutWChainId,
		criteria, tokenIn, amountIn, contractAddress, bridgeFee,
	} = await getEvmSwapParams(
    provider,
		quote, destinationAddress, timeout, referrerAddress,
		signerAddress, signerChainId, payload
	);
	const mayanSwap = new ethers.Contract(contractAddress, MayanSwapArtifact.abi);
	let data: string;
	let value: string | null;
	if (tokenIn === ethers.ZeroAddress) {
		data = mayanSwap.interface.encodeFunctionData(
			"wrapAndSwapETH",
			[relayerFees, recipient, tokenOut, tokenOutWChainId, criteria]
		);
		value = ethers.hexlify(amountIn.toString());
	} else {
		data = mayanSwap.interface.encodeFunctionData(
			"swap",
			[relayerFees, recipient, tokenOut, tokenOutWChainId,
				criteria, tokenIn, amountIn]
		)
		value = ethers.hexlify(bridgeFee.toString());
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
	signer: Signer, overrides?: Overrides, payload?: Uint8Array | Buffer | null
): Promise<TransactionResponse> {
	const signerAddress = await signer.getAddress();
	const signerChainId = (await signer.provider.getNetwork()).chainId;
	const swapParams =
		await getEvmSwapParams(
      signer.provider,
			quote, destinationAddress, timeout, referrerAddress,
			signerAddress, signerChainId, payload
		);

	if (!overrides) {
		overrides = {
			value: swapParams.bridgeFee,
		}
	}

	if(swapParams.tokenIn === ethers.ZeroAddress) {
		overrides.value = swapParams.amountIn;
		return wrapAndSwapETH(swapParams, signer, overrides);
	} else {
		if (!overrides.value) {
			overrides.value = swapParams.bridgeFee;
		}
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
		relayerFees, recipient, tokenOut,
		tokenOutWChainId, criteria, overrides
	);
}

