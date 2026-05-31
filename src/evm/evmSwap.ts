import {
	Contract,
	ethers,
	Overrides,
	Signer,
	toBeHex,
	TransactionRequest,
	TransactionResponse,
	ZeroAddress,
} from 'ethers';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import type {
	Erc20Permit,
	EvmForwarderParams,
	Quote,
	ReferrerAddresses,
} from '../types';
import {
	getAmountOfFractionalAmount,
	getAssociatedTokenAddress,
	getEvmChainIdByName,
	getGasDecimal,
	getQuoteSuitableReferrerAddress,
	getWormholeChainIdById,
	getWormholeChainIdByName,
	nativeAddressToHexString,
	ZeroPermit,
} from '../utils';
import MayanSwapArtifact from './MayanSwapArtifact';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import ERC20Artifact from './ERC20Artifact';
import addresses from '../addresses';
import { Buffer } from 'buffer';
import { getMctpFromEvmTxPayload } from './evmMctp';
import {
	getSwiftFromEvmGasLessParams,
	getSwiftFromEvmTxPayload,
} from './evmSwift';
import { getEstimateGasEvm, submitSwiftEvmSwap } from '../api';
import { getFastMctpFromEvmTxPayload } from './evmFastMctp';
import {
	getHyperCoreDepositFromEvmTxPayload,
	getHyperCoreSwiftFromEvmGasLessParams,
} from './evmHyperCore';
import { getMonoChainFromEvmTxPayload } from './evmMonoChain';

export type ContractRelayerFees = {
	swapFee: bigint;
	redeemFee: bigint;
	refundFee: bigint;
};

export type Criteria = {
	transferDeadline: bigint;
	swapDeadline: bigint;
	amountOutMin: bigint;
	gasDrop: bigint;
	unwrap: boolean;
	customPayload: string;
};

export type Recipient = {
	mayanAddr: string;
	auctionAddr: string;
	referrer: string;
	destAddr: string;
	mayanChainId: number;
	destChainId: number;
	refundAddr: string;
};

export type EvmSwapParams = {
	contractAddress: string;
	relayerFees: ContractRelayerFees;
	recipient: Recipient;
	tokenOut: string;
	tokenOutWChainId: number;
	criteria: Criteria;
	tokenIn: string;
	amountIn: bigint;
	bridgeFee: bigint;
};

function getEvmSwapParams(
	quote: Quote,
	destinationAddress: string,
	referrerAddress: string | null | undefined,
	signerAddress: string,
	signerChainId: string | number,
	payload?: Uint8Array | Buffer | null
): EvmSwapParams {
	const mayanProgram = new PublicKey(addresses.MAYAN_PROGRAM_ID);
	const [mayanMainAccount] = PublicKey.findProgramAddressSync(
		[Buffer.from('MAIN')],
		mayanProgram
	);
	const recipient = getAssociatedTokenAddress(
		new PublicKey(quote.fromToken.mint),
		mayanMainAccount,
		true
	);
	const amountIn = BigInt(quote.effectiveAmountIn64);
	const recipientHex = nativeAddressToHexString(recipient.toString(), 1);
	const auctionHex = nativeAddressToHexString(addresses.AUCTION_PROGRAM_ID, 1);
	let referrerHex: string;
	if (referrerAddress) {
		referrerHex = nativeAddressToHexString(referrerAddress, 1);
	} else {
		referrerHex = nativeAddressToHexString(
			SystemProgram.programId.toString(),
			1
		);
	}
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const fromChainId = getWormholeChainIdByName(quote.fromChain);
	const destinationChainId = getWormholeChainIdByName(quote.toChain);
	if (fromChainId !== signerWormholeChainId) {
		throw new Error(
			`Signer chain id(${Number(
				signerChainId
			)}) and quote from chain are not same! ${fromChainId} !== ${signerWormholeChainId}`
		);
	}

	const contractAddress = quote.whMayanContract;

	const recipientStruct: Recipient = {
		mayanAddr: recipientHex,
		mayanChainId: 1,
		destAddr: nativeAddressToHexString(destinationAddress, destinationChainId),
		destChainId: destinationChainId,
		auctionAddr: auctionHex,
		referrer: referrerHex,
		refundAddr: nativeAddressToHexString(signerAddress, signerWormholeChainId),
	};

	const unwrapRedeem = quote.toToken.contract === ZeroAddress;

	const criteria: Criteria = {
		transferDeadline: BigInt(quote.deadline64),
		swapDeadline: BigInt(quote.deadline64),
		amountOutMin: getAmountOfFractionalAmount(
			quote.minAmountOut,
			Math.min(8, quote.toToken.decimals)
		),
		gasDrop: getAmountOfFractionalAmount(
			quote.gasDrop,
			Math.min(8, getGasDecimal(quote.toChain))
		),
		unwrap: unwrapRedeem,
		customPayload: payload ? `0x${Buffer.from(payload).toString('hex')}` : '0x',
	};

	const contractRelayerFees: ContractRelayerFees = {
		swapFee: getAmountOfFractionalAmount(
			quote.swapRelayerFee,
			Math.min(8, quote.fromToken.decimals)
		),
		redeemFee: getAmountOfFractionalAmount(
			quote.redeemRelayerFee,
			Math.min(8, quote.toToken.decimals)
		),
		refundFee: getAmountOfFractionalAmount(
			quote.refundRelayerFee,
			Math.min(8, quote.fromToken.decimals)
		),
	};
	if (!quote.toToken.realOriginContractAddress || !quote.toToken.realOriginChainId) {
		throw new Error('Missing toToken real origin contract address');
	}
	const tokenOut = nativeAddressToHexString(
		quote.toToken.realOriginContractAddress,
		quote.toToken.realOriginChainId
	);

	const bridgeFee = getAmountOfFractionalAmount(quote.bridgeFee, 18);
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
	};
}

export async function getSwapFromEvmTxPayload(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ReferrerAddresses | null | undefined,
	signerAddress: string,
	signerChainId: number | string,
	payload: Uint8Array | Buffer | null | undefined,
	permit: Erc20Permit | null | undefined,
	options?: {
		usdcPermitSignature?: string;
		apiKey?: string;
	}
): Promise<TransactionRequest & { _forwarder: EvmForwarderParams }> {
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const fromChainId = getWormholeChainIdByName(quote.fromChain);
	if (fromChainId !== signerWormholeChainId) {
		throw new Error(
			`Signer chain id(${Number(
				signerChainId
			)}) and quote from chain are not same! ${fromChainId} !== ${signerWormholeChainId}`
		);
	}

	const referrerAddress = getQuoteSuitableReferrerAddress(
		quote,
		referrerAddresses
	);

	if (quote.toChain === 'hypercore') {
		return getHyperCoreDepositFromEvmTxPayload(
			quote,
			swapperAddress,
			destinationAddress,
			referrerAddress,
			signerChainId,
			permit,
			payload,
			options
		);
	}

	if (quote.type === 'MCTP') {
		return getMctpFromEvmTxPayload(
			quote,
			destinationAddress,
			referrerAddress,
			signerChainId,
			permit,
			payload,
			options?.apiKey,
		);
	}
	if (quote.type === 'SWIFT') {
		return getSwiftFromEvmTxPayload(
			quote,
			swapperAddress,
			destinationAddress,
			referrerAddress,
			signerChainId,
			permit,
			payload,
			options?.apiKey,
		);
	}
	if (quote.type === 'SHUTTLE') {
		throw new Error('SHUTTLE quote type is not supported on EVM');
	}

	if (quote.type === 'FAST_MCTP') {
		return getFastMctpFromEvmTxPayload(
			quote,
			destinationAddress,
			referrerAddress,
			signerChainId,
			permit,
			payload,
			options?.apiKey
		);
	}

	if (quote.type === 'MONO_CHAIN') {
		return getMonoChainFromEvmTxPayload(
			quote,
			destinationAddress,
			referrerAddress,
			signerChainId,
			permit
		);
	}

	if (quote.type != 'WH') {
		throw new Error('Unsupported quote type');
	}

	if (!Number(quote.deadline64)) {
		throw new Error('WH mode requires a timeout');
	}
	const {
		relayerFees,
		recipient,
		tokenOut,
		tokenOutWChainId,
		criteria,
		tokenIn,
		amountIn,
		contractAddress,
		bridgeFee,
	} = getEvmSwapParams(
		quote,
		destinationAddress,
		referrerAddress,
		signerAddress,
		signerChainId,
		payload
	);

	const forwarderContract = new Contract(
		addresses.MAYAN_FORWARDER_CONTRACT,
		MayanForwarderArtifact.abi
	);
	const mayanSwap = new Contract(contractAddress, MayanSwapArtifact.abi);

	let forwarderMethod: string;
	let forwarderParams: any[];
	let value: string | null;

	const _permit = permit || ZeroPermit;

	if (tokenIn === ZeroAddress) {
		const mayanCallData = mayanSwap.interface.encodeFunctionData(
			'wrapAndSwapETH',
			[relayerFees, recipient, tokenOut, tokenOutWChainId, criteria]
		);
		forwarderMethod = 'forwardEth';
		forwarderParams = [contractAddress, mayanCallData];
		value = toBeHex(amountIn);
	} else {
		const mayanCallData = mayanSwap.interface.encodeFunctionData('swap', [
			relayerFees,
			recipient,
			tokenOut,
			tokenOutWChainId,
			criteria,
			tokenIn,
			amountIn,
		]);

		forwarderMethod = 'forwardERC20';
		forwarderParams = [
			tokenIn,
			amountIn,
			_permit,
			contractAddress,
			mayanCallData,
		];
		value = toBeHex(bridgeFee);
	}

	const data = forwarderContract.interface.encodeFunctionData(
		forwarderMethod,
		forwarderParams
	);
	return {
		to: addresses.MAYAN_FORWARDER_CONTRACT,
		data,
		value,
		chainId: signerChainId,
		_forwarder: {
			method: forwarderMethod,
			params: forwarderParams,
		},
	};
}

export async function swapFromEvm(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ReferrerAddresses | null | undefined,
	signer: Signer,
	permit: Erc20Permit | null | undefined,
	overrides: Overrides | null | undefined,
	payload: Uint8Array | Buffer | null | undefined,
	options?: {
		apiKey?: string;
		includeAllowanceTx?: boolean;
	}
): Promise<TransactionResponse | string> {
	if (!signer.provider) {
		throw new Error('No provider found for signer');
	}
	const signerAddress = await signer.getAddress();
	if (signerAddress.toLowerCase() !== swapperAddress.toLowerCase()) {
		throw new Error('Signer address does not match swapper address');
	}
	const signerChainId = Number((await signer.provider.getNetwork()).chainId);

	if (
		quote.type === 'SWIFT' &&
		quote.gasless
	) {
		const referrerAddress = getQuoteSuitableReferrerAddress(
			quote,
			referrerAddresses
		);
		const gasLessParams = quote.toChain === 'hypercore' ? getHyperCoreSwiftFromEvmGasLessParams(
			quote,
			swapperAddress,
			destinationAddress,
			referrerAddress,
			signerChainId,
			permit,
			payload,
		) : getSwiftFromEvmGasLessParams(
			quote,
			swapperAddress,
			destinationAddress,
			referrerAddress,
			signerChainId,
			permit,
			payload,
		);
		const signedOrderHash = await signer.signTypedData(
			gasLessParams.orderTypedData.domain,
			gasLessParams.orderTypedData.types,
			gasLessParams.orderTypedData.value
		);
		await submitSwiftEvmSwap(gasLessParams, signedOrderHash, options?.apiKey);
		return gasLessParams.orderHash;
	}
	const transactionRequest = await getSwapFromEvmTxPayload(
		quote,
		swapperAddress,
		destinationAddress,
		referrerAddresses,
		signerAddress,
		signerChainId,
		payload,
		permit,
		options
	);
	// @ts-ignore
	delete transactionRequest._forwarder;

	if (
		options?.includeAllowanceTx &&
		!quote.gasless &&
		quote.fromToken.contract !== ZeroAddress
	) {
		return handleAtomicBatch(
			quote,
			transactionRequest,
			signer,
			signerAddress,
			signerChainId,
		);
	}

	if (overrides?.gasPrice) {
		transactionRequest.gasPrice = overrides.gasPrice;
	}
	if (overrides?.maxFeePerGas) {
		transactionRequest.maxFeePerGas = overrides.maxFeePerGas;
	}
	if (overrides?.maxPriorityFeePerGas) {
		transactionRequest.maxPriorityFeePerGas = overrides.maxPriorityFeePerGas;
	}

	if (overrides?.gasLimit) {
		transactionRequest.gasLimit = overrides.gasLimit;
	} else {
		const estimatedGas = await signer.estimateGas(transactionRequest);
		// convert gasLimit to string for support ethers.js v5
		transactionRequest.gasLimit = String(
			(BigInt(String(estimatedGas)) * BigInt(110)) / BigInt(100)
		);
	}
	transactionRequest.chainId = getEvmChainIdByName(quote.fromChain);
	return signer.sendTransaction(transactionRequest);
}

export async function estimateQuoteRequiredGas(
	quote: Quote,
	swapperAddress: string,
	signer: Signer,
	permit: Erc20Permit | null | undefined,
	payload: Uint8Array | Buffer | null | undefined,
	options?: {
		usdcPermitSignature?: string;
		apiKey?: string;
	}
): Promise<bigint> {
	const signerAddress = await signer.getAddress();
	const sampleDestinationAddress: string =
		quote.toChain === 'solana'
			? 'ENsytooJVSZyNHbxvueUeX8Am8gcNqPivVVE8USCBiy5'
			: '0x1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a';
	const signerChainId = Number((await signer.provider!.getNetwork()).chainId);
	if (quote.type === 'SWIFT' && quote.gasless) {
		return BigInt(0);
	}
	const transactionRequest = await getSwapFromEvmTxPayload(
		quote,
		swapperAddress,
		sampleDestinationAddress,
		null,
		signerAddress,
		signerChainId,
		payload,
		permit,
		options,
	);
	// @ts-ignore
	delete transactionRequest._forwarder;

	let baseGas = await signer.estimateGas(transactionRequest);
	// make sure about baseGas type (ethers 5)
	baseGas = BigInt(String(baseGas));
	if (quote.type === 'MCTP' || quote.type === 'SWIFT') {
		return (baseGas * BigInt(110)) / BigInt(100);
	}
	return baseGas;
}

export async function estimateQuoteRequiredGasAprox(
	quote: Quote,
	provider: ethers.JsonRpcProvider,
	permit: Erc20Permit | null | undefined,
	payload: Uint8Array | Buffer | null | undefined,
	options?: {
		usdcPermitSignature?: string;
		apiKey?: string;
	},
): Promise<bigint> {
	const signerAddress = '0x1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a';
	const sampleDestinationAddress: string =
		quote.toChain === 'solana'
			? 'ENsytooJVSZyNHbxvueUeX8Am8gcNqPivVVE8USCBiy5'
			: '0x1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a';
	const signerChainId = quote?.fromToken?.chainId;
	if (quote.type === 'SWIFT' && quote.gasless) {
		return BigInt(0);
	}
	const transactionRequest = await getSwapFromEvmTxPayload(
		quote,
		signerAddress,
		sampleDestinationAddress,
		null,
		signerAddress,
		signerChainId,
		payload,
		permit,
		options,
	);
	// @ts-ignore
	delete transactionRequest._forwarder;

	return provider.estimateGas(transactionRequest);
}

export async function estimateQuoteRequiredGasAprox2(
	quote: Quote,
	payload: Uint8Array | Buffer | null | undefined,
	apiKey?: string,
): Promise<{
	estimateGas: bigint;
	gasPrice: bigint;
	requiredNative: bigint;
}> {
	const signerAddress = '0x1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a';
	const sampleDestinationAddress: string =
		quote.toChain === 'solana'
			? 'ENsytooJVSZyNHbxvueUeX8Am8gcNqPivVVE8USCBiy5'
			: quote.toChain === 'sui'
			? '0xcde6dbe01902be1f200ff03dbbd149e586847be8cee15235f82750d9b06c0e04'
			: '0x1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a';
	const signerChainId = getEvmChainIdByName(quote.fromChain);
	if (quote.type === 'SWIFT' && quote.gasless) {
		return {
			estimateGas: BigInt(0),
			gasPrice: BigInt(0),
			requiredNative: BigInt(0),
		}
	}
	const transactionRequest = await getSwapFromEvmTxPayload(
		quote,
		signerAddress,
		sampleDestinationAddress,
		null,
		signerAddress,
		signerChainId,
		payload,
		undefined,
		{
			apiKey,
		}
	);

	const { gasPrice, estimatedGas } =  await getEstimateGasEvm({
		from: signerAddress,
		chainId: signerChainId,
		tokenIn: quote.fromToken.contract,
		value: '0x' + BigInt(String(transactionRequest.value)).toString(16),
		data: transactionRequest.data as string,
		to: transactionRequest.to as string,
	});
	return {
		estimateGas: (estimatedGas * BigInt(110)) / BigInt(100),
		gasPrice: gasPrice,
		requiredNative: gasPrice * estimatedGas,
	};
}

function findCapsForChain(caps: any, chainId: number | string): any | undefined {
	if (!caps || typeof caps !== 'object') return undefined;
	const numericId = Number(chainId);
	if (!Number.isFinite(numericId)) return undefined;
	for (const key of Object.keys(caps)) {
		const parsed = key.startsWith('0x') ? parseInt(key, 16) : parseInt(key, 10);
		if (parsed === numericId) return caps[key];
	}
	return undefined;
}

// wallet_sendCalls returns a bundle id, not a tx hash. Poll wallet_getCallsStatus
// until the on-chain transaction hash is available so callers get a usable hash
// (matching the eth_sendTransaction path which returns a hash after broadcast).
async function waitForAtomicBatchTxHash(
	provider: { send: (method: string, params: unknown) => Promise<any> },
	id: string
): Promise<string> {
	const POLL_INTERVAL_MS = 1_000;
	const TIMEOUT_MS = 90_000;
	const start = Date.now();
	while (Date.now() - start < TIMEOUT_MS) {
		let res: any;
		try {
			res = await provider.send('wallet_getCallsStatus', [id]);
		} catch {
			// Wallet may not be ready to report status yet — retry until timeout.
		}
		const receipts = res?.receipts;
		const txHash =
			Array.isArray(receipts) && receipts.length > 0
				? receipts[receipts.length - 1]?.transactionHash
				: undefined;
		if (txHash) {
			return txHash;
		}
		// EIP-5792 v2.0.0 numeric status: 100 pending, 200 confirmed, 400 offchain
		// failure, 500 reverted. Anything >= 400 means the batch will not land.
		const status = res?.status;
		if (typeof status === 'number' && status >= 400) {
			throw new Error(`Atomic batch failed (status ${status})`);
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	throw new Error('Timed out waiting for atomic batch transaction hash');
}

async function handleAtomicBatch(
	quote: Quote,
	transactionRequest: TransactionRequest,
	signer: Signer,
	signerAddress: string,
	signerChainId: number | string,
): Promise<string> {
	const chainHex = '0x' + Number(signerChainId).toString(16);
	let caps: any;
	try {
		caps = await (signer.provider as any).send('wallet_getCapabilities', [
			signerAddress,
			[chainHex],
		]);
	} catch (e) {
		caps = undefined;
	}
	const chainCaps = findCapsForChain(caps, signerChainId);
	if (chainCaps?.atomic?.status !== 'supported') {
		throw new Error(
			'Wallet does not support atomic batching; cannot include allowance tx'
		);
	}
	const erc20Contract = new Contract(quote.fromToken.contract, ERC20Artifact.abi, signer);
	const approveCalls: Array<object> = [];
	const USDT_ETHEREUM_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
	if (quote.fromChain === 'ethereum' && quote.fromToken.contract.toLowerCase() === USDT_ETHEREUM_ADDRESS) {
		// USDT on Ethereum has a non-standard approve that requires resetting to zero first if the current allowance is non-zero.
		const currentAllowance: bigint = await erc20Contract.allowance(signerAddress, addresses.MAYAN_FORWARDER_CONTRACT);
		if (currentAllowance > BigInt(0)) {
			const resetData = erc20Contract.interface.encodeFunctionData('approve', [
				addresses.MAYAN_FORWARDER_CONTRACT,
				BigInt(0),
			]);
			approveCalls.push({
				to: quote.fromToken.contract,
				data: resetData,
				value: '0x0',
			});
		}
	}
	const approveData = erc20Contract.interface.encodeFunctionData('approve', [
		addresses.MAYAN_FORWARDER_CONTRACT,
		BigInt(quote.effectiveAmountIn64),
	]);
	approveCalls.push({
		to: quote.fromToken.contract,
		data: approveData,
		value: '0x0',
	});
	const callsParams = {
		version: '2.0.0',
		chainId: chainHex,
		from: signerAddress,
		atomicRequired: true,
		calls: [
			...approveCalls,
			{
				to: transactionRequest.to,
				data: transactionRequest.data as string,
				value: transactionRequest.value
					? toBeHex(BigInt(transactionRequest.value.toString()))
					: '0x0',
			},
		],
	};
	const sendResult: unknown = await (signer.provider as any).send(
		'wallet_sendCalls',
		[callsParams]
	);
	// EIP-5792 v2.0.0 returns { id }, earlier drafts returned a bare string.
	const batchId =
		typeof sendResult === 'string'
			? sendResult
			: (sendResult as { id?: string })?.id;
	if (!batchId) {
		throw new Error('wallet_sendCalls did not return a batch id');
	}
	// Resolve the bundle id to the real on-chain tx hash before returning.
	return waitForAtomicBatchTxHash(signer.provider as any, batchId);
}
