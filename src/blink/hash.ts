import { keccak256, toBeHex, zeroPadValue } from 'ethers';
import { Buffer } from 'buffer';
import type { Referrer } from '../types';
import { hexToUint8Array } from '../utils';
import type { BlinkOrderParams, BlinkQuote } from './types';

export const BLINK_SUPPORTED_PARAMS_VERSION = 1;

// The quote hash is keccak256 over the order params laid out as
//   u8 paramsVersion, then every field as   u16 tag | u32 length | bytes
// Strings are utf8, amounts are 32-byte big-endian integers, and the referrer list is
//   u16 count, then per referrer   u16 address length | utf8 address | u16 bps

function u16(value: number): Buffer {
	const buf = Buffer.alloc(2);
	buf.writeUInt16BE(value);
	return buf;
}

function u32(value: number): Buffer {
	const buf = Buffer.alloc(4);
	buf.writeUInt32BE(value);
	return buf;
}

function taggedField(tag: number, bytes: Uint8Array): Buffer {
	return Buffer.concat([u16(tag), u32(bytes.length), bytes]);
}

function stringField(tag: number, value: string): Buffer {
	return taggedField(tag, Buffer.from(value, 'utf8'));
}

function amountField(tag: number, value: string): Buffer {
	const uint256 = zeroPadValue(toBeHex(BigInt(value || '0')), 32);
	return taggedField(tag, hexToUint8Array(uint256));
}

function referrersField(tag: number, referrers: Referrer[]): Buffer {
	const entries = referrers.map((referrer) => {
		const address = Buffer.from(referrer.address, 'utf8');
		return Buffer.concat([u16(address.length), address, u16(referrer.bps)]);
	});
	return taggedField(tag, Buffer.concat([u16(referrers.length), ...entries]));
}

export function encodeBlinkOrderParams(params: BlinkOrderParams): Buffer {
	return Buffer.concat([
		Buffer.from([params.paramsVersion]),
		stringField(1, params.srcChain),
		stringField(2, params.dstChain),
		stringField(3, params.srcToken),
		stringField(4, params.dstToken),
		stringField(5, params.lockToken),
		amountField(6, params.expectedAmountIn),
		amountField(7, params.expectedAmountOut),
		amountField(8, params.expectedLockAmount),
		amountField(9, params.minLockAmount),
		amountField(10, params.minAmountOut),
		amountField(11, params.gasDrop),
		stringField(12, params.recipient),
		stringField(13, params.refundAddress),
		referrersField(14, params.referrers),
		stringField(15, params.routerAddress),
		amountField(16, params.refundFeeBridge),
		taggedField(17, params.random),
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
