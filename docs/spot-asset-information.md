# Spot Asset Information

The terminal uses different sources for different market types:

- HIP-3 descriptions come from Hyperliquid's public `perpAnnotation` endpoint.
- Native perpetual descriptions remain project-owned local copy.
- Spot descriptions and social links are generated from a reviewed snapshot of Hyperliquid's official frontend data. Hyperliquid does not expose those spot descriptions through a documented public API.

The browser never scrapes or requests Hyperliquid frontend bundles at runtime. Refreshing the checked-in spot data also cross-checks every snapshot pair against Hyperliquid's mainnet `spotMeta` response. The generator fetches that response by default; pass a saved response as the optional second argument for a reproducible offline run:

```bash
pnpm asset-info:generate /absolute/path/to/hyperliquid_asset_info_snapshot.json
pnpm asset-info:generate /absolute/path/to/hyperliquid_asset_info_snapshot.json /absolute/path/to/spot-meta.json
```

The generator accepts only `hyperliquid-asset-info-snapshot/v1`, imports trust-tier 1 frontend descriptions, imports trust-tier 3 curated social links, and adds issuer-level X and website links to trust-tier 2 Unit-enabled spot assets. It rejects empty text, trailing-backslash artifacts, Unicode replacement characters, non-HTTPS URLs, and unauditable URL shorteners. Social destinations are classified by hostname, so only `t.me` or `telegram.me` links receive a Telegram label.

Generated records contain the base and quote token IDs from `spotMeta`. Runtime lookup requires the pair name, token names, and both token IDs to match. A reused `@index`, testnet collision, or UI remapping therefore fails closed instead of displaying stale mainnet metadata.

Description data is loaded only when the asset information dialog opens, and only for a locale that has descriptions: the dialog loads nothing for the others. Snapshot copy is used only when it contains the active application locale, and Traditional Chinese uses the project's reviewed translation described below; neither ever replaces Hindi or Arabic text with English, nor falls back to an unrelated language. Unit provider copy is rendered separately from the underlying asset description. Social links are limited to spot markets and are shown in both desktop and expanded mobile market headers.

The frontend snapshot is a provenance record, not a documented Hyperliquid API contract or a license grant. Keep its source URL, retrieval timestamp, and generated hash with each refresh. Do not publish refreshed verbatim copy without confirming that the project is permitted to redistribute it; use project-owned summaries when that permission is unavailable. The Traditional Chinese translation is derived from the same snapshot, records the snapshot's timestamp and hash (`SPOT_ASSET_ZH_TW_SOURCE_GENERATED_AT`, `SPOT_ASSET_ZH_TW_SOURCE_SHA256`) and stays within the same boundary.

## Traditional Chinese

The snapshot has no Traditional Chinese, so the Traditional Chinese interface (`zh-TW`, and the `zh-HK`, `zh-MO` and `zh-Hant` tags that route to it) reads `apps/terminal/src/domain/market/spot-asset-descriptions-zh-tw.ts`: project-owned Taiwanese copy translated from the snapshot's Simplified Chinese and checked against its English, not a character conversion. The interface loads only that file, never the snapshot module, and runs the same pair, token name and token ID check against the identity each entry carries. A pair the file does not contain is shown as in a locale without snapshot copy: the description slot shows the local description when there is one and otherwise the generic market sentence, and the provider slot shows the local Unit notice when there is one and otherwise stays empty. Simplified Chinese is never shown.

- **Local copy wins.** A pair is not translated when the slot its snapshot text would fill already has reviewed Lingui copy: an `asset` description where `getMarketAssetReference` gives a `localDescriptionId`, or a `provider` description where it gives a `localProviderId`. Today that is the four HYPE pairs (`@107`, `@207`, `@232`, `@255`), SPCXD (`@465`), UBTC (`@142`) and USOL (`@156`). Other interface languages keep preferring the snapshot.
- **Translation rules.** The Simplified text is the source. Where it mistranslates the English (Hyperliquid rendered as 超流动性, `in addition to Hyperliquid` reversed) the translation follows the English; where the two are different texts it follows the Simplified. Tickers, numbers and their units, domains, addresses, handles, tags, `{link}` and Latin-script names are kept as written. The glossary, the per-entry decisions and the reviews are in the [task record](work-memory/sessions/2026-11-28-zh-tw-spot-asset-descriptions.md).
- **Checks.** `apps/terminal/src/lib/tests/spot-asset-zh-tw-contract.test.ts` requires every snapshot pair with Simplified text to be translated or covered by local copy, matches each entry's identity and source constants to the snapshot, and fingerprints each translated source (`apps/terminal/src/lib/tests/fixtures/spot-asset-zh-tw-sources.ts`). It rejects simplified-only characters (with a list checked against the sources and against the Traditional Chinese catalog), mainland or machine-translation wording, lost or added preserved values and Latin words, missing glossary terms, and identical sources translated differently. It cannot judge meaning; that is the review's job.
- **Refreshing the snapshot.** Before `pnpm asset-info:generate`, look in the raw snapshot JSON for `zh-TW` or `zh-Hant` descriptions: the generator keeps only `en`, `es`, `fr` and `zh-CN` and would drop them silently. If Hyperliquid now publishes Traditional Chinese, stop and let the operator decide whether to use it instead. Otherwise regenerate, run the contract test, translate and review every pair it names (new pairs and changed sources), update their fingerprints and the two source constants, and keep the exclusions in step with the local copy.
