import { PublicKey } from '@solana/web3.js';
import addresses from './addresses';
import { Buffer } from 'buffer';

export function getWormholePDAs(supplierProgram: string): {
	bridgeConfig: PublicKey,
	sequenceKey: PublicKey,
	feeCollector: PublicKey,
	emitter: PublicKey,
	shimEventAuth: PublicKey,
	shimMessage: PublicKey,
} {
	const wormholeProgramId = new PublicKey(addresses.WORMHOLE_PROGRAM_ID);
	const wormholeShimProgramId = new PublicKey(addresses.WORMHOLE_SHIM_POST_MESSAGE_PROGRAM_ID);
	const programId = new PublicKey(supplierProgram);
	const [ bridgeConfig ] = PublicKey.findProgramAddressSync(
		[Buffer.from('Bridge')],
		wormholeProgramId,
	);
	const [emitter] = PublicKey.findProgramAddressSync(
		[Buffer.from('emitter')],
		programId,
	);
	const [sequenceKey] = PublicKey.findProgramAddressSync(
		[Buffer.from('Sequence'), emitter.toBuffer()],
		wormholeProgramId,
	);
	const [feeCollector] = PublicKey.findProgramAddressSync(
		[Buffer.from('fee_collector')],
		wormholeProgramId,
	);
	const [shimMessage] = PublicKey.findProgramAddressSync(
		[emitter.toBuffer()],
		wormholeShimProgramId,
	);
	const [shimEventAuth] = PublicKey.findProgramAddressSync(
		[Buffer.from('__event_authority')],
		wormholeShimProgramId,
	);
	return {
		bridgeConfig,
		sequenceKey,
		feeCollector,
		emitter,
		shimEventAuth,
		shimMessage,
	};
}

