
# Mayan Cross-Chain Swap SDK
A minimal package for sending cross-chain swap transactions

## Installation:

```bash
npm install --save @mayanfinance/swap-sdk
```

## Usage:

Import the necessary functions and models:

```javascript
import { fetchQuote, swapFromEvm, swapFromSolana, Quote, createSwapFromSuiMoveCalls } from '@mayanfinance/swap-sdk'
```

Then you will need to get a quote:

### Getting Quote:
```javascript
const quotes = await fetchQuote({
	amountIn64: "250000000", // if fromToken is USDC means 250 USDC
	fromToken: fromToken.contract,
	toToken: toToken.contract,
	fromChain: "avalanche",
	toChain: "solana",
	slippageBps: "auto",
	gasDrop: 0.04, // optional
	referrer: "YOUR SOLANA WALLET ADDRESS", // optional
	referrerBps: 5, // optional
});
```
> `slippageBps` can either be a specific basis point number or the string **"auto"**. When set to "auto", the system determines the safest slippage based on the input and output tokens.
You can also provide slippageBps directly as a number in basis points; for example, 300 means 3%. Regardless of whether you pass "auto" or a basis point number, the `slippageBps` field in the quote response will always be returned as a **basis point number**.

> see the list of supported chains [here](./src/types.ts#L13).

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
unichain: 0.01 ETH
base: 0.01 ETH
```

#### Referrer fee:
> If you want to receive [referrer fee](https://docs.mayan.finance/integration/referral), set the `referrer` param to your wallet address.

#### Slippage:
> Slippage is in bps (basis points), so 300 means "up to three percent slippage".

<br />
After you get the quote, you can build and send the swap transaction:

### Bridge from Solana:

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
  solana: "YOUR SOLANA WALLET",
  sui: "YOUR SUI WALLET"
}
```
<br />

If you need more control over the transaction and manually send the trx you can use `createSwapFromSolanaInstructions` function to build the solana instruction.


### Bridge from EVM:

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

### Bridge from Sui
The `createSwapFromSuiMoveCalls` function returns a Transaction instance containing all the required Move calls. This transaction should then be signed by the user's wallet and broadcast to the Sui network.

```javascript
const bridgeFromSuiMoveCalls = await createSwapFromSuiMoveCalls(
  	quote, // Quote
	originWalletAddress, // string
	destinationWalletAddress, // string
	referrerAddresses, // Optional(ReferrerAddresses)
	customPayload, // Optional(Uint8Array | Buffer)
	suiClient, // SuiClient
	options, // Optional(ComposableSuiMoveCallsOptions)
);

await suiClient.signAndExecuteTransaction({
     signer: suiKeypair,
     transaction: bridgeFromSuiMoveCalls,
 });
```

#### Composability on Move Calls and Input Coin

The SDK offers composability for advanced use cases where you want to integrate bridge Move calls into an existing Sui transaction or use a specific coin as the input for bridging.

- **Custom Move Calls**: To compose the bridge logic into an existing transaction, pass your transaction through the `builtTransaction` parameter. The bridge Move calls will be appended, allowing you to sign and send the combined transaction.

- **Custom Input Coin**: If you'd like to use a specific coin (e.g., one returned from earlier Move calls) as the input for the bridge, provide it via the `inputCoin` parameter.

```javascript
type ComposableSuiMoveCallsOptions = {
	builtTransaction?: SuiTransaction;
	inputCoin?: SuiFunctionParameter;
}
```
<br />

### Depositing on HyperCore (Hyperliquid Core) as a Destination


To deposit into HyperCore, start by fetching a quote as described earlier, just set the `toChain` parameter to `hypercore`. Then, depending on the source chain, use the appropriate transaction-building method, also covered above.

The key difference when depositing **USDC on HyperCore** is that you must pass a `usdcPermitSignature` in the options object when building the transaction.

You can generate this signature using the `getHyperCoreUSDCDepositPermitParams` helper function as shown below:

```javascript
import { getHyperCoreUSDCDepositPermitParams } from '@mayanfinance/swap-sdk';

const arbitrumProvider = new ethers.providers.JsonRpcProvider('ARBITRUM_RPC_URL');
const arbDestUserWallet = new ethers.Wallet('USER_ARBITRUM_WALLET_PRIVATE_KEY', arbitrumProvider);

const { value, domain, types } = await getHyperCoreUSDCDepositPermitParams(
	quote,
	userDestAddress,
	arbitrumProvider
);

const permitSignature = await arbDestUserWallet.signTypedData(domain, types, value);
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
