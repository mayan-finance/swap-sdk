<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://cdn.mayan.finance/brand-kit/Mayan_Logo_White.png">
  <img src="https://cdn.mayan.finance/brand-kit/Mayan_Logo_Black.png" alt="Mayan" width="320">
</picture>

# 🗿 Mayan Cross-Chain Swap SDK

[![npm version](https://img.shields.io/npm/v/@mayanfinance/swap-sdk.svg)](https://www.npmjs.com/package/@mayanfinance/swap-sdk)
[![npm downloads](https://img.shields.io/npm/dw/@mayanfinance/swap-sdk.svg)](https://www.npmjs.com/package/@mayanfinance/swap-sdk)
[![license](https://img.shields.io/npm/l/@mayanfinance/swap-sdk.svg)](./LICENSE)

</div>

TypeScript client for Mayan, an intent-based cross-chain swap protocol. Fetch a quote, build one transaction, and the user receives the output token on another chain.

## ⚠️ Breaking changes

<details open>
<summary><b>v16.0.0: EVM swaps take a provider, and Blink quotes are offered by default</b></summary>

<br />

- **`swapFromEvm` requires `options.evmProvider`**, an ethers `JsonRpcProvider` on the source chain. The SDK reads the chain through it: gas estimation, and for Blink whether the swapper is a contract account (see [Blink](#blink)). It must be on the signer's chain, or the swap throws. Pass your own RPC provider rather than the wallet's.
- **`getSwapFromEvmTxPayload` requires `options.evmProvider`** as well, for every quote type, and `options` is no longer optional. The provider must be on the chain of `signerChainId`.
- **`estimateQuoteRequiredGasAprox2(quote, payload, apiKey, evmProvider)`** takes the provider as a fourth, required argument.
- **Blink deposits go through the escrow unless you opt in to the direct transfer.** A Blink order that allows it is deposited by a plain ERC20 transfer only with `allowBlinkEvmDirectTransfer: true` in the options of `swapFromEvm` / `getSwapFromEvmTxPayload` (and of the allowance helpers and gas estimators), and only for an externally owned swapper, which the SDK checks with `getCode`. Without it every ERC20 Blink deposit is a `depositToken` call that needs an allowance. See [Blink](#blink).
- **`BLINK` quotes are returned by default.** `quote.type` can now be `'BLINK'`, Mayan's inventory-backed route. Pass `blink: false` in `QuoteOptions` to leave them out until you handle them; see [Blink](#blink).
- **`swiftRefundAddress` is now `refundAddress`** in the swap options on every chain, and it applies to every quote type. The old name is still accepted for Swift quotes; see [Custom refund address](#custom-refund-address).

```typescript
import { ethers } from 'ethers';
import { swapFromEvm } from '@mayanfinance/swap-sdk';

const evmProvider = new ethers.JsonRpcProvider('https://<your-arbitrum-rpc>');
const tx = await swapFromEvm(
  quote, swapperAddress, destinationAddress, referrerAddresses,
  signer, permit, null, null,
  { evmProvider },
);
```

New in this release, not breaking: the approval step is one set of helpers for every quote type (`isEvmSwapAllowanceEnough`, `signEvmSwapPermit`, `getEvmSwapApproveTxs`), see [ERC20 allowance](#erc20-allowance).

</details>

<details>
<summary><b>v15.0.0: Sui moves to <code>@mysten/sui</code> v2 and the gRPC / Core API</b></summary>

<br />

This affects the **Sui** integration only. Solana and EVM flows are unchanged. If you do not bridge from Sui you are unaffected, apart from the Node note below.

- **Upgrade `@mysten/sui` to `^2`.** It is **ESM-only** and required by the Sui swap functions (`createSwapFromSuiMoveCalls`, …).
- **Pass a v2 client.** A v1 `SuiClient` is not supported. The `suiClient` parameter accepts any client implementing the Sui Core API (`ClientWithCoreApi`): `SuiGrpcClient`, `SuiJsonRpcClient`, GraphQL, or `@mysten/dapp-kit`. **gRPC is recommended**, since Mysten is deprecating JSON-RPC.

```typescript
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { fetchQuote, createSwapFromSuiMoveCalls } from '@mayanfinance/swap-sdk';

const suiClient = new SuiGrpcClient({
  network: 'mainnet',
  baseUrl: 'https://<your-sui-grpc-endpoint>:443',
  // meta: { authorization: '<token>' }, // only if your provider requires auth
});

const tx = await createSwapFromSuiMoveCalls(
  quote, swapperWalletAddress, destinationWalletAddress,
  referrerAddresses, customPayload, suiClient, options,
);
```

- **`signAndExecuteTransaction` returns a different shape on v2 clients:** `{ $kind, Transaction | FailedTransaction }`. Read the digest from the nested object. Wallet adapters and `@mysten/dapp-kit` follow their own v2 API.

```typescript
const res = await suiClient.signAndExecuteTransaction({ signer, transaction: tx });
const digest = res.Transaction?.digest ?? res.FailedTransaction?.digest;
```

- **TypeScript module resolution.** If you hit `Cannot find module '@mysten/sui/...'`, set `"moduleResolution": "bundler"` (or `node16` / `nodenext`) and `"module": "esnext"` in your `tsconfig.json`.
- **CommonJS on older Node breaks, even if you never touch Sui.** On **Node < 20.19 / < 22.12**, `require('@mayanfinance/swap-sdk')` throws `ERR_REQUIRE_ESM`. Run on **Node ≥ 20.19 / ≥ 22.12**, or import the SDK as **ESM**. Bundlers that cannot `require()` an ES module, including some **Metro / React Native** setups, are affected the same way. ESM consumers are unaffected.

> **Packaging or install trouble with v15?** [Open an issue](https://github.com/mayan-finance/swap-sdk/issues).

</details>

<details>
<summary><b>v14.0.0: HyperCore deposits no longer need an extra signature</b></summary>

<br />

- **HyperCore USDC deposits no longer require an extra user signature.** Fetch a quote with `toChain: 'hypercore'` and call the regular `swapFromEvm` / `swapFromSolana` / `getSwapFromEvmTxPayload`.
- **Removed APIs**:
  - `getHyperCoreUSDCDepositPermitParams`. No replacement.
  - `usdcPermitSignature`. Still accepted by `getSwapFromEvmTxPayload`, `estimateQuoteRequiredGas*` and `ComposableSuiMoveCallsOptions`, but ignored. Remove it from your call sites.
  - `checkHyperCoreDeposit`.
  - `Quote.hyperCoreParams`.
- **Sui is not supported as a source chain for HyperCore deposits.**

**Recommended, not breaking:** `fetchQuote` now always POSTs. The `GET` endpoint is still reachable through `generateFetchQuoteUrl`. Switching to `generateFetchQuoteUrlAndBody`, which returns both the URL and a JSON body, unlocks features that do not fit in a query string, most notably Solana `extraInstructions`.

</details>

---

## Install

```bash
npm install --save @mayanfinance/swap-sdk
```

Node.js 20.19+ or 22.12+ if you `require()` the package. ESM has no version floor.

---

## Quickstart

250 USDC on Arbitrum to USDC on Solana.

```typescript
import { fetchQuote, swapFromEvm } from '@mayanfinance/swap-sdk';
import { ethers } from 'ethers';

// 1. Get a quote. One entry is returned per available route.
const quotes = await fetchQuote({
  amountIn64: '250000000', // 250 USDC, in the input token's base units (6 decimals)
  fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
  toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC on Solana
  fromChain: 'arbitrum',
  toChain: 'solana',
  slippageBps: 'auto',
});

const quote = quotes[0];

// 2. Execute. One signature from the user, on the source chain only.
const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
const swapperAddress = await signer.getAddress();
const destinationSolanaAddress = 'RECIPIENT SOLANA WALLET';
const evmProvider = new ethers.JsonRpcProvider('https://<your-arbitrum-rpc>'); // the SDK reads the source chain through it

const tx = await swapFromEvm(
  quote,
  swapperAddress,
  destinationSolanaAddress,
  null,  // referrerAddresses
  signer,
  null,  // permit
  null,  // overrides
  null,  // payload
  { evmProvider },
);

// 3. Track it to completion.
const txHash = typeof tx === 'string' ? tx : tx.hash; // gasless Swift orders return the order hash, see "Gasless swaps"
const res = await fetch(`https://explorer-api.mayan.finance/v3/swap/trx/${txHash}`);
const { clientStatus } = await res.json(); // INPROGRESS | COMPLETED | REFUNDED
```

ERC20 inputs need an allowance first. See [ERC20 allowance](#erc20-allowance).

Full runnable examples for EVM, Solana and Sui live in [`mayan-finance/sdk-example`](https://github.com/mayan-finance/sdk-example).

---

## Supported chains

Pass these identifiers as `fromChain` / `toChain`. The full union is `ChainName` in [`src/types.ts`](./src/types.ts).

| Chain | `ChainName` | Chain | `ChainName` |
|---|---|---|---|
| Solana | `solana` | Base | `base` |
| Ethereum | `ethereum` | Linea | `linea` |
| BNB Smart Chain | `bsc` | Unichain | `unichain` |
| Polygon | `polygon` | HyperEVM | `hyperevm` |
| Avalanche | `avalanche` | HyperCore | `hypercore` |
| Arbitrum | `arbitrum` | Monad | `monad` |
| Optimism | `optimism` | Fogo | `fogo` |
| Sui | `sui` | | |

Token addresses come from the [Tokens API](https://price-api.mayan.finance/swagger/).

---

## Fetching quotes

`fetchQuote(params, options)` returns a `Quote[]`, one entry per available route.

```typescript
import { fetchQuote } from '@mayanfinance/swap-sdk';

const quotes = await fetchQuote(
  {
    amountIn64: '250000000', // base units of fromToken
    fromToken: fromToken.contract,
    toToken: toToken.contract,
    fromChain: 'avalanche',
    toChain: 'solana',
    slippageBps: 'auto',
    gasDrop: 0.04,                      // optional
    referrer: 'YOUR SOLANA WALLET',     // optional
    referrerBps: 5,                     // optional
  },
  {
    apiKey: 'YOUR API KEY',             // optional
  },
);
```

Each quote has a `type`:

- `SWIFT`, the intent-based auction. The primary route.
- `MCTP` and `FAST_MCTP`, over Circle CCTP. Suited to high-value stablecoin transfers.
- `WH`, the legacy Wormhole Token Bridge route.
- `MONO_CHAIN`, for same-chain swaps.
- `BLINK`, Mayan's inventory-backed route. See [Blink](#blink).

Pick one and pass it to the swap function.

### Blink

`BLINK` quotes are offered by default. Pass `blink: false` in `QuoteOptions` to leave them out.

A `BLINK` quote can only be swapped when `fetchQuote` was called with both `destinationAddress` and `refundAddress` (the swapper's address, or the `refundAddress` you pass in the swap options). The returned quote then carries the Blink order bound to those addresses in `blinkQuote`, and the swap functions use it as is; `hasBlinkQuoteHash(quote)` tells you whether a quote has one. Without them the quote is a price preview and the swap functions throw instead of fetching an order themselves. The SDK verifies the order hash, the amounts, the recipient, the refund address and the referrers against the quote and the swap inputs, and checks every contract it touches against the guardian-signed Blink contract manifest before building the deposit. Quotes expire 30 minutes after issuance; past that the SDK refuses to build the deposit, so request a new quote.

Referrer splits work the same way as for Swift V2: pass `referrers` when fetching the quote and the same object as `referrerAddresses` at swap time. Blink pays every listed wallet on the source chain.

EVM deposits do not go through the Mayan forwarder. The [ERC20 allowance](#erc20-allowance) helpers know which contract to approve, so the rest of this paragraph only matters if you approve by hand. Blink has two deposit contracts per chain: the escrow the quote calls `routerAddress` (plain transfers, `depositToken`, `depositNative`) and the router of the signed manifest, `order.contracts.router` (the permit and source-swap variants). Use `includeAllowanceTx` to bundle the approval, or call `resolveBlinkOrder` first and approve `getBlinkEvmDepositSpender(order, false)` for the amount. A `permit` is honored only if it was signed for `getBlinkEvmDepositSpender(order, true)` as spender; without a source swap that is the manifest router, not `order.quote.routerAddress`, and a permit for the escrow makes the deposit revert with `TransferFailed()`. When the order allows a direct transfer, `allowBlinkEvmDirectTransfer: true` in the swap options lets the SDK send a plain ERC20 transfer to the escrow instead, which needs no approval and the least gas. Blink attributes that transfer by the transaction's own calldata, which a contract account wraps (a Safe, an ERC-4337 account, an EIP-7702 delegated EOA), so the SDK only does it for a swapper without code on `options.evmProvider`; a contract account, and every swapper without the opt-in, deposits through the escrow's `depositToken` with the allowance the helpers ask for. Pass the same option to the allowance helpers so their answer matches the deposit, and leave it out for a smart account that is not deployed yet, since it has no code to detect.

Gasless `BLINK` quotes (`gasless: true` in `QuoteOptions`) are signed by the user and submitted through Mayan's explorer API, which indexes the order at once and hands it to Blink, instead of being sent as a transaction. On EVM the swap signs one Permit2 message; Permit2 itself needs an allowance on the token once, which the [ERC20 allowance](#erc20-allowance) helpers give with a gasless permit, passed to `swapFromEvm` as `permit`. On Solana the user signs a transaction whose fee payer is the Blink sponsor, and on Sui use `swapBlinkGaslessFromSui` with a `signTransaction` callback. The swap functions return the Blink quote hash, which is also the explorer order id prefixed with `BLINK_`. To sign elsewhere, build the order with `getBlinkGaslessFromEvmParams` (typed data to sign), `getBlinkGaslessFromSolanaTransaction` or `getBlinkGaslessFromSuiTransaction` (a sponsored transaction to sign); each returns the quote hash and the order params the submission must carry, and `submitBlinkGaslessOrder({ quoteHash, orderParams, evm | svm | sui }, apiKey)` sends the signed result. A refusal is thrown as `{ code, message }`, such as `BLINK_SUBMIT_THROTTLED` when a submission for the same quote is still in flight.

Sui orders that start with a source swap are opened by the user and executed by Blink. Pass a prefetched order through `ComposableSuiMoveCallsOptions.blinkOrder` and track the execution on the Explorer API with the quote hash, as for a gasless order.

### Slippage

`slippageBps` takes basis points or `'auto'`. `300` means 3%. With `'auto'` Mayan picks the slippage for the pair, and `quote.slippageBps` holds the resolved value.

### Gas on destination

Set `gasDrop` to the amount of native token the user should receive on the destination chain.

Maximum `gasDrop` per destination chain:

| Chain | Max | Chain | Max |
|---|---|---|---|
| ethereum | 0.05 ETH | arbitrum | 0.01 ETH |
| bsc | 0.02 BNB | optimism | 0.01 ETH |
| polygon | 0.2 POL | unichain | 0.01 ETH |
| avalanche | 0.2 AVAX | base | 0.01 ETH |
| solana | 0.2 SOL | | |

These figures are indicative. Read `quote.maxUserGasDrop` rather than hardcoding a ceiling. `gasDrop` is ignored for HyperCore deposits.

### API key

Optional. An `apiKey` lifts the per-IP rate limit. See [API keys](https://docs.mayan.finance/integration/quote-api?utm_source=npm&utm_medium=readme&utm_campaign=swap-sdk#api-key).

### Guaranteed price

A Swift quote with `swiftAuctionMode` equal to `3` has a guaranteed price. The user receives exactly `quote.minAmountOut`, not more and not less, and `expectedAmountOut` equals `minAmountOut`. In other auction modes the user receives at least `quote.minAmountOut`, and the final amount can be higher.

---

## Executing swaps

### Solana

```typescript
const { signature } = await swapFromSolana(
  quote,
  originWalletAddress,
  destinationWalletAddress,
  referrerAddresses,
  signSolanaTransaction,
  solanaConnection,
);
```

For manual control over the transaction, build instructions with `createSwapFromSolanaInstructions` and send them yourself.

### EVM

```typescript
const tx = await swapFromEvm(
  quote,
  swapperAddress,
  destinationWalletAddress,
  referrerAddresses,
  signer,
  permit,      // optional, EIP-2612
  overrides,   // optional
  payload,     // optional
  options,     // { evmProvider, apiKey?, includeAllowanceTx?, refundAddress?, allowBlinkEvmDirectTransfer? }
);
```

The signer's address must match `swapperAddress`, and the signer must have a provider attached. `options.evmProvider` is required: an ethers `JsonRpcProvider` on the source chain, through which the SDK reads the chain (gas estimation, and whether a Blink swapper is a contract account). It must be on the signer's chain.

To build the payload and send it yourself, use `getSwapFromEvmTxPayload`. It takes the same `options`, with `evmProvider` required for every quote type and checked against `signerChainId`.

#### ERC20 allowance

To swap from an ERC20 token, the contract that pulls it needs an allowance first. Which contract that is depends on the route (the Mayan Forwarder, a gasless Swift contract, Blink's deposit contracts or Permit2), so let the SDK work it out:

```typescript
import {
  isEvmSwapAllowanceEnough, signEvmSwapPermit, getEvmSwapApproveTxs, swapFromEvm,
} from '@mayanfinance/swap-sdk';

let permit = null;
if (!(await isEvmSwapAllowanceEnough(quote, swapperAddress, provider))) {
  // One wallet pop-up, no gas: an EIP-2612 permit, or null if the token has none
  permit = await signEvmSwapPermit(quote, signer);
  if (!permit) {
    // Fall back to approve transactions (usually one)
    for (const tx of await getEvmSwapApproveTxs(quote, swapperAddress, provider)) {
      await (await signer.sendTransaction(tx)).wait();
    }
  }
}
await swapFromEvm(quote, swapperAddress, destination, referrerAddresses, signer, permit, null, null, { evmProvider: provider });
```

- `isEvmSwapAllowanceEnough(quote, owner, provider, permit?, options?)` is `true` when the swap spends no allowance (a native input, a Blink direct transfer with `allowBlinkEvmDirectTransfer: true`), when the current allowance covers it, or when `permit` is still good for this quote. Keep the permit across quote refreshes and pass it here to know whether to ask again. Every helper takes the same trailing `options` as `swapFromEvm` for `allowBlinkEvmDirectTransfer`; pass the same value to both.
- Signing outside the SDK (a backend that returns what to sign, a non-ethers wallet): `getEvmSwapPermitParams(quote, owner, provider)` returns the permit as EIP-712 typed data, and its signature's `v`, `r`, `s` with `value.value` and `value.deadline` make the `permit` below. `getEvmSwapApproveTxs` already returns plain transactions, and `getEvmSwapApproval(quote, owner, provider)` the spender and amounts behind all of these.
- `provider` must be on the quote's source chain. With `includeAllowanceTx` a wallet that supports atomic batches bundles the approval into the swap instead.

The permit passed to `swapFromEvm` has this shape:

```typescript
{
  value: bigint,
  deadline: number,
  v: number,
  r: string,
  s: string,
}
```

#### Gasless swaps

For gasless Swift quotes (`quote.type === 'SWIFT' && quote.gasless`), `swapFromEvm` returns the order hash as a `string` instead of a transaction response. Track it on the Explorer API like a transaction hash. Other quote types return a transaction response even when gasless. HyperCore withdrawals return the HyperCore order id.

#### Contract-level integration

To integrate at the contract level, use the `_forwarder` object returned by `getSwapFromEvmTxPayload`. It carries the method name and parameters for a contract-level call.

### Sui

`suiClient` accepts any client implementing the Sui Core API (`ClientWithCoreApi`). `SuiGrpcClient` from `@mysten/sui/grpc` is recommended. TypeScript needs `"moduleResolution"` set to `bundler`, `node16` or `nodenext`.

> Only `MCTP` and `FAST_MCTP` quotes execute from Sui. Swift is not supported from Sui.

```typescript
const bridgeFromSuiMoveCalls = await createSwapFromSuiMoveCalls(
  quote,                     // Quote
  originWalletAddress,       // string
  destinationWalletAddress,  // string
  referrerAddresses,         // optional ReferrerAddresses
  customPayload,             // optional Uint8Array | Buffer
  suiClient,                 // ClientWithCoreApi
  options,                   // optional ComposableSuiMoveCallsOptions
);

await suiClient.signAndExecuteTransaction({
  signer: suiKeypair,
  transaction: bridgeFromSuiMoveCalls,
});
```

#### Composable Move calls and input coin

- **Custom Move calls.** Pass your transaction as `options.builtTransaction`. The bridge calls are appended, and you sign and send the combined transaction.
- **Custom input coin.** Pass a coin, for example one returned by an earlier Move call, as `options.inputCoin`.

The full option set is `ComposableSuiMoveCallsOptions` in [`src/types.ts`](./src/types.ts).

---

## Earning fees

Set `referrer` to your fee wallet and `referrerBps` to your rate.

```typescript
const quotes = await fetchQuote({
  amountIn64: '250000000',
  fromToken: fromToken.contract,
  toToken: toToken.contract,
  fromChain: 'avalanche',
  toChain: 'solana',
  slippageBps: 'auto',
  referrer: 'YOUR SOLANA WALLET',
  referrerBps: 5,
});
```

At swap time pass `referrerAddresses` with an address for every network you route across. A route with no matching address earns no fee, and no error.

```typescript
{
  evm: 'YOUR EVM WALLET',
  solana: 'YOUR SOLANA WALLET',
  sui: 'YOUR SUI WALLET',
}
```

To split across wallets, pass `referrers` in `QuoteOptions` instead of `referrer` / `referrerBps`, and the same object as `referrerAddresses` at swap time:

```typescript
const referrers = {
  evm: [
    { address: 'FIRST EVM WALLET', bps: 10 },
    { address: 'SECOND EVM WALLET', bps: 5 },
  ],
  solana: [
    { address: 'FIRST SOLANA WALLET', bps: 10 },
  ],
};
```

Each `bps` must be an integer from 0 to 255. Pass the same object at swap time that you fetched the quote with, or the SDK throws. Never mix the two shapes in one object. Split referrers earn nothing on `WH`, or on `MCTP` and `FAST_MCTP` to a non-Solana destination.

Rates per route, payout chains and collection: [fees earning](https://docs.mayan.finance/build/fees-earning?utm_source=npm&utm_medium=readme&utm_campaign=swap-sdk).

---

## Cross-chain deposits

Give each user a permanent deposit address. Tokens sent there arrive as your configured output token on the destination chain. No wallet connection or approval needed.

```typescript
const quotes = await fetchQuote(
  {
    amountIn64: '250000000',
    fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
    toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC on Solana
    fromChain: 'arbitrum',
    toChain: 'solana',
    slippageBps: 'auto',
    destinationAddress: userSolanaWallet,
  },
  { mpsDeposit: true },
);

const depositAddress = quotes[0].mpsDepositAddress;
```

The address is deterministic per destination chain, wallet and token. Changing any of them gives a different address. Sui is not supported as a deposit chain.

Call `validateMpsDepositAddress(quote, destinationAddress)` before showing an address to a user. It throws if the address is invalid.

Supported chains and tokens, minimums, statuses and events: [Mayan Payment Service](https://docs.mayan.finance/payment-service?utm_source=npm&utm_medium=readme&utm_campaign=swap-sdk).

---

## Hyperliquid funding

Pick the destination token by name from the Tokens API, `USDC (spot)` or `USDC (perps)`. Other destination tokens are not supported. The input token can be anything Mayan supports on the source chain.

```typescript
const quotes = await fetchQuote({
  amountIn64: '250000000',
  fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
  fromChain: 'arbitrum',
  toToken: hyperCoreUsdc.contract,                          // from fetchTokenList('hypercore')
  toChain: 'hypercore',
  slippageBps: 'auto',
});

// destinationAddress is the user's HyperCore address, EVM-style 0x...
const tx = await swapFromEvm(
  quotes[0], swapperAddress, hyperCoreAddress, null, signer, null, null, null, { evmProvider },
);
```

`gasDrop` is ignored, a custom payload is not supported, and the minimum deposit is around 5 USDC of output.

> Sui is not supported as a source chain for HyperCore deposits. Route from an EVM chain or Solana instead.

---

## Advanced

### Custom refund address

An order that cannot be completed is refunded on the source chain. Pass `refundAddress` in the swap options to choose the wallet that receives the refund, for when the initiating wallet cannot receive funds. It must be a valid wallet on the **source** chain; zero addresses are rejected.

```typescript
// EVM: via the options argument
const tx = await swapFromEvm(
  quote, swapperAddress, destinationWalletAddress, referrerAddresses,
  signer, permit, overrides, payload,
  { evmProvider, refundAddress: 'REFUND WALLET ON SOURCE CHAIN' },
);

// Solana: via the instructionOptions argument
const swapTrx = await swapFromSolana(
  quote, originWalletAddress, destinationWalletAddress, referrerAddresses,
  signSolanaTransaction, solanaConnection, extraRpcs, sendOptions, jitoOptions,
  { refundAddress: 'REFUND WALLET ON SOURCE CHAIN' },
);

// Sui: via the options argument
const tx = await createSwapFromSuiMoveCalls(
  quote, originWalletAddress, destinationWalletAddress, referrerAddresses,
  payload, suiClient,
  { refundAddress: 'REFUND WALLET ON SOURCE CHAIN' },
);
```

The same option exists on `getSwapFromEvmTxPayload`, `createSwapFromSolanaInstructions` and `swapBlinkGaslessFromSui`.

Not every protocol can honor it. The SDK checks the option against the quote type before building anything and throws when the protocol cannot refund to that wallet:

- **Swift.** Honored. Gasless Swift orders on EVM always refund to the swapper, so a different address is rejected there. On Solana only Swift V2 quotes (`quote.swiftVersion === 'V2'`) support it.
- **Blink.** Honored. The Blink order is bound to its refund address when the quote is issued, so fetch the quote with the same `refundAddress` (see [Blink](#blink)).
- **MCTP and Fast MCTP.** These protocols refund to the destination address. A `refundAddress` that is not `destinationAddress` is rejected.
- **Wormhole and mono-chain.** These refund to, or keep the funds in, the swapper wallet. A `refundAddress` that is not `swapperAddress` is rejected.

EVM and Sui addresses are compared case-insensitively, so a checksummed and a lowercase spelling of the same wallet match.

`swiftRefundAddress` is the previous name of this option. It is still accepted, applies to Swift quotes only, and must name the same wallet as `refundAddress` when both are passed.

### Bundling extra Solana instructions

To pack your own instructions into the **same** transaction as the Mayan swap, describe them up front via `extraInstructions`, so the quote leaves room for them in one Solana v0 transaction.

Only the POST flow (`fetchQuote` / `generateFetchQuoteUrlAndBody`) supports this.

```typescript
import { fetchQuote, InstructionInfo } from '@mayanfinance/swap-sdk';

const extraInstructions: InstructionInfo[] = [
  {
    programId: 'YourProgram1111111111111111111111111111111',
    accounts: [
      { pubkey: '...', isSigner: false, isWritable: true },
      // ...
    ],
    data: 'BASE64_ENCODED_INSTRUCTION_DATA',
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
        // optional: base58 addresses of address lookup tables your
        // instructions rely on, so the quoter can size the transaction
      ],
    },
  },
);
```

`InstructionInfo` and `SolanaKeyInfo` are defined in [`src/types.ts`](./src/types.ts).

You still append `extraInstructions` to the instruction list you submit on chain. The option is a sizing hint for the quote, nothing more.

---

## Tracking swaps

Query the [Explorer API](https://docs.mayan.finance/build/track-transactions) with the source transaction hash:

```
GET https://explorer-api.mayan.finance/v3/swap/trx/{txHash}
```

Branch on `clientStatus`: `INPROGRESS` (keep polling), `COMPLETED`, or `REFUNDED` (funds returned on the source chain).

Full schema: [Explorer API reference](https://explorer-api.mayan.finance/swagger/#/default/SwapDetailsController_getSwapByTrxHash).

---

## Support

- **Docs**: [docs.mayan.finance](https://docs.mayan.finance/?utm_source=npm&utm_medium=readme&utm_campaign=swap-sdk)
- **Bugs and feature requests**: [GitHub issues](https://github.com/mayan-finance/swap-sdk/issues)
- **Integration support**: [Discord](https://discord.com/invite/MayanFinance)
- **Updates**: [@mayan on X](https://x.com/mayan)

## License

[MIT](./LICENSE)
