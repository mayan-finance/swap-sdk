import {
	Contract,
	Signer,
	toBeHex,
	Overrides,
	ZeroAddress,
	TransactionResponse,
	TransactionRequest
} from 'ethers';
import { Keypair, SystemProgram } from '@solana/web3.js';
import type { Quote } from '../types';
import {
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById, getGasDecimal,
} from '../utils';
import MayanSwiftArtifact from './MayanSwiftArtifact';
import addresses from '../addresses';
import { Buffer } from 'buffer';


export type SwiftOrderParams = {
	tokenOut: string;
	minAmountOut: bigint;
	gasDrop: bigint;
	destAddr: string;
	destChainId: number;
	referrerAddr: string;
	referrerBps: number;
	auctionMode: 1 | 2;
	random: string;
	destEmitter: string;
};

export type EvmSwiftParams = {
	contractAddress: string;
	trader: string;
	tokenIn: string;
	amountIn: bigint;
	order: SwiftOrderParams;
};

export async function getEvmSwiftParams(
	quote: Quote, swapperAddress: string, destinationAddress: string, referrerAddress: string | null | undefined,
	signerChainId: number | string
): Promise<EvmSwiftParams> {
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	const destChainId = getWormholeChainIdByName(quote.toChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`);
	}
	const tokenIn = quote.fromToken.contract;
	const amountIn = getAmountOfFractionalAmount(
		quote.effectiveAmountIn,
		quote.fromToken.decimals
	);
	let referrerHex: string;
	if (referrerAddress) {
		referrerHex = nativeAddressToHexString(
			referrerAddress,
			destChainId
		);
	} else {
		referrerHex = nativeAddressToHexString(
			SystemProgram.programId.toString(),
			1
		);
	}
	const contractAddress = addresses.SWIFT_EVM_CONTRACT;
	const randomKey = nativeAddressToHexString(Keypair.generate().publicKey.toString(), 1);
	const destEmitter = nativeAddressToHexString(SystemProgram.programId.toString(), 1);
	const tokenOut = quote.toToken.contract === ZeroAddress ? nativeAddressToHexString(SystemProgram.programId.toString(), 1) : nativeAddressToHexString(quote.toToken.contract, quote.toToken.wChainId);
	const minAmountOut = getAmountOfFractionalAmount(
		quote.minAmountOut,
		Math.min(8, quote.toToken.decimals)
	);
	const gasDrop = getAmountOfFractionalAmount(
		quote.gasDrop,
		Math.min(8, getGasDecimal(quote.toChain))
	);
	const destinationAddressHex = nativeAddressToHexString(destinationAddress, getWormholeChainIdByName(quote.toChain));
	const orderParams: SwiftOrderParams = {
		tokenOut,
		minAmountOut,
		gasDrop,
		destAddr: destinationAddressHex,
		destChainId,
		referrerAddr: referrerHex,
		referrerBps: quote.referrerBps || 0,
		auctionMode: 2, // Swift token
		random: randomKey,
		destEmitter,
	};
	return {
		contractAddress,
		trader: swapperAddress,
		tokenIn,
		amountIn,
		order: orderParams
	};
}

export async function getSwiftFromEvmTxPayload(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined,
	signerChainId: number | string
): Promise<TransactionRequest> {
	const {
		tokenIn,
		amountIn,
		trader,
		order,
		contractAddress
	} = await getEvmSwiftParams(
		quote,
		swapperAddress,
		destinationAddress,
		referrerAddress,
		signerChainId
	);
	let data: string;
	let value: string | null;
	const mayanSwift = new Contract(addresses.SWIFT_EVM_CONTRACT, MayanSwiftArtifact.abi);
	if (tokenIn === ZeroAddress) {
		data = mayanSwift.interface.encodeFunctionData(
			'createOrderWithEth',
			[trader, order]
		);
		value = toBeHex(amountIn);
	} else {
		data = mayanSwift.interface.encodeFunctionData(
			'createOrderWithToken',
			[
				tokenIn,
				amountIn,
				trader,
				order,
			]
		);
		value = toBeHex(0);
	}
	return {
		to: contractAddress,
		data,
		value
	};
}


export async function swiftFromEvm(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddress: string | null | undefined,
	signer: Signer, signerChainId: number, overrides?: Overrides
): Promise<TransactionResponse>{
	const params = await getEvmSwiftParams(
		quote,
		swapperAddress,
		destinationAddress,
		referrerAddress,
		signerChainId
	);
	const mayanSwift = new Contract(addresses.SWIFT_EVM_CONTRACT, MayanSwiftArtifact.abi, signer);
	if (params.tokenIn === ZeroAddress) {
		if (!overrides) {
			overrides = {
				value: params.amountIn
			};
		} else {
			overrides.value = params.amountIn;
		}
		return mayanSwift.createOrderWithEth(
			params.trader,
			params.order,
			overrides
		);
	} else {
		if (!overrides) {
			overrides = {
				value: 0
			};
		}
		return mayanSwift.createOrderWithToken(
			params.tokenIn,
			params.amountIn,
			params.trader,
			params.order,
			overrides
		);
	}
}

export async function swiftUnlockFundsEvm(
	vaa: Uint8Array | Buffer | string, signer: Signer, overrides?: Overrides
): Promise<TransactionResponse> {
	const contract = new Contract(addresses.SWIFT_EVM_CONTRACT, MayanSwiftArtifact.abi, signer);
	let vaaHex: string;
	if (typeof vaa === 'string') {
		vaaHex = vaa.startsWith('0x') ? vaa : `0x${vaa}`;
	} else {
		vaaHex = `0x${Buffer.from(vaa).toString('hex')}`;
	}
	if (!overrides) {
		return contract.unlockOrder(vaaHex);
	}
	return contract.unlockOrder(vaaHex, overrides);
}
