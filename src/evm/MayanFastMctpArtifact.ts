export default {
	"abi": [
		{
			"type": "constructor",
			"inputs": [
				{
					"name": "_cctpTokenMessengerV2",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "_feeManager",
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
			"name": "bridge",
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
					"name": "redeemFee",
					"type": "uint64",
					"internalType": "uint64"
				},
				{
					"name": "circleMaxFee",
					"type": "uint256",
					"internalType": "uint256"
				},
				{
					"name": "gasDrop",
					"type": "uint64",
					"internalType": "uint64"
				},
				{
					"name": "destAddr",
					"type": "bytes32",
					"internalType": "bytes32"
				},
				{
					"name": "destDomain",
					"type": "uint32",
					"internalType": "uint32"
				},
				{
					"name": "referrerAddress",
					"type": "bytes32",
					"internalType": "bytes32"
				},
				{
					"name": "referrerBps",
					"type": "uint8",
					"internalType": "uint8"
				},
				{
					"name": "payloadType",
					"type": "uint8",
					"internalType": "uint8"
				},
				{
					"name": "minFinalityThreshold",
					"type": "uint32",
					"internalType": "uint32"
				},
				{
					"name": "customPayload",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "cctpTokenMessengerV2",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "contract ITokenMessengerV2"
				}
			],
			"stateMutability": "view"
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
			"name": "createOrder",
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
					"name": "circleMaxFee",
					"type": "uint256",
					"internalType": "uint256"
				},
				{
					"name": "destDomain",
					"type": "uint32",
					"internalType": "uint32"
				},
				{
					"name": "minFinalityThreshold",
					"type": "uint32",
					"internalType": "uint32"
				},
				{
					"name": "orderPayload",
					"type": "tuple",
					"internalType": "struct FastMCTP.OrderPayload",
					"components": [
						{
							"name": "payloadType",
							"type": "uint8",
							"internalType": "uint8"
						},
						{
							"name": "destAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "tokenOut",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "amountOutMin",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "gasDrop",
							"type": "uint64",
							"internalType": "uint64"
						},
						{
							"name": "redeemFee",
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
							"name": "referrerAddr",
							"type": "bytes32",
							"internalType": "bytes32"
						},
						{
							"name": "referrerBps",
							"type": "uint8",
							"internalType": "uint8"
						}
					]
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "domainToCaller",
			"inputs": [
				{
					"name": "",
					"type": "uint32",
					"internalType": "uint32"
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
					"internalType": "address"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "fulfillOrder",
			"inputs": [
				{
					"name": "cctpMsg",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "cctpSigs",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "swapProtocol",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "swapData",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [],
			"stateMutability": "payable"
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
			"name": "keyToMintRecipient",
			"inputs": [
				{
					"name": "",
					"type": "bytes32",
					"internalType": "bytes32"
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
			"name": "redeem",
			"inputs": [
				{
					"name": "cctpMsg",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "cctpSigs",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [],
			"stateMutability": "payable"
		},
		{
			"type": "function",
			"name": "refund",
			"inputs": [
				{
					"name": "cctpMsg",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "cctpSigs",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [],
			"stateMutability": "payable"
		},
		{
			"type": "function",
			"name": "rescueEth",
			"inputs": [
				{
					"name": "amount",
					"type": "uint256",
					"internalType": "uint256"
				},
				{
					"name": "to",
					"type": "address",
					"internalType": "address payable"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "rescueRedeem",
			"inputs": [
				{
					"name": "cctpMsg",
					"type": "bytes",
					"internalType": "bytes"
				},
				{
					"name": "cctpSigs",
					"type": "bytes",
					"internalType": "bytes"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "rescueToken",
			"inputs": [
				{
					"name": "token",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "amount",
					"type": "uint256",
					"internalType": "uint256"
				},
				{
					"name": "to",
					"type": "address",
					"internalType": "address"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "setDomainCallers",
			"inputs": [
				{
					"name": "domain",
					"type": "uint32",
					"internalType": "uint32"
				},
				{
					"name": "caller",
					"type": "bytes32",
					"internalType": "bytes32"
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
			"name": "setMintRecipient",
			"inputs": [
				{
					"name": "destDomain",
					"type": "uint32",
					"internalType": "uint32"
				},
				{
					"name": "tokenIn",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "mintRecipient",
					"type": "bytes32",
					"internalType": "bytes32"
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
			"name": "setWhitelistedMsgSenders",
			"inputs": [
				{
					"name": "sender",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "isWhitelisted",
					"type": "bool",
					"internalType": "bool"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "setWhitelistedSwapProtocols",
			"inputs": [
				{
					"name": "protocol",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "isWhitelisted",
					"type": "bool",
					"internalType": "bool"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "whitelistedMsgSenders",
			"inputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "address"
				}
			],
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
			"name": "whitelistedSwapProtocols",
			"inputs": [
				{
					"name": "",
					"type": "address",
					"internalType": "address"
				}
			],
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
			"type": "event",
			"name": "OrderFulfilled",
			"inputs": [
				{
					"name": "sourceDomain",
					"type": "uint32",
					"indexed": false,
					"internalType": "uint32"
				},
				{
					"name": "sourceNonce",
					"type": "bytes32",
					"indexed": false,
					"internalType": "bytes32"
				},
				{
					"name": "amount",
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
					"name": "sourceDomain",
					"type": "uint32",
					"indexed": false,
					"internalType": "uint32"
				},
				{
					"name": "sourceNonce",
					"type": "bytes32",
					"indexed": false,
					"internalType": "bytes32"
				},
				{
					"name": "amount",
					"type": "uint256",
					"indexed": false,
					"internalType": "uint256"
				}
			],
			"anonymous": false
		},
		{
			"type": "error",
			"name": "AlreadySet",
			"inputs": []
		},
		{
			"type": "error",
			"name": "CallerNotSet",
			"inputs": []
		},
		{
			"type": "error",
			"name": "CctpReceiveFailed",
			"inputs": []
		},
		{
			"type": "error",
			"name": "DeadlineViolation",
			"inputs": []
		},
		{
			"type": "error",
			"name": "EthTransferFailed",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidAddress",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidAmountOut",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidGasDrop",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidMintRecipient",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidPayload",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidPayloadType",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidRedeemFee",
			"inputs": []
		},
		{
			"type": "error",
			"name": "InvalidRefundFee",
			"inputs": []
		},
		{
			"type": "error",
			"name": "MintRecipientNotSet",
			"inputs": []
		},
		{
			"type": "error",
			"name": "Paused",
			"inputs": []
		},
		{
			"type": "error",
			"name": "Unauthorized",
			"inputs": []
		},
		{
			"type": "error",
			"name": "UnauthorizedMsgSender",
			"inputs": []
		},
		{
			"type": "error",
			"name": "UnauthorizedSwapProtocol",
			"inputs": []
		}
	]
};
