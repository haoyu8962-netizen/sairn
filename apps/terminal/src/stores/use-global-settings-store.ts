import Big from "big.js";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { STORAGE_KEYS } from "@/config/app";
import {
	defaultNumberFormatLocale,
	type NumberFormatLocale,
	normalizeNumberFormatLocale,
	resolveNumberFormatLocale,
} from "@/config/i18n";
import { getNetwork, type Network, subscribeNetworkStorage, switchNetwork } from "@/lib/network";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import {
	clampMarketOrderSlippage,
	DEFAULT_TRADING_PROTECTIONS,
	legacyTradingProtections,
	readStartupTradingProtections,
	readTradingProtections,
	stricterTradingProtections,
	TRADING_PROTECTION_STORAGE_KEYS,
	type TradingProtections,
	tradingProtectionsEqual,
	writeTradingProtection,
} from "@/lib/storage/trading-protection-storage";
import { applyThemeColor } from "@/lib/theme-color";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { z } from "@/lib/zod";

type Theme = "dark" | "light";

const THEME_TRANSITION_GUARD_ATTRIBUTE = "data-theme-transition";
let themeTransitionReleaseFrame: number | undefined;

const globalSettingsSchema = z.object({
	state: z.object({
		hideSmallBalances: z.boolean().optional(),
		animateOrderbook: z.boolean().optional(),
		showChartScanlines: z.boolean().optional(),
		skipOrderConfirmation: z.boolean().optional(),
		transactionDelayProtection: z.boolean().optional(),
		numberFormatLocale: z.string().optional(),
		marketOrderSlippagePercent: z.number().optional(),
		marginMode: z.enum(["cross", "isolated"]).optional(),
		positionsActiveTab: z.string().optional(),
		mobileActiveTab: z.string().optional(),
		theme: z.enum(["dark", "light"]).optional(),
		network: z.enum(["mainnet", "testnet"]).optional(),
	}),
});

const DEFAULT_GLOBAL_SETTINGS = {
	hideSmallBalances: true,
	animateOrderbook: true,
	showChartScanlines: false,
	...DEFAULT_TRADING_PROTECTIONS,
	numberFormatLocale: defaultNumberFormatLocale,
	marginMode: "cross" as MarginMode,
	positionsActiveTab: "positions",
	mobileActiveTab: "trade",
	theme: "dark" as Theme,
	network: getNetwork(),
} as const;

interface GlobalSettingsStore extends TradingProtections {
	hideSmallBalances: boolean;
	animateOrderbook: boolean;
	showChartScanlines: boolean;
	numberFormatLocale: NumberFormatLocale;
	marginMode: MarginMode;
	positionsActiveTab: string;
	mobileActiveTab: string;
	theme: Theme;
	network: Network;
	actions: {
		setHideSmallBalances: (next: boolean) => void;
		setAnimateOrderbook: (next: boolean) => void;
		setShowChartScanlines: (next: boolean) => void;
		setSkipOrderConfirmation: (next: boolean) => void;
		setTransactionDelayProtection: (next: boolean) => void;
		setNumberFormatLocale: (next: NumberFormatLocale) => void;
		setMarketOrderSlippagePercent: (percent: number) => number;
		setMarginMode: (mode: MarginMode) => void;
		setPositionsActiveTab: (tab: string) => void;
		setMobileActiveTab: (tab: string) => void;
		setTheme: (theme: Theme) => void;
		setNetwork: (network: Network) => void;
	};
}

// The settings record keeps version 4 so that a rolled-back release reads it without a migration.
// The three trading protections live in their own keys (ADR 0057); the record carries them only
// for releases that predate those keys.
const GLOBAL_SETTINGS_VERSION = 4;

type StoredSettingsState = z.infer<typeof globalSettingsSchema>["state"];
type PersistedGlobalSettings = Partial<Omit<GlobalSettingsStore, "actions" | "network" | keyof TradingProtections>>;

type StoredSettings =
	| { kind: "missing" }
	| { kind: "supported"; state: StoredSettingsState; version: unknown }
	| { kind: "future"; state: StoredSettingsState | null };

// Settings every window shares live. The two active-tab fields stay per window: another window's
// tab choice is kept in storage but never moves the tab this window is showing.
const SHARED_SETTING_KEYS = [
	"hideSmallBalances",
	"animateOrderbook",
	"showChartScanlines",
	"skipOrderConfirmation",
	"transactionDelayProtection",
	"numberFormatLocale",
	"marketOrderSlippagePercent",
	"marginMode",
	"theme",
] as const satisfies readonly (keyof GlobalSettingsStore)[];

function partializeGlobalSettings(state: GlobalSettingsStore): PersistedGlobalSettings {
	return {
		hideSmallBalances: state.hideSmallBalances,
		animateOrderbook: state.animateOrderbook,
		showChartScanlines: state.showChartScanlines,
		...(state.numberFormatLocale === defaultNumberFormatLocale ? {} : { numberFormatLocale: state.numberFormatLocale }),
		marginMode: state.marginMode,
		positionsActiveTab: state.positionsActiveTab,
		mobileActiveTab: state.mobileActiveTab,
		theme: state.theme,
	};
}

function migrateGlobalSettings(persisted: unknown): PersistedGlobalSettings {
	const state = persisted as StoredSettingsState;
	return { ...state, numberFormatLocale: normalizeNumberFormatLocale(state.numberFormatLocale) };
}

function mergeGlobalSettings(
	persisted: unknown,
	current: GlobalSettingsStore,
	protections: TradingProtections,
): GlobalSettingsStore {
	const p = (persisted ?? {}) as StoredSettingsState;
	return {
		...current,
		...DEFAULT_GLOBAL_SETTINGS,
		...p,
		numberFormatLocale: normalizeNumberFormatLocale(p.numberFormatLocale),
		animateOrderbook:
			typeof p.animateOrderbook === "boolean" ? p.animateOrderbook : DEFAULT_GLOBAL_SETTINGS.animateOrderbook,
		skipOrderConfirmation: protections.skipOrderConfirmation,
		transactionDelayProtection: protections.transactionDelayProtection,
		marketOrderSlippagePercent: protections.marketOrderSlippagePercent,
		marginMode: p.marginMode === "isolated" ? "isolated" : "cross",
		theme: p.theme === "light" ? "light" : "dark",
		network: getNetwork(),
	};
}

// What this window last agreed with storage, as persisted fields of its own memory. A write sends
// only the fields that differ from it, on top of whatever another window stored meanwhile.
let lastSyncedSettings: PersistedGlobalSettings | null = null;
let applyingStoredSettings = false;
let startupProtections: TradingProtections = DEFAULT_TRADING_PROTECTIONS;

function browserStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

// Clearing is best effort: storage that refuses removal keeps the damaged record, and every read
// still treats it as missing, so the protections resolve from their own keys (ADR 0057).
function discardStoredSettings(storage: Storage, reason: string, detail: unknown): StoredSettings {
	console.warn(`[global settings] persisted state ${reason}, clearing`, detail);
	try {
		storage.removeItem(STORAGE_KEYS.GLOBAL_SETTINGS);
	} catch {}
	return { kind: "missing" };
}

// One read decides the version and the content, so a record a newer release writes in between is
// never validated against this release's schema, cleared or overwritten.
function readStoredSettings(storage: Storage | null = browserStorage()): StoredSettings {
	if (!storage) return { kind: "missing" };
	let raw: string | null;
	try {
		raw = storage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS);
	} catch {
		return { kind: "missing" };
	}
	if (raw === null) return { kind: "missing" };
	let record: unknown;
	try {
		record = JSON.parse(raw);
	} catch (error) {
		return discardStoredSettings(storage, "could not be parsed", error);
	}
	const version = (record as { version?: unknown } | null)?.version;
	const parsed = globalSettingsSchema.safeParse(record);
	if (typeof version === "number" && version > GLOBAL_SETTINGS_VERSION) {
		return { kind: "future", state: parsed.success ? parsed.data.state : null };
	}
	if (parsed.success) return { kind: "supported", state: parsed.data.state, version };
	return discardStoredSettings(storage, "failed schema validation", parsed.error.issues);
}

// The three protections an older release reads from the record: never looser than what that
// release last stored there, nor than the value this release resolves from its own keys.
function rollbackProtections(storage: Storage, previous: StoredSettingsState | undefined): TradingProtections {
	return stricterTradingProtections(legacyTradingProtections(previous ?? {}), readTradingProtections(storage));
}

function writeSettingsRecord(storage: Storage, state: object, previous: StoredSettingsState | undefined) {
	storage.setItem(
		STORAGE_KEYS.GLOBAL_SETTINGS,
		JSON.stringify({
			state: { ...state, ...rollbackProtections(storage, previous) },
			version: GLOBAL_SETTINGS_VERSION,
		}),
	);
}

// Best effort: a refused write leaves the record as it is and never changes what this window read.
function tightenRollbackRecord(storage: Storage, state: StoredSettingsState) {
	const previous = legacyTradingProtections(state);
	if (tradingProtectionsEqual(stricterTradingProtections(previous, startupProtections), previous)) return;
	try {
		writeSettingsRecord(storage, state, state);
	} catch {
		// The next write that storage accepts carries the stricter values.
	}
}

function hydrateStoredSettings(): string | null {
	const storage = browserStorage();
	const stored = readStoredSettings(storage);
	startupProtections = DEFAULT_TRADING_PROTECTIONS;
	if (storage) {
		const legacy =
			stored.kind === "future" ? null : legacyTradingProtections(stored.kind === "supported" ? stored.state : {});
		startupProtections = readStartupTradingProtections(storage, legacy);
		if (stored.kind === "supported") tightenRollbackRecord(storage, stored.state);
	}
	if (stored.kind === "missing" || stored.state === null) return null;
	const version = stored.kind === "supported" ? stored.version : GLOBAL_SETTINGS_VERSION;
	return JSON.stringify({ state: stored.state, version });
}

// Protections reach an open window from storage only when they are stricter than its own; a
// window loosens a protection only through its own explicit action.
function withStricterStoredProtections(next: GlobalSettingsStore): GlobalSettingsStore {
	const storage = browserStorage();
	if (!storage) return next;
	try {
		return { ...next, ...stricterTradingProtections(next, readTradingProtections(storage)) };
	} catch {
		return next;
	}
}

function applySharedSettings(next: GlobalSettingsStore) {
	const current = useGlobalSettingsStore.getState();
	const update: Partial<Record<(typeof SHARED_SETTING_KEYS)[number], unknown>> = {};
	for (const key of SHARED_SETTING_KEYS) {
		if (!Object.is(current[key], next[key])) update[key] = next[key];
	}
	if (Object.keys(update).length > 0) {
		applyingStoredSettings = true;
		try {
			useGlobalSettingsStore.setState(update as Partial<GlobalSettingsStore>);
		} finally {
			applyingStoredSettings = false;
		}
	}
	lastSyncedSettings = partializeGlobalSettings(useGlobalSettingsStore.getState());
}

function combineWithStoredSettings(
	outgoing: PersistedGlobalSettings,
	stored: StoredSettingsState,
): GlobalSettingsStore | null {
	const previous = lastSyncedSettings as Record<string, unknown> | null;
	if (!previous) return null;
	const changes = outgoing as Record<string, unknown>;
	const combined: Record<string, unknown> = { ...stored };
	for (const key of new Set([...Object.keys(previous), ...Object.keys(changes)])) {
		if (Object.is(previous[key], changes[key])) continue;
		if (key in changes) combined[key] = changes[key];
		else delete combined[key];
	}
	const current = useGlobalSettingsStore.getState();
	return mergeGlobalSettings(combined, current, current);
}

function writeOutgoingSettings(value: string) {
	const storage = browserStorage();
	const stored = readStoredSettings(storage);
	if (!storage || stored.kind === "future") return;
	const outgoing = JSON.parse(value) as { state: PersistedGlobalSettings };
	const previous = stored.kind === "supported" ? stored.state : undefined;
	const combined = previous ? combineWithStoredSettings(outgoing.state, previous) : null;
	if (!combined) {
		writeSettingsRecord(storage, outgoing.state, previous);
		lastSyncedSettings = outgoing.state;
		return;
	}
	writeSettingsRecord(storage, partializeGlobalSettings(combined), previous);
	applySharedSettings(withStricterStoredProtections(combined));
}

const crossWindowSettingsStorage: StateStorage = {
	getItem: hydrateStoredSettings,
	setItem: (_name, value) => {
		if (applyingStoredSettings) return;
		try {
			writeOutgoingSettings(value);
		} catch {
			// A refused write keeps this window's settings in memory only (ADR 0057).
		}
	},
	removeItem: (name) => {
		const storage = browserStorage();
		if (storage && readStoredSettings(storage).kind !== "future") storage.removeItem(name);
	},
};

function syncStoredSettings() {
	const stored = readStoredSettings();
	const current = useGlobalSettingsStore.getState();
	const next = stored.kind === "supported" ? mergeGlobalSettings(stored.state, current, current) : current;
	applySharedSettings(withStricterStoredProtections(next));
}

function setTradingProtection<K extends keyof TradingProtections>(
	set: (update: Partial<GlobalSettingsStore>) => void,
	field: K,
	value: TradingProtections[K],
) {
	const storage = browserStorage();
	if (storage) {
		try {
			writeTradingProtection(storage, field, value);
		} catch {
			// A refused write keeps the choice in this window only; the next read of storage can
			// tighten it again but never loosen it.
		}
	}
	set({ [field]: value });
}

const useGlobalSettingsStore = create<GlobalSettingsStore>()(
	persist(
		(set, get) => ({
			...DEFAULT_GLOBAL_SETTINGS,
			actions: {
				setHideSmallBalances: (next) => set({ hideSmallBalances: next }),
				setAnimateOrderbook: (next) => set({ animateOrderbook: next }),
				setShowChartScanlines: (next) => set({ showChartScanlines: next }),
				setSkipOrderConfirmation: (next) => setTradingProtection(set, "skipOrderConfirmation", next),
				setTransactionDelayProtection: (next) => setTradingProtection(set, "transactionDelayProtection", next),
				setNumberFormatLocale: (next) => set({ numberFormatLocale: next }),
				setMarketOrderSlippagePercent: (percent) => {
					const current = get().marketOrderSlippagePercent;
					if (!Number.isFinite(percent)) return current;
					const next = clampMarketOrderSlippage(percent);
					if (current === next) return next;
					setTradingProtection(set, "marketOrderSlippagePercent", next);
					return next;
				},
				setMarginMode: (mode) => set({ marginMode: mode }),
				setPositionsActiveTab: (tab) => set({ positionsActiveTab: tab }),
				setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),
				setTheme: (theme) => set({ theme }),
				setNetwork: (network) => {
					const result = switchNetwork(network);
					if (result !== "persisted") return;
					set({ network });
					if (typeof window !== "undefined") window.location.reload();
				},
			},
		}),
		{
			name: STORAGE_KEYS.GLOBAL_SETTINGS,
			version: GLOBAL_SETTINGS_VERSION,
			storage: createJSONStorage(() => crossWindowSettingsStorage),
			partialize: partializeGlobalSettings,
			migrate: migrateGlobalSettings,
			merge: (persisted, current) => mergeGlobalSettings(persisted, current, startupProtections),
			onRehydrateStorage: () => (state) => {
				if (state) lastSyncedSettings = partializeGlobalSettings(state);
			},
		},
	),
);

if (typeof window !== "undefined") {
	// A removal or clear() counts too: open windows take whichever value is stricter, so what storage
	// answers after another window deleted keys can only tighten them.
	window.addEventListener("storage", (event) => {
		if (event.storageArea && event.storageArea !== window.localStorage) return;
		if (
			event.key !== null &&
			event.key !== STORAGE_KEYS.GLOBAL_SETTINGS &&
			!TRADING_PROTECTION_STORAGE_KEYS.has(event.key)
		)
			return;
		syncStoredSettings();
	});
	// A page restored from the back/forward cache missed every storage event while it was frozen.
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) syncStoredSettings();
	});
}

function suppressThemeTransitions(root: HTMLElement) {
	root.setAttribute(THEME_TRANSITION_GUARD_ATTRIBUTE, "");
	const view = root.ownerDocument.defaultView;
	if (!view || typeof view.requestAnimationFrame !== "function") {
		root.removeAttribute(THEME_TRANSITION_GUARD_ATTRIBUTE);
		return;
	}

	if (themeTransitionReleaseFrame !== undefined) {
		view.cancelAnimationFrame(themeTransitionReleaseFrame);
	}
	themeTransitionReleaseFrame = view.requestAnimationFrame(() => {
		themeTransitionReleaseFrame = view.requestAnimationFrame(() => {
			root.removeAttribute(THEME_TRANSITION_GUARD_ATTRIBUTE);
			themeTransitionReleaseFrame = undefined;
		});
	});
}

// Keeps <html class> and the theme-color meta in sync with the persisted theme, re-asserting past
// any document-shell re-render (React re-acquiring the <html> singleton writes back the SSR
// default) via a MutationObserver. The idempotent `contains` guard makes it settle in one pass; the
// meta is synced before that guard because a re-rendered head can bring back a stale value.
function applyThemeClass(theme: Theme, suppressTransitions = false) {
	if (typeof document === "undefined") return;
	applyThemeColor(theme);
	const root = document.documentElement;
	const other = theme === "dark" ? "light" : "dark";
	if (root.classList.contains(theme) && !root.classList.contains(other)) return;
	if (suppressTransitions) suppressThemeTransitions(root);
	root.classList.remove("light", "dark");
	root.classList.add(theme);
}

function syncDocumentTheme() {
	applyThemeClass(useGlobalSettingsStore.getState().theme);
}

const globalScope = globalThis as { __sairnThemeDocSync?: boolean };
if (typeof document !== "undefined" && !globalScope.__sairnThemeDocSync) {
	globalScope.__sairnThemeDocSync = true;
	syncDocumentTheme();
	new MutationObserver(() => applyThemeClass(useGlobalSettingsStore.getState().theme, true)).observe(
		document.documentElement,
		{
			attributes: true,
			attributeFilter: ["class"],
		},
	);
}

useGlobalSettingsStore.subscribe((state, prev) => {
	if (state.theme !== prev.theme) applyThemeClass(state.theme, true);
	if (state.numberFormatLocale !== prev.numberFormatLocale) notifyNumberFormatChange();
});

subscribeNetworkStorage((network) => {
	if (useGlobalSettingsStore.getState().network === network) return;
	useGlobalSettingsStore.setState({ network });
	window.location.reload();
});

export function useTheme() {
	return useGlobalSettingsStore((state) => state.theme);
}

export function useNumberFormatLocale() {
	return useGlobalSettingsStore((state) => state.numberFormatLocale);
}

export function useSetTheme() {
	return useGlobalSettingsStore((state) => state.actions.setTheme);
}

export function useGlobalSettings() {
	return useGlobalSettingsStore(
		useShallow((state) => ({
			hideSmallBalances: state.hideSmallBalances,
			showChartScanlines: state.showChartScanlines,
			numberFormatLocale: state.numberFormatLocale,
		})),
	);
}

export function useGlobalSettingsActions() {
	return useGlobalSettingsStore((state) => state.actions);
}

export function useAnimateOrderbook() {
	return useGlobalSettingsStore((state) => state.animateOrderbook);
}

export function useMarketOrderSlippagePercent() {
	return useGlobalSettingsStore((state) => state.marketOrderSlippagePercent);
}

export function marketOrderSlippagePercentToBpsString(percent: number): string {
	return Big(String(percent)).times(100).toString();
}

export function useMarketOrderSlippageBpsString(): string {
	return useGlobalSettingsStore((state) => marketOrderSlippagePercentToBpsString(state.marketOrderSlippagePercent));
}

export function useMarketOrderSlippageBps() {
	return Number(useMarketOrderSlippageBpsString());
}

export function useSkipOrderConfirmation() {
	return useGlobalSettingsStore((state) => state.skipOrderConfirmation);
}

export function getSkipOrderConfirmation(): boolean {
	return useGlobalSettingsStore.getState().skipOrderConfirmation;
}

export function useTransactionDelayProtection() {
	return useGlobalSettingsStore((state) => state.transactionDelayProtection);
}

export function getTransactionDelayProtection(): boolean {
	return useGlobalSettingsStore.getState().transactionDelayProtection;
}

export function useMarginMode() {
	return useGlobalSettingsStore((state) => state.marginMode);
}

export function getResolvedFormatLocale(): string {
	return resolveNumberFormatLocale(useGlobalSettingsStore.getState().numberFormatLocale);
}

export function getNumberFormatLocale(): NumberFormatLocale {
	return useGlobalSettingsStore.getState().numberFormatLocale;
}

export function useHideSmallBalances() {
	return useGlobalSettingsStore((state) => state.hideSmallBalances);
}

export function usePositionsActiveTab() {
	return useGlobalSettingsStore((state) => state.positionsActiveTab);
}

export function getPositionsActiveTab(): string {
	return useGlobalSettingsStore.getState().positionsActiveTab;
}

export function useMobileActiveTab() {
	return useGlobalSettingsStore((state) => state.mobileActiveTab);
}

export function useNetwork() {
	return useGlobalSettingsStore((state) => state.network);
}

export function useIsTestnet() {
	return useGlobalSettingsStore((state) => state.network === "testnet");
}
