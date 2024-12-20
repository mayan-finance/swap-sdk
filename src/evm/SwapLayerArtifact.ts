export default {
	abi: [
		{
			type: 'function',
			name: 'batchMaxApprove',
			inputs: [{ name: 'approvals', type: 'bytes', internalType: 'bytes' }],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'function',
			name: 'initiate',
			inputs: [
				{ name: 'recipient', type: 'bytes32', internalType: 'bytes32' },
				{
					name: 'overrideAmountIn',
					type: 'uint256',
					internalType: 'uint256',
				},
				{ name: 'targetChain', type: 'uint16', internalType: 'uint16' },
				{
					name: 'params',
					type: 'bytes',
					internalType: 'bytes',
				},
			],
			outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
			stateMutability: 'payable',
		},
		{
			type: 'error',
			name: 'ChainNotSupported',
			inputs: [{ name: 'chain', type: 'uint16', internalType: 'uint16' }],
		},
		{
			type: 'error',
			name: 'DeadlineExpired',
			inputs: [
				{ name: 'blocktime', type: 'uint256', internalType: 'uint256' },
				{
					name: 'deadline',
					type: 'uint256',
					internalType: 'uint256',
				},
			],
		},
		{ type: 'error', name: 'EthTransferFailed', inputs: [] },
		{
			type: 'error',
			name: 'ExceedsMaxGasDropoff',
			inputs: [
				{ name: 'requested', type: 'uint256', internalType: 'uint256' },
				{
					name: 'maximum',
					type: 'uint256',
					internalType: 'uint256',
				},
			],
		},
		{
			type: 'error',
			name: 'ExceedsMaxRelayingFee',
			inputs: [
				{ name: 'fee', type: 'uint256', internalType: 'uint256' },
				{
					name: 'maximum',
					type: 'uint256',
					internalType: 'uint256',
				},
			],
		},
		{
			type: 'error',
			name: 'InsufficientInputAmount',
			inputs: [
				{ name: 'input', type: 'uint256', internalType: 'uint256' },
				{
					name: 'minimum',
					type: 'uint256',
					internalType: 'uint256',
				},
			],
		},
		{
			type: 'error',
			name: 'InvalidAddress',
			inputs: [{ name: 'addr', type: 'bytes32', internalType: 'bytes32' }],
		},
		{
			type: 'error',
			name: 'InvalidBoolVal',
			inputs: [{ name: 'val', type: 'uint8', internalType: 'uint8' }],
		},
		{
			type: 'error',
			name: 'InvalidOverrideAmount',
			inputs: [
				{ name: 'received', type: 'uint256', internalType: 'uint256' },
				{
					name: 'maximum',
					type: 'uint256',
					internalType: 'uint256',
				},
			],
		},
		{
			type: 'error',
			name: 'InvalidSwapType',
			inputs: [{ name: 'swapType', type: 'uint256', internalType: 'uint256' }],
		},
		{
			type: 'error',
			name: 'InvalidSwapTypeForChain',
			inputs: [
				{ name: 'chain', type: 'uint16', internalType: 'uint16' },
				{
					name: 'swapType',
					type: 'uint256',
					internalType: 'uint256',
				},
			],
		},
		{
			type: 'error',
			name: 'LengthMismatch',
			inputs: [
				{ name: 'encodedLength', type: 'uint256', internalType: 'uint256' },
				{
					name: 'expectedLength',
					type: 'uint256',
					internalType: 'uint256',
				},
			],
		},
		{ type: 'error', name: 'RelayingDisabledForChain', inputs: [] },
	],
};

