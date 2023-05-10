export default {
	"_format": "hh-sol-artifact-1",
	"contractName": "MayanSwap",
	"sourceName": "src/MayanSwap.sol",
	"abi": [
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "_tokenBridge",
					"type": "address"
				}
			],
			"stateMutability": "nonpayable",
			"type": "constructor"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": true,
					"internalType": "uint16",
					"name": "emitterChainId",
					"type": "uint16"
				},
				{
					"indexed": true,
					"internalType": "bytes32",
					"name": "emitterAddress",
					"type": "bytes32"
				},
				{
					"indexed": true,
					"internalType": "uint64",
					"name": "sequence",
					"type": "uint64"
				}
			],
			"name": "Redeemed",
			"type": "event"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "newGuardian",
					"type": "address"
				}
			],
			"name": "changeGuardian",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "claimGuardian",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"components": [
						{
							"internalType": "uint8",
							"name": "payloadID",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "tokenAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "tokenChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "destAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "destChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "sourceAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "sourceChainId",
							"type": "uint16"
						},
						{
							"internalType": "uint64",
							"name": "sequence",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "amountOutMin",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "swapFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "redeemFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						},
						{
							"internalType": "bytes32",
							"name": "auctionAddr",
							"type": "bytes32"
						},
						{
							"internalType": "bool",
							"name": "unwrapRedeem",
							"type": "bool"
						},
						{
							"internalType": "bool",
							"name": "unwrapRefund",
							"type": "bool"
						}
					],
					"internalType": "struct MayanStructs.Swap",
					"name": "s",
					"type": "tuple"
				}
			],
			"name": "encodeSwap",
			"outputs": [
				{
					"internalType": "bytes",
					"name": "encoded",
					"type": "bytes"
				}
			],
			"stateMutability": "pure",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "isPaused",
			"outputs": [
				{
					"internalType": "bool",
					"name": "",
					"type": "bool"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "bytes",
					"name": "encoded",
					"type": "bytes"
				}
			],
			"name": "parseRedeemPayload",
			"outputs": [
				{
					"components": [
						{
							"internalType": "bytes32",
							"name": "recepient",
							"type": "bytes32"
						},
						{
							"internalType": "uint64",
							"name": "relayerFee",
							"type": "uint64"
						},
						{
							"internalType": "bool",
							"name": "unwrap",
							"type": "bool"
						},
						{
							"internalType": "uint64",
							"name": "gasDrop",
							"type": "uint64"
						}
					],
					"internalType": "struct MayanStructs.Redeem",
					"name": "r",
					"type": "tuple"
				}
			],
			"stateMutability": "pure",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "bytes",
					"name": "encodedVm",
					"type": "bytes"
				}
			],
			"name": "redeem",
			"outputs": [],
			"stateMutability": "payable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "bool",
					"name": "_pause",
					"type": "bool"
				}
			],
			"name": "setPause",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"components": [
						{
							"internalType": "uint64",
							"name": "swapFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "redeemFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						}
					],
					"internalType": "struct MayanSwap.RelayerFees",
					"name": "relayerFees",
					"type": "tuple"
				},
				{
					"components": [
						{
							"internalType": "bytes32",
							"name": "mayanAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "mayanChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "auctionAddr",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "destAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "destChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "referrer",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwap.Recepient",
					"name": "recepient",
					"type": "tuple"
				},
				{
					"internalType": "bytes32",
					"name": "tokenOutAddr",
					"type": "bytes32"
				},
				{
					"internalType": "uint16",
					"name": "tokenOutChainId",
					"type": "uint16"
				},
				{
					"components": [
						{
							"internalType": "uint256",
							"name": "transferDeadline",
							"type": "uint256"
						},
						{
							"internalType": "uint64",
							"name": "swapDeadline",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "amountOutMin",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "bool",
							"name": "unwrap",
							"type": "bool"
						},
						{
							"internalType": "uint32",
							"name": "nonce",
							"type": "uint32"
						}
					],
					"internalType": "struct MayanSwap.Criteria",
					"name": "criteria",
					"type": "tuple"
				},
				{
					"internalType": "address",
					"name": "tokenIn",
					"type": "address"
				},
				{
					"internalType": "uint256",
					"name": "amountIn",
					"type": "uint256"
				}
			],
			"name": "swap",
			"outputs": [
				{
					"internalType": "uint64",
					"name": "sequence",
					"type": "uint64"
				}
			],
			"stateMutability": "payable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "amount",
					"type": "uint256"
				},
				{
					"internalType": "address payable",
					"name": "to",
					"type": "address"
				}
			],
			"name": "sweepEth",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "token",
					"type": "address"
				},
				{
					"internalType": "uint256",
					"name": "amount",
					"type": "uint256"
				},
				{
					"internalType": "address",
					"name": "to",
					"type": "address"
				}
			],
			"name": "sweepToken",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"components": [
						{
							"internalType": "uint64",
							"name": "swapFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "redeemFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						}
					],
					"internalType": "struct MayanSwap.RelayerFees",
					"name": "relayerFees",
					"type": "tuple"
				},
				{
					"components": [
						{
							"internalType": "bytes32",
							"name": "mayanAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "mayanChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "auctionAddr",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "destAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "destChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "referrer",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwap.Recepient",
					"name": "recepient",
					"type": "tuple"
				},
				{
					"internalType": "bytes32",
					"name": "tokenOutAddr",
					"type": "bytes32"
				},
				{
					"internalType": "uint16",
					"name": "tokenOutChainId",
					"type": "uint16"
				},
				{
					"components": [
						{
							"internalType": "uint256",
							"name": "transferDeadline",
							"type": "uint256"
						},
						{
							"internalType": "uint64",
							"name": "swapDeadline",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "amountOutMin",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "bool",
							"name": "unwrap",
							"type": "bool"
						},
						{
							"internalType": "uint32",
							"name": "nonce",
							"type": "uint32"
						}
					],
					"internalType": "struct MayanSwap.Criteria",
					"name": "criteria",
					"type": "tuple"
				}
			],
			"name": "wrapAndSwapETH",
			"outputs": [
				{
					"internalType": "uint64",
					"name": "sequence",
					"type": "uint64"
				}
			],
			"stateMutability": "payable",
			"type": "function"
		},
		{
			"stateMutability": "payable",
			"type": "receive"
		}
	]
}
