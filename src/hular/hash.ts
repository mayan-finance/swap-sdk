import { keccak256, toUtf8Bytes } from 'ethers';
import type { Referrer } from '../types';
import type { HularOrderParams, HularQuote } from './types';

export const HULAR_SUPPORTED_PARAMS_VERSION = 1;

function minimalBigEndian(value: bigint): Uint8Array {
	const bytes: number[] = [];
	let rest = value;
	while (rest > BigInt(0)) {
		bytes.unshift(Number(rest & BigInt(0xff)));
		rest >>= BigInt(8);
	}
	return Uint8Array.from(bytes);
}

function writeField(out: number[], tag: number, value: Uint8Array): void {
	if (value.length === 0) {
		return;
	}
	out.push((tag >>> 8) & 0xff, tag & 0xff);
	const length = value.length;
	out.push((length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff);
	for (const byte of value) {
		out.push(byte);
	}
}

function referrersValue(referrers: Referrer[]): Uint8Array {
	const out: number[] = [];
	for (const referrer of referrers) {
		const address = toUtf8Bytes(referrer.address);
		out.push((address.length >>> 8) & 0xff, address.length & 0xff);
		for (const byte of address) {
			out.push(byte);
		}
		out.push((referrer.bps >>> 8) & 0xff, referrer.bps & 0xff);
	}
	return Uint8Array.from(out);
}

export function encodeHularOrderParams(params: HularOrderParams): Uint8Array {
	const out: number[] = [params.paramsVersion & 0xff];
	const str = (tag: number, value: string) => writeField(out, tag, toUtf8Bytes(value));
	const int = (tag: number, value: bigint) => writeField(out, tag, minimalBigEndian(value));
	str(1, params.srcChain);
	str(2, params.dstChain);
	str(3, params.srcToken);
	str(4, params.dstToken);
	str(5, params.bridgeTokenSrc);
	str(6, params.bridgeTokenDst);
	int(7, BigInt(params.amountIn || '0'));
	int(8, BigInt(params.amountOut || '0'));
	int(9, BigInt(params.bridgeAmount || '0'));
	int(10, BigInt(params.minBridgeOut || '0'));
	int(11, BigInt(params.minAmountOut || '0'));
	int(12, BigInt(params.gasDrop || '0'));
	str(13, params.recipient);
	str(14, params.refundAddress);
	str(15, params.refundToken);
	writeField(out, 16, referrersValue(params.referrers));
	int(17, BigInt(params.slippageBps));
	int(18, BigInt(params.srcSlippageBps));
	str(19, params.routerAddress);
	int(20, BigInt(params.refundFeeBridge || '0'));
	int(21, BigInt(params.refundFeeNative || '0'));
	writeField(out, 22, params.nonce);
	return Uint8Array.from(out);
}

export function computeHularQuoteHash(params: HularOrderParams): string {
	return keccak256(encodeHularOrderParams(params));
}

export function assertHularQuoteHash(quote: HularQuote): void {
	const computed = computeHularQuoteHash(quote.orderParams);
	if (computed !== quote.quoteHash.toLowerCase()) {
		throw new Error(
			`Hular quote hash mismatch: server sent ${quote.quoteHash}, params hash to ${computed}`
		);
	}
}
