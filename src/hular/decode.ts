import { Buffer } from 'buffer';
import type { Referrer } from '../types';
import type {
	HularChain,
	HularOrderParams,
	HularQuote,
	HularSvmInstruction,
	HularSwapInstructions,
} from './types';

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function count(value: unknown): number {
	return typeof value === 'number' ? value : 0;
}

function flag(value: unknown): boolean {
	return value === true;
}

function items<T>(value: unknown, decode: (item: any) => T): T[] {
	return Array.isArray(value) ? value.map(decode) : [];
}

function decodeReferrer(json: any): Referrer {
	return { address: text(json?.address), bps: count(json?.bps) };
}

function decodeOrderParams(json: any): HularOrderParams {
	return {
		srcChain: text(json.srcChain),
		dstChain: text(json.dstChain),
		srcToken: text(json.srcToken),
		dstToken: text(json.dstToken),
		bridgeTokenSrc: text(json.bridgeTokenSrc),
		bridgeTokenDst: text(json.bridgeTokenDst),
		amountIn: text(json.amountIn),
		amountOut: text(json.amountOut),
		bridgeAmount: text(json.bridgeAmount),
		minBridgeOut: text(json.minBridgeOut),
		minAmountOut: text(json.minAmountOut),
		gasDrop: text(json.gasDrop),
		recipient: text(json.recipient),
		refundAddress: text(json.refundAddress),
		refundToken: text(json.refundToken),
		referrers: items(json.referrers, decodeReferrer),
		slippageBps: count(json.slippageBps),
		srcSlippageBps: count(json.srcSlippageBps),
		routerAddress: text(json.routerAddress),
		refundFeeBridge: text(json.refundFeeBridge),
		refundFeeNative: text(json.refundFeeNative),
		nonce: Uint8Array.from(Buffer.from(text(json.nonce), 'base64')),
		paramsVersion: count(json.paramsVersion),
	};
}

export function decodeHularQuote(json: any): HularQuote {
	const quote = json?.crossChain;
	if (!quote) {
		throw new Error('Hular returned a quote that is not cross-chain');
	}
	if (!quote.orderParams) {
		throw new Error('Hular quote has no order params');
	}
	return {
		quoteHash: text(quote.quoteHash),
		amountIn: text(quote.amountIn),
		amountOut: text(quote.amountOut),
		minAmountOut: text(quote.minAmountOut),
		slippageBps: count(quote.slippageBps),
		routerAddress: text(quote.routerAddress),
		orderParams: decodeOrderParams(quote.orderParams),
		directTransfer: flag(quote.directTransfer),
		depositDeadline: text(quote.depositDeadline),
	};
}

function decodeSvmInstruction(json: any): HularSvmInstruction {
	return {
		programId: text(json?.programId),
		accounts: items(json?.accounts, (meta) => ({
			pubkey: text(meta?.pubkey),
			isSigner: flag(meta?.isSigner),
			isWritable: flag(meta?.isWritable),
		})),
		data: text(json?.data),
	};
}

export function decodeHularSwapInstructions(json: any): HularSwapInstructions {
	const swap: HularSwapInstructions = {
		routerAddress: text(json?.routerAddress),
		srcToken: text(json?.srcToken),
		amountIn: text(json?.amountIn),
		bridgeToken: text(json?.bridgeToken),
		minBridgeOut: text(json?.minBridgeOut),
	};
	if (json?.evm) {
		swap.evm = {
			aggregator: text(json.evm.aggregator),
			swapCalldata: text(json.evm.swapCalldata),
			value: text(json.evm.value),
		};
	}
	if (json?.svm) {
		if (!json.svm.swap) {
			throw new Error('Hular swap instructions are missing the swap step');
		}
		swap.svm = {
			setup: items(json.svm.setup, decodeSvmInstruction),
			swap: decodeSvmInstruction(json.svm.swap),
			cleanup: items(json.svm.cleanup, decodeSvmInstruction),
			lookupTables: items(json.svm.lookupTables, (table) => ({
				address: text(table?.address),
				addresses: items(table?.addresses, text),
			})),
			allowedSwapPrograms: items(json.svm.allowedSwapPrograms, text),
			swapProgramsSignature: text(json.svm.swapProgramsSignature),
		};
	}
	return swap;
}

export function decodeHularChains(json: any): HularChain[] {
	return items(json?.chains, (chain) => ({
		chain: text(chain?.chain),
		router: text(chain?.router),
		treasury: text(chain?.treasury),
		escrow: text(chain?.escrow),
	}));
}
