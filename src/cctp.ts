import { PublicKey } from '@solana/web3.js';
import addresses from './addresses';
import { Buffer } from 'buffer';
import {ChainName} from "./types";

export const CCTP_TOKEN_DECIMALS = 6;
export function getCCTPDomain(chain: ChainName): number {
	switch (chain) {
		case 'ethereum':
			return 0;
		case 'avalanche':
			return 1;
		case 'optimism':
			return 2;
		case 'arbitrum':
			return 3;
		case 'solana':
			return 5;
		case 'base':
			return 6;
		case 'polygon':
			return 7;
		case 'sui':
			return 8;
		case 'unichain':
			return 10;
		case 'linea':
			return 11;
		case 'sonic':
			return 13;
		case 'hyperevm':
			return 19;
		default:
			throw new Error('unsupported chain for cctp');
	}
}

export function getCCTPBridgePDAs(mint: PublicKey, destinationChain: ChainName): {
	messageTransmitter: PublicKey,
	senderAuthority: PublicKey,
	localToken: PublicKey,
	tokenMessenger: PublicKey,
	tokenMinter: PublicKey,
	remoteTokenMessengerKey: PublicKey,
	eventAuthCore: PublicKey,
	eventAuthToken: PublicKey,
} {
	const cctpCoreProgramId = new PublicKey(addresses.CCTP_CORE_PROGRAM_ID);
	const cctpTokenProgramId = new PublicKey(addresses.CCTP_TOKEN_PROGRAM_ID);

	const [messageTransmitter] = PublicKey.findProgramAddressSync(
		[Buffer.from('message_transmitter')],
		cctpCoreProgramId,
	);

	const [senderAuthority] = PublicKey.findProgramAddressSync(
		[Buffer.from('sender_authority')],
		cctpTokenProgramId,
	);

	const [localToken] = PublicKey.findProgramAddressSync(
		[Buffer.from('local_token'), mint.toBytes()],
		cctpTokenProgramId,
	);

	const [tokenMessenger] = PublicKey.findProgramAddressSync(
		[Buffer.from('token_messenger')],
		cctpTokenProgramId,
	);
	const [tokenMinter] = PublicKey.findProgramAddressSync(
		[Buffer.from('token_minter')],
		cctpTokenProgramId,
	);

	const destinationDomain = getCCTPDomain(destinationChain);

	const [remoteTokenMessengerKey] = PublicKey.findProgramAddressSync(
		[Buffer.from('remote_token_messenger'), Buffer.from(destinationDomain.toString())],
		cctpTokenProgramId,
	);

	const [eventAuthCore] = PublicKey.findProgramAddressSync(
		[Buffer.from('__event_authority')],
		cctpCoreProgramId,
	);

	const [eventAuthToken] = PublicKey.findProgramAddressSync(
		[Buffer.from('__event_authority')],
		cctpTokenProgramId,
	);

	return {
		messageTransmitter,
		senderAuthority,
		remoteTokenMessengerKey,
		tokenMessenger,
		tokenMinter,
		eventAuthToken,
		eventAuthCore,
		localToken,
	}
}

export function getCCTPV2BridgePDAs(
	mint: PublicKey,
	destinationChain: ChainName,
	ledger: PublicKey,
	trader: PublicKey,
): {
	messageTransmitter: PublicKey,
	senderAuthority: PublicKey,
	localToken: PublicKey,
	tokenMessenger: PublicKey,
	tokenMinter: PublicKey,
	remoteTokenMessengerKey: PublicKey,
	eventAuthCore: PublicKey,
	eventAuthToken: PublicKey,
	cctpDenyListAccount: PublicKey,
	realDenyListAccount: PublicKey,
} {
	const cctpV2CoreProgramId = new PublicKey(addresses.CCTPV2_CORE_PROGRAM_ID);
	const cctpV2TokenProgramId = new PublicKey(addresses.CCTPV2_TOKEN_PROGRAM_ID);

	const [messageTransmitter] = PublicKey.findProgramAddressSync(
		[Buffer.from('message_transmitter')],
		cctpV2CoreProgramId,
	);

	const [senderAuthority] = PublicKey.findProgramAddressSync(
		[Buffer.from('sender_authority')],
		cctpV2TokenProgramId,
	);

	const [localToken] = PublicKey.findProgramAddressSync(
		[Buffer.from('local_token'), mint.toBytes()],
		cctpV2TokenProgramId,
	);

	const [tokenMessenger] = PublicKey.findProgramAddressSync(
		[Buffer.from('token_messenger')],
		cctpV2TokenProgramId,
	);
	const [tokenMinter] = PublicKey.findProgramAddressSync(
		[Buffer.from('token_minter')],
		cctpV2TokenProgramId,
	);

	const destinationDomain = getCCTPDomain(destinationChain);

	const [remoteTokenMessengerKey] = PublicKey.findProgramAddressSync(
		[Buffer.from('remote_token_messenger'), Buffer.from(destinationDomain.toString())],
		cctpV2TokenProgramId,
	);

	const [eventAuthCore] = PublicKey.findProgramAddressSync(
		[Buffer.from('__event_authority')],
		cctpV2CoreProgramId,
	);

	const [eventAuthToken] = PublicKey.findProgramAddressSync(
		[Buffer.from('__event_authority')],
		cctpV2TokenProgramId,
	);

	const [cctpDenyListAccount] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('denylist_account'),
			ledger.toBytes(),
		],
		cctpV2TokenProgramId,
	);

	const [realDenyListAccount] = PublicKey.findProgramAddressSync(
		[
			Buffer.from('denylist_account'),
			trader.toBytes(),
		],
		cctpV2TokenProgramId,
	);

	return {
		messageTransmitter,
		senderAuthority,
		remoteTokenMessengerKey,
		tokenMessenger,
		tokenMinter,
		eventAuthToken,
		eventAuthCore,
		localToken,
		cctpDenyListAccount,
		realDenyListAccount,
	}
}
