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
import type { BlinkOrder, ChainReferrers, Erc20Permit, EvmForwarderParams, Quote, ReferrerAddresses } from '../types';
import { getPermitDomain, getWormholeChainIdById, getWormholeChainIdByName } from '../utils';
import { resolveBlinkOrder, needsBlinkSourceSwap } from '../blink/order';
import { submitBlinkGaslessOrder } from '../api';
import ERC20Artifact from './ERC20Artifact';
import addresses from '../addresses';

const PERMIT_DEADLINE_SECS = 1800;

const blinkRouterInterface = new Interface([
	'function depositNative(bytes32 quoteHash)',
	'function depositToken(bytes32 quoteHash, address token, uint256 amount)',
	'function depositTokenWithPermit(bytes32 quoteHash, address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
	'function depositWithSwap(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address lockToken, uint256 minLockAmount)',
	'function depositWithSwapAndPermit(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address lockToken, uint256 minLockAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
	'function swapAndForward(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address dstToken, uint256 minAmountOut, uint256 amountOut, uint16 referrerBps, address recipient)',
	'function swapAndForwardWithPermit(bytes32 quoteHash, address srcToken, uint256 amountIn, address aggregator, bytes swapData, address dstToken, uint256 minAmountOut, uint256 amountOut, uint16 referrerBps, address recipient, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
]);

const erc20Interface = new Interface(ERC20Artifact.abi);

export function isNativeBlinkEvmToken(address: string): boolean {
	return /^0x0*$/i.test(address);
}

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
		!needsBlinkSourceSwap(params)
	);
}

function referrerTotalBps(referrers: { bps: number }[]): number {
	return referrers.reduce((total, r) => total + r.bps, 0);
}

/**
 * The transaction that deposits the order into the Blink router. A permit signed with the
 * router as spender is appended to the ERC20 variants; without one the router must already be
 * approved. When the quote allows it an ERC20 order becomes a plain transfer to the router with
 * the quote hash appended, which needs no approval at all.
 */
export function buildBlinkEvmDepositCall(order: BlinkOrder, permit?: Erc20Permit | null): BlinkEvmDepositCall {
	const { quoteHash, orderParams: params } = order.quote;
	const amountIn = BigInt(params.expectedAmountIn);
	const native = isNativeBlinkEvmToken(params.srcToken);
	const swap = order.swap;

	if (native && permit) {
		throw new Error('Native Blink deposits do not take a permit');
	}
	if (swap && !swap.evm) {
		throw new Error('Blink returned swap instructions that are not for EVM');
	}

	if (!permit && usesBlinkDirectTransfer(order)) {
		const transfer = erc20Interface.encodeFunctionData('transfer', [params.routerAddress, amountIn]);
		return { to: params.srcToken, data: transfer + quoteHash.slice(2), value: BigInt(0) };
	}

	let method: string;
	let args: any[];
	let value = BigInt(0);
	if (!swap || !swap.evm) {
		if (native) {
			method = 'depositNative';
			args = [quoteHash];
			value = amountIn;
		} else {
			method = permit ? 'depositTokenWithPermit' : 'depositToken';
			args = [quoteHash, params.srcToken, amountIn];
		}
	} else if (params.srcChain === params.dstChain) {
		method = permit ? 'swapAndForwardWithPermit' : 'swapAndForward';
		args = [
			quoteHash,
			params.srcToken,
			amountIn,
			swap.evm.aggregator,
			swap.evm.swapCalldata,
			params.dstToken,
			BigInt(params.minAmountOut),
			BigInt(params.expectedAmountOut),
			referrerTotalBps(params.referrers),
			params.recipient,
		];
		value = BigInt(swap.evm.value);
	} else {
		method = permit ? 'depositWithSwapAndPermit' : 'depositWithSwap';
		args = [
			quoteHash,
			swap.srcToken,
			BigInt(swap.amountIn),
			swap.evm.aggregator,
			swap.evm.swapCalldata,
			swap.lockToken,
			BigInt(swap.minLockAmount),
		];
		value = BigInt(swap.evm.value);
	}
	if (permit) {
		args.push(BigInt(permit.deadline), permit.v, permit.r, permit.s);
	}

	const to = swap ? swap.routerAddress : permit ? order.contracts.router : params.routerAddress;
	return { to, data: blinkRouterInterface.encodeFunctionData(method, args), value };
}

function assertSignerChain(quote: Quote, signerChainId: number | string): number {
	if (!Number.isFinite(Number(signerChainId))) {
		throw new Error('Invalid signer chain id');
	}
	const signerWormholeChainId = getWormholeChainIdById(Number(signerChainId));
	const sourceChainId = getWormholeChainIdByName(quote.fromChain);
	if (sourceChainId !== signerWormholeChainId) {
		throw new Error(
			`Signer chain id(${Number(signerChainId)}) and quote from chain are not same! ${sourceChainId} !== ${signerWormholeChainId}`
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
	refundAddress?: string
): Promise<TransactionRequest & { _forwarder: EvmForwarderParams }> {
	if (quote.type !== 'BLINK') {
		throw new Error('Quote type is not BLINK');
	}
	if (quote.gasless) {
		throw new Error('Gasless Blink quotes are submitted through swapFromEvm');
	}
	const chainId = assertSignerChain(quote, signerChainId);
	const order = await resolveBlinkOrder(quote, refundAddress ?? swapperAddress, destinationAddress, referrerAddresses);
	const params = order.quote.orderParams;
	const permitCoversAmount =
		!!permit && !isNativeBlinkEvmToken(params.srcToken) && permit.value >= BigInt(params.expectedAmountIn);
	const call = buildBlinkEvmDepositCall(order, permitCoversAmount ? permit : null);
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
	swap?: { lockToken: string; minLockAmount: bigint }
) {
	const witnessType = swap ? 'BlinkSwapDeposit' : 'BlinkDeposit';
	const witnessFields = swap
		? [
				{ name: 'quoteHash', type: 'bytes32' },
				{ name: 'lockToken', type: 'address' },
				{ name: 'minLockAmount', type: 'uint256' },
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
				? { quoteHash, lockToken: swap.lockToken, minLockAmount: swap.minLockAmount }
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
	refundAddress?: string
): Promise<string> {
	if (quote.type !== 'BLINK' || !quote.gasless) {
		throw new Error('Quote is not a gasless BLINK quote');
	}
	if (!signer.provider) {
		throw new Error('No provider found for signer');
	}
	const chainId = assertSignerChain(quote, signerChainId);
	const order = await resolveBlinkOrder(quote, refundAddress ?? swapperAddress, destinationAddress, referrerAddresses);
	const params = order.quote.orderParams;
	if (isNativeBlinkEvmToken(params.srcToken)) {
		throw new Error('Gasless Blink deposits require an ERC20 input token');
	}
	const amountIn = BigInt(params.expectedAmountIn);
	const spender = order.contracts.router;
	const erc20 = new Contract(params.srcToken, ERC20Artifact.abi, signer.provider);
	const permit2Allowance: bigint = await erc20.allowance(swapperAddress, addresses.BLINK_PERMIT2_ADDRESS);
	const deadline = permitDeadline();
	// Permit2 needs an allowance on the token; sign an EIP-2612 permit for it when there is none
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
		needsBlinkSourceSwap(params) ? { lockToken: params.lockToken, minLockAmount: BigInt(params.minLockAmount) } : undefined
	);
	const signature = await signer.signTypedData(typedData.domain, typedData.types, typedData.value);
	await submitBlinkGaslessOrder({
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
