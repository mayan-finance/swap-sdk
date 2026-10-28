import fetch from 'cross-fetch';
import addresses from '../addresses';
import {
	decodeBlinkChains,
	decodeBlinkContractsResponse,
	decodeBlinkGaslessSubmission,
	decodeBlinkOrderDetail,
	decodeBlinkSourceSwapStatus,
	decodeBlinkSwapInstructions,
} from './decode';
import type {
	BlinkChain,
	BlinkContractsResponse,
	BlinkGaslessOrderRequest,
	BlinkGaslessSubmission,
	BlinkOrderDetail,
	BlinkSourceSwapStatus,
	BlinkSwapInstructions,
} from './types';

export const BLINK_GRPC_NOT_FOUND = 5;

export class BlinkApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: number,
		message: string
	) {
		super(message);
		this.name = 'BlinkApiError';
	}
}

async function blinkRequest(path: string, init?: RequestInit): Promise<any> {
	const res = await fetch(`${addresses.BLINK_API_URL}${path}`, {
		redirect: 'follow',
		...init,
	});
	let body: any = null;
	try {
		body = await res.json();
	} catch (err) {
		body = null;
	}
	if (!res.ok) {
		throw new BlinkApiError(
			res.status,
			typeof body?.code === 'number' ? body.code : 0,
			body?.message || `Blink request failed with status ${res.status}`
		);
	}
	return body;
}

function blinkPost(path: string, body: unknown): Promise<any> {
	return blinkRequest(path, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
}

async function unlessNotFound<T>(call: () => Promise<T>): Promise<T | null> {
	try {
		return await call();
	} catch (err) {
		if (err instanceof BlinkApiError && (err.status === 404 || err.code === BLINK_GRPC_NOT_FOUND)) {
			return null;
		}
		throw err;
	}
}

export async function getBlinkSwapInstructions(quoteHash: string): Promise<BlinkSwapInstructions> {
	return decodeBlinkSwapInstructions(await blinkRequest(`/v1/quotes/${quoteHash}/instructions`));
}

export async function getBlinkContracts(): Promise<BlinkContractsResponse> {
	return decodeBlinkContractsResponse(await blinkRequest('/v1/contracts'));
}

export async function getBlinkChains(): Promise<BlinkChain[]> {
	return decodeBlinkChains(await blinkRequest('/v1/chains'));
}

export async function getBlinkPriorityFee(chain: string): Promise<bigint> {
	const json = await blinkRequest(`/v1/chains/${chain}/priority-fee`);
	return BigInt(json?.compute_unit_price_micro_lamports ?? 0);
}

export function getBlinkOrder(quoteHash: string): Promise<BlinkOrderDetail | null> {
	return unlessNotFound(async () => decodeBlinkOrderDetail(await blinkRequest(`/v1/orders/${quoteHash}`)));
}

export function getBlinkSourceSwap(quoteHash: string): Promise<BlinkSourceSwapStatus | null> {
	return unlessNotFound(async () =>
		decodeBlinkSourceSwapStatus(await blinkRequest(`/v1/orders/${quoteHash}/source-swap`))
	);
}

export async function submitBlinkGaslessOrder(request: BlinkGaslessOrderRequest): Promise<BlinkGaslessSubmission> {
	const body: Record<string, unknown> = { quote_hash: request.quoteHash };
	if ('evm' in request) {
		body.evm = {
			owner: request.evm.owner,
			permit2_nonce: request.evm.permit2Nonce,
			deadline: request.evm.deadline,
			signature: request.evm.signature,
			permit_signature: request.evm.permitSignature,
		};
	} else if ('svm' in request) {
		body.svm = { tx_base64: request.svm.txBase64 };
	} else if ('sui' in request) {
		body.sui = { tx_base64: request.sui.txBase64, signature: request.sui.signature };
	}
	return decodeBlinkGaslessSubmission(await blinkPost('/v1/gasless/orders', body));
}
