import { zeroPad } from '@ethersproject/bytes';
import { ethers } from 'ethers';
import { PublicKey, Connection, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { sha3_256 } from 'js-sha3';
import addresses  from './addresses';

export const isValidAptosType = (str: string): boolean =>
	/^(0x)?[0-9a-fA-F]+::\w+::\w+$/.test(str);

export function nativeAddressToHexString(
	address: string, wChainId: number) : string {
	let padded: Uint8Array;
	if (wChainId === 1) {
		padded = zeroPad(new PublicKey(address).toBytes(), 32);
	} else if (wChainId === 2 || wChainId === 4 || wChainId === 5 || wChainId === 6 || wChainId === 22) {
		if (wChainId === 22 && isValidAptosType(address)) {
			return `0x${sha3_256(address)}`
		}
		let hex = (<string>address).substring(2);
		const result = [];
		for (let i = 0; i < hex.length; i += 2) {
			result.push(parseInt(hex.substring(i, i + 2), 16));
		}
		padded = zeroPad(new Uint8Array(result), 32);
	} else {
		throw new Error('Unsupported token chain');
	}
	const hex = Buffer.from(padded).toString("hex");
	return `0x${hex}`;
}

export function hexToUint8Array(input): Uint8Array {
	return new Uint8Array(Buffer.from(input.substring(2), "hex"));
}

export async function getCurrentEvmTime(
	provider: ethers.providers.BaseProvider
) : Promise<number> {
	const latestBlock = await provider.getBlock('latest');
	return latestBlock.timestamp;
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
	amount: string | number, decimals: string | number) : ethers.BigNumber {
	const fixedAmount = Number(amount).toFixed(Math.min(8, Number(decimals)));
	return ethers.utils.parseUnits(fixedAmount, Number(decimals))
}

export function getDisplayAmount(
	inputAmount: ethers.BigNumberish, decimals: string | ethers.BigNumberish) : number {
	return  Number(ethers.utils.formatUnits(inputAmount, decimals))
}

const chains: { [index: string]: number }  = {
	solana: 1,
	ethereum: 2,
	bsc: 4,
	polygon: 5,
	avalanche: 6,
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
};
export function getWormholeChainIdById(chainId: number) : number | null {
	return evmChainIdMap[chainId];
}
