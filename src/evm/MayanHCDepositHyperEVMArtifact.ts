export default {
	"abi": [
		{
			"type": "constructor",
			"inputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "BPS_FEE_LIMIT",
			"inputs": [],
			"outputs": [
				{
					"name": "",
					"type": "uint8",
					"internalType": "uint8"
				}
			],
			"stateMutability": "view"
		},
		{
			"type": "function",
			"name": "CORE_DEPOSIT_WALLET",
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
			"name": "USDC",
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
			"name": "admin",
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
			"name": "depositToHyperCore",
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
					"name": "referrerBps",
					"type": "uint16",
					"internalType": "uint16"
				},
				{
					"name": "referrerAddr",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "destAddr",
					"type": "address",
					"internalType": "address"
				},
				{
					"name": "destDex",
					"type": "uint32",
					"internalType": "uint32"
				}
			],
			"outputs": [],
			"stateMutability": "nonpayable"
		},
		{
			"type": "function",
			"name": "rescueTokens",
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
			"type": "error",
			"name": "InvalidToken",
			"inputs": []
		},
		{
			"type": "error",
			"name": "Unauthorized",
			"inputs": []
		}
	],
}
