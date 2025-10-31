export default {
	"_format": "hh-sol-artifact-1",
	"contractName": "MayanSwift",
	"sourceName": "src/MayanSwift.sol",
	"abi": [
		{
			"type": "constructor",
			"inputs": [
				{
					"name": "_wormhole",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "_refundVerifier",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "_refundEmitterChainId",
					"type": "uint16",
					"internalType": "uint16"
				},
				{
					"name": "_refundEmitterAddr",
					"type": "bytes32",
					"internalType": "bytes32"
				},
				{
					"name": "_feeManager",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "_rescueVault",
					"type": "address",
					"internalType": "address"
				}
			],
			"stateMutability": "nonpayable"
		},
		{
			"type": "receive",
			"stateMutability": "payable"
		},
		{
			"type": "function",
			"name": "changeGuardian",
			"inputs": [
				{
					"name": "newGuardian",
					"type": "address",
					"internalType": "address"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "claimGuardian",
			"inputs": [],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "createOrderWithEth",
			"inputs": [
				{
					"name": "params",
					"type": "tuple",
					"internalType": "struct OrderParams",
					"components": [
						{
							"name": "payloadType",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "trader",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "destAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "destChainId",
							"type": "uint16",
							"internalType": "uint16"
						},
						{
							"name": "referrerAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "tokenOut",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "minAmountOut",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "gasDrop",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "cancelFee",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "refundFee",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "deadline",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "referrerBps",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "auctionMode",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "random",
							"type": "bytes32",
							"internalType": "bytes32"
						}
					]
				},
				{
					"name": "customPayload",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [
				{
					"name": "orderHash",
					"type": "bytes32",
					"internalType": "bytes32"
				}
			],
			"stateMutability": "payable"
		},
		{
			"type": "function",
			"name": "createOrderWithSig",
			"inputs": [
				{
					"name": "tokenIn",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "amountIn",
					"type": "uint256",
					"internalType": "uint256"
				},
				{
					"name": "params",
					"type": "tuple",
					"internalType": "struct OrderParams",
					"components": [
						{
							"name": "payloadType",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "trader",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "destAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "destChainId",
							"type": "uint16",
							"internalType": "uint16"
						},
						{
							"name": "referrerAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "tokenOut",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "minAmountOut",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "gasDrop",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "cancelFee",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "refundFee",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "deadline",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "referrerBps",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "auctionMode",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "random",
							"type": "bytes32",
							"internalType": "bytes32"
						}
					]
				},
				{
					"name": "customPayload",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "submissionFee",
					"type": "uint256",
					"internalType": "uint256"
				},
				{
					"name": "signedOrderHash",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "permitParams",
					"type": "tuple",
					"internalType": "struct PermitParams",
					"components": [
						{
							"name": "value",
							"type": "uint256",
							"internalType": "uint256"
						},
						{
							"name": "deadline",
							"type": "uint256",
							"internalType": "uint256"
						},
						{
							"name": "v",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "r",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "s",
							"type": "bytes32",
							"internalType": "bytes32"
						}
					]
				}
			],
			"outputs": [
				{
					"name": "orderHash",
					"type": "bytes32",
					"internalType": "bytes32"
				}
			],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "createOrderWithToken",
			"inputs": [
				{
					"name": "tokenIn",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "amountIn",
					"type": "uint256",
					"internalType": "uint256"
				},
				{
					"name": "params",
					"type": "tuple",
					"internalType": "struct OrderParams",
					"components": [
						{
							"name": "payloadType",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "trader",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "destAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "destChainId",
							"type": "uint16",
							"internalType": "uint16"
						},
						{
							"name": "referrerAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "tokenOut",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "minAmountOut",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "gasDrop",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "cancelFee",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "refundFee",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "deadline",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "referrerBps",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "auctionMode",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "random",
							"type": "bytes32",
							"internalType": "bytes32"
						}
					]
				},
				{
					"name": "customPayload",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [
				{
					"name": "orderHash",
					"type": "bytes32",
					"internalType": "bytes32"
				}
			],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "emitters",
			"inputs": [
				{
					"name": "",
					"type": "uint16",
					"internalType": "uint16"
				}
			],
			"outputs": [
				{
					"name": "",
					"type": "bytes32",
					"internalType": "bytes32"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "feeManager",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "contract IFeeManager"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "getOrders",
			"inputs": [
				{
					"name": "orderHashes",
					"type": "bytes32[]",
					"internalType": "bytes32[]"
				}
			],
			"outputs": [
				{
					"name": "",
					"type": "tuple[]",
					"internalType": "struct Order[]",
					"components": [
						{
							"name": "status",
							"type": "uint8",
							"internalType": "enum Status"
						},
						{
							"name": "amountIn",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "destChainId",
							"type": "uint16",
							"internalType": "uint16"
						}
					]
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "guardian",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "address"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "nextGuardian",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "address"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "orders",
			"inputs": [
				{
					"name": "",
					"type": "bytes32",
					"internalType": "bytes32"
				}
			],
			"outputs": [
				{
					"name": "status",
					"type": "uint8",
					"internalType": "enum Status"
				},
				{
					"name": "amountIn",
					"type": "uint64",
					"internalType": "uint64"
				},
				{
					"name": "destChainId",
					"type": "uint16",
					"internalType": "uint16"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "parseFulfillPayload",
			"inputs": [
				{
					"name": "encoded",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [
				{
					"name": "fulfillMsg",
					"type": "tuple",
					"internalType": "struct FulfillMsg",
					"components": [
						{
							"name": "action",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "orderHash",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "driver",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "promisedAmount",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "penaltyPeriod",
							"type": "uint16",
							"internalType": "uint16"
						}
					]
				}
			],
			"stateMutability": "pure"
		},
		{
			"type": "function",
			"name": "parseRefundPayload",
			"inputs": [
				{
					"name": "encoded",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [
				{
					"name": "refundMsg",
					"type": "tuple",
					"internalType": "struct RefundMsg",
					"components": [
						{
							"name": "action",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "orderHash",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "srcChainId",
							"type": "uint16",
							"internalType": "uint16"
						},
						{
							"name": "tokenIn",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "trader",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "canceler",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "cancelFee",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "refundFee",
							"type": "uint64",
							"internalType": "uint64"
						}
					]
				}
			],
			"stateMutability": "pure"
		},
		{
			"type": "function",
			"name": "parseRefundVerifierPayload",
			"inputs": [
				{
					"name": "encoded",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [
				{
					"name": "verifier",
					"type": "tuple",
					"internalType": "struct RefundVerifier",
					"components": [
						{
							"name": "action",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "verifier",
							"type": "address",
							"internalType": "address"
						},
						{
							"name": "emitterChainId",
							"type": "uint16",
							"internalType": "uint16"
						},
						{
							"name": "emitterAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						}
					]
				}
			],
			"stateMutability": "pure"
		},
		{
			"type": "function",
			"name": "parseRescuePayload",
			"inputs": [
				{
					"name": "encoded",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [
				{
					"name": "rescueMsg",
					"type": "tuple",
					"internalType": "struct RescueMsg",
					"components": [
						{
							"name": "action",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "orderHash",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "orderStatus",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "token",
							"type": "address",
							"internalType": "address"
						},
						{
							"name": "amount",
							"type": "uint64",
							"internalType": "uint64"
						}
					]
				}
			],
			"stateMutability": "pure"
		},
		{
			"type": "function",
			"name": "parseUnlockPayload",
			"inputs": [
				{
					"name": "encoded",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [
				{
					"name": "unlockMsg",
					"type": "tuple",
					"internalType": "struct UnlockMsg",
					"components": [
						{
							"name": "action",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "orderHash",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "srcChainId",
							"type": "uint16",
							"internalType": "uint16"
						},
						{
							"name": "tokenIn",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "referrerAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "referrerBps",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "protocolBps",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "unlockReceiver",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "driver",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "fulfillTime",
							"type": "uint64",
							"internalType": "uint64"
						}
					]
				}
			],
			"stateMutability": "pure"
		},
		{
			"type": "function",
			"name": "paused",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "bool",
					"internalType": "bool"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "refundEmitterAddr",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "bytes32",
					"internalType": "bytes32"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "refundEmitterChainId",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "uint16",
					"internalType": "uint16"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "refundOrder",
			"inputs": [
				{
					"name": "encodedVm",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "fast",
					"type": "bool",
					"internalType": "bool"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "refundVerifier",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "contract IWormhole"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "rescue",
			"inputs": [
				{
					"name": "encodedVm",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "rescueVault",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "address"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "setEmitters",
			"inputs": [
				{
					"name": "chainIds",
					"type": "uint16[]",
					"internalType": "uint16[]"
				},
				{
					"name": "addresses",
					"type": "bytes32[]",
					"internalType": "bytes32[]"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "setFeeManager",
			"inputs": [
				{
					"name": "_feeManager",
					"type": "address",
					"internalType": "address"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "setPause",
			"inputs": [
				{
					"name": "_pause",
					"type": "bool",
					"internalType": "bool"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "setRefundVerifier",
			"inputs": [
				{
					"name": "encodedVm",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "unlockBatch",
			"inputs": [
				{
					"name": "encodedVm",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "indexes",
					"type": "uint16[]",
					"internalType": "uint16[]"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "unlockCompressedBatch",
			"inputs": [
				{
					"name": "encodedVm",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "encodedPayload",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "indexes",
					"type": "uint16[]",
					"internalType": "uint16[]"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "unlockSingle",
			"inputs": [
				{
					"name": "encodedVm",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "wormhole",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "contract IWormhole"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "event",
			"name": "OrderCanceled",
			"inputs": [
				{
					"name": "key",
					"type": "bytes32",
					"indexed": false,
					"internalType": "bytes32"
				},
				{
					"name": "sequence",
					"type": "uint64",
					"indexed": false,
					"internalType": "uint64"
				}
			],
			"anonymous": false
		},
		{
			"type": "event",
			"name": "OrderCreated",
			"inputs": [
				{
					"name": "key",
					"type": "bytes32",
					"indexed": false,
					"internalType": "bytes32"
				}
			],
			"anonymous": false
		},
		{
			"type": "event",
			"name": "OrderFulfilled",
			"inputs": [
				{
					"name": "key",
					"type": "bytes32",
					"indexed": false,
					"internalType": "bytes32"
				},
				{
					"name": "sequence",
					"type": "uint64",
					"indexed": false,
					"internalType": "uint64"
				},
				{
					"name": "netAmount",
					"type": "uint256",
					"indexed": false,
					"internalType": "uint256"
				}
			],
			"anonymous": false
		},
		{
			"type": "event",
			"name": "OrderRefunded",
			"inputs": [
				{
					"name": "key",
					"type": "bytes32",
					"indexed": false,
					"internalType": "bytes32"
				},
				{
					"name": "netAmount",
					"type": "uint256",
					"indexed": false,
					"internalType": "uint256"
				}
			],
			"anonymous": false
		},
		{
			"type": "event",
			"name": "OrderUnlocked",
			"inputs": [
				{
					"name": "key",
					"type": "bytes32",
					"indexed": false,
					"internalType": "bytes32"
				}
			],
			"anonymous": false
		},
		{
			"type": "error",
			"name": "DuplicateOrder",
			"inputs": []
		},
		{
			"type": "error",
			"name": "EmitterAddressExists",
			"inputs": []
		},
		{
			"type": "error",
			"name": "FeesTooHigh",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidAction",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidBatchIndex",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidBpsFee",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidDestChain",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidEmitterAddress",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidEmitterChain",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidEvmAddr",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidGasDrop",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidOrderStatus",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidPayload",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidPayloadLength",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidSrcChain",
			"inputs": []
		},
		{
			"type": "error",
			"name": "OrderNotExists",
			"inputs": [
				{
					"name": "orderHash",
					"type": "bytes32",
					"internalType": "bytes32"
				}
			]
		},
		{
			"type": "error",
			"name": "Paused",
			"inputs": []
		},
		{
			"type": "error",
			"name": "SmallAmountIn",
			"inputs": []
		},
		{
			"type": "error",
			"name": "Unauthorized",
			"inputs": []
		}
	],
	"linkReferences": {},
	"deployedLinkReferences": {}
}
