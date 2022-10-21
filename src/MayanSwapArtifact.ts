export default {
  "contractName": "MayanSwap",
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
      "inputs": [
        {
          "internalType": "address",
          "name": "_tokenBridge",
          "type": "address"
        }
      ],
      "name": "setTokenBridge",
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
              "name": "fee1",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "fee2",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "fee3",
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
              "name": "mayan",
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
          "name": "tokenOutChain",
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
              "internalType": "uint256",
              "name": "amountOutMin",
              "type": "uint256"
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
      "type": "function",
      "payable": true
    },
    {
      "inputs": [
        {
          "components": [
            {
              "internalType": "uint64",
              "name": "fee1",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "fee2",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "fee3",
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
              "name": "mayan",
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
          "name": "tokenOutChain",
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
              "internalType": "uint256",
              "name": "amountOutMin",
              "type": "uint256"
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
      "type": "function",
      "payable": true
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
              "internalType": "uint256",
              "name": "amountIn",
              "type": "uint256"
            },
            {
              "internalType": "bytes32",
              "name": "tokenAddress",
              "type": "bytes32"
            },
            {
              "internalType": "uint16",
              "name": "tokenChain",
              "type": "uint16"
            },
            {
              "internalType": "bytes32",
              "name": "to",
              "type": "bytes32"
            },
            {
              "internalType": "uint16",
              "name": "toChain",
              "type": "uint16"
            },
            {
              "internalType": "bytes32",
              "name": "from",
              "type": "bytes32"
            },
            {
              "internalType": "uint16",
              "name": "fromChain",
              "type": "uint16"
            },
            {
              "internalType": "uint64",
              "name": "sequence",
              "type": "uint64"
            },
            {
              "internalType": "uint256",
              "name": "amountOutMin",
              "type": "uint256"
            },
            {
              "internalType": "uint64",
              "name": "deadline",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "fee1",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "fee2",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "fee3",
              "type": "uint64"
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
      "type": "function",
      "constant": true
    }
  ]
}
