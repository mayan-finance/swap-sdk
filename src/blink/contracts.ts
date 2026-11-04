import { toUtf8Bytes, verifyMessage } from 'ethers';
import { getBlinkContracts } from './api';
import type {
	BlinkChainContracts,
	BlinkContractManifest,
	BlinkContractsResponse,
	BlinkGuardianSet,
} from './types';

export const BLINK_GENESIS_GUARDIANS: readonly string[] = [
	'0x4FbA3CE3CC1eb4297E274f42B1C252Ba42F886a6',
	'0x024721C2d41739BCdE70EEc65e73E2B27726dDA9',
	'0x9E497d060D1543Bd360db003Da7a13924a2dB8cb',
];

const CONTRACTS_REFRESH_MS = 2 * 60 * 60 * 1000;

export class BlinkUnregisteredAddressError extends Error {
	constructor(
		readonly chain: string,
		readonly address: string
	) {
		super(`${address} is not a registered Blink contract on ${chain}`);
		this.name = 'BlinkUnregisteredAddressError';
	}
}

export function sameBlinkAddress(a: string, b: string): boolean {
	return a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function blinkGuardianMessage(index: number, members: string[]): string {
	return `blink-guardians:${index}:${members.map((m) => m.toLowerCase()).join(',')}`;
}

function recoveredSigners(message: string | Uint8Array, signatures: string[]): Set<string> {
	const signers = new Set<string>();
	for (const signature of signatures) {
		signers.add(verifyMessage(message, signature).toLowerCase());
	}
	return signers;
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((m, i) => sameBlinkAddress(m, b[i]));
}

/**
 * Walks the guardian set history: set 0 must be the pinned genesis set and every later set
 * must be signed by a majority of the set before it. Returns the latest set.
 */
export function verifyBlinkGuardianSets(
	sets: BlinkGuardianSet[],
	genesis: readonly string[] = BLINK_GENESIS_GUARDIANS
): BlinkGuardianSet {
	const first = sets[0];
	if (!first || first.index !== 0 || !sameMembers(first.members, genesis)) {
		throw new Error('Blink guardian set 0 does not match the pinned genesis set');
	}
	for (let i = 1; i < sets.length; i++) {
		const previous = sets[i - 1];
		const set = sets[i];
		if (set.index !== i) {
			throw new Error(`Blink guardian set ${set.index} is out of sequence`);
		}
		const distinct = new Set(set.members.map((m) => m.toLowerCase()));
		if (set.members.length === 0 || distinct.size !== set.members.length) {
			throw new Error(`Blink guardian set ${i} members must be non-empty and distinct`);
		}
		const signers = recoveredSigners(blinkGuardianMessage(i, set.members), set.signatures);
		const approvals = previous.members.filter((m) => signers.has(m.toLowerCase())).length;
		const quorum = Math.floor(previous.members.length / 2) + 1;
		if (approvals < quorum) {
			throw new Error(
				`Blink guardian set ${i} has ${approvals} of ${previous.members.length} approvals, quorum is ${quorum}`
			);
		}
	}
	return sets[sets.length - 1];
}

export function verifyBlinkManifestSignatures(manifest: string, signatures: string[], members: string[]): void {
	const signers = recoveredSigners(toUtf8Bytes(manifest), signatures);
	const missing = members.find((m) => !signers.has(m.toLowerCase()));
	if (missing) {
		throw new Error(`Blink guardian ${missing} has not signed the contract manifest`);
	}
}

type ManifestJson = {
	guardian_set_index: number;
	chains: Record<string, { router: string; escrow?: string; swap_programs?: string[] }>;
};

function parseManifest(raw: string): BlinkContractManifest {
	const json: ManifestJson = JSON.parse(raw);
	if (typeof json?.guardian_set_index !== 'number' || typeof json?.chains !== 'object' || json.chains === null) {
		throw new Error('Blink contract manifest is malformed');
	}
	const chains: Record<string, BlinkChainContracts> = {};
	for (const [chain, entry] of Object.entries(json.chains)) {
		if (typeof entry?.router !== 'string') {
			throw new Error(`Blink contract manifest entry for ${chain} is malformed`);
		}
		chains[chain] = { router: entry.router, escrow: entry.escrow, swapPrograms: entry.swap_programs ?? [] };
	}
	return { guardianSetIndex: json.guardian_set_index, chains };
}

export function verifyBlinkContracts(
	response: BlinkContractsResponse,
	genesis: readonly string[] = BLINK_GENESIS_GUARDIANS
): BlinkContractManifest {
	const latest = verifyBlinkGuardianSets(response.guardianSets, genesis);
	verifyBlinkManifestSignatures(response.manifest, response.signatures, latest.members);
	const manifest = parseManifest(response.manifest);
	if (manifest.guardianSetIndex !== latest.index) {
		throw new Error(
			`Blink contract manifest is signed under guardian set ${manifest.guardianSetIndex}, latest is ${latest.index}`
		);
	}
	return manifest;
}

let cachedManifest: BlinkContractManifest | undefined;
let cachedAt = 0;
let inflightRefresh: Promise<BlinkContractManifest> | undefined;

async function fetchVerifiedManifest(): Promise<BlinkContractManifest> {
	const manifest = verifyBlinkContracts(await getBlinkContracts());
	if (cachedManifest && manifest.guardianSetIndex < cachedManifest.guardianSetIndex) {
		throw new Error(`Blink contract manifest rolled back to guardian set ${manifest.guardianSetIndex}`);
	}
	cachedManifest = manifest;
	cachedAt = Date.now();
	return manifest;
}

function refreshBlinkManifest(): Promise<BlinkContractManifest> {
	// concurrent callers share one request
	if (!inflightRefresh) {
		inflightRefresh = fetchVerifiedManifest().finally(() => {
			inflightRefresh = undefined;
		});
	}
	return inflightRefresh;
}

/**
 * The guardian-signed contract manifest, cached for two hours. A quote issued under a newer
 * guardian set than the cached manifest triggers a refresh; one issued under an older set is
 * refused.
 */
export async function getBlinkManifest(guardianSetIndex?: number): Promise<BlinkContractManifest> {
	let manifest = cachedManifest;
	if (!manifest || Date.now() - cachedAt > CONTRACTS_REFRESH_MS) {
		manifest = await refreshBlinkManifest();
	}
	if (guardianSetIndex !== undefined && guardianSetIndex > manifest.guardianSetIndex) {
		manifest = await refreshBlinkManifest();
	}
	if (guardianSetIndex !== undefined && guardianSetIndex !== manifest.guardianSetIndex) {
		throw new Error(
			`Blink quote was issued under guardian set ${guardianSetIndex}, latest is ${manifest.guardianSetIndex}`
		);
	}
	return manifest;
}

export async function getBlinkChainContracts(chain: string, guardianSetIndex?: number): Promise<BlinkChainContracts> {
	let contracts = (await getBlinkManifest(guardianSetIndex)).chains[chain];
	if (!contracts) {
		// the chain may have been added since the manifest was cached
		await refreshBlinkManifest();
		contracts = (await getBlinkManifest(guardianSetIndex)).chains[chain];
	}
	if (!contracts) {
		throw new BlinkUnregisteredAddressError(chain, 'every contract');
	}
	return contracts;
}

function isRegistered(contracts: BlinkChainContracts | undefined, address: string): boolean {
	if (!contracts) {
		return false;
	}
	if (sameBlinkAddress(contracts.router, address)) {
		return true;
	}
	return contracts.escrow !== undefined && sameBlinkAddress(contracts.escrow, address);
}

export async function assertBlinkContractRegistered(
	chain: string,
	address: string,
	guardianSetIndex?: number
): Promise<void> {
	let manifest = await getBlinkManifest(guardianSetIndex);
	if (isRegistered(manifest.chains[chain], address)) {
		return;
	}
	// the address may have been registered since the manifest was cached
	await refreshBlinkManifest();
	manifest = await getBlinkManifest(guardianSetIndex);
	if (isRegistered(manifest.chains[chain], address)) {
		return;
	}
	throw new BlinkUnregisteredAddressError(chain, address);
}
