import {
	Contract,
	Interface,
	MaxUint256,
	type Provider,
	Signature,
	Signer,
	hexlify,
	randomBytes,
	toBeHex,
	type TransactionRequest,
} from 'ethers';
import type {
	BlinkEvmGaslessOrder,
	BlinkOrder,
	ChainReferrers,
	Erc20Permit,
	EvmForwarderParams,
	Quote,
	ReferrerAddresses,
} from '../types';
import { getWormholeChainIdById, getWormholeChainIdByName } from '../utils';
import { resolveBlinkOrder, needsBlinkSourceSwap } from '../blink/order';
import { submitBlinkGaslessOrder } from '../api';
import ERC20Artifact from './ERC20Artifact';
import addresses from '../addresses';

/** How long a permit or a Permit2 transfer signed by the SDK stays valid */
export const PERMIT_DEADLINE_SECS = 30 * 60;
/** A permit this close to its deadline is refused: a gasless Blink order expires with it */
export const PERMIT_MIN_LIFETIME_SECS = 5 * 60;

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

/**
 * The contract an EVM Blink deposit is sent to, apart from a direct transfer (the token
 * itself). Blink runs two deposit contracts per chain: the quote's `routerAddress` is the
 * escrow (`depositToken`, `depositNative`, plain transfers) and the permit and source-swap
 * variants live on the router of the guardian-signed manifest (`order.contracts.router`).
 * The two differ, so a permit must name the manifest router as spender, never
 * `quote.routerAddress`.
 */
function blinkEvmDepositTarget(order: BlinkOrder, permit: boolean): string {
	if (order.swap) {
		return order.swap.routerAddress;
	}
	// A source swap runs on the manifest router, which Blink's swap route names as well
	if (needsBlinkSourceSwap(order.quote.orderParams)) {
		return order.contracts.router;
	}
	return permit ? order.contracts.router : order.quote.orderParams.routerAddress;
}

/**
 * The address an ERC20 approval or an EIP-2612 permit for an EVM Blink deposit must name as
 * spender: the contract that pulls the tokens. `permit` says whether the deposit will carry a
 * permit (`depositTokenWithPermit` and friends on the manifest router) or rely on an allowance
 * (`depositToken` on the quote's `routerAddress`, the escrow). Returns `null` when nothing has
 * to be approved: a native input, or an order the SDK deposits by direct transfer (no permit).
 * An order from `loadBlinkOrder`, which has no swap route, gives the same answer.
 */
export function getBlinkEvmDepositSpender(order: BlinkOrder, permit: boolean): string | null {
	if (isNativeBlinkEvmToken(order.quote.orderParams.srcToken)) {
		return null;
	}
	if (!permit && usesBlinkDirectTransfer(order)) {
		return null;
	}
	return blinkEvmDepositTarget(order, permit);
}

function referrerTotalBps(referrers: { bps: number }[]): number {
	return referrers.reduce((total, r) => total + r.bps, 0);
}

/**
 * The transaction that deposits the order into Blink. A permit is appended to the ERC20
 * variants and must have been signed with `getBlinkEvmDepositSpender(order, true)` (the
 * manifest router) as spender; without one, `getBlinkEvmDepositSpender(order, false)` must
 * already be approved. When the quote allows it an ERC20 order becomes a plain transfer to the
 * escrow (`quote.routerAddress`) with the quote hash appended, which needs no approval at all.
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

	if (!swap && needsBlinkSourceSwap(params)) {
		throw new Error('Blink order needs its swap route to build the deposit: resolve it with resolveBlinkOrder');
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

	const to = blinkEvmDepositTarget(order, !!permit);
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

/**
 * The token permit that gives Permit2 its allowance. Blink's router submits it for the maximum
 * amount and with the order's deadline, so a permit for another amount would fail on-chain after
 * Blink accepted the order, and one about to expire would leave the relayer no time to deposit.
 */
function assertPermit2Permit(permit: Erc20Permit | null | undefined, token: string): Erc20Permit {
	if (!permit) {
		throw new Error(
			`Permit2 has no allowance for ${token}: pass the permit from signEvmSwapPermit, or approve Permit2 first`
		);
	}
	if (permit.value !== MaxUint256) {
		throw new Error('A permit for Permit2 must grant the maximum amount: sign it with signEvmSwapPermit');
	}
	if (permit.deadline < Math.floor(Date.now() / 1000) + PERMIT_MIN_LIFETIME_SECS) {
		throw new Error(`The permit for Permit2 expires in less than ${PERMIT_MIN_LIFETIME_SECS / 60} minutes: sign a new one`);
	}
	return permit;
}

/** A gasless Blink order from EVM, built but not signed */
export type BlinkGaslessEvmParams = {
	quoteHash: string;
	/** The Permit2 transfer of the input token, bound to the quote hash: what the user signs (EIP-712) */
	typedData: ReturnType<typeof blinkPermit2WitnessTypedData>;
	/** Submit with `submitBlinkGaslessOrder({ quoteHash, evm: { ...order, signature } })` */
	order: Omit<BlinkEvmGaslessOrder, 'signature'>;
};

/**
 * Builds a gasless Blink order without signing it, for integrators whose wallet signs
 * elsewhere. Permit2 needs an allowance on the token: without one, `permit` must be the token
 * permit for Permit2 (from `getEvmSwapPermitParams`), which Blink's relayer runs with the
 * deposit. `provider` must be on the quote's source chain.
 */
export async function getBlinkGaslessFromEvmParams(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	signerChainId: number | string,
	permit: Erc20Permit | null | undefined,
	provider: Provider,
	refundAddress?: string
): Promise<BlinkGaslessEvmParams> {
	if (quote.type !== 'BLINK' || !quote.gasless) {
		throw new Error('Quote is not a gasless BLINK quote');
	}
	const chainId = assertSignerChain(quote, signerChainId);
	const order = await resolveBlinkOrder(quote, refundAddress ?? swapperAddress, destinationAddress, referrerAddresses);
	const params = order.quote.orderParams;
	if (isNativeBlinkEvmToken(params.srcToken)) {
		throw new Error('Gasless Blink deposits require an ERC20 input token');
	}
	const amountIn = BigInt(params.expectedAmountIn);
	const erc20 = new Contract(params.srcToken, ERC20Artifact.abi, provider);
	const permit2Allowance: bigint = await erc20.allowance(swapperAddress, addresses.BLINK_PERMIT2_ADDRESS);
	const tokenPermit = permit2Allowance < amountIn ? assertPermit2Permit(permit, params.srcToken) : null;
	// Blink's router runs the token permit with the Permit2 deadline, so the order takes its deadline
	const deadline = tokenPermit ? BigInt(tokenPermit.deadline) : permitDeadline();
	const nonce = BigInt(hexlify(randomBytes(32)));
	const typedData = blinkPermit2WitnessTypedData(
		chainId,
		params.srcToken,
		amountIn,
		order.contracts.router,
		nonce,
		deadline,
		order.quote.quoteHash,
		needsBlinkSourceSwap(params) ? { lockToken: params.lockToken, minLockAmount: BigInt(params.minLockAmount) } : undefined
	);
	return {
		quoteHash: order.quote.quoteHash,
		typedData,
		order: {
			owner: swapperAddress,
			permit2Nonce: nonce.toString(),
			deadline: deadline.toString(),
			permitSignature: tokenPermit
				? Signature.from({ v: tokenPermit.v, r: tokenPermit.r, s: tokenPermit.s }).serialized
				: undefined,
		},
	};
}

/**
 * Submits a gasless Blink order. The user signs one message, the Permit2 transfer of the input
 * token bound to the quote hash, and Blink's relayer makes the deposit. Without a Permit2
 * allowance pass the token permit for Permit2 (`signEvmSwapPermit`), so the user still pays no gas.
 */
export async function swapBlinkGaslessFromEvm(
	quote: Quote,
	swapperAddress: string,
	destinationAddress: string,
	referrerAddresses: ChainReferrers | ReferrerAddresses | null | undefined,
	signer: Signer,
	signerChainId: number | string,
	permit: Erc20Permit | null | undefined,
	refundAddress?: string
): Promise<string> {
	if (!signer.provider) {
		throw new Error('No provider found for signer');
	}
	const { quoteHash, typedData, order } = await getBlinkGaslessFromEvmParams(
		quote,
		swapperAddress,
		destinationAddress,
		referrerAddresses,
		signerChainId,
		permit,
		signer.provider,
		refundAddress
	);
	const signature = await signer.signTypedData(typedData.domain, typedData.types, typedData.value);
	await submitBlinkGaslessOrder({ quoteHash, evm: { ...order, signature } });
	return quoteHash;
}
