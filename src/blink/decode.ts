import { Buffer } from 'buffer';
import type { Referrer } from '../types';
import type {
	BlinkChain,
	BlinkContractsResponse,
	BlinkGaslessSubmission,
	BlinkOrderDetail,
	BlinkOrderParams,
	BlinkQuote,
	BlinkSourceSwapStatus,
	BlinkSvmInstruction,
	BlinkSwapInstructions,
} from './types';

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

function count(value: unknown): number {
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string' && value !== '') {
		return Number(value);
	}
	return 0;
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

function decodeOrderParams(json: any): BlinkOrderParams {
	return {
		srcChain: text(json.src_chain),
		dstChain: text(json.dst_chain),
		srcToken: text(json.src_token),
		dstToken: text(json.dst_token),
		bridgeTokenSrc: text(json.bridge_token_src),
		bridgeTokenDst: text(json.bridge_token_dst),
		amountIn: text(json.amount_in),
		amountOut: text(json.amount_out),
		bridgeAmount: text(json.bridge_amount),
		minBridgeOut: text(json.min_bridge_out),
		minAmountOut: text(json.min_amount_out),
		gasDrop: text(json.gas_drop),
		recipient: text(json.recipient),
		refundAddress: text(json.refund_address),
		refundToken: text(json.refund_token),
		referrers: items(json.referrers, decodeReferrer),
		slippageBps: count(json.slippage_bps),
		srcSlippageBps: count(json.src_slippage_bps),
		routerAddress: text(json.router_address),
		refundFeeBridge: text(json.refund_fee_bridge),
		refundFeeNative: text(json.refund_fee_native),
		nonce: Uint8Array.from(Buffer.from(text(json.nonce), 'base64')),
		paramsVersion: count(json.params_version),
	};
}

export function decodeBlinkQuote(json: any): BlinkQuote {
	const crossChain = json?.cross_chain;
	const quote = crossChain ?? json?.same_chain_swap;
	if (!quote) {
		throw new Error('Blink returned an empty quote');
	}
	if (!quote.order_params) {
		throw new Error('Blink quote has no order params');
	}
	return {
		quoteHash: text(quote.quote_hash),
		amountIn: text(quote.amount_in),
		amountOut: text(quote.amount_out),
		minAmountOut: text(quote.min_amount_out),
		slippageBps: count(quote.slippage_bps),
		routerAddress: text(quote.router_address),
		orderParams: decodeOrderParams(quote.order_params),
		gasless: crossChain ? flag(quote.gasless) : false,
		sponsorFees: crossChain ? flag(quote.sponsor_fees) : false,
		gaslessRouterAddress: optionalText(quote.gasless_router_address),
		sponsorAddress: optionalText(quote.sponsor_address),
		sponsorGasBudget:
			quote.sponsor_gas_budget !== undefined && quote.sponsor_gas_budget !== null
				? BigInt(quote.sponsor_gas_budget)
				: undefined,
		fulfillEtaSecs:
			quote.fulfill_eta_secs !== undefined && quote.fulfill_eta_secs !== null
				? count(quote.fulfill_eta_secs)
				: undefined,
		directTransfer: crossChain ? flag(quote.direct_transfer) : false,
		depositDeadline: text(quote.deposit_deadline),
		guardianSetIndex: count(quote.guardian_set_index),
	};
}

function decodeSvmInstruction(json: any): BlinkSvmInstruction {
	return {
		programId: text(json?.program_id),
		accounts: items(json?.accounts, (meta) => ({
			pubkey: text(meta?.pubkey),
			isSigner: flag(meta?.is_signer),
			isWritable: flag(meta?.is_writable),
		})),
		data: text(json?.data),
	};
}

export function decodeBlinkSwapInstructions(json: any): BlinkSwapInstructions {
	const swap: BlinkSwapInstructions = {
		routerAddress: text(json?.router_address),
		srcToken: text(json?.src_token),
		amountIn: text(json?.amount_in),
		bridgeToken: text(json?.bridge_token),
		minBridgeOut: text(json?.min_bridge_out),
	};
	if (json?.evm) {
		swap.evm = {
			aggregator: text(json.evm.aggregator),
			swapCalldata: text(json.evm.swap_calldata),
			value: text(json.evm.value),
		};
	}
	if (json?.svm) {
		if (!json.svm.swap) {
			throw new Error('Blink swap instructions are missing the swap step');
		}
		swap.svm = {
			setup: items(json.svm.setup, decodeSvmInstruction),
			swap: decodeSvmInstruction(json.svm.swap),
			cleanup: items(json.svm.cleanup, decodeSvmInstruction),
			lookupTables: items(json.svm.lookup_tables, (table) => ({
				address: text(table?.address),
				addresses: items(table?.addresses, text),
			})),
		};
	}
	return swap;
}

export function decodeBlinkChains(json: any): BlinkChain[] {
	return items(json?.chains, (chain) => ({
		chain: text(chain?.chain),
		vm: text(chain?.vm),
		rpcUrl: optionalText(chain?.rpc_url),
		router: optionalText(chain?.router),
		escrow: optionalText(chain?.escrow),
		treasury: optionalText(chain?.treasury),
		swapExecutor: optionalText(chain?.swap_executor),
		maxGasDrop: text(chain?.max_gas_drop),
		nativeSymbol: text(chain?.native_symbol),
		nativeDecimals: count(chain?.native_decimals),
		gasless: flag(chain?.gasless),
	}));
}

export function decodeBlinkContractsResponse(json: any): BlinkContractsResponse {
	return {
		manifest: text(json?.manifest),
		signatures: items(json?.signatures, text),
		guardianSets: items(json?.guardian_sets, (set) => ({
			index: count(set?.index),
			members: items(set?.members, text),
			signatures: items(set?.signatures, text),
		})),
	};
}

export function decodeBlinkSourceSwapStatus(json: any): BlinkSourceSwapStatus {
	return {
		intent: text(json?.intent),
		status: text(json?.status),
		openTx: text(json?.open_tx),
		swapTx: optionalText(json?.swap_tx),
		expiresAt: text(json?.expires_at),
		reason: optionalText(json?.reason),
	};
}

export function decodeBlinkOrderDetail(json: any): BlinkOrderDetail {
	return {
		state: optionalText(json?.order?.state),
		srcTx: optionalText(json?.order?.src_tx),
		dstTxHash: optionalText(json?.order?.dst_tx_hash),
	};
}

export function decodeBlinkGaslessSubmission(json: any): BlinkGaslessSubmission {
	return {
		quoteHash: text(json?.quote_hash),
		status: text(json?.status),
		txHash: optionalText(json?.tx_hash),
		error: optionalText(json?.error),
	};
}
