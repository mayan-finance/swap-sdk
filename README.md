
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
  amount: 250,
  fromToken: fromToken.contract,
  toToken: toToken.contract,
  fromChain: "bsc",
  toChain: "solana",
  slippage: 3,
  gasDrop: 0.04, // optional
  referrer: "YOUR SOLANA WALLET ADDRESS", // optional
});
```

You can get the list of supported tokens using [Tokens API](https://price-api.mayan.finance/swagger/)

#### Gas on destination:
To enable [Gas on destination](https://docs.mayan.finance/dapp/gas-on-destination) set the gasDrop param to the amount of native token (e.g. ETH, BNB..) you want to receive on the destination chain.


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
> If you want to receive [referrer fee](https://docs.mayan.finance/integration/referral), set the `referrer` param to your wallet address.

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

>```referrerAddress``` must be a Solana wallet address. If you don't want to get referrer fee from users, set "referrerAddress" to ```null``` or ```"11111111111111111111111111111111"```
### Tracking:
To track the progress of swaps, you can use [Mayan Explorer API](https://explorer-api.mayan.finance/swagger/)


<br />

## 📱 React Native Support (Solana Mobile SDK):

You can also use this SDK in your react native app:
<br />
```javascript
import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';

import { createSwapFromSolanaInstructions } from '@react-native-swap-sdk';
```

For swaps from solana after importing the necessary functions you can use ```createSwapFromSolanaInstructions``` function to get the instructions and signers for the swap transaction. Then you can use ```transact``` function to sign and then send the transaction.
<br />

For Swaps from EVM you can continue using ```swapFromEvm``` function.

```javascript
const swapper = new PublicKey(originWalletAddress);
const { instructions, signers } = await createSwapFromSolanaInstructions(
  quote,
  originWalletAddress,
  finalDestination,
  deadlineInSeconds,
  referrerAddress,
  solanaConnection,
);

const signedTrx = await transact(async (wallet: Web3MobileWallet) => {
  const authorizationResult = await authorizeSession(wallet);
  if (!authorizationResult.publicKey.equals(swapper)) {
    throw new Error('Wallet account does not match the swapper account');
  }
  const blockhash = await solanaConnection.getLatestBlockhash();
  const swapTransaction = new Transaction({
    ...blockhash,
    feePayer: authorizationResult.publicKey,
  });
  swapTransaction.add(...instructions);
  signers.forEach(signer => {
    return swapTransaction.partialSign(signer);
  });

  const signedTransactions = await wallet.signTransactions({
    transactions: [swapTransaction],
  });
  return signedTransactions[0];
});
const trxHash = await solanaConnection.sendRawTransaction(signedTrx.serialize());
```

To learn more about how to manage authorized session you can check [this practice]('https://github.com/solana-mobile/solana-mobile-dapp-scaffold/blob/main/template/components/providers/AuthorizationProvider.tsx').