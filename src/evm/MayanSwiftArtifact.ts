export default {
	"_format": "hh-sol-artifact-1",
	"contractName": "MayanSwift",
	"sourceName": "src/MayanSwift.sol",
	"abi": [
		{
			"inputs": [
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
			"name": "DeadlineViolation",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "DuplicateOrder",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "FeesTooHigh",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidAction",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidAmount",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidAuctionMode",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidBpsFee",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidContractSignature",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidDestChain",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidEmitterAddress",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidEmitterChain",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidEvmAddr",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidGasDrop",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidOrderHash",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidOrderStatus",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidSignature",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidSignatureLength",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidSigner",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidSrcChain",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "InvalidWormholeFee",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "OrderNotExists",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "Paused",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "SmallAmountIn",
			"type": "error"
		},
		{
			"inputs": [],
			"name": "Unauthorized",
			"type": "error"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "bytes32",
					"name": "key",
					"type": "bytes32"
				},
				{
					"indexed": false,
					"internalType": "uint64",
					"name": "sequence",
					"type": "uint64"
				}
			],
			"name": "OrderCanceled",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "bytes32",
					"name": "key",
					"type": "bytes32"
				}
			],
			"name": "OrderCreated",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "bytes32",
					"name": "key",
					"type": "bytes32"
				},
				{
					"indexed": false,
					"internalType": "uint64",
					"name": "sequence",
					"type": "uint64"
				},
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "netAmount",
					"type": "uint256"
				}
			],
			"name": "OrderFulfilled",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "bytes32",
					"name": "key",
					"type": "bytes32"
				},
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "netAmount",
					"type": "uint256"
				}
			],
			"name": "OrderRefunded",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "bytes32",
					"name": "key",
					"type": "bytes32"
				}
			],
			"name": "OrderUnlocked",
			"type": "event"
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
					"internalType": "bytes32",
					"name": "tokenIn",
					"type": "bytes32"
				},
				{
					"components": [
						{
							"internalType": "bytes32",
							"name": "trader",
							"type": "bytes32"
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
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "cancelFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
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
							"name": "auctionMode",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "random",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwift.OrderParams",
					"name": "params",
					"type": "tuple"
				},
				{
					"internalType": "uint16",
					"name": "srcChainId",
					"type": "uint16"
				},
				{
					"internalType": "uint8",
					"name": "protocolBps",
					"type": "uint8"
				},
				{
					"internalType": "bytes32",
					"name": "canceler",
					"type": "bytes32"
				}
			],
			"name": "cancelOrder",
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
							"internalType": "bytes32",
							"name": "trader",
							"type": "bytes32"
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
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "cancelFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
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
							"name": "auctionMode",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "random",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwift.OrderParams",
					"name": "params",
					"type": "tuple"
				}
			],
			"name": "createOrderWithEth",
			"outputs": [
				{
					"internalType": "bytes32",
					"name": "orderHash",
					"type": "bytes32"
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
					"components": [
						{
							"internalType": "bytes32",
							"name": "trader",
							"type": "bytes32"
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
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "cancelFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
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
							"name": "auctionMode",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "random",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwift.OrderParams",
					"name": "params",
					"type": "tuple"
				},
				{
					"internalType": "bytes",
					"name": "signedOrderHash",
					"type": "bytes"
				}
			],
			"name": "createOrderWithSig",
			"outputs": [
				{
					"internalType": "bytes32",
					"name": "orderHash",
					"type": "bytes32"
				}
			],
			"stateMutability": "nonpayable",
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
					"components": [
						{
							"internalType": "bytes32",
							"name": "trader",
							"type": "bytes32"
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
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "cancelFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
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
							"name": "auctionMode",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "random",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwift.OrderParams",
					"name": "params",
					"type": "tuple"
				}
			],
			"name": "createOrderWithToken",
			"outputs": [
				{
					"internalType": "bytes32",
					"name": "orderHash",
					"type": "bytes32"
				}
			],
			"stateMutability": "nonpayable",
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
					"internalType": "uint256",
					"name": "fulfillAmount",
					"type": "uint256"
				},
				{
					"internalType": "bytes",
					"name": "encodedVm",
					"type": "bytes"
				},
				{
					"internalType": "bytes32",
					"name": "recepient",
					"type": "bytes32"
				},
				{
					"internalType": "bool",
					"name": "batch",
					"type": "bool"
				}
			],
			"name": "fulfillOrder",
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
					"name": "fulfillAmount",
					"type": "uint256"
				},
				{
					"internalType": "bytes32",
					"name": "orderHash",
					"type": "bytes32"
				},
				{
					"internalType": "uint16",
					"name": "srcChainId",
					"type": "uint16"
				},
				{
					"internalType": "bytes32",
					"name": "tokenIn",
					"type": "bytes32"
				},
				{
					"internalType": "uint8",
					"name": "protocolBps",
					"type": "uint8"
				},
				{
					"components": [
						{
							"internalType": "bytes32",
							"name": "trader",
							"type": "bytes32"
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
							"name": "gasDrop",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "cancelFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "deadline",
							"type": "uint64"
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
							"name": "auctionMode",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "random",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwift.OrderParams",
					"name": "params",
					"type": "tuple"
				},
				{
					"internalType": "bytes32",
					"name": "recepient",
					"type": "bytes32"
				},
				{
					"internalType": "bool",
					"name": "batch",
					"type": "bool"
				}
			],
			"name": "fulfillSimple",
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
			"name": "nextGuardian",
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
			"inputs": [
				{
					"internalType": "bytes32",
					"name": "",
					"type": "bytes32"
				}
			],
			"name": "orders",
			"outputs": [
				{
					"internalType": "enum MayanSwift.Status",
					"name": "status",
					"type": "uint8"
				},
				{
					"internalType": "uint64",
					"name": "amountIn",
					"type": "uint64"
				},
				{
					"internalType": "uint16",
					"name": "destChainId",
					"type": "uint16"
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
			"name": "parseFulfillPayload",
			"outputs": [
				{
					"components": [
						{
							"internalType": "uint8",
							"name": "action",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "orderHash",
							"type": "bytes32"
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
							"internalType": "uint64",
							"name": "deadline",
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
							"internalType": "uint16",
							"name": "srcChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "tokenIn",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwift.FulfillMsg",
					"name": "fulfillMsg",
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
					"name": "encoded",
					"type": "bytes"
				}
			],
			"name": "parseRefundPayload",
			"outputs": [
				{
					"components": [
						{
							"internalType": "uint8",
							"name": "action",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "orderHash",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "srcChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "tokenIn",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "recipient",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "canceler",
							"type": "bytes32"
						},
						{
							"internalType": "uint64",
							"name": "cancelFee",
							"type": "uint64"
						},
						{
							"internalType": "uint64",
							"name": "refundFee",
							"type": "uint64"
						}
					],
					"internalType": "struct MayanSwift.RefundMsg",
					"name": "refundMsg",
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
					"name": "encoded",
					"type": "bytes"
				}
			],
			"name": "parseUnlockPayload",
			"outputs": [
				{
					"components": [
						{
							"internalType": "uint8",
							"name": "action",
							"type": "uint8"
						},
						{
							"internalType": "bytes32",
							"name": "orderHash",
							"type": "bytes32"
						},
						{
							"internalType": "uint16",
							"name": "srcChainId",
							"type": "uint16"
						},
						{
							"internalType": "bytes32",
							"name": "tokenIn",
							"type": "bytes32"
						},
						{
							"internalType": "bytes32",
							"name": "recipient",
							"type": "bytes32"
						}
					],
					"internalType": "struct MayanSwift.UnlockMsg",
					"name": "unlockMsg",
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
					"internalType": "bytes32[]",
					"name": "orderHashes",
					"type": "bytes32[]"
				}
			],
			"name": "postBatch",
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
				}
			],
			"name": "refundOrder",
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
			"name": "unlockBatch",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "bytes32",
					"name": "",
					"type": "bytes32"
				}
			],
			"name": "unlockMsgs",
			"outputs": [
				{
					"internalType": "uint8",
					"name": "action",
					"type": "uint8"
				},
				{
					"internalType": "bytes32",
					"name": "orderHash",
					"type": "bytes32"
				},
				{
					"internalType": "uint16",
					"name": "srcChainId",
					"type": "uint16"
				},
				{
					"internalType": "bytes32",
					"name": "tokenIn",
					"type": "bytes32"
				},
				{
					"internalType": "bytes32",
					"name": "recipient",
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
			"name": "unlockSingle",
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
