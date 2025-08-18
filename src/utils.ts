import { ethers, zeroPadValue, parseUnits, formatUnits, TypedDataEncoder, JsonRpcProvider } from 'ethers';
import {PublicKey, SystemProgram} from '@solana/web3.js';
import { Buffer } from 'buffer';
import addresses  from './addresses';
import { ChainName, Erc20Permit, Quote, ReferrerAddresses, Token, PermitDomain, PermitValue } from './types';
import ERC20Artifact from './evm/ERC20Artifact';
import * as sha3 from 'js-sha3';
import { CCTP_TOKEN_DECIMALS } from './cctp';
import { checkHyperCoreDeposit } from './api';
const sha3_256 = sha3.sha3_256;

export const isValidAptosType = (str: string): boolean =>
	/^(0x)?[0-9a-fA-F]+::\w+::\w+$/.test(str);

export function nativeAddressToHexString(
	address: string, wChainId: number) : string {
	if (wChainId === 1) {
		return zeroPadValue(new PublicKey(address).toBytes(), 32);
	} else if (
		wChainId === chains.ethereum || wChainId === chains.bsc || wChainId === chains.polygon ||
		wChainId === chains.avalanche  || wChainId === chains.arbitrum || wChainId === chains.optimism ||
		wChainId === chains.base || wChainId === chains.unichain || wChainId === chains.linea ||
		wChainId === chains.sonic || wChainId === chains.hyperevm
	) {
		return zeroPadValue(address, 32);
	} else if (wChainId === chains.aptos && isValidAptosType(address)) {
		return `0x${sha3_256(address)}`
	} else if (wChainId === chains.sui) {
		let addressStr = address.startsWith('0x') ? address.substring(2) : address;
		if (Buffer.from(addressStr, 'hex').length !== 32) {
			throw new Error('Invalid sui address: ' + address);
		}
		return zeroPadValue(address, 32);
	} else {
		console.log(`Unsupported chain id: ${wChainId}`, address);
		throw new Error('Unsupported token chain');
	}
}

export function hexToUint8Array(input: string): Uint8Array {
	return new Uint8Array(
		Buffer.from(
			input.startsWith('0x') ? input.substring(2) : input,
			"hex"
		)
	);
}

export function getAssociatedTokenAddress(
	mint: PublicKey,
	owner: PublicKey,
	allowOwnerOffCurve = false,
	programId = new PublicKey(addresses.TOKEN_PROGRAM_ID),
	associatedTokenProgramId = new PublicKey(addresses.ASSOCIATED_TOKEN_PROGRAM_ID)
): PublicKey {
	if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) {
		throw new Error('TokenOwnerOffCurveError');
	}

	const [address] = PublicKey.findProgramAddressSync(
		[owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
		associatedTokenProgramId
	);

	return address;
}

function isValidNumericInput(value: any): boolean {
	return (
		(typeof value === 'string' || typeof value === 'number') &&
		value !== '' &&
		value !== null &&
		!isNaN(Number(value)) &&
		Number.isFinite(Number(value))
	);
}

export function getAmountOfFractionalAmount(
	amount: string | number, decimals: string | number) : bigint {
	if (amount === null || amount === undefined) {
		throw new Error('getAmountOfFractionalAmount: Amount is null or undefined');
	}
	if (typeof amount !== 'string' && typeof amount !== 'number') {
		throw new Error('getAmountOfFractionalAmount: Amount is not a string or number');
	}
	if (typeof amount === 'string' && amount.length === 0) {
		throw new Error('getAmountOfFractionalAmount: Amount is empty');
	}
	if (!Number.isFinite(Number(amount))) {
		throw new Error('getAmountOfFractionalAmount: Amount is not a number');
	}
	if (!isValidNumericInput(decimals)) {
		throw new Error('getAmountOfFractionalAmount: decimals is not a number');
	}
	const cutFactor = Math.min(8, Number(decimals));
	const numStr = Number(amount).toFixed(cutFactor + 1);
	const reg = new RegExp(`^-?\\d+(?:\\.\\d{0,${cutFactor}})?`);
	const matchResult = numStr.match(reg);
	if (!matchResult) {
		throw new Error('getAmountOfFractionalAmount: fixedAmount is null');
	}
	const fixedAmount = matchResult[0];
	return parseUnits(fixedAmount, Number(decimals))
}

export function getDisplayAmount(
	inputAmount: ethers.BigNumberish, decimals: string | ethers.BigNumberish) : number {
	return  Number(formatUnits(inputAmount, decimals))
}

const chains: { [index in ChainName]: number }  = {
	solana: 1,
	ethereum: 2,
	bsc: 4,
	polygon: 5,
	avalanche: 6,
	arbitrum: 23,
	optimism: 24,
	base: 30,
	aptos: 22,
	sui: 21,
	unichain: 44,
	linea: 38,
	hypercore: 65000,
	sonic: 52,
	hyperevm: 47,
};

export function getWormholeChainIdByName(chain: string) : number | null {
	return chains[chain];
}

const evmChainIdMap: { [index: string]: number }  = {
	[1]: 2,
	[56]: 4,
	[137]: 5,
	[43114]: 6,
	[42161]: 23,
	[10]: 24,
	[8453]: 30,
	[130]: 44,
	[59144]: 38,
	[146]: 52,
	[999]: 47,
};

export function getEvmChainIdByName(chain: ChainName) {
	const wormholeChainId = chains[chain];
	const evmIds = Object.keys(evmChainIdMap);
	for (const evmId of evmIds) {
		if (evmChainIdMap[evmId] === wormholeChainId) {
			return Number(evmId);
		}
	}
	throw new Error(`Unsupported chain: ${chain}`);
}



export function getWormholeChainIdById(chainId: number) : number | null {
	return evmChainIdMap[chainId];
}

const sdkVersion = [11, 0, 0];

export function getSdkVersion(): string {
	return sdkVersion.join('_');
}

export function checkSdkVersionSupport(minimumVersion: [number, number, number]): boolean {
	//major
	if (sdkVersion[0] < minimumVersion[0]) {
		return false;
	}
	if (sdkVersion[0] > minimumVersion[0]) {
		return true;
	}
	//minor
	if (sdkVersion[1] < minimumVersion[1]) {
		return false;
	}
	if (sdkVersion[1] > minimumVersion[1]) {
		return true;
	}
	//patch
	if (sdkVersion[2] >= minimumVersion[2]) {
		return true;
	}
	return false;
}

export function getGasDecimal(chain: ChainName): number {
	if (chain === 'solana') {
		return 9;
	}
	return 18;
}

export function getGasDecimalsInSolana(chain: ChainName): number {
	if (chain === 'solana') {
		return 9;
	}
	return 8;
}

const MAX_U64 = BigInt(2) ** BigInt(64) - BigInt(1);
export function getSafeU64Blob(value: bigint): Buffer {
	if (value < BigInt(0) || value > MAX_U64) {
		throw new Error(`Invalid u64: ${value}`);
	}
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64LE(value);
	return buf;
}

export const ZeroPermit: Erc20Permit = {
	value: BigInt(0),
	deadline: 0,
	v: 0,
	r: `0x${SystemProgram.programId.toBuffer().toString('hex')}`,
	s: `0x${SystemProgram.programId.toBuffer().toString('hex')}`,
}

export function wait(time: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, time);
	});
}

export function getQuoteSuitableReferrerAddress(
	quote: Quote,
	referrerAddresses?: ReferrerAddresses,
): string | null {
	if (!quote || !referrerAddresses) {
		return null;
	}
	if (quote.type === 'WH') {
		return referrerAddresses?.solana || null;
	}
	if (quote.type === 'MCTP' || quote.type === 'SWIFT') {
		if (quote.toChain === 'solana') {
			return referrerAddresses?.solana || null;
		}
		if (quote.toChain === 'sui') {
			return referrerAddresses?.sui || null;
		}
		return referrerAddresses?.evm || null;
	}
	if (quote.type === 'FAST_MCTP') {
		if (quote.toChain !== 'solana' && quote.toChain !== 'sui') {
			return referrerAddresses?.evm || null;
		}
	}
	if (quote.type === 'MONO_CHAIN') {
		if (quote.fromChain === 'solana') {
			return referrerAddresses?.solana || null;
		} else if (quote.fromChain === 'sui') {
			return referrerAddresses?.sui || null;
		}
		return referrerAddresses?.evm || null;
	}
	return null;
}

export const MCTP_PAYLOAD_TYPE_DEFAULT = 1;
export const MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD = 2;
export const MCTP_INIT_ORDER_PAYLOAD_ID = 1;
export const FAST_MCTP_PAYLOAD_TYPE_DEFAULT = 1;
export const FAST_MCTP_PAYLOAD_TYPE_CUSTOM_PAYLOAD = 2;
export const FAST_MCTP_PAYLOAD_TYPE_ORDER = 3;

export async function getPermitDomain(token: Token, provider: JsonRpcProvider): Promise<PermitDomain> {
	const contract = new ethers.Contract(token.contract, ERC20Artifact.abi, provider);
	let domainSeparator: string;
	let name: string;
	try {
		let [_domainSeparator, _name] = await Promise.all([contract.DOMAIN_SEPARATOR(), contract.name()]);
		domainSeparator = _domainSeparator;
		name = _name;
	} catch (err) {
		throw {
			mayanError: {
				permitIssue: true,
			},
		};
	}
	const domain: PermitDomain = {
		name: name,
		version: '1',
		chainId: token.chainId,
		verifyingContract: token.contract,
	};
	for (let i = 1; i < 11; i++) {
		domain.version = String(i);
		const hash = TypedDataEncoder.hashDomain(domain);
		if (hash.toLowerCase() === domainSeparator.toLowerCase()) {
			return domain;
		}
	}
	throw {
		mayanError: {
			permitIssue: true,
		},
	};
}

export const PermitTypes = {
	Permit: [
		{
			name: 'owner',
			type: 'address',
		},
		{
			name: 'spender',
			type: 'address',
		},
		{
			name: 'value',
			type: 'uint256',
		},
		{
			name: 'nonce',
			type: 'uint256',
		},
		{
			name: 'deadline',
			type: 'uint256',
		},
	],
};

export async function getPermitParams(
	token: Token,
	walletAddress: string,
	spender: string,
	amount: bigint,
	provider: JsonRpcProvider,
	deadline: BigInt
): Promise<{
	domain: PermitDomain;
	types: typeof PermitTypes;
	value: PermitValue;
}> {
	if (token.standard !== 'erc20' && token.standard !== 'hypertoken') {
		throw new Error('Token is not ERC20');
	}
	if (!token.supportsPermit) {
		throw new Error('Token does not support permit');
	}
	const contract = new ethers.Contract(token.contract, ERC20Artifact.abi, provider);
	const [domain, nonce] = await Promise.all([getPermitDomain(token, provider), contract.nonces(walletAddress)]);
	return {
		domain,
		types: PermitTypes,
		value: {
			owner: walletAddress,
			spender: spender,
			nonce: String(nonce),
			value: String(amount),
			deadline: String(deadline),
		}
	}
}

export async function getHyperCoreUSDCDepositPermitParams(
	quote: Quote,
	userArbitrumAddress: string,
	arbProvider: JsonRpcProvider,
): Promise<{
	domain: PermitDomain;
	types: typeof PermitTypes;
	value: PermitValue;
}> {
	if (!quote.hyperCoreParams) {
		throw new Error('Quote does not have hyperCoreParams');
	}
	if (quote.toChain !== 'hypercore') {
		throw new Error('Quote toChain is not hypercore');
	}
	if (quote.toToken.contract.toLowerCase() !== addresses.ARBITRUM_USDC_CONTRACT.toLowerCase()) {
		throw new Error('Quote toToken is not USDC on Arbitrum');
	}

	const USDC_ARB_TOKEN: Token = {
		name: "USDC",
		standard: "erc20",
		symbol: "USDC",
		mint: "CR4xnGrhsu1fWNPoX4KbTUUtqGMF3mzRLfj4S6YEs1Yo",
		verified: true,
		contract: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
		chainId: 42161,
		wChainId: 23,
		decimals: 6,
		logoURI: "http://assets.coingecko.com/coins/images/6319/small/usdc.png?1696506694",
		coingeckoId: "usd-coin",
		realOriginContractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
		realOriginChainId: 23,
		supportsPermit: true,
		verifiedAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
	}
	const [permitParams, isAllowed] = await Promise.all([
		getPermitParams(
			USDC_ARB_TOKEN,
			userArbitrumAddress,
			addresses.HC_ARBITRUM_BRIDGE,
			BigInt(quote.hyperCoreParams.depositAmountUSDC64),
			arbProvider,
			BigInt(quote.deadline64)
		),
		checkHyperCoreDeposit(userArbitrumAddress, quote.toToken.contract)
	]);
	if (!isAllowed) {
		throw new Error('Because of concurrency, deposit is not possible at the moment, please try again later');
	}
	return permitParams;
}

export function getHyperCoreUSDCDepositCustomPayload(
	quote: Quote,
	destinationAddress: string,
	usdcPermitSignature: string,
): Buffer {
	const payload = Buffer.alloc(109);
	const destAddressBuf = Buffer.from(hexToUint8Array(destinationAddress));
	if (destAddressBuf.length !== 20) {
		throw new Error('Invalid destination address length, expected 20 bytes');
	}
	const permitSignatureBuf = Buffer.from(
		hexToUint8Array(usdcPermitSignature)
	);
	if (permitSignatureBuf.length !== 65) {
		throw new Error('Invalid USDC permit signature length, expected 65 bytes');
	}
	payload.writeBigUInt64BE(BigInt(quote.redeemRelayerFee64), 0)
	payload.set(destAddressBuf, 8);
	payload.writeBigUInt64BE(BigInt(quote.hyperCoreParams.depositAmountUSDC64), 28);
	payload.writeBigUInt64BE(BigInt(quote.deadline64), 36);
	payload.set(permitSignatureBuf, 44);

	return payload
}
