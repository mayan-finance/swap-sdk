import { getBlinkOrder, getBlinkSourceSwap, submitBlinkGaslessOrder } from './api';
import type { BlinkGaslessOrderRequest } from './types';

const GASLESS_POLL_MS = 2000;
const SOURCE_SWAP_POLL_MS = 2000;
const SOURCE_SWAP_SETTLE_MS = 120_000;
const SOURCE_SWAP_UNSEEN_MS = 420_000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function submitAndTrackBlinkGaslessOrder(request: BlinkGaslessOrderRequest): Promise<string> {
	let submission = await submitBlinkGaslessOrder(request);
	for (;;) {
		if (submission.status === 'failed' || submission.status === 'rejected') {
			throw new Error(submission.error ?? 'Blink gasless submission failed');
		}
		if (submission.txHash) {
			return submission.txHash;
		}
		await sleep(GASLESS_POLL_MS);
		submission = await submitBlinkGaslessOrder({ quoteHash: request.quoteHash });
	}
}

export async function trackBlinkSourceSwap(quoteHash: string): Promise<string> {
	const started = Date.now();
	for (;;) {
		const swap = await getBlinkSourceSwap(quoteHash);
		if (swap?.status === 'executed') {
			return swap.swapTx ?? swap.openTx;
		}
		const overdue = swap
			? Date.parse(swap.expiresAt) + SOURCE_SWAP_SETTLE_MS < Date.now()
			: Date.now() - started > SOURCE_SWAP_UNSEEN_MS;
		if (swap?.status === 'lapsed' || overdue) {
			const detail = await getBlinkOrder(quoteHash);
			if (detail?.srcTx) {
				return detail.srcTx;
			}
			throw new Error(
				`The Blink source swap did not run (${swap?.reason ?? 'expired'}); the funds never left the wallet`
			);
		}
		await sleep(SOURCE_SWAP_POLL_MS);
	}
}
