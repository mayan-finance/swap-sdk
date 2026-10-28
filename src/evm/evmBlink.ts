import {
	Contract,
	Interface,
	JsonRpcProvider,
	MaxUint256,
	Signer,
	hexlify,
	randomBytes,
	toBeHex,
	type TransactionRequest,
} from 'ethers';
import type { ChainReferrers, Erc20Permit, EvmForwarderParams, Quote, ReferrerAddresses } from '../types';
import { getPermitDomain, getWormholeChainIdById, getWormholeChainIdByName } from '../utils';
import { fetchBlinkOrder, isBlinkSourceSwap } from '../blink/order';
import { submitAndTrackBlinkGaslessOrder } from '../blink/gasless';
import type { BlinkOrder } from '../blink/types';
import ERC20Artifact from './ERC20Artifact';
import addresses from '../addresses';

const PERMIT_DEADLINE_SECS = 1800;

const blinkRouterInterface = new Interface([
	'function depositNative(bytes32 quoteHash)',
	'function depositToken(bytes32 quoteHash, address token, uint256 amount)',
	'function depositWithSwap(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address bridgeToken, uint256 minBridgeOut)',
	'function swapAndForward(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address dstToken, uint256 minAmountOut, uint256 amountOut, uint16 referrerBps, address recipient)',
	'function depositTokenWithPermit(bytes32 quoteHash, address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
	'function depositTokenWithPermit2(bytes32 quoteHash, address token, uint256 amount, uint256 nonce, uint256 deadline, bytes signature)',
	'function depositWithSwapAndPermit(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address bridgeToken, uint256 minBridgeOut, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
	'function depositWithSwapAndPermit2(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address bridgeToken, uint256 minBridgeOut, uint256 nonce, uint256 deadline, bytes signature)',
	'function swapAndForwardWithPermit(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address dstToken, uint256 minAmountOut, uint256 amountOut, uint16 referrerBps, address recipient, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
	'function swapAndForwardWithPermit2(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address dstToken, uint256 minAmountOut, uint256 amountOut, uint16 referrerBps, address recipient, uint256 nonce, uint256 deadline, bytes signature)',
]);

const erc20Interface = new Interface(ERC20Artifact.abi);

export function isNativeBlinkEvmToken(address: string): boolean {
	return /^0x0*$/i.test(address);
}

export type BlinkEvmDepositSignature =
	| { kind: 'permit'; deadline: bigint; v: number; r: string; s: string }
	| { kind: 'permit2'; nonce: bigint; deadline: bigint; signature: string };

export type BlinkEvmDepositCall = {
	to: string;
	data: string;
	value: bigint;
};

export function usesBlinkDirectTransfer(order: BlinkOrder): boolean {
	const params = order.quote.orderParams;
	return (
		order.quote.directTransfer &&
		!isNativeBlinkEvmToken(params.srcToken) &&
		params.srcChain !== params.dstChain &&
		!isBlinkSourceSwap(params)
	);
}

function referrerTotalBps(referrers: { bps: number }[]): number {
	return referrers.reduce((total, r) => total + r.bps, 0);
}

export function buildBlinkEvmDepositCall(order: BlinkOrder, signature?: BlinkEvmDepositSignature): BlinkEvmDepositCall {
	const { quoteHash, orderParams: params } = order.quote;
	const amountIn = BigInt(params.amountIn);
	const native = isNativeBlinkEvmToken(params.srcToken);
	if (!signature && usesBlinkDirectTransfer(order)) {
		return {
			to: params.srcToken,
			data: erc20Interface.encodeFunctionData('transfer', [params.routerAddress, amountIn]) + quoteHash.slice(2),
			value: BigInt(0),
		};
	}
	if (native && signature) {
		throw new Error('Native Blink deposits do not take a permit');
	}
	const sameChain = params.srcChain === params.dstChain;
	const swap = order.swap;
	if (swap && !swap.evm) {
		throw new Error('Blink returned swap instructions that are not for EVM');
	}
	const to = swap ? swap.routerAddress : signature ? order.contracts.router : params.routerAddress;
	const value = swap?.evm ? BigInt(swap.evm.value) : native ? amountIn : BigInt(0);
	const swapArgs = swap?.evm
		? sameChain
			? [
					quoteHash,
					params.srcToken,
					amountIn,
					swap.evm.aggregator,
					swap.evm.swapCalldata,
					params.dstToken,
					BigInt(params.minAmountOut),
					BigInt(params.amountOut),
					referrerTotalBps(params.referrers),
					params.recipient,
			  ]
			: [
					quoteHash,
					swap.srcToken,
					BigInt(swap.amountIn),
					swap.evm.aggregator,
					swap.evm.swapCalldata,
					swap.bridgeToken,
					BigInt(swap.minBridgeOut),
			  ]
		: null;
	const swapMethod = sameChain ? 'swapAndForward' : 'depositWithSwap';
	let data: string;
	if (!signature) {
		data = swapArgs
			? blinkRouterInterface.encodeFunctionData(swapMethod, swapArgs)
			: native
			? blinkRouterInterface.encodeFunctionData('depositNative', [quoteHash])
			: blinkRouterInterface.encodeFunctionData('depositToken', [quoteHash, params.srcToken, amountIn]);
	} else if (signature.kind === 'permit') {
		const permitArgs = [signature.deadline, signature.v, signature.r, signature.s];
		data = swapArgs
			? blinkRouterInterface.encodeFunctionData(`${swapMethod}AndPermit`, [...swapArgs, ...permitArgs])
			: blinkRouterInterface.encodeFunctionData('depositTokenWithPermit', [
					quoteHash,
					params.srcToken,
					amountIn,
					...permitArgs,
			  ]);
	} else {
		const permit2Args = [signature.nonce, signature.deadline, signature.signature];
		data = swapArgs
			? blinkRouterInterface.encodeFunctionData(`${swapMethod}AndPermit2`, [...swapArgs, ...permit2Args])
			: blinkRouterInterface.encodeFunctionData('depositTokenWithPermit2', [
					quoteHash,
					params.srcToken,
					amountIn,
					...permit2Args,
			  ]);
	}
	return { to, data, value };
}

function assertSignerChain(quote: Quote, signerChainId: number | string): number {
	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(
			`Signer chain id(${Number(
				signerChainId
			)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`
		);
	}
	return Number(signerChainId);
}

export async function getBlinkFromEvmTxPayload(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	signerChainId: number | string,
	permit: Erc20Permit | null | undefined,
	apiKey?: string
): Promise<TransactionRequest & { _forwarder: EvmForwarderParams }> {
	if (quote.type !== 'BLINK') {
		throw new Error('Quote type is not BLINK');
	}
	if (quote.gasless) {
		throw new Error('Gasless Blink quotes are submitted through swapFromEvm');
	}
	const chainId = assertSignerChain(quote, signerChainId);
	const order = await fetchBlinkOrder(quote, swapperAddress, destinationAddress, referrerAddresses, apiKey);
	const params = order.quote.orderParams;
	const usePermit = !!permit && !isNativeBlinkEvmToken(params.srcToken) && permit.value >= BigInt(params.amountIn);
	const call = buildBlinkEvmDepositCall(
		order,
		usePermit && permit
			? { kind: 'permit', deadline: BigInt(permit.deadline), v: permit.v, r: permit.r, s: permit.s }
			: undefined
	);
	return {
		to: call.to,
		data: call.data,
		value: toBeHex(call.value),
		chainId,
		_forwarder: {
			method: 'blink',
			params: [],
		},
	};
}

export function blinkPermit2WitnessTypedData(
	chainId: number,
	token: string,
	amount: bigint,
	spender: string,
	nonce: bigint,
	deadline: bigint,
	quoteHash: string,
	swap?: { bridgeToken: string; minBridgeOut: bigint }
) {
	const witnessType = swap ? 'BlinkSwapDeposit' : 'BlinkDeposit';
	const witnessFields = swap
		? [
				{ name: 'quoteHash', type: 'bytes32' },
				{ name: 'bridgeToken', type: 'address' },
				{ name: 'minBridgeOut', type: 'uint256' },
		  ]
		: [{ name: 'quoteHash', type: 'bytes32' }];
	return {
		domain: {
			name: 'Permit2',
			chainId,
			verifyingContract: addresses.BLINK_PERMIT2_ADDRESS,
		},
		types: {
			TokenPermissions: [
				{ name: 'token', type: 'address' },
				{ name: 'amount', type: 'uint256' },
			],
			PermitWitnessTransferFrom: [
				{ name: 'permitted', type: 'TokenPermissions' },
				{ name: 'spender', type: 'address' },
				{ name: 'nonce', type: 'uint256' },
				{ name: 'deadline', type: 'uint256' },
				{ name: 'witness', type: witnessType },
			],
			[witnessType]: witnessFields,
		},
		value: {
			permitted: { token, amount },
			spender,
			nonce,
			deadline,
			witness: swap
				? { quoteHash, bridgeToken: swap.bridgeToken, minBridgeOut: swap.minBridgeOut }
				: { quoteHash },
		},
	};
}

function permitDeadline(): bigint {
	return BigInt(Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECS);
}

async function signPermit2Approval(
	quote: Quote,
	signer: Signer,
	owner: string,
	deadline: bigint
): Promise<string> {
	const provider = signer.provider as JsonRpcProvider;
	let domain;
	try {
		domain = await getPermitDomain(quote.fromToken, provider);
	} catch (err) {
		throw new Error(
			`Gasless Blink deposits need a Permit2 allowance or an EIP-2612 permit for ${quote.fromToken.contract}`
		);
	}
	const erc20 = new Contract(quote.fromToken.contract, ERC20Artifact.abi, provider);
	const nonce: bigint = await erc20.nonces(owner);
	return signer.signTypedData(
		domain,
		{
			Permit: [
				{ name: 'owner', type: 'address' },
				{ name: 'spender', type: 'address' },
				{ name: 'value', type: 'uint256' },
				{ name: 'nonce', type: 'uint256' },
				{ name: 'deadline', type: 'uint256' },
			],
		},
		{
			owner,
			spender: addresses.BLINK_PERMIT2_ADDRESS,
			value: MaxUint256,
			nonce,
			deadline,
		}
	);
}

export async function swapBlinkGaslessFromEvm(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	signer: Signer,
	signerChainId: number | string,
	apiKey?: string
): Promise<string> {
	if (quote.type !== 'BLINK' || !quote.gasless) {
		throw new Error('Quote is not a gasless BLINK quote');
	}
	if (!signer.provider) {
		throw new Error('No provider found for signer');
	}
	const chainId = assertSignerChain(quote, signerChainId);
	const order = await fetchBlinkOrder(quote, swapperAddress, destinationAddress, referrerAddresses, apiKey);
	const params = order.quote.orderParams;
	if (isNativeBlinkEvmToken(params.srcToken)) {
		throw new Error('Gasless Blink deposits require an ERC20 input token');
	}
	const amountIn = BigInt(params.amountIn);
	const spender = order.contracts.router;
	const erc20 = new Contract(params.srcToken, ERC20Artifact.abi, signer.provider);
	const permit2Allowance: bigint = await erc20.allowance(swapperAddress, addresses.BLINK_PERMIT2_ADDRESS);
	const deadline = permitDeadline();
	const permitSignature =
		permit2Allowance < amountIn ? await signPermit2Approval(quote, signer, swapperAddress, deadline) : undefined;
	const nonce = BigInt(hexlify(randomBytes(32)));
	const typedData = blinkPermit2WitnessTypedData(
		chainId,
		params.srcToken,
		amountIn,
		spender,
		nonce,
		deadline,
		order.quote.quoteHash,
		isBlinkSourceSwap(params) ? { bridgeToken: params.bridgeTokenSrc, minBridgeOut: BigInt(params.minBridgeOut) } : undefined
	);
	const signature = await signer.signTypedData(typedData.domain, typedData.types, typedData.value);
	await submitAndTrackBlinkGaslessOrder({
		quoteHash: order.quote.quoteHash,
		evm: {
			owner: swapperAddress,
			permit2Nonce: nonce.toString(),
			deadline: deadline.toString(),
			signature,
			permitSignature,
		},
	});
	return order.quote.quoteHash;
}
