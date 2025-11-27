import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';

export interface Idl {
	address: string;
	metadata: {
		name: string;
		version: string;
		spec: string;
		description?: string;
	};
	instructions: IdlInstruction[];
	// accounts?: { name: string; discriminator: number[] }[];
	// events?: { name: string; discriminator: number[] }[];
	// errors?: IdlError[];
	types?: IdlTypeDef[];
}

/** Instruction definition */
export interface IdlInstruction {
	name: string;
	discriminator: number[];
	docs?: string[];
	accounts: IdlAccount[];
	args?: IdlField[];
	/** e.g. 'u64' */
	returns?: PrimitiveType;
}

/** Program account (for CPI, PDAs, etc.) */
export interface IdlAccount {
	name: string;
	/** writable? signer? optional? */
	writable?: boolean;
	signer?: boolean;
	optional?: boolean;
	/** literal address (if set) */
	address?: string;
	/** PDA generation info */
	pda?: {
		seeds: Seed[];
		program: { kind: 'const'; value: number[] };
	};
}

/** A PDA seed (either a constant byte array, or another account’s field) */
export type Seed =
	| { kind: 'const'; value: number[] }
	| { kind: 'account'; path: string };

/** Primitive and composite field types */
export type PrimitiveType = 'u8' | 'u16' | 'u32' | 'u64' | 'bool' | 'pubkey';
export type IdlFieldType =
	| PrimitiveType
	| { array: [IdlFieldType, number] }
	| { vec: IdlFieldType }
	| { option: IdlFieldType }
	| { defined: { name: string } };

/** Argument definition */
export interface IdlField {
	name: string;
	type: IdlFieldType;
}

/** Custom types: structs and enums */
export interface IdlTypeDef {
	name: string;
	type:
		| {
				kind: 'struct';
				fields: IdlField[];
		  }
		| {
				kind: 'enum';
				variants: Array<{
					name: string;
					/** optional payload fields */
					fields?: IdlField[];
				}>;
		  };
}

/**
 * Decode an instruction's args given its name and raw data.
 * Assumes data starts with 8-byte Anchor discriminator.
 */
export function decodeInstructionArgs(
	idl: Idl,
	data: Buffer
): Record<string, any> {
	// 1. verify discriminator
	const disc = data.subarray(0, 8);

	// 2. find instruction args definition
	const ix = idl.instructions.find(
		(ix) =>
			Buffer.from(ix.discriminator).toString('hex').toLowerCase() ===
			Buffer.from(disc).toString('hex').toLowerCase()
	);
	if (!ix)
		throw new Error(
			`Instruction ${Buffer.from(disc).toString('hex')} not in IDL`
		);
	const argsDef = ix.args || [];

	// 3. decode each arg in sequence
	const result: Record<string, any> = {};
	let offset = 8;
	for (const field of argsDef) {
		const [value, newOffset] = decodeType(field.type, data, offset, idl);
		result[field.name] = value;
		offset = newOffset;
	}

	return result;
}

/**
 * Recursively decode a value of given type from buffer at offset.
 * Returns [decodedValue, nextOffset]
 */
function decodeType(
	type: IdlFieldType,
	buffer: Buffer,
	offset: number,
	idl: Idl
): [any, number] {
	// Primitive types
	if (typeof type === 'string') {
		switch (type) {
			case 'u8':
				return [buffer.readUInt8(offset), offset + 1];
			case 'u16':
				return [buffer.readUInt16LE(offset), offset + 2];
			case 'u32':
				return [buffer.readUInt32LE(offset), offset + 4];
			case 'u64': {
				const val = buffer.readBigUInt64LE(offset);
				// return as BigInt
				return [val, offset + 8];
			}
			case 'bool':
				return [buffer.readUInt8(offset) !== 0, offset + 1];
			case 'pubkey': {
				const slice = buffer.subarray(offset, offset + 32);
				return [new PublicKey(slice), offset + 32];
			}
			default:
				throw new Error(`Unknown primitive: ${type}`);
		}
	}

	// Fixed array [innerType, length]
	if ('array' in type) {
		const [innerType, len] = type.array;
		const arr = [];
		let cur = offset;
		for (let i = 0; i < len; i++) {
			const [v, next] = decodeType(innerType, buffer, cur, idl);
			arr.push(v);
			cur = next;
		}
		return [arr, cur];
	}

	// Defined custom type
	if ('defined' in type) {
		const def = idl.types?.find((t) => t.name === type.defined.name);
		if (!def) {
			throw new Error(`Type ${type.defined} not found`);
		}
		if (def.type.kind === 'struct') {
			const obj: any = {};
			let cur = offset;
			for (const f of def.type.fields) {
				const [v, next] = decodeType(f.type, buffer, cur, idl);
				obj[f.name] = v;
				cur = next;
			}
			return [obj, cur];
		} else {
			// enum: first byte is variant index
			const idx = buffer.readUInt8(offset);
			const variant = def.type.variants[idx];
			if (!variant) throw new Error(`Invalid enum index ${idx}`);
			let cur = offset + 1;
			const payload: any = { variant: variant.name };
			if (variant.fields && variant.fields.length) {
				const vals: any[] = [];
				for (const f of variant.fields) {
					const [v, next] = decodeType(f.type, buffer, cur, idl);
					vals.push(v);
					cur = next;
				}
				payload.fields = vals;
			}
			return [payload, cur];
		}
	}

	// Option<T> => 1-byte present flag + value
	if ('option' in type) {
		const flag = buffer.readUInt8(offset);
		if (flag === 0) return [null, offset + 1];
		return decodeType(type.option, buffer, offset + 1, idl);
	}

	// Vec<T> => 4-byte length + elements
	if ('vec' in type) {
		const len = buffer.readUInt32LE(offset);
		let cur = offset + 4;
		const arr: any[] = [];
		for (let i = 0; i < len; i++) {
			const [v, next] = decodeType(type.vec, buffer, cur, idl);
			arr.push(v);
			cur = next;
		}
		return [arr, cur];
	}

	throw new Error(`Unsupported type shape: ${JSON.stringify(type)}`);
}

export function decodeJupiterV6InsArgs(args: Uint8Array) {
	return decodeInstructionArgs(jupV6Idl, Buffer.from(args));
}

const jupV6Idl: Idl & any = {
	address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
	metadata: {
		name: 'jupiter',
		version: '0.1.0',
		spec: '0.1.0',
		description: 'Jupiter aggregator program',
	},
	instructions: [
		{
			name: 'route',
			discriminator: [229, 23, 203, 151, 122, 227, 173, 42],
			accounts: [
				{
					name: 'token_program',
				},
				{
					name: 'user_transfer_authority',
					signer: true,
				},
				{
					name: 'user_source_token_account',
					writable: true,
				},
				{
					name: 'user_destination_token_account',
					writable: true,
				},
				{
					name: 'destination_token_account',
					writable: true,
					optional: true,
				},
				{
					name: 'destination_mint',
				},
				{
					name: 'platform_fee_account',
					writable: true,
					optional: true,
				},
				{
					name: 'event_authority',
					address: 'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',
				},
				{
					name: 'program',
				},
			],
			args: [
				{
					name: 'route_plan',
					type: {
						vec: {
							defined: {
								name: 'RoutePlanStep',
							},
						},
					},
				},
				{
					name: 'in_amount',
					type: 'u64',
				},
				{
					name: 'quoted_out_amount',
					type: 'u64',
				},
				{
					name: 'slippage_bps',
					type: 'u16',
				},
				{
					name: 'platform_fee_bps',
					type: 'u8',
				},
			],
			returns: 'u64',
		},
		{
			name: 'shared_accounts_route',
			discriminator: [193, 32, 155, 51, 65, 214, 156, 129],
			accounts: [
				{
					name: 'token_program',
				},
				{
					name: 'program_authority',
				},
				{
					name: 'user_transfer_authority',
					signer: true,
				},
				{
					name: 'source_token_account',
					writable: true,
				},
				{
					name: 'program_source_token_account',
					writable: true,
				},
				{
					name: 'program_destination_token_account',
					writable: true,
				},
				{
					name: 'destination_token_account',
					writable: true,
				},
				{
					name: 'source_mint',
				},
				{
					name: 'destination_mint',
				},
				{
					name: 'platform_fee_account',
					writable: true,
					optional: true,
				},
				{
					name: 'token_2022_program',
					optional: true,
				},
				{
					name: 'event_authority',
					address: 'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',
				},
				{
					name: 'program',
				},
			],
			args: [
				{
					name: 'id',
					type: 'u8',
				},
				{
					name: 'route_plan',
					type: {
						vec: {
							defined: {
								name: 'RoutePlanStep',
							},
						},
					},
				},
				{
					name: 'in_amount',
					type: 'u64',
				},
				{
					name: 'quoted_out_amount',
					type: 'u64',
				},
				{
					name: 'slippage_bps',
					type: 'u16',
				},
				{
					name: 'platform_fee_bps',
					type: 'u8',
				},
			],
			returns: 'u64',
		},
		{
			name: 'route_v2',
			discriminator: [187, 100, 250, 204, 49, 196, 175, 20],
			accounts: [
				{
					name: 'user_transfer_authority',
					signer: true,
				},
				{
					name: 'user_source_token_account',
					writable: true,
				},
				{
					name: 'user_destination_token_account',
					writable: true,
				},
				{
					name: 'source_mint',
				},
				{
					name: 'destination_mint',
				},
				{
					name: 'source_token_program',
				},
				{
					name: 'destination_token_program',
				},
				{
					name: 'destination_token_account',
					writable: true,
					optional: true,
				},
				{
					name: 'event_authority',
					address: 'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',
				},
				{
					name: 'program',
				},
			],
			args: [
				{
					name: 'in_amount',
					type: 'u64',
				},
				{
					name: 'quoted_out_amount',
					type: 'u64',
				},
				{
					name: 'slippage_bps',
					type: 'u16',
				},
				{
					name: 'platform_fee_bps',
					type: 'u16',
				},
				{
					name: 'positive_slippage_bps',
					type: 'u16',
				},
				{
					name: 'route_plan',
					type: {
						vec: {
							defined: {
								name: 'RoutePlanStepV2',
							},
						},
					},
				},
			],
			returns: 'u64',
		},
		{
			name: 'shared_accounts_route_v2',
			discriminator: [209, 152, 83, 147, 124, 254, 216, 233],
			accounts: [
				{
					name: 'program_authority',
				},
				{
					name: 'user_transfer_authority',
					signer: true,
				},
				{
					name: 'source_token_account',
					writable: true,
				},
				{
					name: 'program_source_token_account',
					writable: true,
				},
				{
					name: 'program_destination_token_account',
					writable: true,
				},
				{
					name: 'destination_token_account',
					writable: true,
				},
				{
					name: 'source_mint',
				},
				{
					name: 'destination_mint',
				},
				{
					name: 'source_token_program',
				},
				{
					name: 'destination_token_program',
				},
				{
					name: 'event_authority',
					address: 'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',
				},
				{
					name: 'program',
				},
			],
			args: [
				{
					name: 'id',
					type: 'u8',
				},
				{
					name: 'in_amount',
					type: 'u64',
				},
				{
					name: 'quoted_out_amount',
					type: 'u64',
				},
				{
					name: 'slippage_bps',
					type: 'u16',
				},
				{
					name: 'platform_fee_bps',
					type: 'u16',
				},
				{
					name: 'positive_slippage_bps',
					type: 'u16',
				},
				{
					name: 'route_plan',
					type: {
						vec: {
							defined: {
								name: 'RoutePlanStepV2',
							},
						},
					},
				},
			],
			returns: 'u64',
		},
	],
	types: [
		{
			name: 'FeeEvent',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'account',
						type: 'pubkey',
					},
					{
						name: 'mint',
						type: 'pubkey',
					},
					{
						name: 'amount',
						type: 'u64',
					},
				],
			},
		},
		{
			name: 'RemainingAccountsInfo',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'slices',
						type: {
							vec: {
								defined: {
									name: 'RemainingAccountsSlice',
								},
							},
						},
					},
				],
			},
		},
		{
			name: 'RemainingAccountsSlice',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'accounts_type',
						type: 'u8',
					},
					{
						name: 'length',
						type: 'u8',
					},
				],
			},
		},
		{
			name: 'AccountsType',
			type: {
				kind: 'enum',
				variants: [
					{
						name: 'TransferHookA',
					},
					{
						name: 'TransferHookB',
					},
					{
						name: 'TransferHookReward',
					},
					{
						name: 'TransferHookInput',
					},
					{
						name: 'TransferHookIntermediate',
					},
					{
						name: 'TransferHookOutput',
					},
					{
						name: 'SupplementalTickArrays',
					},
					{
						name: 'SupplementalTickArraysOne',
					},
					{
						name: 'SupplementalTickArraysTwo',
					},
				],
			},
		},
		{
			name: 'DefiTunaAccountsType',
			type: {
				kind: 'enum',
				variants: [
					{
						name: 'TransferHookA',
					},
					{
						name: 'TransferHookB',
					},
					{
						name: 'TransferHookInput',
					},
					{
						name: 'TransferHookIntermediate',
					},
					{
						name: 'TransferHookOutput',
					},
					{
						name: 'SupplementalTickArrays',
					},
					{
						name: 'SupplementalTickArraysOne',
					},
					{
						name: 'SupplementalTickArraysTwo',
					},
				],
			},
		},
		{
			name: 'RoutePlanStep',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'swap',
						type: {
							defined: {
								name: 'Swap',
							},
						},
					},
					{
						name: 'percent',
						type: 'u8',
					},
					{
						name: 'input_index',
						type: 'u8',
					},
					{
						name: 'output_index',
						type: 'u8',
					},
				],
			},
		},
		{
			name: 'RoutePlanStepV2',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'swap',
						type: {
							defined: {
								name: 'Swap',
							},
						},
					},
					{
						name: 'bps',
						type: 'u16',
					},
					{
						name: 'input_index',
						type: 'u8',
					},
					{
						name: 'output_index',
						type: 'u8',
					},
				],
			},
		},
		{
			name: 'Side',
			type: {
				kind: 'enum',
				variants: [
					{
						name: 'Bid',
					},
					{
						name: 'Ask',
					},
				],
			},
		},
		{
			name: 'Swap',
			type: {
				kind: 'enum',
				variants: [
					{
						name: 'Saber',
					},
					{
						name: 'SaberAddDecimalsDeposit',
					},
					{
						name: 'SaberAddDecimalsWithdraw',
					},
					{
						name: 'TokenSwap',
					},
					{
						name: 'Sencha',
					},
					{
						name: 'Step',
					},
					{
						name: 'Cropper',
					},
					{
						name: 'Raydium',
					},
					{
						name: 'Crema',
						fields: [
							{
								name: 'a_to_b',
								type: 'bool',
							},
						],
					},
					{
						name: 'Lifinity',
					},
					{
						name: 'Mercurial',
					},
					{
						name: 'Cykura',
					},
					{
						name: 'Serum',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'MarinadeDeposit',
					},
					{
						name: 'MarinadeUnstake',
					},
					{
						name: 'Aldrin',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'AldrinV2',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'Whirlpool',
						fields: [
							{
								name: 'a_to_b',
								type: 'bool',
							},
						],
					},
					{
						name: 'Invariant',
						fields: [
							{
								name: 'x_to_y',
								type: 'bool',
							},
						],
					},
					{
						name: 'Meteora',
					},
					{
						name: 'GooseFX',
					},
					{
						name: 'DeltaFi',
						fields: [
							{
								name: 'stable',
								type: 'bool',
							},
						],
					},
					{
						name: 'Balansol',
					},
					{
						name: 'MarcoPolo',
						fields: [
							{
								name: 'x_to_y',
								type: 'bool',
							},
						],
					},
					{
						name: 'Dradex',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'LifinityV2',
					},
					{
						name: 'RaydiumClmm',
					},
					{
						name: 'Openbook',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'Phoenix',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'Symmetry',
						fields: [
							{
								name: 'from_token_id',
								type: 'u64',
							},
							{
								name: 'to_token_id',
								type: 'u64',
							},
						],
					},
					{
						name: 'TokenSwapV2',
					},
					{
						name: 'HeliumTreasuryManagementRedeemV0',
					},
					{
						name: 'StakeDexStakeWrappedSol',
					},
					{
						name: 'StakeDexSwapViaStake',
						fields: [
							{
								name: 'bridge_stake_seed',
								type: 'u32',
							},
						],
					},
					{
						name: 'GooseFXV2',
					},
					{
						name: 'Perps',
					},
					{
						name: 'PerpsAddLiquidity',
					},
					{
						name: 'PerpsRemoveLiquidity',
					},
					{
						name: 'MeteoraDlmm',
					},
					{
						name: 'OpenBookV2',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'RaydiumClmmV2',
					},
					{
						name: 'StakeDexPrefundWithdrawStakeAndDepositStake',
						fields: [
							{
								name: 'bridge_stake_seed',
								type: 'u32',
							},
						],
					},
					{
						name: 'Clone',
						fields: [
							{
								name: 'pool_index',
								type: 'u8',
							},
							{
								name: 'quantity_is_input',
								type: 'bool',
							},
							{
								name: 'quantity_is_collateral',
								type: 'bool',
							},
						],
					},
					{
						name: 'SanctumS',
						fields: [
							{
								name: 'src_lst_value_calc_accs',
								type: 'u8',
							},
							{
								name: 'dst_lst_value_calc_accs',
								type: 'u8',
							},
							{
								name: 'src_lst_index',
								type: 'u32',
							},
							{
								name: 'dst_lst_index',
								type: 'u32',
							},
						],
					},
					{
						name: 'SanctumSAddLiquidity',
						fields: [
							{
								name: 'lst_value_calc_accs',
								type: 'u8',
							},
							{
								name: 'lst_index',
								type: 'u32',
							},
						],
					},
					{
						name: 'SanctumSRemoveLiquidity',
						fields: [
							{
								name: 'lst_value_calc_accs',
								type: 'u8',
							},
							{
								name: 'lst_index',
								type: 'u32',
							},
						],
					},
					{
						name: 'RaydiumCP',
					},
					{
						name: 'WhirlpoolSwapV2',
						fields: [
							{
								name: 'a_to_b',
								type: 'bool',
							},
							{
								name: 'remaining_accounts_info',
								type: {
									option: {
										defined: {
											name: 'RemainingAccountsInfo',
										},
									},
								},
							},
						],
					},
					{
						name: 'OneIntro',
					},
					{
						name: 'PumpWrappedBuy',
					},
					{
						name: 'PumpWrappedSell',
					},
					{
						name: 'PerpsV2',
					},
					{
						name: 'PerpsV2AddLiquidity',
					},
					{
						name: 'PerpsV2RemoveLiquidity',
					},
					{
						name: 'MoonshotWrappedBuy',
					},
					{
						name: 'MoonshotWrappedSell',
					},
					{
						name: 'StabbleStableSwap',
					},
					{
						name: 'StabbleWeightedSwap',
					},
					{
						name: 'Obric',
						fields: [
							{
								name: 'x_to_y',
								type: 'bool',
							},
						],
					},
					{
						name: 'FoxBuyFromEstimatedCost',
					},
					{
						name: 'FoxClaimPartial',
						fields: [
							{
								name: 'is_y',
								type: 'bool',
							},
						],
					},
					{
						name: 'SolFi',
						fields: [
							{
								name: 'is_quote_to_base',
								type: 'bool',
							},
						],
					},
					{
						name: 'SolayerDelegateNoInit',
					},
					{
						name: 'SolayerUndelegateNoInit',
					},
					{
						name: 'TokenMill',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'DaosFunBuy',
					},
					{
						name: 'DaosFunSell',
					},
					{
						name: 'ZeroFi',
					},
					{
						name: 'StakeDexWithdrawWrappedSol',
					},
					{
						name: 'VirtualsBuy',
					},
					{
						name: 'VirtualsSell',
					},
					{
						name: 'Perena',
						fields: [
							{
								name: 'in_index',
								type: 'u8',
							},
							{
								name: 'out_index',
								type: 'u8',
							},
						],
					},
					{
						name: 'PumpSwapBuy',
					},
					{
						name: 'PumpSwapSell',
					},
					{
						name: 'Gamma',
					},
					{
						name: 'MeteoraDlmmSwapV2',
						fields: [
							{
								name: 'remaining_accounts_info',
								type: {
									defined: {
										name: 'RemainingAccountsInfo',
									},
								},
							},
						],
					},
					{
						name: 'Woofi',
					},
					{
						name: 'MeteoraDammV2',
					},
					{
						name: 'MeteoraDynamicBondingCurveSwap',
					},
					{
						name: 'StabbleStableSwapV2',
					},
					{
						name: 'StabbleWeightedSwapV2',
					},
					{
						name: 'RaydiumLaunchlabBuy',
						fields: [
							{
								name: 'share_fee_rate',
								type: 'u64',
							},
						],
					},
					{
						name: 'RaydiumLaunchlabSell',
						fields: [
							{
								name: 'share_fee_rate',
								type: 'u64',
							},
						],
					},
					{
						name: 'BoopdotfunWrappedBuy',
					},
					{
						name: 'BoopdotfunWrappedSell',
					},
					{
						name: 'Plasma',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'GoonFi',
						fields: [
							{
								name: 'is_bid',
								type: 'bool',
							},
							{
								name: 'blacklist_bump',
								type: 'u8',
							},
						],
					},
					{
						name: 'HumidiFi',
						fields: [
							{
								name: 'swap_id',
								type: 'u64',
							},
							{
								name: 'is_base_to_quote',
								type: 'bool',
							},
						],
					},
					{
						name: 'MeteoraDynamicBondingCurveSwapWithRemainingAccounts',
					},
					{
						name: 'TesseraV',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'PumpWrappedBuyV2',
					},
					{
						name: 'PumpWrappedSellV2',
					},
					{
						name: 'PumpSwapBuyV2',
					},
					{
						name: 'PumpSwapSellV2',
					},
					{
						name: 'Heaven',
						fields: [
							{
								name: 'a_to_b',
								type: 'bool',
							},
						],
					},
					{
						name: 'SolFiV2',
						fields: [
							{
								name: 'is_quote_to_base',
								type: 'bool',
							},
						],
					},
					{
						name: 'Aquifer',
					},
					{
						name: 'PumpWrappedBuyV3',
					},
					{
						name: 'PumpWrappedSellV3',
					},
					{
						name: 'PumpSwapBuyV3',
					},
					{
						name: 'PumpSwapSellV3',
					},
					{
						name: 'JupiterLendDeposit',
					},
					{
						name: 'JupiterLendRedeem',
					},
					{
						name: 'DefiTuna',
						fields: [
							{
								name: 'a_to_b',
								type: 'bool',
							},
							{
								name: 'remaining_accounts_info',
								type: {
									option: {
										defined: {
											name: 'RemainingAccountsInfo',
										},
									},
								},
							},
						],
					},
					{
						name: 'AlphaQ',
						fields: [
							{
								name: 'a_to_b',
								type: 'bool',
							},
						],
					},
					{
						name: 'RaydiumV2',
					},
					{
						name: 'SarosDlmm',
						fields: [
							{
								name: 'swap_for_y',
								type: 'bool',
							},
						],
					},
					{
						name: 'Futarchy',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'MeteoraDammV2WithRemainingAccounts',
					},
					{
						name: 'Obsidian',
					},
					{
						name: 'WhaleStreet',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
					{
						name: 'DynamicV1',
						fields: [
							{
								name: 'candidate_swaps',
								type: {
									vec: {
										defined: {
											name: 'CandidateSwap',
										},
									},
								},
							},
						],
					},
					{
						name: 'PumpWrappedBuyV4',
					},
					{
						name: 'PumpWrappedSellV4',
					},
				],
			},
		},
		{
			name: 'CandidateSwap',
			type: {
				kind: 'enum',
				variants: [
					{
						name: 'HumidiFi',
						fields: [
							{
								name: 'swap_id',
								type: 'u64',
							},
							{
								name: 'is_base_to_quote',
								type: 'bool',
							},
						],
					},
					{
						name: 'TesseraV',
						fields: [
							{
								name: 'side',
								type: {
									defined: {
										name: 'Side',
									},
								},
							},
						],
					},
				],
			},
		},
		{
			name: 'SwapEvent',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'amm',
						type: 'pubkey',
					},
					{
						name: 'input_mint',
						type: 'pubkey',
					},
					{
						name: 'input_amount',
						type: 'u64',
					},
					{
						name: 'output_mint',
						type: 'pubkey',
					},
					{
						name: 'output_amount',
						type: 'u64',
					},
				],
			},
		},
		{
			name: 'SwapEventV2',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'input_mint',
						type: 'pubkey',
					},
					{
						name: 'input_amount',
						type: 'u64',
					},
					{
						name: 'output_mint',
						type: 'pubkey',
					},
					{
						name: 'output_amount',
						type: 'u64',
					},
				],
			},
		},
		{
			name: 'SwapsEvent',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'swap_events',
						type: {
							vec: {
								defined: {
									name: 'SwapEventV2',
								},
							},
						},
					},
				],
			},
		},
		{
			name: 'TokenLedger',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'token_account',
						type: 'pubkey',
					},
					{
						name: 'amount',
						type: 'u64',
					},
				],
			},
		},
		{
			name: 'BestSwapOutAmountViolation',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'expected_out_amount',
						type: 'u64',
					},
					{
						name: 'out_amount',
						type: 'u64',
					},
				],
			},
		},
		{
			name: 'CandidateSwapResult',
			type: {
				kind: 'enum',
				variants: [
					{
						name: 'OutAmount',
						fields: ['u64'],
					},
					{
						name: 'ProgramError',
						fields: ['u64'],
					},
				],
			},
		},
		{
			name: 'CandidateSwapResults',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'results',
						type: {
							vec: {
								defined: {
									name: 'CandidateSwapResult',
								},
							},
						},
					},
				],
			},
		},
	],
};
