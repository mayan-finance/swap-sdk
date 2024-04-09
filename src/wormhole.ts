import { PublicKey } from '@solana/web3.js';
import addresses from './addresses';
import { Buffer } from 'buffer';

export function getWormholePDAs(supplierProgram: string): {
	bridgeConfig: PublicKey,
	sequenceKey: PublicKey,
	feeCollector: PublicKey,
	emitter: PublicKey,
} {
	const wormholeProgramId = new PublicKey(addresses.WORMHOLE_PROGRAM_ID);
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
	return {
		bridgeConfig,
		sequenceKey,
		feeCollector,
		emitter,
	};
}

