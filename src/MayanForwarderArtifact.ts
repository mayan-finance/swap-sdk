export default {
  "_format": "hh-sol-artifact-1",
  "contractName": "MayanForwarder",
  "sourceName": "src/MayanForwarder.sol",
  "abi": [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_guardian",
          "type": "address"
        },
        {
          "internalType": "address[]",
          "name": "_swapProtocols",
          "type": "address[]"
        },
        {
          "internalType": "address[]",
          "name": "_mayanProtocols",
          "type": "address[]"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "Forwarded",
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
              "internalType": "uint256",
              "name": "value",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "deadline",
              "type": "uint256"
            },
            {
              "internalType": "uint8",
              "name": "v",
              "type": "uint8"
            },
            {
              "internalType": "bytes32",
              "name": "r",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "s",
              "type": "bytes32"
            }
          ],
          "internalType": "struct MayanForwarder.PermitParams",
          "name": "permitParams",
          "type": "tuple"
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
        },
        {
          "internalType": "address",
          "name": "middleToken",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "minMiddleAmount",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "mayanProtocol",
          "type": "address"
        },
        {
          "internalType": "bytes",
          "name": "mayanData",
          "type": "bytes"
        }
      ],
      "name": "forwardERC20",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "amountIn",
          "type": "uint256"
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
        },
        {
          "internalType": "address",
          "name": "middleToken",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "minMiddleAmount",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "mayanProtocol",
          "type": "address"
        },
        {
          "internalType": "bytes",
          "name": "mayanData",
          "type": "bytes"
        }
      ],
      "name": "forwardEth",
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
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "mayanProtocols",
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
          "internalType": "address",
          "name": "mayanProtocol",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "enabled",
          "type": "bool"
        }
      ],
      "name": "setMayanProtocol",
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
      "inputs": [
        {
          "internalType": "address",
          "name": "swapProtocol",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "enabled",
          "type": "bool"
        }
      ],
      "name": "setSwapProtocol",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "swapProtocols",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ],"linkReferences": {},
  "deployedLinkReferences": {}
}
