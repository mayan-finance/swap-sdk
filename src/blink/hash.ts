import { keccak256 } from 'ethers';
import { Buffer } from 'buffer';
import type { Referrer } from '../types';
import type { BlinkOrderParams, BlinkQuote } from './types';

export const BLINK_SUPPORTED_PARAMS_VERSION = 1;

function minimalBigEndian(value: bigint): Buffer {
	if (value <= BigInt(0)) {
		return Buffer.alloc(0);
	}
	const hex = value.toString(16);
	return Buffer.from(hex.length % 2 === 0 ? hex : '0' + hex, 'hex');
}

function encodeField(tag: number, value: Buffer): Buffer {
	if (value.length === 0) {
		return Buffer.alloc(0);
	}
	const header = Buffer.alloc(6);
	header.writeUInt16BE(tag, 0);
	header.writeUInt32BE(value.length, 2);
	return Buffer.concat([header, value]);
}

function encodeReferrers(referrers: Referrer[]): Buffer {
	return Buffer.concat(
		referrers.map((referrer) => {
			const address = Buffer.from(referrer.address, 'utf8');
			const addressLength = Buffer.alloc(2);
			addressLength.writeUInt16BE(address.length, 0);
			const bps = Buffer.alloc(2);
			bps.writeUInt16BE(referrer.bps, 0);
			return Buffer.concat([addressLength, address, bps]);
		})
	);
}

export function encodeBlinkOrderParams(params: BlinkOrderParams): Buffer {
	const str = (tag: number, value: string) => encodeField(tag, Buffer.from(value, 'utf8'));
	const int = (tag: number, value: bigint) => encodeField(tag, minimalBigEndian(value));
	const version = Buffer.alloc(1);
	version.writeUInt8(params.paramsVersion, 0);
	return Buffer.concat([
		version,
		str(1, params.srcChain),
		str(2, params.dstChain),
		str(3, params.srcToken),
		str(4, params.dstToken),
		str(5, params.bridgeTokenSrc),
		str(6, params.bridgeTokenDst),
		int(7, BigInt(params.amountIn || '0')),
		int(8, BigInt(params.amountOut || '0')),
		int(9, BigInt(params.bridgeAmount || '0')),
		int(10, BigInt(params.minBridgeOut || '0')),
		int(11, BigInt(params.minAmountOut || '0')),
		int(12, BigInt(params.gasDrop || '0')),
		str(13, params.recipient),
		str(14, params.refundAddress),
		str(15, params.refundToken),
		encodeField(16, encodeReferrers(params.referrers)),
		int(17, BigInt(params.slippageBps)),
		int(18, BigInt(params.srcSlippageBps)),
		str(19, params.routerAddress),
		int(20, BigInt(params.refundFeeBridge || '0')),
		int(21, BigInt(params.refundFeeNative || '0')),
		encodeField(22, Buffer.from(params.nonce)),
	]);
}

export function computeBlinkQuoteHash(params: BlinkOrderParams): string {
	return keccak256(encodeBlinkOrderParams(params));
}

export function assertBlinkQuoteHash(quote: BlinkQuote): void {
	if (quote.orderParams.paramsVersion > BLINK_SUPPORTED_PARAMS_VERSION) {
		throw new Error(
			`Blink quote uses params version ${quote.orderParams.paramsVersion}, this SDK supports up to ${BLINK_SUPPORTED_PARAMS_VERSION}`
		);
	}
	const computed = computeBlinkQuoteHash(quote.orderParams);
	if (computed !== quote.quoteHash.toLowerCase()) {
		throw new Error(`Blink quote hash mismatch: server sent ${quote.quoteHash}, params hash to ${computed}`);
	}
}
