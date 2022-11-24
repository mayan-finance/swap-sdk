
# Mayan Swap SDK
A minimal package for sending cross-chain swap transactions

## Installation:

```bash
npm install --save @mayanfinance/swap-sdk
```

## Usage: 

import the necessary functions and models: 

```bash
import { fetchQuote, swapFromEvm, swapFromSolana, Quote } from '@mayanfinance/swap-sdk'
```

Then we will need to get a quote:

### Getting Quote:
```bash
const quote = await getQuote({
  amountIn: 250,
  fromToken: fromToken.contract,
  toToken: toToken.contract,
  fromChain: "bsc",
  toChain: "solana",
  slippage: 3,
});
```

You can get the list of available tokens using [Tokens API](https://price-api.mayan.finance/swagger/)

> Slippage is in percentage, so 3 means "up to three percent slippage".

After we get the quote we can send the swap transaction:

### Swap from Solana:

```bash
swapTrx = await swapFromSolana(quote, originWalletAddress, destinationWalletAddress, deadlineInSeconds, signSolanaTransaction)
```

### Swap from EVM:

```bash
swapTrx = await swapFromEvm(quote, destinationWalletAddress, deadlineInSeconds, provider, signer)
```

### Tracking:
To track the progress of a swap, we can use [Mayan Explorer API](https://explorer-api.mayan.finance/swagger/)
