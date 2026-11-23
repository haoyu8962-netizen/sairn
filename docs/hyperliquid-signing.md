# Hyperliquid Signing Architecture

> Complete reference for Hyperliquid's three distinct signing mechanisms: L1 Actions, User-Signed Actions, and Arbitrum EVM transactions.

## Quick Reference

| Signing Type | Chain ID | Domain | Use Case | Network Required |
|--------------|----------|--------|----------|------------------|
| **L1 Actions** | 1337 | "Exchange" | Trading operations | None (API only) |
| **User-Signed** | Signer's chain: external wallet → its current chain; Privy embedded owner → the environment's Arbitrum (42161 / 421614); SDK examples use 0x66eee | "HyperliquidSignTransaction" | Transfers, agent approval | None (API only) |
| **Arbitrum EVM** | 42161 | USDC EIP-3009 + contract call | CCTP deposits from Arbitrum | Arbitrum network |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HYPERLIQUID SIGNING                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────┐  │
│  │   L1 Actions         │  │   User-Signed        │  │  Arbitrum EVM │  │
│  │   (Trading)          │  │   (Admin/Transfers)  │  │  (Deposits)   │  │
│  ├──────────────────────┤  ├──────────────────────┤  ├───────────────┤  │
│  │ Chain ID: 1337       │  │ Chain ID: signer's   │  │ Chain ID:     │  │
│  │ Domain: "Exchange"   │  │ Domain: "Hyperliquid │  │ 42161         │  │
│  │                      │  │ SignTransaction"     │  │               │  │
│  ├──────────────────────┤  ├──────────────────────┤  ├───────────────┤  │
│  │ • order              │  │ • withdraw3          │  │ • EIP-3009    │  │
│  │ • cancel             │  │ • usdSend            │  │ • CCTP        │  │
│  │ • modify             │  │ • spotSend           │  │   deposit     │  │
│  │ • updateLeverage     │  │ • approveAgent       │  │               │  │
│  │ • updateIsolatedMarg │  │ • approveBuilderFee  │  │               │  │
│  │ • twapOrder          │  │                      │  │               │  │
│  │ • scheduleCancel     │  │                      │  │               │  │
│  │ • vaultTransfer      │  │ • usdClassTransfer   │  │               │  │
│  │ • subAccountTransfer │  │ • sendAsset          │  │               │  │
│  │ • etc...             │  │ • tokenDelegate      │  │               │  │
│  └──────────────────────┘  └──────────────────────┘  └───────────────┘  │
│           │                         │                        │          │
│           ▼                         ▼                        ▼          │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────┐  │
│  │ signL1Action()       │  │ signUserSignedAction │  │ wagmi/viem    │  │
│  │ (SDK handles auto)   │  │ (SDK handles auto)   │  │ signTypedData │  │
│  └──────────────────────┘  └──────────────────────┘  └───────────────┘  │
│           │                         │                        │          │
│           └─────────────────────────┼────────────────────────┘          │
│                                     ▼                                    │
│                    ┌────────────────────────────┐                        │
│                    │   ExchangeClient (SDK)     │                        │
│                    │   Handles both L1 and      │                        │
│                    │   User-Signed automatically │                        │
│                    └────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Signing Type 1: L1 Actions (Trading)

High-frequency trading operations that use a "phantom agent" construction. **No EVM network connection required** - signing happens purely with the private key.

### Characteristics

| Property | Value |
|----------|-------|
| Chain ID | 1337 |
| Domain Name | "Exchange" |
| Serialization | Msgpack binary → keccak256 hash |
| Signed By | Agent wallet (viem or ethers local account) |
| Network | None required (Hyperliquid API only) |
| Expiry | `expiresAfter` = estimated exchange time + 15 s on every L1 action ([ADR 0045](adr/0045-l1-action-expiry.md)) |

Every `ExchangeClient` from `createExchangeClient` or `getTradingClient` sets the SDK's `defaultExpiresAfter`, so an L1 action that the exchange has not accepted within 15 seconds is rejected with `Action already expired` instead of executing late, as with the official terminal's default Transaction Delay Protection. The exchange time comes from an `exchangeStatus` sample per network (the server's time as received, with nothing added for the round trip) plus the monotonic time elapsed since, so once a sample exists, changing the system clock cannot stretch the 15 seconds; when the wall-clock and monotonic ages disagree by more than a second, the next action first waits for a new sample. Before the first usable sample the device clock is used, as on the official terminal. User-signed actions do not support the field and are unchanged. As on the official terminal, Settings › Trading › Transaction delay protection turns the protection off (ADR 0045 decision 6).

`expiresAfter` only bounds the wait after signing. The wait before it is bounded separately ([ADR 0053](adr/0053-exchange-action-start-deadline.md)): for every action except the order cancels `cancel` and `cancelByCloid`, the time from entering the request scheduler to the call of the wallet's signer is limited to 15 seconds (age taken as the larger of the wall-clock and monotonic ages). A TWAP termination (`twapCancel`) has this limit too since 2026-11-19: the official terminal sends it at once without queueing or retrying, so one that cannot reach the signer within 15 seconds is reported as not sent and the user terminates again (ADR 0053 addendum). The scheduler checks it before calling the SDK, `defaultExpiresAfter` checks it again after the server-clock sync, and every client from `createExchangeClient` / `getTradingClient` wraps its wallet so that `signTypedData` checks it before the inner signer runs; an external wallet's own confirmation prompt happens inside that call and is not counted. A late action fails with `ExchangeActionDeadlineError` (unwrapped from the SDK's `AbstractWalletError`) and nothing is signed. The limit ends where the signer is called. For an owner-signed client, `owner-signer-client.ts` still awaits `verifyOwner()`, the embedded wallet's asynchronous signing round trip and a post-signature identity check before it sends; none of that is inside the limit. An L1 action carries an `expiresAfter` computed before signing, so a late send is rejected as expired, provided Transaction Delay Protection is on and the server-time estimate is reliable. A user-signed action (withdrawals, transfers, approvals: fixed amounts, no price) has no later protection, and a page frozen during those few hundred milliseconds can still send it late when it resumes. Only when all three conditions hold (an L1 action, Transaction Delay Protection on, a reliable server-time sample) is an action accepted by the exchange within about 30 seconds of entering the queue or not at all; when a resting limit order fills is not bounded by either. The builder-fee approval and the Agent approval flows share the deadline of the explicit authorization that started them (`useTradingAuthorization.authorize()`; when that authorization first registers an Agent, the builder-fee step counts from the registration's return instead, and a builder-fee step refused after the Agent went through is reported as `TradingAuthorizationIncompleteError`, never as nothing signed), check it before they ask for a signature, and the Agent flow checks it again immediately before calling `approveAgent`, removing a saved candidate that was never submitted. A client used outside the scheduler has an empty slot and is unchanged, unless its caller binds it to a deadline of its own through `createExchangeClient`'s fifth argument, as the explicit Agent approval does with the deadline of the click that started it; a cached client never accepts one. The legal re-check on that path sends one request with no retries and fails as `status_unavailable` after 10 seconds, so a page that loses focus can no longer pause it. `useExchange` runs its mutation with `networkMode: "always"` and the application `QueryClient` defaults every mutation to it, so an action that has reached `useExchange` while offline fails at once instead of being replayed when the network returns. Queries an application workflow awaits before it calls `useExchange` are outside the scheduler's limit, so each workflow that has such a wait (staking, vaults and the Agent registration they trigger, withdrawals and manual deposits, Send, referrals, TP/SL, the four close submissions, the API wallet page and Link mobile device) calls `startExchangeActionDeadline()` in its confirming handler before any `await` and checks it right before it submits or hands it to the approval implementation; `useTrackedOrder` and `useTrackedTwapOrder` check inside the asset lock, right before the request is queued, with the caller's deadline or one they start themselves; a late one is not submitted and reports that workflow's existing not-sent feedback. That click deadline is not carried into the scheduler, which starts its own 15 seconds at enqueue. A new workflow that waits before `useExchange` must do the same (ADR 0053 decision 10 and its entry table). This applies to user-signed actions too, and does not depend on the delay-protection setting.

The signer entry also checks the wallet session ([ADR 0058](adr/0058-signer-session-guard.md)). Every scheduled request carries the session generation it was captured in. Changes of the session identity (network, client key, session mode) are handled only by the session provider: a generation is retired as `unresolved` when the session identity becomes unknown (a reconnect, the wallet leaving the Privy directory) and as `replaced` when it becomes another identity or the network changes; the provider lifecycle ending or the user disconnecting also counts as `replaced`, and an unresolved generation is upgraded to `replaced` once the session settles on a different identity than the last confirmed one, or as soon as the network changes while the session is still unresolved. The modules that retired generations before keep doing so as `replaced`: an Agent-only owner switch or clear, an Agent key replacement or removal (Agent signer only), an ended Agent registration session, and cross-tab storage events (a changed Agent key entry retires that owner's Agent signer, an unusable registration session every signer of that owner, a changed or cleared Agent-only owner that owner's Agent-only session, and a cleared storage or an unreadable Agent-only entry every identity). The owner-signer provider retires nothing on mount or unmount; within one unchanged identity it retires the `user` signer as `replaced` only when the previous binding had an owner wallet and the binding changed. A binding without a wallet cannot have an owner signature in flight, so an external wallet, whose binding is null, keeps its pending signature when a binding appears or when a binding without a wallet flickers in and out; an email owner whose binding loses or changes its wallet is still retired. An explicit `replaced` retirement (for example an Agent key replacement, which retires only the Agent signer) also upgrades the matching unresolved generations, and a new capture upgrades an unresolved generation of the same identity and signer whose proof (registration epoch, Agent key, activation epoch, lifecycle) differs; one with the same proof stays unresolved and is sent. Before the wallet is asked to sign (`guardSigning`, again after `defaultExpiresAfter`), a user-signed request requires its generation to be current and otherwise fails with `ExchangeRequestInvalidatedError` (`phase: "before-signature"`), so no wallet prompt appears; the Agent signer is exempt because it prompts nothing. The explicit Agent approval client has no generation; right before its wallet signs, the signer awaits `beforeSign`, which checks the approval session and region, then the registration lease under the registration session lock (`isAgentRegistrationExecutionLeaseCurrent`, the same source as `beforeSubmit`), then the click deadline (the lock wait can outlast it; an aborted approval stops waiting for that lock) and the session and region again, so a registration ended or an Agent key replaced in another tab opens no wallet prompt (failing as an `AbortError`, an identity-changed error or a region error, like `beforeSubmit`). After signing, the transport refuses `/exchange` only for a `replaced` generation or an ended lifecycle (`phase: "after-signature"`): an external wallet's or an Agent's signature that returns while the session is merely unresolved is sent, as on the official terminal (operator decision, 2026-11-22). The execution guards inside the funds-action lock run when the SDK is called, before signing; between the signature and the send only the generation is checked. The email owner signer is the exception: it applies the same phases around its own reads and silent signature, and drops a signature once its owner binding changed, reported as `after-signature` (also when the inner Privy signer threw because of that change); it is not re-signed automatically. `before-start` comes from the scheduler and from `useExchange`'s own start checks, which turn any error of the app's `assertCurrent` into `before-start`. All three phases (`before-start`, `before-signature`, `after-signature`) mean the request never reached the exchange; the SDK wraps a signer error in `AbstractWalletError.cause` and only that layer is unwrapped. Checks that run after an approval may have reached the exchange (the builder-fee approval's confirmation, the trading authorization's checks after an Agent registration or a builder-fee approval) rewrite this error into an ordinary identity-changed error, so they are never reported as not sent; a builder-fee step that is dropped by its deadline (`ExchangeActionDeadlineError`) or as `ExchangeRequestInvalidatedError` after this authorization approved an Agent is reported as `TradingAuthorizationIncompleteError`, while a plain error the step throws before it starts ("No wallet connected", "Wallet changed during builder fee approval") keeps its own text. Once the HTTP request has started, a failure without a definitive exchange answer (no status, a status below 400, 408 or 5xx, an unverified response) is reported as unknown; `ApiRequestError`, other 4xx responses and acknowledged responses keep their own branches. Manual deposits have their own session check on the Arbitrum path (Signing Type 3).

### Methods Using L1 Signing

| Method | Description | Parameters |
|--------|-------------|------------|
| `order` | Place order(s) | `orders`, `grouping`, `builder?` |
| `cancel` | Cancel by order ID | `cancels: [{a, o}]` |
| `cancelByCloid` | Cancel by client order ID | `cancels: [{asset, cloid}]` |
| `modify` | Modify single order | `oid`, `order` |
| `batchModify` | Modify multiple orders | `modifies` |
| `updateLeverage` | Set leverage for asset | `asset`, `isCross`, `leverage` |
| `updateIsolatedMargin` | Add/remove isolated margin | `asset`, `isBuy`, `ntli` |
| `twapOrder` | Place TWAP order | `a`, `b`, `s`, `r`, `m`, `t` |
| `twapCancel` | Cancel TWAP | `a`, `t` |
| `scheduleCancel` | Dead man's switch | `time?` |
| `vaultTransfer` | Deposit/withdraw vault | `vaultAddress`, `isDeposit`, `usd` |
| `subAccountTransfer` | Transfer to sub-account | `subAccountUser`, `isDeposit`, `usd` |
| `subAccountSpotTransfer` | Spot transfer to sub-account | `subAccountUser`, `isDeposit`, `token`, `amount` |
| `createSubAccount` | Create sub-account | `name` |
| `createVault` | Create vault | `...` |
| `setDisplayName` | Set leaderboard name | `displayName` |

### Code Example

```typescript
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

// Agent wallet signs with chainId 1337 automatically
const agentSigner = privateKeyToAccount("0x...");
const client = new ExchangeClient({
  transport: new HttpTransport(),
  wallet: agentSigner,
});

// SDK handles L1 signing internally
await client.order({
  orders: [{
    a: 0, b: true, p: "95000", s: "0.01",
    r: false, t: { limit: { tif: "Gtc" } }
  }],
  grouping: "na",
});
```

---

## Signing Type 2: User-Signed Actions (Admin/Transfers)

Administrative operations that use EIP-712 typed data with Hyperliquid's signature chain ID. **No EVM network connection required** - the chain ID is embedded in the signature, not the network.

### Characteristics

| Property | Value |
|----------|-------|
| Chain ID | `signatureChainId` of the signer: hl-react configures none, so the SDK's `resolveSignatureChainId` reads the wallet's `getChainId()`. An external wallet therefore signs with whatever chain it is on (via `useConnectionWalletClient`, which never requires a switch); the Privy embedded owner reports the environment's Arbitrum chain (42161 Mainnet, 421614 Testnet); the SDK's own examples show 0x66eee (421614). Hyperliquid accepts any value here as long as the EIP-712 domain and the action agree |
| Domain Name | "HyperliquidSignTransaction" |
| Serialization | Direct EIP-712 typed data |
| Signed By | Master wallet (wagmi walletClient or viem account) |
| Network | None required (Hyperliquid API only) |

### Methods Using User-Signed Actions

| Method | Description | Parameters |
|--------|-------------|------------|
| `withdraw3` | Withdraw USDC to Arbitrum | `destination`, `amount` |
| `usdSend` | Send USDC to address | `destination`, `amount` |
| `spotSend` | Send spot tokens | `destination`, `token`, `amount` |
| `usdClassTransfer` | Move USDC perp↔spot | `amount`, `toPerp` |
| `sendAsset` | Transfer between DEXs/sub-accounts | `destination`, `sourceDex`, `destinationDex`, `token`, `amount` |
| `approveAgent` | Approve agent wallet; the ordinary trading connection sends no `agentName` (unnamed default Agent, [ADR 0038](adr/0038-unnamed-default-agent-for-trading-connection.md)), the API wallet page and Link mobile device send a name | `agentAddress`, `agentName?`, `nonce` |
| `approveBuilderFee` | Approve builder fee | `builder`, `maxFeeRate`, `nonce` |
| `tokenDelegate` | Delegate/undelegate staking | `validator`, `amount`, `isUndelegate` |
| `userDexAbstraction` | Enable/disable HIP-3 DEX abstraction | `user`, `enabled` |

### Code Example

```typescript
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

// Master wallet for user-signed actions
const masterAccount = privateKeyToAccount("0x...");
const client = new ExchangeClient({
  transport: new HttpTransport(),
  wallet: masterAccount,
});

// SDK signs the user-signed action with the signer's chain id (see "Chain ID" above); a bare private key with no configured signatureChainId falls back to the SDK default, not 0x66eee
await client.withdraw3({
  destination: "0x...",
  amount: "100.0",
});
```

---

## Signing Type 3: Arbitrum EVM Transactions (Deposits)

Deposits authorize native USDC with EIP-3009 and submit an on-chain CCTP call on Arbitrum. External wallets submit directly; Privy email wallets sign with their exact embedded EOA and use the matching Smart Wallet Paymaster/Bundler for gas-sponsored submission.

### Characteristics

| Property | Value |
|----------|-------|
| Chain ID | 42161 (Arbitrum One) |
| Direct contract | CctpExtension (`0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE`) |
| Sponsored contract | CctpExtensionV2 (`0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB`) |
| Token | USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`) |
| Authorization signer | Exact selected master/embedded EOA |
| Transaction sender | External wallet directly, or Privy Smart Wallet via Paymaster/Bundler |
| Network | **Arbitrum required** |

### Deposit Flow

1. **Fetch current routing and Circle fee/allowance** - Require a fresh `depositRoute === "cctp"` and a reviewed fee quote.
2. **Sign EIP-3009 `ReceiveWithAuthorization`** - The exact USDC owner authorizes the selected CCTP extension.
3. **Submit the CCTP call** - External wallets call CctpExtension; Privy Smart Wallets call `CctpExtensionV2.batchSponsorDepositForBurn` through the configured Bundler/Paymaster.
4. **Classify the receipt and track forwarding** - A V2 transaction is successful for the user only when its matching `SponsoredDepositForBurn` event exists; `SponsoredDepositForBurnSkipped` is a failure, even if the outer transaction receipt succeeded.
5. **Hyperliquid credits** - Continue tracking the source transaction and HyperCore credit after refresh.

A manual deposit is bound to the session of its click (`DepositReview.session`, [ADR 0058](adr/0058-signer-session-guard.md) decision 5). Every request the deposit itself makes to the wallet goes through one guarded EIP-1193 provider (requests Privy's Smart Wallet SDK makes internally do not; see below); the deposit never calls Privy's `wallet.switchChain`, whose own add-chain and second switch would bypass it. The network switch goes through that provider: `wallet_switchEthereumChain`, and on an unknown-chain answer (4902, or the Rabby and Coinbase wordings Privy recognises) `wallet_addEthereumChain` and a second switch, with Privy's 300 ms pause before Rabby is asked to add the chain. Each click creates an attempt (`createDepositSessionAttempt`) that records the global modal opening shown (`getGlobalModalOpening()`), the resolving flag, the client key and the deposit wallet, is told about every commit of the dialog, and can only be voided: when the opening changes (closed, opened again, another modal; read synchronously, so a close and reopen merged into one commit counts), when the dialog unmounts, or when the session settles on another wallet or client key. Before the permit signature, the account request, the network switch and the signature need the click's live session token, whose identity includes the account mode. Once the permit is signed the deposit waits once, before any fresh check, at most `DEPOSIT_SESSION_SETTLE_TIMEOUT_MS` (30 seconds by whichever of the wall clock and the monotonic clock reaches it first, as for the signing deadline, independent of the dialog's presentation hold, so a return after the limit times out even when a background tab delayed the timer or the device slept), for the session to settle on the click's wallet and client key: back on the click's account it continues; a voided attempt stops quietly and saves nothing; a wait that times out stops both the external and the sponsored path with "Wallet not connected" and sends nothing (operator decisions of 2026-11-23: the external wallet waits once with its own 30-second limit; the sponsored path waits for the click's account, then redoes every fresh check before it broadcasts, and stops on a timeout or another identity). After the wait the route, Circle fee and capacity, balance (sponsored) or gas checks (external), legal recheck, active account, chain (external) and a freshly obtained Smart Wallet client (sponsored) are all checked again; then a synchronous gate requires that the attempt is not void, that no commit saw the session away from the click's identity since the moment the wait was decided (the wait hands back the interruption count of that moment), and that the session is still settled on it, and only then is the authorization saved and the transaction sent, or handed to Privy's Smart Wallet `sendTransaction`. A session that is interrupted again during these checks, even one that comes back before the gate, stops the deposit quietly at the gate; a check that fails meanwhile is reported as it is unless the attempt was voided and nothing was forwarded to the wallet (also when viem's chain read inside `writeContract` fails), and there is no second wait and no broadcast with check results from before or during the interruption. The sponsored gate sits at the Privy SDK call: Privy then prepares the UserOperation, signs it with the embedded wallet's own provider and sends it to the bundler inside the SDK, and an account switch during those seconds no longer stops it (it deposits the click owner's own authorized USDC into that owner's account; ADR 0058 lists it as an open limitation). The provider applies the same gate to `eth_sendTransaction`, `wallet_sendTransaction`, `wallet_sendCalls` and `eth_sendRawTransaction`, and records every send it forwards in the attempt's forwarding ledger, which alone decides the outcome of an external deposit that returned no hash: once a forwarded send was answered or failed with anything other than a refusal that means nothing was broadcast (up to six levels of the cause chain are read), no further send is forwarded, so viem's fallback `wallet_sendTransaction` after an unclear `eth_sendTransaction` answer cannot broadcast a second transaction, and the saved authorization is kept and the outcome is unknown; with nothing forwarded, or every forward refused so, the authorization is removed and the failure is reported as it is (a session stop returns the deposit to idle without an error; a failed removal after a session stop still shows "Deposit status unknown"). viem still reads `eth_chainId` between the app's gate and `eth_sendTransaction`, because without it the request would carry no `chainId` for the wallet to check; the provider applies the gate again when the send is forwarded, so a session flash during that round trip stops the deposit quietly there and the signed permit goes unused. Automatic email-wallet deposits ([ADR 0040](adr/0040-automatic-email-wallet-deposits.md)) have no click and are not checked.

### Code Example (Current Implementation)

The implementation lives in `apps/terminal/src/lib/hyperliquid/use-deposit.ts`, with pure EIP-3009/CCTP parameter and receipt validation in `apps/terminal/src/lib/trade/cctp-deposit.ts`. It revalidates the owner, route, fee quote, fast-burn allowance, and contract result at the relevant signing and submission boundaries. New Bridge2 deposits are intentionally fail-closed. The app never stored recovery data for Bridge2 deposits; past ones appear in the account ledger like any other deposit.

---

## Withdrawal Flow (HyperCore → Arbitrum)

Withdrawals use **User-Signed Actions** (not Arbitrum EVM).

| Step | Action | Signing Type |
|------|--------|--------------|
| 1 | Call `exchange.withdraw3()` | User-Signed (signer's chain) |
| 2 | Hyperliquid processes | Automatic |
| 3 | USDC arrives on Arbitrum | ~10 min |

```typescript
// Withdrawal - uses User-Signed Action, NOT Arbitrum tx
await exchangeClient.withdraw3({
  destination: arbitrumAddress,
  amount: "100.0",
});
```

---

## Complete Method → Signing Type Reference

### L1 Actions (Chain ID: 1337)

| Category | Methods |
|----------|---------|
| **Orders** | `order`, `cancel`, `cancelByCloid`, `modify`, `batchModify` |
| **TWAP** | `twapOrder`, `twapCancel` |
| **Position** | `updateLeverage`, `updateIsolatedMargin` |
| **Schedule** | `scheduleCancel` |
| **Sub-accounts** | `createSubAccount`, `subAccountTransfer`, `subAccountSpotTransfer`, `subAccountModify` |
| **Vaults** | `createVault`, `vaultTransfer`, `vaultModify`, `vaultDistribute` |
| **Account** | `setDisplayName`, `setReferrer`, `registerReferrer`, `claimRewards` |
| **Staking (L1)** | `cDeposit`, `cWithdraw`, `linkStakingUser`, `cSignerAction`, `cValidatorAction` |
| **Advanced** | `evmUserModify`, `perpDeploy`, `spotDeploy`, `reserveRequestWeight`, `agentEnableDexAbstraction`, `convertToMultiSigUser`, `noop` |

### User-Signed Actions (Chain ID: the signer's chain)

| Category | Methods |
|----------|---------|
| **Withdrawals** | `withdraw3` |
| **External Transfers** | `usdSend`, `spotSend` |
| **Internal Transfers** | `usdClassTransfer`, `sendAsset` |
| **Approvals** | `approveAgent`, `approveBuilderFee` |
| **Staking** | `tokenDelegate` |
| **Advanced** | `userDexAbstraction` |

### Arbitrum EVM Transactions (Chain ID: 42161)

| Category | Methods |
|----------|---------|
| **Deposits** | USDC EIP-3009 authorization + CctpExtension/CctpExtensionV2 submission |

---

## Bridging: HyperCore ↔ HyperEVM ↔ Arbitrum

### System Addresses

| Token | System Address |
|-------|----------------|
| USDC | `0x2000000000000000000000000000000000000000` |
| HYPE | `0x2222222222222222222222222222222222222222` |

### Contract Addresses (Mainnet)

| Contract | Address |
|----------|---------|
| Native USDC (Arbitrum) | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| CctpExtension (Arbitrum) | `0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE` |
| CctpExtensionV2 (Arbitrum) | `0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB` |
| Bridge2 (retired; no code uses it) | `0x2df1c51e09aecf9cacb7bc98cb1742757f163df7` |
| CoreDepositWallet (HyperEVM) | `0x6b9e773128f453f5c2c60935ee2de2cbc5390a24` |
| CoreWriter (HyperEVM) | `0x3333333333333333333333333333333333333333` |

### Bridge Flows

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BRIDGE FLOWS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ARBITRUM → HYPERCORE (Deposit)                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│  │ Arbitrum │───▶│ CCTP Ext. │───▶│ HyperCore│                           │
│  │ USDC     │    │ V1 / V2  │    │ Balance  │                           │
│  └──────────┘    └──────────┘    └──────────┘                           │
│  Signing: Arbitrum EVM (42161)                                           │
│                                                                          │
│  HYPERCORE → ARBITRUM (Withdraw)                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│  │ HyperCore│───▶│ withdraw3│───▶│ Arbitrum │                           │
│  │ Balance  │    │ API Call │    │ USDC     │                           │
│  └──────────┘    └──────────┘    └──────────┘                           │
│  Signing: User-Signed (signer's chain)                                   │
│                                                                          │
│  HYPERCORE → HYPEREVM (Internal Bridge)                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│  │ HyperCore│───▶│ spotSend │───▶│ HyperEVM │                           │
│  │ Spot     │    │ to 0x200.│    │ USDC     │                           │
│  └──────────┘    └──────────┘    └──────────┘                           │
│  Signing: User-Signed (signer's chain)                                   │
│                                                                          │
│  HYPEREVM → HYPERCORE (Internal Bridge)                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│  │ HyperEVM │───▶│ CoreDepo-│───▶│ HyperCore│                           │
│  │ USDC     │    │ sitWallet│    │ Balance  │                           │
│  └──────────┘    └──────────┘    └──────────┘                           │
│  Signing: HyperEVM transaction                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Wallet Pattern

The recommended pattern for frontend applications to avoid chain ID conflicts.

### Why Use Agent Wallets?

Browser wallets enforce chain ID matching:
- L1 Actions require chain ID 1337
- Browser connected to Arbitrum (42161) → **Conflict!**

Solution: Two-wallet pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AGENT WALLET PATTERN                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐         ┌──────────────────────┐              │
│  │   Master Wallet      │         │    Agent Wallet      │              │
│  │   (Browser/wagmi)    │         │  (viem local account)│              │
│  ├──────────────────────┤         ├──────────────────────┤              │
│  │ • approveAgent       │────────▶│ • order              │              │
│  │ • approveBuilderFee  │  signs  │ • cancel             │              │
│  │ • withdraw3          │  once   │ • modify             │              │
│  │ • usdSend            │         │ • updateLeverage     │              │
│  │ • spotSend           │         │ • All L1 Actions     │              │
│  └──────────────────────┘         └──────────────────────┘              │
│           │                                  │                           │
│           │ Chain ID: signer's chain        │ Chain ID: 1337            │
│           │ (No network switch needed)       │ (No network needed)       │
│           │                                  │                           │
│           ▼                                  ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Hyperliquid API                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Agent Key Storage Security

Agent private keys are stored in browser storage. `Stay Connected` is off by
default: unchecked uses `sessionStorage`, while checked uses `localStorage`.
Both scopes use the same environment-and-owner key and validated record shape.

This storage is acceptable within the product's Agent-wallet threat model because:

| Concern | Mitigation |
|---------|------------|
| **Limited permissions** | Agent keys can only execute trades - they cannot withdraw funds or transfer assets |
| **User-revocable** | Users can revoke agent approval anytime from their master wallet |
| **Session-scoped default** | The default key disappears with the browser tab/session |
| **Persistent opt-in** | Cross-restart storage requires an explicit `Stay Connected` choice |
| **Standard pattern** | This is the recommended Hyperliquid pattern for web applications |

The master wallet (hardware wallet / MetaMask) never has its keys stored - it only signs the initial agent approval and admin operations like withdrawals.

### Default Agent versus named Agents

Hyperliquid gives an account one unnamed default Agent and, for low trading
volume, three named Agents. The ordinary trading connection approves the
unnamed default Agent, as the official terminal's Establish Connection does:
`approveAgent` carries no `agentName`, the SDK signs the EIP-712 message with
an empty name, and the new approval replaces the account's previous default
Agent wherever it was approved. Because the default Agent never appears in
`extraAgents`, its approval is verified with `userRole` for the stored key,
which must answer `{ role: "agent", data: { user: <exact owner> } }`. Named
Agents (`name valid_until <ms>`) stay with the API wallet page and the Link
mobile device transfer and are verified through `extraAgents`; a named
approval beyond the account's cap is rejected with
`Too many extra agents for cumulative volume traded. Current limit is N`
([ADR 0038](adr/0038-unnamed-default-agent-for-trading-connection.md)).

### Current Implementation

```typescript
// useAgentRegistration.ts - Generates, stores, and verifies an Agent wallet
const register = async (options: { persistConnection: boolean }) => {
  // 1. Generate new agent keypair
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  // 2. Master wallet signs approveAgent (User-Signed, the signer's chain).
  //    No agentName: this is the account's unnamed default Agent (ADR 0038).
  await exchangeClient.approveAgent({
    agentAddress: account.address,
  });

  // 3. Store in the selected scope, then verify storage and server approval
  const storageScope = options.persistConnection ? "local" : "session";
  await persistAgentForRegistration(
    epoch,
    privateKey,
    account.address,
    { source: "local-registration" },
    { scope: storageScope },
  );
  // userRole for the new address must answer { role: "agent", data: { user: owner } }
  const requirements = await refetchAgent(account.address);
  if (!requirements.isAgentReady) {
    throw new Error("Agent approval could not be confirmed");
  }
  await verifyStoredAgent(account.address);
};

// useHyperliquidClients.ts - Agent signs L1 actions only after verification
const trading = hasUserSession && signer && agentReady
  ? getTradingClient(signer, isTestnet)
  : null;
```

Agent registration does not approve a builder fee. The terminal requests
`approveBuilderFee` separately when the first trading action needs the
configured builder code. The complete first-time ordering and fail-closed
requirements are documented in `docs/trading-onboarding.md`.

The low-level registration hook retains a persistent default for compatibility
with older callers. Product entry points must pass the user's stored
`Stay Connected` preference explicitly; omitting it is not an acceptable UI
default.

### Mobile Agent QR transfer and Agent-only sessions

Link mobile device reuses the Agent Wallet Pattern to move a trading-only key
from the desktop to a phone. This section describes the implemented behavior;
the product decisions and the official comparison are in
[ADR 0015](adr/0015-link-device-alignment.md).

- The desktop generates the Agent private key locally and the exact owner
  wallet signs `approveAgent` (User-Signed, with the signer's chain id: the external wallet's current chain, or the embedded owner's environment Arbitrum chain) with the name
  `Mobile QR valid_until <ms>`, where `<ms>` is the expiry 30 days after approval.
  Hyperliquid stores the parsed name `Mobile QR`, the same name the official
  terminal's Link Mobile Device approves, and deregisters a named agent when an
  approval reuses its name, so a phone linked here or there takes one shared
  named slot. Each time the dialog opens it fetches `extraAgents` once and uses
  only that answer: when the documented base limit of 3 active named agents is
  reached and none is `Mobile QR`, it says the approval may be rejected, lists
  them with their expiry and links to the API Wallet page, without blocking the
  approval because sub-accounts (2 more each) and trading volume raise the
  limit
  (`getMobileAgentSlotState`, ADR 0039)
  (`packages/hl-react/src/signing/mobile-agent.ts`, `MOBILE_AGENT_VALIDITY_MS`).
  Approval is the dialog's single explicit action; the dialog never signs a
  builder fee. While the owner's builder fee is definitively unapproved (trading
  not activated yet) the action is disabled with an explanation to deposit and
  place a first order on desktop, and a fresh `maxBuilderFee` check runs before
  the Agent is signed; an unknown answer signs nothing (ADR 0039). The dialog passes `applicationReview: "confirmed"`, so an embedded wallet
  signs without a second Privy prompt, and the exchange's `status: "ok"` is
  the success signal. The desktop does not poll `extraAgents`.
- The key travels as plain JSON in the URL fragment of `/mobile-agent-sync`
  (`apps/terminal/src/lib/mobile-sync/sync-core.ts`, payload version 5, TTL
  `MOBILE_SYNC_PAYLOAD_TTL_MS` = 2 minutes, bound to the network and owner).
  The fragment never reaches a server and is removed from the address bar by
  the import page before its first paint. Reveal requires a 2 s hold and the
  QR closes after `MOBILE_SYNC_QR_VISIBLE_MS` = 60 s, on window blur or when
  the page is hidden. The transfer uses no server state (ADR 0015 D7 option B
  and D8): a second phone scanning the same code within the payload lifetime
  is not rejected, and the payload is not encrypted because a key carried in
  the same link protects nothing against whoever holds the link. The phone
  refuses another network, an expired payload, one dated ahead of it beyond
  the clock skew, and every older envelope version with a refresh-both-devices
  message. These limits bind honest clients only: a captured complete QR or
  URL exposes the Agent key until it expires or the owner replaces or removes
  it.
- The phone performs an explicit Import step: one fail-closed `extraAgents`
  verification of address, name base and unexpired `validUntil`
  (`verifyExpectedMobileAgent`), then it stores the Agent record in the local
  storage scope on that device (`persistAgentForRegistration(...,
  { scope: "local" })`; the underlying `agent-storage.ts` default is also
  `local`) and activates the owner in an `agent-only` session mode
  (`packages/hl-react/src/signing/agent-session.ts`), rolling back through
  `cancelAgentRegistrationEpochAndRemove` when activation or verification is
  no longer current. An env-matching Agent-only owner takes precedence over a
  connected wallet in `resolveSession`; while it is active the terminal masks
  the Privy identity and builds no owner signer or user-signed client, and
  Disconnect removes only the imported key (ADR 0039).
- An Agent-only session can sign L1 actions only: orders, cancels, leverage,
  vault transfers and sub-account transfers. It cannot construct any
  User-Signed call, so deposit, `withdraw3`, `usdSend`, `spotSend` and other
  master-wallet actions need the master wallet on desktop; the phone surfaces
  those actions disabled with a single desktop-required reason
  (`agent-only-session`, see `docs/mobile-data-presentation.md`). Approvals it
  cannot sign are never offered: `useTradingGuard` reports
  `needsOwnerApproval` and the order and confirmation buttons stay disabled
  with the desktop-required reason instead of an Enable action.
- There is no revoke panel. Approving again from the dialog replaces the
  phone's Agent under the same name base (the dialog's warning says so), and
  the API wallet page removes any Agent; the phone clears its record at its
  next `extraAgents` check (`use-agent-status.ts`) or when `validUntil` passes,
  and `subscribeMobileAgentEnded` lets the terminal tell the user to scan
  again.

For comparison, the official terminal encodes the raw Agent private key as
base64 JSON in a `?link=` query string with no expiry, signs as soon as its
icon is clicked, imports on the phone without an explicit step and approves a
`Mobile QR` agent without `valid_until` (the exchange's 90-day default
expiry applies) that each re-link replaces. Sairn keeps the four
differences that matter (exact owner and an explicit click, 30-day expiry,
fragment instead of query string, one `extraAgents` verification before
import) and otherwise matches the official entry, copy and step count.

---

## Implementation Strategy

### For wagmi/viem Integration

| Signing Type | Implementation |
|--------------|----------------|
| **L1 Actions** | viem local account (agent wallet, stored locally) |
| **User-Signed** | `walletClient.signTypedData()` via SDK's AbstractWallet adapter |
| **Arbitrum EVM** | `useSignTypedData()` + `useWriteContract()` from wagmi |

### Wallet Adapter Pattern

```typescript
// wallet.ts - Adapts wagmi walletClient for Hyperliquid SDK
export function toHyperliquidWallet(
  walletClient: WalletClient,
  address: `0x${string}`,
): AbstractWallet {
  return {
    address,
    signTypedData: async (params) => {
      return walletClient.signTypedData({
        account: address,
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message,
      });
    },
  };
}
```

---

## Common Pitfalls

| Issue | Cause | Solution |
|-------|-------|----------|
| "User or API Wallet does not exist" | Wrong chain ID or key ordering | Use SDK, don't manually sign |
| "Provided chainId must match" | Browser wallet chain mismatch | Use agent wallet for L1 actions |
| Signature recovery fails | Address not lowercase | SDK handles automatically |
| "Agent not approved" | Using agent before approval | Call `approveAgent` first |

### Chain ID Reference

| Purpose | Chain ID | Decimal |
|---------|----------|---------|
| L1 Actions | 1337 | 1337 |
| User-Signed (external wallet) | wallet's current chain | — |
| User-Signed (Privy embedded owner) | 0xa4b1 Mainnet / 0x66eee Testnet | 42161 / 421614 |
| Arbitrum One | 42161 | 42161 |
| Arbitrum Sepolia | 421614 | 421614 |

---

## Where the signers live today

An earlier version of this page ended with an app-local refactoring proposal: a `src/lib/hyperliquid/{signing,trading,admin,deposits}` layout, per-method hooks such as `useExchangeOrder` and `useExchangeWithdraw3`, `useTradingClient`/`useAdminClient`, and an unchecked migration checklist. That proposal was superseded when the signer model moved into `@sairn/hl-react`; [signing-architecture-proposal.md](./signing-architecture-proposal.md) keeps it as a historical record. The current split (2026-10-08):

| Concern | Implementation |
|---------|----------------|
| Signer choice per action | `useExchange(method, options)` in `packages/hl-react/src/hooks/useExchange.ts`. `packages/hl-react/src/registries/exchange.ts` routes the user-signed methods (`withdraw3`, `usdSend`, `spotSend`, `usdClassTransfer`, `sendAsset`, `approveAgent`, `approveBuilderFee`, staking and account-mode actions) to the exact owner and every other method, an L1 action, to the trading signer; only `order` gets the builder code injected. |
| Trading signer | Email sessions sign L1 actions with the exact active Privy embedded owner (`signing/owner-signer-client.ts`, `signing/owner-signer-provider.tsx`, supplied by `apps/terminal/src/providers/hyperliquid-owner-signer-bridge.tsx`); external-wallet and Agent-only sessions use a verified Agent (`signing/use-agent-registration.ts`, `agent-storage.ts`, `use-agent-status.ts`). |
| Decision record | [ADR 0002](adr/0002-exact-owner-trading-signers.md) for the signer model; [trading onboarding](trading-onboarding.md) and [email trading signing](email-trading-signing.md) for the first-use sequence. |

### Deposit (CCTP-only)

`useDeposit` requires an explicit CCTP route. The exact owner signs the USDC EIP-3009 authorization; external wallets submit CctpExtension directly, while email-wallet sessions submit CctpExtensionV2 through the already configured Privy Smart Wallet Paymaster/Bundler. Neither path may fall back to Bridge2 when routing, fee, allowance, owner, or receipt validation fails.

## Signer check after an owner signature (2026-11-12)

Hyperliquid executes an action for the address it recovers from the signature and the payload; a wrong signer shows up as `User or API Wallet 0x… does not exist` or `Must deposit before performing actions` ([Signing](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing)). So after an owner signature returns, `assertTypedDataSignedBy` recovers the address from the same typed data the wallet received (`recoverTypedDataAddress`) and compares it with the selected owner, case-insensitively. A mismatch, or a signature that cannot be recovered (a contract-wallet signature included: Hyperliquid needs an EOA signature), throws `WalletAccountMismatchError` and nothing is sent. It covers the external wallet's user client and its terms signature (`toHyperliquidWallet`), every action of the embedded owner (`owner-signer-client.ts`), Agent approval from either wallet (`external-agent-signer.ts`, `privy-agent-signer.ts`) and the embedded wallet's terms signature (`privy-legal-signer.ts`). Local Agent keys are not checked. The CCTP deposit's EIP-3009 authorization is not a Hyperliquid action and is verified by the token contract.

## Stored nonce and Agent records (2026-11-12)

- A nonce record that cannot be parsed, or whose nonce is not a non-negative safe integer, is treated as absent and replaced. While the server clock holds a sample and the device's wall and monotonic clocks still agree, the exchange's estimated time is both the base of a new nonce and the reference of its future window (2026-11-19): the nonce is the larger of that time and the stored nonce plus one, a stored nonce at or beyond one day ahead of it is discarded, and a nonce that would reach that limit is refused without rewriting the record (the exchange accepts a nonce only inside (T − 2 days, T + 1 day) of the block time T, [Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)). Without such an estimate, for example after the device slept or before the first sample, the device clock is used as before. The official terminal counts from the device clock in every case; on a device whose clock is right the two bases agree within milliseconds, and on one that is wrong by more than the window only the exchange's time is accepted, so this terminal keeps the exchange base (ADR 0045, 2026-11-19 addendum).
- No sample is fetched just to number an action: only an L1 action with Transaction Delay Protection on waits for one, because its `expiresAfter` needs it (ADR 0045 decision 4). A user-signed action, or an L1 action with the protection off, signs at once from the device clock when there is no sample, as the official terminal does before its first account snapshot.
- An action the exchange refuses with `Invalid nonce: nonce too low` is sent once and not signed again automatically; the caller gets the SDK's `ApiRequestError` and its text follows ADR 0024. The official terminal re-signs it once with the exchange's floor plus 100; here the cross-tab nonce lock and stored floor already prevent the collisions within one browser that this retry repairs in the official terminal, and an automatic second signature would have to pass every execution guard, deadline and pending-record step again (ADR 0045, 2026-11-19 addendum).
- An Agent registration session record keeps fields this version does not know and writes them back while the record keeps its epoch; a new epoch (a new session, `closing` or `closed`) starts without them. Known fields stay strictly validated, so an unknown field never makes an invalid record a valid session (2026-11-13). Unknown fields are read and written back as JSON values through JavaScript numbers: every number a `JSON.stringify` writer can store comes back as the same text, but a future field whose value does not fit a double (an integer above 2^53, an exponent beyond the double range) must be stored as a string (2026-11-19, `0945c1c0`).
- An Agent record keeps fields this version does not know and writes them back for the same key and source; known fields stay strictly validated. This protects only from this version on: older tabs still delete records with unknown fields, so a new field must wait until older versions are gone, and a field that restricts a key must change a known field or the storage key instead.
