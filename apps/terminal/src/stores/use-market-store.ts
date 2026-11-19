import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { DEFAULT_FAVORITE_MARKETS, DEFAULT_MARKET_NAME, STORAGE_KEYS } from "@/config/app";
import { DEFAULT_SELECTED_MARKETS } from "@/config/markets";
import type { ExchangeScope } from "@/domain/market";
import { isSafeTradeRouteMarketName } from "@/lib/hyperliquid/market-route";
import { z } from "@/lib/zod";
import { useExchangeScope } from "@/providers/exchange-scope";

const safeMarketNameSchema = z.string().refine(isSafeTradeRouteMarketName);

const marketStoreSchema = z.object({
	state: z.object({
		selectedMarkets: z.record(z.string(), safeMarketNameSchema).optional(),
		favoriteMarkets: z.array(safeMarketNameSchema).optional(),
	}),
});

const MARKET_STORE_VERSION = 3;

interface MarketStore {
	selectedMarkets: Record<ExchangeScope, string>;
	favoriteMarkets: string[];
	actions: {
		setSelectedMarket: (scope: ExchangeScope, marketName: string) => void;
		toggleFavoriteMarket: (marketName: string) => void;
	};
}

interface MarketPrefs {
	selectedMarkets: Record<string, string>;
	favoriteMarkets: string[];
}

function normalizeMarketPrefs(persisted: unknown, fallbackFavorites: readonly string[]): MarketPrefs {
	const p = persisted as (Partial<MarketPrefs> & { selectedMarket?: string }) | undefined;

	let selectedMarkets: Record<string, string> = { ...DEFAULT_SELECTED_MARKETS };
	if (p?.selectedMarkets) {
		selectedMarkets = { ...selectedMarkets, ...p.selectedMarkets };
	} else if (p?.selectedMarket) {
		selectedMarkets = { ...selectedMarkets, all: p.selectedMarket, perp: p.selectedMarket };
	}

	return {
		selectedMarkets,
		favoriteMarkets: Array.isArray(p?.favoriteMarkets) ? p.favoriteMarkets : [...fallbackFavorites],
	};
}

function partializeMarketPrefs(state: MarketStore): MarketPrefs {
	return { selectedMarkets: state.selectedMarkets, favoriteMarkets: state.favoriteMarkets };
}

type MarketEdit =
	| { kind: "select"; scope: ExchangeScope; marketName: string }
	| { kind: "favorite"; marketName: string; included: boolean };

const MARKET_PREFS_LOCK_NAME = `${STORAGE_KEYS.MARKET_PREFS}:lock`;

// Edits this window shows but has not stored yet. Storage only changes inside persistMarketEdit,
// which reads, applies one edit and writes under one cross-window lock where Web Locks exist.
const pendingEdits = new Set<MarketEdit>();

type StoredMarketRecord =
	| { kind: "missing" }
	| { kind: "supported"; raw: string; record: { state: unknown; version?: unknown } }
	| { kind: "future"; state: z.infer<typeof marketStoreSchema>["state"] | null };

function marketStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

// One read decides the version and the content, so a record a newer release writes is never
// validated against this release's schema, cleared or overwritten.
function readStoredRecord(storage: Storage | null = marketStorage()): StoredMarketRecord {
	if (!storage) return { kind: "missing" };
	let raw: string | null;
	try {
		raw = storage.getItem(STORAGE_KEYS.MARKET_PREFS);
	} catch {
		return { kind: "missing" };
	}
	if (!raw) return { kind: "missing" };
	let record: unknown;
	try {
		record = JSON.parse(raw);
	} catch (error) {
		console.warn("[market store] persisted state could not be parsed, clearing", error);
		storage.removeItem(STORAGE_KEYS.MARKET_PREFS);
		return { kind: "missing" };
	}
	const version = (record as { version?: unknown } | null)?.version;
	const parsed = marketStoreSchema.safeParse(record);
	if (typeof version === "number" && version > MARKET_STORE_VERSION) {
		return { kind: "future", state: parsed.success ? parsed.data.state : null };
	}
	if (!parsed.success) {
		console.warn("[market store] persisted state failed schema validation, clearing", parsed.error.issues);
		storage.removeItem(STORAGE_KEYS.MARKET_PREFS);
		return { kind: "missing" };
	}
	return { kind: "supported", raw, record: record as { state: unknown; version?: unknown } };
}

function readStoredPrefs(stored: StoredMarketRecord = readStoredRecord()): MarketPrefs | null {
	if (stored.kind !== "supported") return null;
	const { state, version } = stored.record;
	if (typeof version === "number" && version !== MARKET_STORE_VERSION) return null;
	return normalizeMarketPrefs(state, DEFAULT_FAVORITE_MARKETS);
}

function sameMarkets(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((market, index) => market === b[index]);
}

function applyMarketEdit(prefs: MarketPrefs, edit: MarketEdit): MarketPrefs {
	if (edit.kind === "select") {
		return { ...prefs, selectedMarkets: { ...prefs.selectedMarkets, [edit.scope]: edit.marketName } };
	}
	if (prefs.favoriteMarkets.includes(edit.marketName) === edit.included) return prefs;
	return {
		...prefs,
		favoriteMarkets: edit.included
			? [...prefs.favoriteMarkets, edit.marketName]
			: prefs.favoriteMarkets.filter((market) => market !== edit.marketName),
	};
}

function showStoredFavorites(stored: MarketPrefs) {
	let visible = stored;
	for (const edit of pendingEdits) visible = applyMarketEdit(visible, edit);
	if (!sameMarkets(useMarketStore.getState().favoriteMarkets, visible.favoriteMarkets)) {
		useMarketStore.setState({ favoriteMarkets: visible.favoriteMarkets });
	}
}

// While a newer release owns the record, this window's edits stay in its memory only.
function writeMarketEdit(edit: MarketEdit, fallback: MarketPrefs) {
	let next: MarketPrefs;
	try {
		const storage = marketStorage();
		const stored = readStoredRecord(storage);
		if (!storage || stored.kind === "future") return;
		next = applyMarketEdit(readStoredPrefs(stored) ?? fallback, edit);
		storage.setItem(STORAGE_KEYS.MARKET_PREFS, JSON.stringify({ state: next, version: MARKET_STORE_VERSION }));
	} finally {
		pendingEdits.delete(edit);
	}
	showStoredFavorites(next);
}

function persistMarketEdit(edit: MarketEdit, fallback: MarketPrefs) {
	pendingEdits.add(edit);
	const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
	if (!locks) {
		writeMarketEdit(edit, fallback);
		return;
	}
	locks
		.request(MARKET_PREFS_LOCK_NAME, () => writeMarketEdit(edit, fallback))
		.catch(() => {
			if (pendingEdits.has(edit)) writeMarketEdit(edit, fallback);
		});
}

function editMarketPrefs(edit: MarketEdit) {
	const current = partializeMarketPrefs(useMarketStore.getState());
	useMarketStore.setState(applyMarketEdit(current, edit));
	persistMarketEdit(edit, current);
}

function syncStoredPrefs() {
	const stored = readStoredPrefs();
	if (stored) showStoredFavorites(stored);
}

const hydrateOnlyStorage: StateStorage = {
	getItem: () => {
		const stored = readStoredRecord();
		if (stored.kind === "supported") return stored.raw;
		if (stored.kind === "future" && stored.state) {
			return JSON.stringify({ state: stored.state, version: MARKET_STORE_VERSION });
		}
		return null;
	},
	setItem: () => {},
	removeItem: (name) => {
		const storage = marketStorage();
		if (storage && readStoredRecord(storage).kind !== "future") storage.removeItem(name);
	},
};

const useMarketStore = create<MarketStore>()(
	persist(
		(): MarketStore => ({
			selectedMarkets: { ...DEFAULT_SELECTED_MARKETS },
			favoriteMarkets: [...DEFAULT_FAVORITE_MARKETS],
			actions: {
				setSelectedMarket: (scope, marketName) => {
					if (!isSafeTradeRouteMarketName(marketName)) return;
					if (useMarketStore.getState().selectedMarkets[scope] === marketName) return;
					editMarketPrefs({ kind: "select", scope, marketName });
				},
				toggleFavoriteMarket: (marketName) => {
					if (!isSafeTradeRouteMarketName(marketName)) return;
					const included = !useMarketStore.getState().favoriteMarkets.includes(marketName);
					editMarketPrefs({ kind: "favorite", marketName, included });
				},
			},
		}),
		{
			name: STORAGE_KEYS.MARKET_PREFS,
			version: MARKET_STORE_VERSION,
			storage: createJSONStorage(() => hydrateOnlyStorage),
			partialize: partializeMarketPrefs,
			merge: (persisted, current) => ({
				...current,
				...(normalizeMarketPrefs(persisted, current.favoriteMarkets) as Pick<
					MarketStore,
					"selectedMarkets" | "favoriteMarkets"
				>),
			}),
		},
	),
);

if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key !== STORAGE_KEYS.MARKET_PREFS || event.newValue === null) return;
		if (event.storageArea && event.storageArea !== window.localStorage) return;
		syncStoredPrefs();
	});
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) syncStoredPrefs();
	});
}

export function useSelectedMarket(): string {
	const { marketName, scope } = useExchangeScope();
	const storedMarket = useMarketStore((state) => state.selectedMarkets[scope] ?? DEFAULT_MARKET_NAME);
	return marketName ?? storedMarket;
}

export function useSelectedMarkets() {
	return useMarketStore((state) => state.selectedMarkets);
}

export function getStoredSelectedMarket(scope: ExchangeScope): string | undefined {
	return useMarketStore.getState().selectedMarkets[scope];
}

export function getTradeHomeMarketName(): string {
	const marketName = useMarketStore.getState().selectedMarkets.all;
	return isSafeTradeRouteMarketName(marketName) ? marketName : DEFAULT_SELECTED_MARKETS.all;
}

export function useFavoriteMarkets() {
	return useMarketStore((state) => state.favoriteMarkets);
}

export function useMarketActions() {
	return useMarketStore((state) => state.actions);
}
