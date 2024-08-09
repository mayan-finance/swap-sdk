import { ethers, zeroPadValue, parseUnits, formatUnits } from 'ethers';
import {PublicKey, SystemProgram} from '@solana/web3.js';
import { Buffer } from 'buffer';
import addresses  from './addresses';
import { ChainName, Erc20Permit, Quote, ReferrerAddresses } from './types';
import * as sha3 from 'js-sha3';
const sha3_256 = sha3.sha3_256;

export const isValidAptosType = (str: string): boolean =>
	/^(0x)?[0-9a-fA-F]+::\w+::\w+$/.test(str);

export function nativeAddressToHexString(
	address: string, wChainId: number) : string {
	if (wChainId === 1) {
		return zeroPadValue(new PublicKey(address).toBytes(), 32);
	} else if (
		wChainId === 2 || wChainId === 4 || wChainId === 5 ||
		wChainId === 6  || wChainId === 23 || wChainId === 24 ||
		wChainId === 30
	) {
		return zeroPadValue(address, 32);
	} else if (wChainId === 22 && isValidAptosType(address)) {
		return `0x${sha3_256(address)}`
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

const sdkVersion = [9, 1, 0];

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
		return referrerAddresses?.evm || null;
	}
	return null;
}
