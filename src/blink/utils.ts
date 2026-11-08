import { keccak256, toBeHex, zeroPadValue } from 'ethers';
import { Buffer } from 'buffer';
import type {
	BlinkChain,
	BlinkContractsResponse,
	BlinkGaslessSubmission,
	BlinkOrderParams,
	BlinkOrderParamsJson,
	BlinkQuote,
	BlinkQuoteJson,
	BlinkSwapInstructions,
	InstructionInfo,
	Referrer,
} from '../types';
import { hexToUint8Array } from '../utils';

// Each accessor validates one field and throws, naming the field, when it is missing or
// malformed: a defaulted field would otherwise flow into a real deposit. The Blink API prints
// every field, while Mayan's quote API omits proto3 fields at their default, so only the quote
// decoders pass `?? 0`, `?? false` or `?? []` for fields the proto gives no presence.

function invalidField(name: string, value: unknown): never {
	if (value === undefined || value === null) {
		throw new Error(`Blink response is missing ${name}`);
	}
	throw new Error(`Blink response has an invalid ${name}: ${JSON.stringify(value)}`);
}

function nonEmptyText(value: unknown, name: string): string {
	return typeof value === 'string' && value !== '' ? value : invalidField(name, value);
}

function optionalText(value: unknown, name: string): string | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}
	return typeof value === 'string' ? value : invalidField(name, value);
}

/** An unsigned amount, kept as the decimal string the API sent. */
function decimal(value: unknown, name: string): string {
	return typeof value === 'string' && /^\d+$/.test(value) ? value : invalidField(name, value);
}

/** An unsigned integer, sent as a JSON number (32-bit) or a decimal string (64-bit). */
function integer(value: unknown, name: string): number {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
		return value;
	}
	if (typeof value === 'string' && /^\d+$/.test(value)) {
		return Number(value);
	}
	return invalidField(name, value);
}

function flag(value: unknown, name: string): boolean {
	return typeof value === 'boolean' ? value : invalidField(name, value);
}

/** An RFC 3339 timestamp, kept as sent. */
function timestamp(value: unknown, name: string): string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : invalidField(name, value);
}

function list<T>(value: unknown, name: string, decode: (item: any, name: string) => T): T[] {
	if (!Array.isArray(value)) {
		return invalidField(name, value);
	}
	return value.map((item, index) => decode(item, `${name}[${index}]`));
}

function decodeReferrer(json: any, name: string): Referrer {
	return {
		address: nonEmptyText(json?.address, `${name}.address`),
		bps: integer(json?.bps ?? 0, `${name}.bps`),
	};
}

function decodeOrderParams(json: BlinkOrderParamsJson, name: string): BlinkOrderParams {
	return {
		srcChain: nonEmptyText(json.srcChain, `${name}.srcChain`),
		dstChain: nonEmptyText(json.dstChain, `${name}.dstChain`),
		srcToken: nonEmptyText(json.srcToken, `${name}.srcToken`),
		dstToken: nonEmptyText(json.dstToken, `${name}.dstToken`),
		lockToken: nonEmptyText(json.lockToken, `${name}.lockToken`),
		expectedAmountIn: decimal(json.expectedAmountIn, `${name}.expectedAmountIn`),
		expectedAmountOut: decimal(json.expectedAmountOut, `${name}.expectedAmountOut`),
		expectedLockAmount: decimal(json.expectedLockAmount, `${name}.expectedLockAmount`),
		minLockAmount: decimal(json.minLockAmount, `${name}.minLockAmount`),
		minAmountOut: decimal(json.minAmountOut, `${name}.minAmountOut`),
		gasDrop: decimal(json.gasDrop, `${name}.gasDrop`),
		recipient: nonEmptyText(json.recipient, `${name}.recipient`),
		refundAddress: nonEmptyText(json.refundAddress, `${name}.refundAddress`),
		referrers: list(json.referrers ?? [], `${name}.referrers`, decodeReferrer),
		routerAddress: nonEmptyText(json.routerAddress, `${name}.routerAddress`),
		refundFeeBridge: decimal(json.refundFeeBridge, `${name}.refundFeeBridge`),
		random: Buffer.from(nonEmptyText(json.random, `${name}.random`), 'base64'),
		paramsVersion: integer(json.paramsVersion, `${name}.paramsVersion`),
	};
}

export function decodeBlinkQuote(json: BlinkQuoteJson | null | undefined): BlinkQuote {
	const crossChain = json?.crossChain;
	const quote = crossChain ?? json?.sameChainSwap;
	if (!quote) {
		throw new Error('Blink returned an empty quote');
	}
	const name = crossChain ? 'crossChain' : 'sameChainSwap';
	if (!quote.orderParams) {
		invalidField(`${name}.orderParams`, quote.orderParams);
	}
	return {
		quoteHash: nonEmptyText(quote.quoteHash, `${name}.quoteHash`),
		amountIn: decimal(quote.amountIn, `${name}.amountIn`),
		amountOut: decimal(quote.amountOut, `${name}.amountOut`),
		minAmountOut: decimal(quote.minAmountOut, `${name}.minAmountOut`),
		slippageBps: integer(quote.slippageBps ?? 0, `${name}.slippageBps`),
		routerAddress: nonEmptyText(quote.routerAddress, `${name}.routerAddress`),
		orderParams: decodeOrderParams(quote.orderParams, `${name}.orderParams`),
		gasless: flag(crossChain?.gasless ?? false, 'crossChain.gasless'),
		sponsorFees: flag(crossChain?.sponsorFees ?? false, 'crossChain.sponsorFees'),
		gaslessRouterAddress: optionalText(crossChain?.gaslessRouterAddress, 'crossChain.gaslessRouterAddress'),
		sponsorAddress: optionalText(crossChain?.sponsorAddress, 'crossChain.sponsorAddress'),
		sponsorGasBudget:
			crossChain?.sponsorGasBudget === undefined || crossChain?.sponsorGasBudget === null
				? undefined
				: BigInt(decimal(crossChain.sponsorGasBudget, 'crossChain.sponsorGasBudget')),
		fulfillEtaSecs:
			quote.fulfillEtaSecs === undefined || quote.fulfillEtaSecs === null
				? undefined
				: integer(quote.fulfillEtaSecs, `${name}.fulfillEtaSecs`),
		directTransfer: flag(crossChain?.directTransfer ?? false, 'crossChain.directTransfer'),
		expiresAt: timestamp(quote.expiresAt, `${name}.expiresAt`),
		guardianSetIndex: integer(quote.guardianSetIndex ?? 0, `${name}.guardianSetIndex`),
	};
}

function decodeSvmInstruction(json: any, name: string): InstructionInfo {
	return {
		programId: nonEmptyText(json?.programId, `${name}.programId`),
		accounts: list(json?.accounts, `${name}.accounts`, (meta, metaName) => ({
			pubkey: nonEmptyText(meta?.pubkey, `${metaName}.pubkey`),
			isSigner: flag(meta?.isSigner, `${metaName}.isSigner`),
			isWritable: flag(meta?.isWritable, `${metaName}.isWritable`),
		})),
		data: optionalText(json?.data, `${name}.data`) ?? '',
	};
}

export function decodeBlinkSwapInstructions(json: any): BlinkSwapInstructions {
	const swap: BlinkSwapInstructions = {
		routerAddress: nonEmptyText(json?.routerAddress, 'routerAddress'),
		srcToken: nonEmptyText(json?.srcToken, 'srcToken'),
		amountIn: decimal(json?.amountIn, 'amountIn'),
		lockToken: nonEmptyText(json?.lockToken, 'lockToken'),
		minLockAmount: decimal(json?.minLockAmount, 'minLockAmount'),
	};
	if (json?.evm) {
		swap.evm = {
			aggregator: nonEmptyText(json.evm.aggregator, 'evm.aggregator'),
			swapCalldata: nonEmptyText(json.evm.swapCalldata, 'evm.swapCalldata'),
			value: decimal(json.evm.value, 'evm.value'),
		};
	}
	if (json?.svm) {
		swap.svm = {
			setup: list(json.svm.setup, 'svm.setup', decodeSvmInstruction),
			swap: decodeSvmInstruction(json.svm.swap, 'svm.swap'),
			cleanup: list(json.svm.cleanup, 'svm.cleanup', decodeSvmInstruction),
			lookupTables: list(json.svm.lookupTables, 'svm.lookupTables', (table, tableName) => ({
				address: nonEmptyText(table?.address, `${tableName}.address`),
				addresses: list(table?.addresses, `${tableName}.addresses`, nonEmptyText),
			})),
			swapAuthorityLamports: decimal(json.svm.swapAuthorityLamports, 'svm.swapAuthorityLamports'),
		};
	}
	return swap;
}

export function decodeBlinkChains(json: any): BlinkChain[] {
	return list(json?.chains, 'chains', (chain, name) => ({
		chain: nonEmptyText(chain?.chain, `${name}.chain`),
		vm: nonEmptyText(chain?.vm, `${name}.vm`),
		rpcUrl: optionalText(chain?.rpcUrl, `${name}.rpcUrl`),
		router: optionalText(chain?.router, `${name}.router`),
		escrow: optionalText(chain?.escrow, `${name}.escrow`),
		treasury: optionalText(chain?.treasury, `${name}.treasury`),
		swapExecutor: optionalText(chain?.swapExecutor, `${name}.swapExecutor`),
		maxGasDrop: decimal(chain?.maxGasDrop, `${name}.maxGasDrop`),
		nativeSymbol: nonEmptyText(chain?.nativeSymbol, `${name}.nativeSymbol`),
		nativeDecimals: integer(chain?.nativeDecimals, `${name}.nativeDecimals`),
		gasless: flag(chain?.gasless, `${name}.gasless`),
	}));
}

export function decodeBlinkContractsResponse(json: any): BlinkContractsResponse {
	return {
		manifest: nonEmptyText(json?.manifest, 'manifest'),
		signatures: list(json?.signatures, 'signatures', nonEmptyText),
		guardianSets: list(json?.guardianSets, 'guardianSets', (set, name) => ({
			index: integer(set?.index, `${name}.index`),
			members: list(set?.members, `${name}.members`, nonEmptyText),
			signatures: list(set?.signatures, `${name}.signatures`, nonEmptyText),
		})),
	};
}

export function decodeBlinkPriorityFee(json: any): bigint {
	return BigInt(decimal(json?.computeUnitPriceMicroLamports, 'computeUnitPriceMicroLamports'));
}

export function decodeBlinkGaslessSubmission(json: any): BlinkGaslessSubmission {
	return {
		quoteHash: nonEmptyText(json?.quoteHash, 'quoteHash'),
		status: nonEmptyText(json?.status, 'status'),
		txHash: optionalText(json?.txHash, 'txHash'),
		error: optionalText(json?.error, 'error'),
	};
}

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
	const uint256 = zeroPadValue(toBeHex(BigInt(value)), 32);
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
