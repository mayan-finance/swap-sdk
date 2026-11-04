import { keccak256 } from 'ethers';
import { Buffer } from 'buffer';
import type { Referrer } from '../types';
import type { BlinkOrderParams, BlinkQuote } from './types';

export const BLINK_SUPPORTED_PARAMS_VERSION = 1;

function uint256BigEndian(value: bigint): Buffer {
	return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
}

function encodeField(tag: number, value: Buffer): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16BE(tag, 0);
	header.writeUInt32BE(value.length, 2);
	return Buffer.concat([header, value]);
}

function encodeReferrers(referrers: Referrer[]): Buffer {
	const count = Buffer.alloc(2);
	count.writeUInt16BE(referrers.length, 0);
	return Buffer.concat([
		count,
		...referrers.map((referrer) => {
			const address = Buffer.from(referrer.address, 'utf8');
			const addressLength = Buffer.alloc(2);
			addressLength.writeUInt16BE(address.length, 0);
			const bps = Buffer.alloc(2);
			bps.writeUInt16BE(referrer.bps, 0);
			return Buffer.concat([addressLength, address, bps]);
		}),
	]);
}

export function encodeBlinkOrderParams(params: BlinkOrderParams): Buffer {
	const str = (tag: number, value: string) => encodeField(tag, Buffer.from(value, 'utf8'));
	const int = (tag: number, value: string) => encodeField(tag, uint256BigEndian(BigInt(value || '0')));
	const version = Buffer.alloc(1);
	version.writeUInt8(params.paramsVersion, 0);
	return Buffer.concat([
		version,
		str(1, params.srcChain),
		str(2, params.dstChain),
		str(3, params.srcToken),
		str(4, params.dstToken),
		str(5, params.lockToken),
		int(6, params.expectedAmountIn),
		int(7, params.expectedAmountOut),
		int(8, params.expectedLockAmount),
		int(9, params.minLockAmount),
		int(10, params.minAmountOut),
		int(11, params.gasDrop),
		str(12, params.recipient),
		str(13, params.refundAddress),
		encodeField(14, encodeReferrers(params.referrers)),
		str(15, params.routerAddress),
		int(16, params.refundFeeBridge),
		encodeField(17, Buffer.from(params.random)),
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
