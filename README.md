
# Mayan Swap SDK
A minimal package for sending cross-chain swap transactions

## Installation:

```bash
npm install --save @mayanfinance/swap-sdk
```

## Usage: 

Import the necessary functions and models: 

```javascript
import { fetchQuote, swapFromEvm, swapFromSolana, Quote } from '@mayanfinance/swap-sdk'
```

Then you will need to get a quote:

### Getting Quote:
```javascript
const quote = await fetchQuote({
  amountIn: 250,
  fromToken: fromToken.contract,
  toToken: toToken.contract,
  fromChain: "bsc",
  toChain: "solana",
  slippage: 3,
  gasDrop: 0.04, // optional
  withReferrer: false, // optional
});
```

You can get the list of available tokens using [Tokens API](https://price-api.mayan.finance/swagger/)

#### Gas on destination:
To enable "Gas on destination" set the gasDrop param to the amount of native token (e.g. ETH, BNB..) you want to receive on the destination chain.


```
Maximum supported amount of gasDrop for each destination chain:

ethereum: 0.05 ETH
bsc: 0.02 BNB
polygon: 0.2 MATIC
avalanche: 0.2 AVAX
solana: 0.2 SOL
arbitrum: 0.01 ETH
```

#### Referrer fee:
> If you want to receive referrer fee, set `withReferrer` param to `true`.

#### Slippage:
> Slippage is in percentage, so 3 means "up to three percent slippage".

<br />
After you get the quote, you can send the swap transaction:

### Swap from Solana:

```javascript
swapTrx = await swapFromSolana(quote, originWalletAddress, destinationWalletAddress, deadlineInSeconds, referrerAddress, signSolanaTransaction, solanaConnection)
```

### Swap from EVM:

```javascript
swapTrx = await swapFromEvm(quote, destinationWalletAddress, deadlineInSeconds, referrerAddress, provider, signer)
```
<br />

>"referrerAddress" should be a Solana wallet address. If you don't want to get referrer fee from users, set "referrerAddress" to "11111111111111111111111111111111"
### Tracking:
To track the progress of a swap, you can use [Mayan Explorer API](https://explorer-api.mayan.finance/swagger/)
