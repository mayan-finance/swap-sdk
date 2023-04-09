
# Mayan Swap SDK
A minimal package for sending cross-chain swap transactions

## Installation:

```bash
npm install --save @mayanfinance/swap-sdk
```

## Usage: 

Import the necessary functions and models: 

```bash
import { fetchQuote, swapFromEvm, swapFromSolana, Quote } from '@mayanfinance/swap-sdk'
```

Then we will need to get a quote:

### Getting Quote:
```bash
const quote = await fetchQuote({
  amountIn: 250,
  fromToken: fromToken.contract,
  toToken: toToken.contract,
  fromChain: "bsc",
  toChain: "solana",
  slippage: 3,
  withReferrer: false,
});
```

You can get the list of available tokens using [Tokens API](https://price-api.mayan.finance/swagger/)
> If you want to receive referrer fee, set "withReferrer" param to "true".

> Slippage is in percentage, so 3 means "up to three percent slippage".

After we get the quote we can send the swap transaction:

### Swap from Solana:

```bash
swapTrx = await swapFromSolana(quote, originWalletAddress, destinationWalletAddress, deadlineInSeconds, referrerAddress, signSolanaTransaction, solanaConnection)
```

### Swap from EVM:

```bash
swapTrx = await swapFromEvm(quote, destinationWalletAddress, deadlineInSeconds, referrerAddress, provider, signer)
```
<br />

>"referrerAddress" should be a Solana wallet address. If you don't want to get referrer fee from users, you could set "referrerAddress" to "11111111111111111111111111111111"
### Tracking:
To track the progress of a swap, we can use [Mayan Explorer API](https://explorer-api.mayan.finance/swagger/)
