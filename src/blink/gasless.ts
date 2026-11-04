import { getBlinkOrder, getBlinkSourceSwap, submitBlinkGaslessOrder } from './api';
import type { BlinkGaslessOrderRequest } from './types';
import { wait } from '../utils';

const GASLESS_POLL_MS = 2000;
const SOURCE_SWAP_POLL_MS = 2000;
const SOURCE_SWAP_SETTLE_MS = 120_000;
const SOURCE_SWAP_UNSEEN_MS = 420_000;

/**
 * Hands the signed deposit to Blink and waits until Blink has broadcast it. Submission is
 * idempotent per quote hash, so polling is a re-submit with only the hash. Resolves to the
 * deposit tx hash.
 */
export async function submitAndTrackBlinkGaslessOrder(request: BlinkGaslessOrderRequest): Promise<string> {
	let submission = await submitBlinkGaslessOrder(request);
	while (true) {
		if (submission.status === 'failed' || submission.status === 'rejected') {
			throw new Error(submission.error ?? 'Blink gasless submission failed');
		}
		if (submission.txHash) {
			return submission.txHash;
		}
		await wait(GASLESS_POLL_MS);
		submission = await submitBlinkGaslessOrder({ quoteHash: request.quoteHash });
	}
}

/**
 * Waits for Blink to execute a Sui source swap the user opened. Resolves to the execution tx,
 * or throws once the intent lapsed and the funds are still in the user's wallet.
 */
export async function trackBlinkSourceSwap(quoteHash: string): Promise<string> {
	const startedAt = Date.now();
	while (true) {
		const swap = await getBlinkSourceSwap(quoteHash);
		if (swap?.status === 'executed') {
			return swap.swapTx ?? swap.openTx;
		}
		let overdue: boolean;
		if (swap) {
			overdue = Date.now() > Date.parse(swap.expiresAt) + SOURCE_SWAP_SETTLE_MS;
		} else {
			overdue = Date.now() - startedAt > SOURCE_SWAP_UNSEEN_MS;
		}
		if (swap?.status === 'lapsed' || overdue) {
			const order = await getBlinkOrder(quoteHash);
			if (order?.srcTx) {
				return order.srcTx;
			}
			throw new Error(
				`The Blink source swap did not run (${swap?.reason ?? 'expired'}); the funds never left the wallet`
			);
		}
		await wait(SOURCE_SWAP_POLL_MS);
	}
}
