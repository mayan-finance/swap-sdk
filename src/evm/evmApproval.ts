import {
	Contract,
	Interface,
	JsonRpcProvider,
	MaxUint256,
	Signature,
	Signer,
	type TransactionRequest,
	verifyTypedData,
	ZeroAddress,
} from 'ethers';
import type {
	ChainName,
	Erc20Permit,
	PermitDomain,
	PermitValue,
	Quote,
} from '../types';
import { getEvmChainIdByName, getPermitParams, PermitTypes } from '../utils';
import { loadBlinkOrder } from '../blink/order';
import {
	allowsBlinkDirectTransfer,
	type BlinkDirectTransferOption,
	getBlinkEvmDepositSpender,
	PERMIT_DEADLINE_SECS,
	PERMIT_MIN_LIFETIME_SECS,
} from './evmBlink';
import ERC20Artifact from './ERC20Artifact';
import MayanForwarderArtifact from './MayanForwarderArtifact';
import addresses from '../addresses';

const USDT_ETHEREUM = '0xdac17f958d2ee523a2206206994597c13d831ec7';

/** Source chains whose swaps spend no ERC20 allowance */
const NO_ALLOWANCE_CHAINS: ChainName[] = [
	'solana',
	'fogo',
	'sui',
	'aptos',
	'ton',
	'hypercore',
];

const erc20Interface = new Interface(ERC20Artifact.abi);

/**
 * What the user approves before an EVM swap can spend the input token. Every quote type
 * resolves to this shape, so a UI does not need to know which contract pulls the tokens.
 */
export type EvmSwapApproval = {
	/** The input token */
	token: string;
	/** The allowance the swap spends */
	amount: bigint;
	/** The contract an approve transaction names */
	spender: string;
	/** The contract an EIP-2612 permit names; differs from `spender` only for some Blink deposits */
	permitSpender: string;
	/** What an approve transaction or a permit grants: `amount`, or unlimited for Permit2 */
	approveAmount: bigint;
};

/** An EIP-2612 permit as EIP-712 typed data, ready for `signTypedData` */
export type EvmSwapPermitParams = {
	domain: PermitDomain;
	types: typeof PermitTypes;
	value: PermitValue;
};

/**
 * What `owner` approves before swapping the quote from an EVM chain, or `null` when the swap
 * spends no allowance: a native or non-EVM input, a HyperCore withdrawal, or a Blink deposit
 * `owner` sends as a direct transfer (with `options.allowBlinkEvmDirectTransfer`, see
 * `allowsBlinkDirectTransfer`). `provider` must be on the quote's source chain.
 */
export async function getEvmSwapApproval(
	quote: Quote,
	owner: string,
	provider: JsonRpcProvider,
	options?: BlinkDirectTransferOption
): Promise<EvmSwapApproval | null> {
	if (
		NO_ALLOWANCE_CHAINS.includes(quote.fromChain) ||
		quote.fromToken.contract === ZeroAddress
	) {
		return null;
	}
	await assertProviderChain(quote, provider);
	const token = quote.fromToken.contract;
	const amount = BigInt(quote.effectiveAmountIn64);

	if (quote.type === 'BLINK' && quote.gasless) {
		// Blink pulls gasless deposits through Permit2, which takes an unlimited allowance once
		const permit2 = addresses.BLINK_PERMIT2_ADDRESS;
		return {
			token,
			amount,
			spender: permit2,
			permitSpender: permit2,
			approveAmount: MaxUint256,
		};
	}
	if (quote.type === 'BLINK') {
		const order = await loadBlinkOrder(quote);
		const directTransfer = await allowsBlinkDirectTransfer(
			quote,
			owner,
			provider,
			options?.allowBlinkEvmDirectTransfer
		);
		const spender = getBlinkEvmDepositSpender(order, false, directTransfer);
		if (!spender) {
			return null;
		}
		const permitSpender = getBlinkEvmDepositSpender(order, true)!;
		return { token, amount, spender, permitSpender, approveAmount: amount };
	}
	const spender =
		quote.type === 'SWIFT' && quote.gasless
			? await getSwiftGaslessSpender(quote, provider)
			: addresses.MAYAN_FORWARDER_CONTRACT;
	return {
		token,
		amount,
		spender,
		permitSpender: spender,
		approveAmount: amount,
	};
}

/**
 * Whether `owner` can swap the quote without approving first: the swap spends no allowance, the
 * current allowance covers it, or `permit` (from {@link signEvmSwapPermit}) grants it.
 */
export async function isEvmSwapAllowanceEnough(
	quote: Quote,
	owner: string,
	provider: JsonRpcProvider,
	permit?: Erc20Permit | null,
	options?: BlinkDirectTransferOption
): Promise<boolean> {
	const approval = await getEvmSwapApproval(quote, owner, provider, options);
	if (!approval) {
		return true;
	}
	if (
		(await getAllowance(approval.token, owner, approval.spender, provider)) >=
		approval.amount
	) {
		return true;
	}
	return (
		!!permit && (await isPermitValid(quote, approval, owner, permit, provider))
	);
}

/**
 * The EIP-2612 permit the swap takes in place of an approve transaction, as typed data to sign
 * wherever the wallet is. Its signature (v, r, s) with `value.value` and `value.deadline` is the
 * `permit` for the swap. `null` when the swap spends no allowance or the token cannot sign a
 * permit; use {@link getEvmSwapApproveTxs} then.
 */
export async function getEvmSwapPermitParams(
	quote: Quote,
	owner: string,
	provider: JsonRpcProvider,
	deadline: number = nowSecs() + PERMIT_DEADLINE_SECS,
	options?: BlinkDirectTransferOption
): Promise<EvmSwapPermitParams | null> {
	const approval = await getEvmSwapApproval(quote, owner, provider, options);
	if (!approval || !quote.fromToken.supportsPermit) {
		return null;
	}
	return getPermitParams(
		quote.fromToken,
		owner,
		approval.permitSpender,
		approval.approveAmount,
		provider,
		BigInt(deadline)
	).catch((err) => {
		// The token's EIP-712 domain was not recognised, so it cannot sign a permit
		if (err?.mayanError?.permitIssue) {
			return null;
		}
		throw err;
	});
}

/**
 * Signs {@link getEvmSwapPermitParams} with `signer`: one wallet pop-up and no gas. Pass the
 * result to `swapFromEvm` as `permit`. `null` when no permit is possible.
 */
export async function signEvmSwapPermit(
	quote: Quote,
	signer: Signer,
	options?: BlinkDirectTransferOption
): Promise<Erc20Permit | null> {
	const provider = signer.provider as JsonRpcProvider | null;
	if (!provider) {
		throw new Error('No provider found for signer');
	}
	const params = await getEvmSwapPermitParams(
		quote,
		await signer.getAddress(),
		provider,
		undefined,
		options
	);
	if (!params) {
		return null;
	}
	const { v, r, s } = Signature.from(
		await signer.signTypedData(params.domain, params.types, params.value)
	);
	return {
		value: BigInt(params.value.value),
		deadline: Number(params.value.deadline),
		v,
		r,
		s,
	};
}

/**
 * The approve transactions that let the swap spend the input token, for a token or a wallet
 * that cannot sign a permit. Usually one; send them in order, each once the previous one is
 * mined. Empty when the swap spends no allowance.
 */
export async function getEvmSwapApproveTxs(
	quote: Quote,
	owner: string,
	provider: JsonRpcProvider,
	options?: BlinkDirectTransferOption
): Promise<TransactionRequest[]> {
	const approval = await getEvmSwapApproval(quote, owner, provider, options);
	if (!approval) {
		return [];
	}
	return getErc20ApproveTxs(
		quote.fromChain,
		approval.token,
		owner,
		approval.spender,
		approval.approveAmount,
		provider
	);
}

/**
 * The transactions that approve `spender` for `amount` of `token`: one, or two for USDT on
 * Ethereum when its allowance is not zero, since it refuses to change a non-zero allowance.
 */
export async function getErc20ApproveTxs(
	chain: ChainName,
	token: string,
	owner: string,
	spender: string,
	amount: bigint,
	provider: JsonRpcProvider
): Promise<TransactionRequest[]> {
	const approve = (value: bigint) => ({
		to: token,
		data: erc20Interface.encodeFunctionData('approve', [spender, value]),
		value: '0x0',
	});
	const isUsdt = chain === 'ethereum' && token.toLowerCase() === USDT_ETHEREUM;
	if (
		isUsdt &&
		(await getAllowance(token, owner, spender, provider)) > BigInt(0)
	) {
		return [approve(BigInt(0)), approve(amount)];
	}
	return [approve(amount)];
}

/** The Swift contract of a gasless order, checked against the forwarder's list of Mayan protocols */
async function getSwiftGaslessSpender(
	quote: Quote,
	provider: JsonRpcProvider
): Promise<string> {
	const swift = quote.swiftMayanContract;
	if (!swift) {
		throw new Error('Swift contract not found in the quote');
	}
	const forwarder = new Contract(
		addresses.MAYAN_FORWARDER_CONTRACT,
		MayanForwarderArtifact.abi,
		provider
	);
	if (!(await forwarder.mayanProtocols(swift))) {
		throw new Error(`${swift} is not a registered Mayan protocol`);
	}
	return swift;
}

/**
 * Whether `permit` is `owner`'s permit for the approval: signed for its permit spender and
 * amount over the token's current nonce, with time left before its deadline.
 */
async function isPermitValid(
	quote: Quote,
	approval: EvmSwapApproval,
	owner: string,
	permit: Erc20Permit,
	provider: JsonRpcProvider
): Promise<boolean> {
	if (
		permit.value !== approval.approveAmount ||
		permit.deadline < nowSecs() + PERMIT_MIN_LIFETIME_SECS
	) {
		return false;
	}
	try {
		const { domain, types, value } = await getPermitParams(
			quote.fromToken,
			owner,
			approval.permitSpender,
			permit.value,
			provider,
			BigInt(permit.deadline)
		);
		const signer = verifyTypedData(domain, types, value, {
			v: permit.v,
			r: permit.r,
			s: permit.s,
		});
		return signer.toLowerCase() === owner.toLowerCase();
	} catch {
		// The token cannot sign a permit, or the signature is malformed
		return false;
	}
}

async function assertProviderChain(
	quote: Quote,
	provider: JsonRpcProvider
): Promise<void> {
	const chainId = Number((await provider.getNetwork()).chainId);
	if (chainId !== getEvmChainIdByName(quote.fromChain)) {
		throw new Error(
			`Provider is on chain ${chainId}, not on the quote's source chain ${quote.fromChain}`
		);
	}
}

async function getAllowance(
	token: string,
	owner: string,
	spender: string,
	provider: JsonRpcProvider
): Promise<bigint> {
	return new Contract(token, ERC20Artifact.abi, provider).allowance(
		owner,
		spender
	);
}

function nowSecs(): number {
	return Math.floor(Date.now() / 1000);
}
