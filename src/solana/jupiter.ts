import { Buffer } from 'buffer';

export function decodeJupiterV6InsArgs(args: Uint8Array): {
	in_amount: bigint;
	quoted_out_amount: bigint;
	slippage_bps: number;
	platform_fee_bps: number;
} {
	console.log('new decodeJupiterV6InsArgs called');
	const routeV2DiscHex = 'bb64facc31c4af14';
	const sharedAccountsRouteV2DiscHex = 'd19853937cfed8e9';
	const discHex = Buffer.from(args.subarray(0, 8)).toString('hex').toLowerCase();
	const data = Buffer.from(args.subarray(8));
	if (discHex === routeV2DiscHex) {
		const in_amount = data.readBigUInt64LE(0);
		const quoted_out_amount = data.readBigUInt64LE(8);
		const slippage_bps = data.readUInt16LE(16);
		const platform_fee_bps = data.readUInt16LE(18);
		return {
			in_amount,
			quoted_out_amount,
			slippage_bps,
			platform_fee_bps,
		};
	} else if (discHex === sharedAccountsRouteV2DiscHex) {
		const in_amount = data.readBigUInt64LE(1);
		const quoted_out_amount = data.readBigUInt64LE(9);
		const slippage_bps = data.readUInt16LE(17);
		const platform_fee_bps = data.readUInt16LE(19);
		return {
			in_amount,
			quoted_out_amount,
			slippage_bps,
			platform_fee_bps,
		};
	} else {
		throw new Error(`Unsupported Jupiter V6 instruction discriminator: ${discHex}`);
	}
}


