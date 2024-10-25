
# Mayan Cross-Chain Swap SDK
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
const quotes = await fetchQuote({
  amount: 250,
  fromToken: fromToken.contract,
  toToken: toToken.contract,
  fromChain: "avalanche",
  toChain: "solana",
  slippageBps: 300, // means 3%
  gasDrop: 0.04, // optional
  referrer: "YOUR SOLANA WALLET ADDRESS", // optional
  referrerBps: 5, // optional
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
optimism: 0.01 ETH
base: 0.01 ETH
```

#### Referrer fee:
> If you want to receive [referrer fee](https://docs.mayan.finance/integration/referral), set the `referrer` param to your wallet address.

#### Slippage:
> Slippage is in bps (basis points), so 300 means "up to three percent slippage".

<br />
After you get the quote, you can build and send the swap transaction:

### Swap from Solana:

```javascript
swapTrx = await swapFromSolana(quotes[0], originWalletAddress, destinationWalletAddress, referrerAddresses, signSolanaTransaction, solanaConnection)
```
<br />

`referrerAddresses` is an optional object with two keys `evm` and `solana` that contains the referrer addresses for each network type.
<br />
example:

```javascript
{
  evm: "YOUR EVM WALLET",
  solana: "YOUR SOLANA WALLET"
}
```
<br />

If you need more control over the transaction and manually send the trx you can use `createSwapFromSolanaInstructions` function to build the solana instruction.


### Swap from EVM:

```javascript
swapTrx = await swapFromEvm(quotes[0], destinationWalletAddress, referrerAddress, provider, signer, permit?)
```

#### ERC20 Allowance

* If you want to initiate a swap using an ERC20 token as the input, ensure that you have already approved sufficient allowance for the Mayan Forwarder contract. The Forwarder's address can be accessed via `addresses.MAYAN_FORWARDER_CONTRACT`.


* Alternatively, the user can sign a permit message ([EIP-2612](https://eips.ethereum.org/EIPS/eip-2612)). The permit parameter is optional; you can pass the permit object to the function if the input token supports the permit standard. The permit object should contain the following fields:

```javascript
{
	value: bigint,
	deadline: number,
	v: number,
	r: string,
	s: string,
}
```
<br />

#### Gasless Transaction:
> If the selected quote's `gasless` parameter is set to true (`quote.gasless == true`), the return value of the `swapFromEvm` function will be the order hash of the `string` type. This hash can be queried on the Mayan Explorer API, similar to a transaction hash.




If you need to get the transaction payload and send it manually, you can use `getSwapFromEvmTxPayload` function to build the EVM transaction payload.

#### Contract Level Integration:
>If you aim to integrate the Mayan protocol at the contract level, you can use the `_forwarder` object returned from the `getSwapFromEvmTxPayload`. It contains the method name and parameters for a contract level method call.

### Tracking:
To track the progress of swaps, you can use [Mayan Explorer API](https://explorer-api.mayan.finance/swagger/#/default/SwapDetailsController_getSwapByTrxHash) by passing the transaction hash of the swap transaction.

<br />
The response contains a lot of info about the swap but the important field is `clientStatus` which can be one of the following values:

- `INPROGRESS` - the swap is being processed
- `COMPLETED` - the swap is completed
- `REFUNDED` - the swap has refunded

<br />

## 📱 React Native Support (Solana Mobile SDK):

You can also use this SDK in your react native app:
<br />
```javascript
import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
```

For swaps from solana after importing the above functions from Solana Mobile SDK you have to pass a callback function that calls `transact` function as the `signSolanaTransaction` parameter of `swapFromSolana` function:


```javascript
const signSolanaTransaction = useCallback(
async (tx: Transaction) => {
  return await transact(async (wallet: Web3MobileWallet) => {
    authorizeSession(wallet);
    const signedTransactions = await wallet.signTransactions({
      transactions: [tx],
    });

    return signedTransactions[0];
  });
},
[authorizeSession],
);
```

For swaps from EVM you can use `useWalletConnectModal` hook from  [WalletConnet](https://github.com/WalletConnect/modal-react-native) to get the provider and pass it to `swapFromEvm` function as the `signer`:

```javascript
import {useWalletConnectModal} from '@walletconnect/modal-react-native';
...
const { provider: evmWalletProvider} =
    useWalletConnectModal();
...
const web3Provider = new ethers.providers.Web3Provider(
                    evmWalletProvider,
                  );
const signer = web3Provider.getSigner(0);
```

To learn more about how to use Mayan SDK in a react-native project, you can check [this scaffold](https://github.com/mayan-finance/react-native-scaffold).
