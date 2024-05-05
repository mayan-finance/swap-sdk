import {
	Contract,
	Signer,
	toBeHex,
	Overrides,
	ZeroAddress,
	TransactionResponse,
	TransactionRequest
} from 'ethers';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import type {Erc20Permit, Quote, ReferrerAddresses} from '../types';
import {
	getAssociatedTokenAddress,
	nativeAddressToHexString,
	getAmountOfFractionalAmount, getWormholeChainIdByName,
	getWormholeChainIdById, getGasDecimal, getEvmChainIdByName,
	getQuoteSuitableReferrerAddress, ZeroPermit
} from '../utils';
import MayanSwapArtifact from './MayanSwapArtifact';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import addresses from '../addresses';
import { Buffer } from 'buffer';
import { getMctpFromEvmTxPayload } from './evmMctp';
import { getSwiftFromEvmTxPayload } from './evmSwift';

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
	quote: Quote, destinationAddress: string,
	referrerAddress: string | null | undefined,
	signerAddress: string, signerChainId: string | number,
	payload?: Uint8Array | Buffer | null
): Promise<EvmSwapParams> {
	const mayanProgram = new PublicKey(addresses.MAYAN_PROGRAM_ID);
	const [mayanMainAccount] = await PublicKey.findProgramAddress(
		[Buffer.from('MAIN')], mayanProgram);
	const recipient = getAssociatedTokenAddress(
		new PublicKey(quote.fromToken.mint),
		mayanMainAccount,
		true
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
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${fromChainId} !== ${signerWormholeChainId}`);
	}

	const contractAddress = quote.whMayanContract;

	const recipientStruct: Recipient = {
		mayanAddr: recipientHex,
		mayanChainId: 1,
		destAddr: nativeAddressToHexString(destinationAddress, destinationChainId),
		destChainId: destinationChainId,
		auctionAddr: auctionHex,
		referrer: referrerHex,
		refundAddr: nativeAddressToHexString(signerAddress, signerWormholeChainId)
	};

	const unwrapRedeem =
		quote.toToken.contract === ZeroAddress;

	const criteria: Criteria = {
		transferDeadline: BigInt(quote.deadline64),
		swapDeadline: BigInt(quote.deadline64),
		amountOutMin: getAmountOfFractionalAmount(
			quote.minAmountOut, Math.min(8, quote.toToken.decimals)
		),
		gasDrop: getAmountOfFractionalAmount(
			quote.gasDrop, Math.min(8, getGasDecimal(quote.toChain))
		),
		unwrap: unwrapRedeem,
		customPayload: payload ? `0x${Buffer.from(payload).toString('hex')}` : '0x'
	};

	const contractRelayerFees: ContractRelayerFees = {
		swapFee: getAmountOfFractionalAmount(quote.swapRelayerFee,
			Math.min(8, quote.fromToken.decimals)),
		redeemFee: getAmountOfFractionalAmount(quote.redeemRelayerFee,
			Math.min(8, quote.toToken.decimals)),
		refundFee: getAmountOfFractionalAmount(quote.refundRelayerFee,
			Math.min(8, quote.fromToken.decimals))
	};
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
		bridgeFee
	};
}

export async function getSwapFromEvmTxPayload(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddresses: ReferrerAddresses | null | undefined,
	signerAddress: string, signerChainId: number | string,
	payload: Uint8Array | Buffer | null | undefined,
	permit: Erc20Permit | null | undefined
): Promise<TransactionRequest> {

	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const fromChainId = getWormholeChainIdByName(quote.fromChain);
	if (fromChainId !== signerWormholeChainId) {
		throw new Error(`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${fromChainId} !== ${signerWormholeChainId}`);
	}

	const referrerAddress = getQuoteSuitableReferrerAddress(quote, referrerAddresses);

	if (quote.type === 'MCTP') {
		return getMctpFromEvmTxPayload(quote, destinationAddress, referrerAddress, signerChainId, permit);
	}
	if (quote.type === 'SWIFT') {
		return getSwiftFromEvmTxPayload(quote, swapperAddress, destinationAddress, referrerAddress, signerChainId, permit);
	}

	if (quote.type != 'WH') {
		throw new Error('Unsupported quote type');
	}

	if (!Number(quote.deadline64)) {
		throw new Error('WH mode requires a timeout');
	}
	const {
		relayerFees, recipient, tokenOut, tokenOutWChainId,
		criteria, tokenIn, amountIn, contractAddress, bridgeFee
	} = await getEvmSwapParams(
		quote, destinationAddress, referrerAddress,
		signerAddress, signerChainId, payload
	);

	const forwarderContract = new Contract(addresses.MAYAN_FORWARDER_CONTRACT, MayanForwarderArtifact.abi);
	const mayanSwap = new Contract(contractAddress, MayanSwapArtifact.abi);
	let data: string;
	let value: string | null;

	const _permit = permit || ZeroPermit;

	if (tokenIn === ZeroAddress) {
		const mayanCallData = mayanSwap.interface.encodeFunctionData(
			'wrapAndSwapETH',
			[relayerFees, recipient, tokenOut, tokenOutWChainId, criteria]
		);
		data = forwarderContract.interface.encodeFunctionData(
			'forwardEth',
			[contractAddress, mayanCallData],
		)
		value = toBeHex(amountIn);
	} else {
		console.log('mayan wh swap erc20', {relayerFees, recipient, tokenOut, tokenOutWChainId,
			criteria, tokenIn, amountIn});
		const mayanCallData = mayanSwap.interface.encodeFunctionData(
			'swap',
			[
				relayerFees, recipient, tokenOut, tokenOutWChainId,
				criteria, tokenIn, amountIn
			]
		);

		data = forwarderContract.interface.encodeFunctionData(
			'forwardERC20',
			[tokenIn, amountIn, _permit, contractAddress, mayanCallData]
		)
		value = toBeHex(bridgeFee);
	}
	return {
		to: addresses.MAYAN_FORWARDER_CONTRACT,
		data,
		value,
		chainId: signerChainId
	};
}
export async function swapFromEvm(
	quote: Quote, swapperAddress: string, destinationAddress: string,
	referrerAddresses: ReferrerAddresses | null | undefined,
	signer: Signer, permit: Erc20Permit | null | undefined,
	overrides: Overrides | null | undefined,
	payload: Uint8Array | Buffer | null | undefined
): Promise<TransactionResponse> {
	if (!signer.provider) {
		throw new Error('No provider found for signer');
	}
	const signerAddress = await signer.getAddress();
	if (signerAddress.toLowerCase() !== swapperAddress.toLowerCase()) {
		throw new Error('Signer address does not match swapper address');
	}
	const signerChainId = Number((await signer.provider.getNetwork()).chainId);

	const transactionRequest = await getSwapFromEvmTxPayload(
		quote, swapperAddress, destinationAddress, referrerAddresses,
		signerAddress, signerChainId, payload, permit
	);

	if (overrides?.gasLimit) {
		transactionRequest.gasLimit = overrides.gasLimit;
	} else if (quote.type === 'MCTP' || quote.type === 'SWIFT') {
		const estimatedGas = await signer.estimateGas(transactionRequest);
		transactionRequest.gasLimit = estimatedGas * BigInt(110) / BigInt(100);
	}
	transactionRequest.chainId = getEvmChainIdByName(quote.fromChain);
	return signer.sendTransaction(transactionRequest);
}

