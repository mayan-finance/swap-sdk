export default {
	abi: [
		{
			type: 'constructor',
			inputs: [
				{ name: '_forwarderAddress', type: 'address', internalType: 'address' },
			],
			stateMutability: 'nonpayable',
		},
		{ type: 'receive', stateMutability: 'payable' },
		{
			type: 'function',
			name: 'ForwarderAddress',
			inputs: [],
			outputs: [{ name: '', type: 'address', internalType: 'address' }],
			stateMutability: 'view',
		},
		{
			type: 'function',
			name: 'MAX_REFERRER_BPS',
			inputs: [],
			outputs: [{ name: '', type: 'uint8', internalType: 'uint8' }],
			stateMutability: 'view',
		},
		{
			type: 'function',
			name: 'changeGuardian',
			inputs: [
				{ name: 'newGuardian', type: 'address', internalType: 'address' },
			],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'function',
			name: 'claimGuardian',
			inputs: [],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'function',
			name: 'guardian',
			inputs: [],
			outputs: [{ name: '', type: 'address', internalType: 'address' }],
			stateMutability: 'view',
		},
		{
			type: 'function',
			name: 'nextGuardian',
			inputs: [],
			outputs: [{ name: '', type: 'address', internalType: 'address' }],
			stateMutability: 'view',
		},
		{
			type: 'function',
			name: 'rescueETH',
			inputs: [
				{ name: 'to', type: 'address', internalType: 'address' },
				{
					name: 'amount',
					type: 'uint256',
					internalType: 'uint256',
				},
			],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'function',
			name: 'rescueToken',
			inputs: [
				{ name: 'token', type: 'address', internalType: 'address' },
				{
					name: 'to',
					type: 'address',
					internalType: 'address',
				},
				{ name: 'amount', type: 'uint256', internalType: 'uint256' },
			],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'function',
			name: 'transferEth',
			inputs: [
				{ name: 'to', type: 'address', internalType: 'address' },
				{
					name: 'referrerAddr',
					type: 'address',
					internalType: 'address',
				},
				{ name: 'referrerBps', type: 'uint8', internalType: 'uint8' },
			],
			outputs: [],
			stateMutability: 'payable',
		},
		{
			type: 'function',
			name: 'transferToken',
			inputs: [
				{ name: 'token', type: 'address', internalType: 'address' },
				{
					name: 'amount',
					type: 'uint256',
					internalType: 'uint256',
				},
				{ name: 'to', type: 'address', internalType: 'address' },
				{
					name: 'referrerAddr',
					type: 'address',
					internalType: 'address',
				},
				{ name: 'referrerBps', type: 'uint8', internalType: 'uint8' },
			],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'event',
			name: 'EthTransferred',
			inputs: [
				{
					name: 'to',
					type: 'address',
					indexed: false,
					internalType: 'address',
				},
				{
					name: 'amount',
					type: 'uint256',
					indexed: false,
					internalType: 'uint256',
				},
			],
			anonymous: false,
		},
		{
			type: 'event',
			name: 'TokenTransferred',
			inputs: [
				{
					name: 'token',
					type: 'address',
					indexed: false,
					internalType: 'address',
				},
				{
					name: 'to',
					type: 'address',
					indexed: false,
					internalType: 'address',
				},
				{
					name: 'amount',
					type: 'uint256',
					indexed: false,
					internalType: 'uint256',
				},
			],
			anonymous: false,
		},
		{ type: 'error', name: 'InvalidReferrerBps', inputs: [] },
		{
			type: 'error',
			name: 'Unauthorized',
			inputs: [],
		},
	],
};
