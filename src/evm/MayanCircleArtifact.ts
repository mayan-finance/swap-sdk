export default {
	"_format": "hh-sol-artifact-1",
	"contractName": "MayanCircle",
	"sourceName": "src/MayanCircle.sol",
	"abi": [
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "_cctpTokenMessenger",
					"type": "address"
				},
				{
					"internalType": "address",
					"name": "_wormhole",
					"type": "address"
				},
				{
					"internalType": "address",
					"name": "_feeManager",
					"type": "address"
				},
				{
					"internalType": "uint16",
					"name": "_auctionChainId",
					"type": "uint16"
				},
				{
					"internalType": "bytes32",
					"name": "_auctionAddr",
					"type": "bytes32"
				},
				{
					"internalType": "bytes32",
					"name": "_solanaEmitter",
					"type": "bytes32"
				},
				{
					"internalType": "uint8",
					"name": "_consistencyLevel",
					"type": "uint8"
				}
			],
			"stateMutability": "nonpayable",
			"type": "constructor"
		},
		{
			"inputs": [],
			"name": "CctpReceiveFailed",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidAction",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidDomain",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidEmitter",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidGasDrop",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidNonce",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidOrder",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "Paused",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "Unauthorized",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "auctionAddr",
			"outputs": [
				{
					"internalType": "bytes32",
					"name": "",
					"type": "bytes32"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "auctionChainId",
			"outputs": [
				{
					"internalType": "uint16",
					"name": "",
					"type": "uint16"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "tokenIn",
					"type": "address"
				},
				{
					"internalType": "uint256",
					"name": "amountIn",
					"type": "uint256"
				},
				{
					"internalType": "uint64",
					"name": "redeemFee",
					"type": "uint64"
				},
				{
					"internalType": "uint64",
					"name": "gasDrop",
					"type": "uint64"
				},
				{
					"internalType": "bytes32",
					"name": "destAddr",
					"type": "bytes32"
				},
				{
					"components": [
						{
							"internalType": "uint32",
							"name": "destDomain",
							"type": "uint32"
						},
						{
							"internalType": "bytes32",
							"name": "mintRecipient",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "callerAddr",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanCircle.CctpRecipient",
					"name": "recipient",
					"type": "tuple"
				}
			],
			"name": "bridgeWithFee",
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
					"internalType": "address",
					"name": "tokenIn",
					"type": "address"
				},
				{
					"internalType": "uint256",
					"name": "amountIn",
					"type": "uint256"
				},
				{
					"internalType": "uint64",
					"name": "gasDrop",
					"type": "uint64"
				},
				{
					"internalType": "uint256",
					"name": "redeemFee",
					"type": "uint256"
				},
				{
					"components": [
						{
							"internalType": "uint32",
							"name": "destDomain",
							"type": "uint32"
						},
						{
							"internalType": "bytes32",
							"name": "mintRecipient",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "callerAddr",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanCircle.CctpRecipient",
					"name": "recipient",
					"type": "tuple"
				}
			],
			"name": "bridgeWithLockedFee",
			"outputs": [
				{
					"internalType": "uint64",
					"name": "cctpNonce",
					"type": "uint64"
				}
			],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "cctpTokenMessenger",
			"outputs": [
				{
					"internalType": "contract ITokenMessenger",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
			"type": "function"
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
			"inputs": [],
			"name": "consistencyLevel",
			"outputs": [
				{
					"internalType": "uint8",
					"name": "",
					"type": "uint8"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"components": [
						{
							"internalType": "address",
							"name": "tokenIn",
							"type": "address"
						},
						{
							"internalType": "uint256",
							"name": "amountIn",
							"type": "uint256"
						},
						{
							"internalType": "uint64",
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "bytes32",
							"name": "destAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "destChain",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "tokenOut",
							"type": "bytes32"
						},
						{
							"internalType": "uint64",
							"name": "minAmountOut",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "redeemFee",
							"type": "uint64"
						},
						{
							"internalType": "bytes32",
							"name": "referrerAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint8",
							"name": "referrerBps",
							"type": "uint8"
						}
					],
					"internalType": "struct MayanCircle.OrderParams",
					"name": "params",
					"type": "tuple"
				},
				{
					"components": [
						{
							"internalType": "uint32",
							"name": "destDomain",
							"type": "uint32"
						},
						{
							"internalType": "bytes32",
							"name": "mintRecipient",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "callerAddr",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanCircle.CctpRecipient",
					"name": "recipient",
					"type": "tuple"
				}
			],
			"name": "createOrder",
			"outputs": [],
			"stateMutability": "payable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "feeManager",
			"outputs": [
				{
					"internalType": "contract IFeeManager",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint64",
					"name": "",
					"type": "uint64"
				}
			],
			"name": "feeStorage",
			"outputs": [
				{
					"internalType": "bytes32",
					"name": "destAddr",
					"type": "bytes32"
				},
				{
					"internalType": "uint64",
					"name": "gasDrop",
					"type": "uint64"
				},
				{
					"internalType": "address",
					"name": "token",
					"type": "address"
				},
				{
					"internalType": "uint256",
					"name": "redeemFee",
					"type": "uint256"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "bytes",
					"name": "cctpMsg",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "cctpSigs",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "encodedVm",
					"type": "bytes"
				},
				{
					"internalType": "address",
					"name": "swapProtocol",
					"type": "address"
				},
				{
					"internalType": "bytes",
					"name": "swapData",
					"type": "bytes"
				}
			],
			"name": "fulfillOrder",
			"outputs": [],
			"stateMutability": "payable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "guardian",
			"outputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
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
			"inputs": [],
			"name": "localDomain",
			"outputs": [
				{
					"internalType": "uint32",
					"name": "",
					"type": "uint32"
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
			"name": "parseFulfillMsg",
			"outputs": [
				{
					"components": [
						{
							"internalType": "uint8",
							"name": "action",
							"type": "uint8"
						},
						{
							"internalType": "uint8",
							"name": "payloadId",
							"type": "uint8"
						},
						{
							"internalType": "uint16",
							"name": "destChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "destAddr",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "driver",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "tokenOut",
							"type": "bytes32"
						},
						{
							"internalType": "uint64",
							"name": "promisedAmount",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "bytes32",
							"name": "referrerAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint8",
							"name": "referrerBps",
							"type": "uint8"
						},
						{
							"internalType": "uint8",
							"name": "protocolBps",
							"type": "uint8"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "redeemFee",
							"type": "uint64"
						},
						{
							"internalType": "uint32",
							"name": "cctpDomain",
							"type": "uint32"
						},
						{
							"internalType": "uint64",
							"name": "cctpNonce",
							"type": "uint64"
						}
					],
					"internalType": "struct MayanCircle.FulfillMsg",
					"name": "fulfillMsg",
					"type": "tuple"
				}
			],
			"stateMutability": "pure",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "paused",
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
					"name": "cctpMsg",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "cctpSigs",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "encodedVm",
					"type": "bytes"
				}
			],
			"name": "redeemWithFee",
			"outputs": [],
			"stateMutability": "payable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "bytes",
					"name": "cctpMsg",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "cctpSigs",
					"type": "bytes"
				},
				{
					"internalType": "bytes32",
					"name": "unlockerAddr",
					"type": "bytes32"
				}
			],
			"name": "redeemWithLockedFee",
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
					"internalType": "uint32",
					"name": "cctpNonce",
					"type": "uint32"
				},
				{
					"internalType": "uint32",
					"name": "cctpDomain",
					"type": "uint32"
				},
				{
					"internalType": "bytes32",
					"name": "destAddr",
					"type": "bytes32"
				},
				{
					"internalType": "bytes32",
					"name": "unlockerAddr",
					"type": "bytes32"
				}
			],
			"name": "refineFee",
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
					"internalType": "bytes",
					"name": "encodedVm",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "cctpMsg",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "cctpSigs",
					"type": "bytes"
				},
				{
					"components": [
						{
							"internalType": "address",
							"name": "tokenIn",
							"type": "address"
						},
						{
							"internalType": "uint256",
							"name": "amountIn",
							"type": "uint256"
						},
						{
							"internalType": "uint64",
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "bytes32",
							"name": "destAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "destChain",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "tokenOut",
							"type": "bytes32"
						},
						{
							"internalType": "uint64",
							"name": "minAmountOut",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "redeemFee",
							"type": "uint64"
						},
						{
							"internalType": "bytes32",
							"name": "referrerAddr",
							"type": "bytes32"
						},
						{
							"internalType": "uint8",
							"name": "referrerBps",
							"type": "uint8"
						}
					],
					"internalType": "struct MayanCircle.OrderParams",
					"name": "orderParams",
					"type": "tuple"
				},
				{
					"components": [
						{
							"internalType": "bytes32",
							"name": "trader",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "sourceChainId",
							"type": "uint16"
						},
						{
							"internalType": "uint8",
							"name": "protocolBps",
							"type": "uint8"
						}
					],
					"internalType": "struct MayanCircle.ExtraParams",
					"name": "extraParams",
					"type": "tuple"
				}
			],
			"name": "refund",
			"outputs": [],
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
			"name": "rescueEth",
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
			"name": "rescueToken",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint8",
					"name": "_consistencyLevel",
					"type": "uint8"
				}
			],
			"name": "setConsistencyLevel",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "_feeManager",
					"type": "address"
				}
			],
			"name": "setFeeManager",
			"outputs": [],
			"stateMutability": "nonpayable",
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
			"inputs": [],
			"name": "solanaEmitter",
			"outputs": [
				{
					"internalType": "bytes32",
					"name": "",
					"type": "bytes32"
				}
			],
			"stateMutability": "view",
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
			"name": "unlockFee",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "bytes",
					"name": "encodedVm1",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "encodedVm2",
					"type": "bytes"
				}
			],
			"name": "unlockFeeRefined",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "wormhole",
			"outputs": [
				{
					"internalType": "contract IWormhole",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"stateMutability": "payable",
			"type": "receive"
		}
	],
	"linkReferences": {},
	"deployedLinkReferences": {}
}
