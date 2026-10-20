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
		if (set.members.length === 0 || new Set(set.members.map((m) => m.toLowerCase())).size !== set.members.length) {
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

function isStringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseManifest(raw: string): BlinkContractManifest {
	const parsed: unknown = JSON.parse(raw);
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		typeof (parsed as { guardian_set_index: unknown }).guardian_set_index !== 'number' ||
		typeof (parsed as { chains: unknown }).chains !== 'object'
	) {
		throw new Error('Blink contract manifest is malformed');
	}
	const { guardian_set_index, chains } = parsed as {
		guardian_set_index: number;
		chains: Record<string, Record<string, unknown>>;
	};
	const out: Record<string, BlinkChainContracts> = {};
	for (const [chain, entry] of Object.entries(chains)) {
		const { router, escrow, swap_programs } = entry;
		if (
			typeof router !== 'string' ||
			(escrow !== undefined && typeof escrow !== 'string') ||
			(swap_programs !== undefined && !isStringList(swap_programs))
		) {
			throw new Error(`Blink contract manifest entry for ${chain} is malformed`);
		}
		out[chain] = { router, escrow, swapPrograms: swap_programs ?? [] };
	}
	return { guardianSetIndex: guardian_set_index, chains: out };
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

let cachedManifest: { manifest: BlinkContractManifest; fetchedAt: number } | undefined;
let inflightManifest: Promise<BlinkContractManifest> | undefined;

async function fetchManifest(): Promise<BlinkContractManifest> {
	const manifest = verifyBlinkContracts(await getBlinkContracts());
	if (cachedManifest && manifest.guardianSetIndex < cachedManifest.manifest.guardianSetIndex) {
		throw new Error(`Blink contract manifest rolled back to guardian set ${manifest.guardianSetIndex}`);
	}
	cachedManifest = { manifest, fetchedAt: Date.now() };
	return manifest;
}

function refreshManifest(): Promise<BlinkContractManifest> {
	if (!inflightManifest) {
		inflightManifest = fetchManifest().finally(() => {
			inflightManifest = undefined;
		});
	}
	return inflightManifest;
}

function currentManifest(): Promise<BlinkContractManifest> {
	if (!cachedManifest || Date.now() - cachedManifest.fetchedAt > CONTRACTS_REFRESH_MS) {
		return refreshManifest();
	}
	return Promise.resolve(cachedManifest.manifest);
}

async function manifestFor(guardianSetIndex?: number): Promise<BlinkContractManifest> {
	let current = await currentManifest();
	if (guardianSetIndex !== undefined && guardianSetIndex > current.guardianSetIndex) {
		current = await refreshManifest();
	}
	if (guardianSetIndex !== undefined && guardianSetIndex !== current.guardianSetIndex) {
		throw new Error(
			`Blink quote was issued under guardian set ${guardianSetIndex}, latest is ${current.guardianSetIndex}`
		);
	}
	return current;
}

async function lookup<T>(
	guardianSetIndex: number | undefined,
	pick: (manifest: BlinkContractManifest) => T | undefined,
	missing: () => Error
): Promise<T> {
	const first = pick(await manifestFor(guardianSetIndex));
	if (first !== undefined) {
		return first;
	}
	await refreshManifest();
	const second = pick(await manifestFor(guardianSetIndex));
	if (second !== undefined) {
		return second;
	}
	throw missing();
}

export function getBlinkChainContracts(chain: string, guardianSetIndex?: number): Promise<BlinkChainContracts> {
	return lookup(
		guardianSetIndex,
		(manifest) => manifest.chains[chain],
		() => new BlinkUnregisteredAddressError(chain, 'every contract')
	);
}

export async function assertBlinkContractRegistered(
	chain: string,
	address: string,
	guardianSetIndex?: number
): Promise<void> {
	await lookup(
		guardianSetIndex,
		(manifest) => {
			const contracts = manifest.chains[chain];
			return [contracts?.router, contracts?.escrow].find(
				(registered) => registered !== undefined && sameBlinkAddress(registered, address)
			);
		},
		() => new BlinkUnregisteredAddressError(chain, address)
	);
}
