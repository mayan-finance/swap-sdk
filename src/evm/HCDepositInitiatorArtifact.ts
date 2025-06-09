export default {
	abi: [
		{
			type: 'constructor',
			inputs: [
				{ name: '_hcProcessor', type: 'address', internalType: 'address' },
				{
					name: '_usdc',
					type: 'address',
					internalType: 'address',
				},
			],
			stateMutability: 'nonpayable',
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
			name: 'deposit',
			inputs: [
				{ name: 'tokenIn', type: 'address', internalType: 'address' },
				{
					name: 'amountIn',
					type: 'uint256',
					internalType: 'uint256',
				},
				{ name: 'trader', type: 'address', internalType: 'address' },
				{
					name: 'gasDrop',
					type: 'uint64',
					internalType: 'uint64',
				},
				{
					name: 'depositPayload',
					type: 'tuple',
					internalType: 'struct HCDepositInitiator.DepositPayload',
					components: [
						{ name: 'relayerFee', type: 'uint64', internalType: 'uint64' },
						{
							name: 'permit',
							type: 'tuple',
							internalType: 'struct IHCBridge.DepositWithPermit',
							components: [
								{ name: 'user', type: 'address', internalType: 'address' },
								{
									name: 'usd',
									type: 'uint64',
									internalType: 'uint64',
								},
								{ name: 'deadline', type: 'uint64', internalType: 'uint64' },
								{
									name: 'signature',
									type: 'tuple',
									internalType: 'struct IHCBridge.Signature',
									components: [
										{ name: 'r', type: 'uint256', internalType: 'uint256' },
										{
											name: 's',
											type: 'uint256',
											internalType: 'uint256',
										},
										{ name: 'v', type: 'uint8', internalType: 'uint8' },
									],
								},
							],
						},
					],
				},
			],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'function',
			name: 'fastDeposit',
			inputs: [
				{ name: 'tokenIn', type: 'address', internalType: 'address' },
				{
					name: 'amountIn',
					type: 'uint256',
					internalType: 'uint256',
				},
				{ name: 'trader', type: 'address', internalType: 'address' },
				{
					name: 'circleMaxFee',
					type: 'uint256',
					internalType: 'uint256',
				},
				{ name: 'gasDrop', type: 'uint64', internalType: 'uint64' },
				{
					name: 'referrerAddress',
					type: 'bytes32',
					internalType: 'bytes32',
				},
				{ name: 'referrerBps', type: 'uint8', internalType: 'uint8' },
				{
					name: 'minFinalityThreshold',
					type: 'uint32',
					internalType: 'uint32',
				},
				{
					name: 'depositPayload',
					type: 'tuple',
					internalType: 'struct HCDepositInitiator.DepositPayload',
					components: [
						{ name: 'relayerFee', type: 'uint64', internalType: 'uint64' },
						{
							name: 'permit',
							type: 'tuple',
							internalType: 'struct IHCBridge.DepositWithPermit',
							components: [
								{ name: 'user', type: 'address', internalType: 'address' },
								{
									name: 'usd',
									type: 'uint64',
									internalType: 'uint64',
								},
								{ name: 'deadline', type: 'uint64', internalType: 'uint64' },
								{
									name: 'signature',
									type: 'tuple',
									internalType: 'struct IHCBridge.Signature',
									components: [
										{ name: 'r', type: 'uint256', internalType: 'uint256' },
										{
											name: 's',
											type: 'uint256',
											internalType: 'uint256',
										},
										{ name: 'v', type: 'uint8', internalType: 'uint8' },
									],
								},
							],
						},
					],
				},
			],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'function',
			name: 'fastMCTP',
			inputs: [],
			outputs: [{ name: '', type: 'address', internalType: 'address' }],
			stateMutability: 'view',
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
			name: 'mayanCircle',
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
			name: 'setFastMCTP',
			inputs: [{ name: '_fastMCTP', type: 'address', internalType: 'address' }],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{
			type: 'function',
			name: 'setMayanCircle',
			inputs: [
				{ name: '_mayanCircle', type: 'address', internalType: 'address' },
			],
			outputs: [],
			stateMutability: 'nonpayable',
		},
		{ type: 'error', name: 'AlreadySet', inputs: [] },
		{
			type: 'error',
			name: 'InsufficientAmount',
			inputs: [],
		},
		{ type: 'error', name: 'Unauthorized', inputs: [] },
	],
};
