
# Mayan Cross-Chain Swap SDK
A minimal package for sending cross-chain swap transactions

## ⚠️ Breaking changes in v14.0.0

- **HyperCore USDC deposits no longer require an extra user signature.** The previous flow that required the user to sign a USDC permit on Arbitrum has been removed. Just fetch a quote with `toChain: 'hypercore'` and call the regular `swapFromEvm` / `swapFromSolana` / `getSwapFromEvmTxPayload` — no extra signing step.
- **Removed APIs** (callers must migrate):
    - `getHyperCoreUSDCDepositPermitParams` — no replacement needed; signing is gone.
    - `usdcPermitSignature` option on `swapFromEvm`, `swapFromSolana`, `getSwapFromEvmTxPayload`, `createSwapFromSuiMoveCalls`, etc. — drop the field from your call sites.
    - `checkHyperCoreDeposit` API helper.
    - `Quote.hyperCoreParams` field (replaced internally by `Quote.hcSwiftDeposit`, which the SDK consumes for you).
- **Sui → HyperCore is temporarily disabled.** Calling `createSwapFromSuiMoveCalls` with a HyperCore destination now throws. A new dedicated method to deposit into HyperCore from Sui will ship in the next release.

### Not breaking, but recommended

- **`fetchQuote` now uses HTTP `POST` by default.** The `GET` endpoint is still supported, and `generateFetchQuoteUrl` continues to work for callers who already integrate against it. Switching to the new `generateFetchQuoteUrlAndBody` helper (which returns both the URL and a JSON body) unlocks features that don't fit in a query string — most notably the new Solana `extraInstructions` option described below.

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
	apiKey: "YOUR API KEY", // optional
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

#### API Key:
> The optional `apiKey` parameter in `fetchQuote` prevents the rate-limit-exceeded error on a per-IP basis. If you are running the SDK in your backend, you can also pass `apiKey` to other SDK functions (e.g. `swapFromEvm`, `swapFromSolana`, token list fetchers, etc.) to benefit from higher rate limits across all API calls. To obtain an API key, see the [API Key docs](https://docs.mayan.finance/integration/quote-api#api-key).

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

#### Bundling extra instructions in a single Solana transaction

When you need to pack your own Solana instructions (e.g. a pre-swap token transfer, a wrap step, or any custom on-chain action) into the **same** transaction as the Mayan swap, you can describe them to the quoter ahead of time via the `extraInstructions` option on `fetchQuote`. The backend then sizes the swap route so that the final Mayan instructions plus your extra instructions fit inside a single Solana v0 transaction (under the UDP/MTU packet limit).

This feature is only available through the POST flow (`fetchQuote` / `generateFetchQuoteUrlAndBody`); it cannot be expressed as a `GET` query string.

```typescript
import { fetchQuote, InstructionInfo } from '@mayanfinance/swap-sdk';

const extraInstructions: InstructionInfo[] = [
    {
        programId: 'YourProgram1111111111111111111111111111111',
        accounts: [
            { pubkey: '...', isSigner: false, isWritable: true },
            // ...
        ],
        data: 'BASE64_ENCODED_INSTRUCTION_DATA', // instruction data as base64
    },
];

const quotes = await fetchQuote(
    {
        amountIn64: '250000000',
        fromToken: fromToken.contract,
        toToken: toToken.contract,
        fromChain: 'solana',
        toChain: 'arbitrum',
        slippageBps: 'auto',
    },
    {
        extraInstructions: {
            instructions: extraInstructions,
            lookupTables: [
                // optional: base58 addresses of address lookup tables
                // your extra instructions rely on, so the quoter can size
                // the transaction correctly
            ],
        },
    },
);
```

Type reference (defined in `src/types.ts`):

```typescript
type SolanaKeyInfo = {
    pubkey: string;       // base58
    isSigner: boolean;
    isWritable: boolean;
};

type InstructionInfo = {
    programId: string;    // base58
    accounts: SolanaKeyInfo[];
    data: string;         // base64-encoded instruction data
};
```

The quoter will pick a swap route whose instructions, combined with the ones you provide, leave enough room in the resulting transaction. You are still responsible for appending your `extraInstructions` to the instruction list you submit on chain — `extraInstructions` is purely a *sizing hint* for the quote.

### Bridge from EVM:

```javascript
swapTrx = await swapFromEvm(quotes[0], swapperAddress, destinationWalletAddress, referrerAddress, provider, signer, permit?)
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

To deposit into HyperCore, fetch a quote as described earlier with `toChain` set to `hypercore`, then call the regular transaction-building method for the source chain (`swapFromEvm`, `swapFromSolana`, `getSwapFromEvmTxPayload`, …). No extra user signature is required — the SDK handles everything from a single signed swap transaction.

Pass the user's HyperCore destination address (an EVM-style `0x…` address) as the `destinationAddress` argument, the same way you would for any other destination chain. The user's selection between **USDC (spot)** and **USDC (perps)** is encoded automatically based on the `toToken` returned in the quote.

> **Sui → HyperCore is temporarily disabled** in this release. Calling `createSwapFromSuiMoveCalls` with `toChain: 'hypercore'` will throw. A new dedicated entry point will be added in the next release.

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
