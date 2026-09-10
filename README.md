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

const tx = await swapFromEvm(
  quote,
  swapperAddress,
  destinationSolanaAddress,
  null,  // referrerAddresses
  signer,
  null,  // permit
  null,  // overrides
  null,  // payload
);

// 3. Track it to completion.
const txHash = typeof tx === 'string' ? tx : tx.hash; // gasless Swift orders return the order hash, see "Gasless swaps"
const res = await fetch(`https://explorer-api.mayan.finance/v3/swap/trx/${txHash}`);
const { clientStatus } = await res.json(); // INPROGRESS | COMPLETED | REFUNDED
```

ERC20 inputs need an allowance for the Mayan Forwarder first. See [ERC20 allowance](#erc20-allowance).

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

Pick one and pass it to the swap function.

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
  options,     // optional: { apiKey, includeAllowanceTx, swiftRefundAddress }
);
```

The signer's address must match `swapperAddress`, and the signer must have a provider attached.

To build the payload and send it yourself, use `getSwapFromEvmTxPayload`.

#### ERC20 allowance

To swap from an ERC20 token, approve enough allowance for the Mayan Forwarder contract first. Its address is `addresses.MAYAN_FORWARDER_CONTRACT`.

Or pass a signed [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612) permit:

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

> Only `MCTP` quotes execute from Sui. Swift is not supported from Sui.

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
  quotes[0], swapperAddress, hyperCoreAddress, null, signer, null, null, null,
);
```

`gasDrop` is ignored, a custom payload is not supported, and the minimum deposit is around 5 USDC of output.

> Sui is not supported as a source chain for HyperCore deposits. Route from an EVM chain or Solana instead.

---

## Advanced

### Custom refund address (Swift)

A Swift order that cannot be completed refunds to the wallet that started it. Pass `swiftRefundAddress` to redirect it to another source-chain address, for when the initiating wallet cannot receive funds.

```typescript
// EVM: via the options argument
const tx = await swapFromEvm(
  quote, swapperAddress, destinationWalletAddress, referrerAddresses,
  signer, permit, overrides, payload,
  { swiftRefundAddress: 'REFUND WALLET ON SOURCE CHAIN' },
);

// Solana: via the instructionOptions argument
const swapTrx = await swapFromSolana(
  quote, originWalletAddress, destinationWalletAddress, referrerAddresses,
  signSolanaTransaction, solanaConnection, extraRpcs, sendOptions, jitoOptions,
  { swiftRefundAddress: 'REFUND WALLET ON SOURCE CHAIN' },
);
```

The same option exists on `getSwapFromEvmTxPayload` and `createSwapFromSolanaInstructions`.

- **EVM.** Gasless Swift orders always refund to the swapper. A different `swiftRefundAddress` is rejected.
- **Solana.** Only Swift V2 quotes (`quote.swiftVersion === 'V2'`) support a custom refund address.
- **Swift quotes only.** Other quote types ignore the option and refund to the swapper wallet. If a separate refund address is critical, filter for `quote.type === 'SWIFT'`.
- The refund address must be a valid wallet on the **source** chain. Zero addresses are rejected.

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
