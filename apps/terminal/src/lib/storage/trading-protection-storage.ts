import { STORAGE_KEYS } from "@/config/app";
import {
	DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT,
	MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
	MARKET_ORDER_SLIPPAGE_MIN_PERCENT,
} from "@/config/trade";
import { z } from "@/lib/zod";

// Order confirmation, market-order slippage and transaction delay protection (ADR 0057). Each
// protection has its own key, written only by an explicit change of that protection, so no other
// write (an older release's whole-record write, another window's unrelated setting) can carry a
// stale value into it. The baseline key is written once, from the settings record a previous
// release left, and only answers for a protection that has never been changed explicitly since.

const protectionSchemas = {
	skipOrderConfirmation: z.boolean(),
	transactionDelayProtection: z.boolean(),
	marketOrderSlippagePercent: z.number(),
};

const baselineSchema = z.object(protectionSchemas);

export type TradingProtections = z.infer<typeof baselineSchema>;

export const DEFAULT_TRADING_PROTECTIONS: TradingProtections = {
	skipOrderConfirmation: false,
	transactionDelayProtection: true,
	marketOrderSlippagePercent: DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT,
};

const STRICTEST_TRADING_PROTECTIONS: TradingProtections = {
	skipOrderConfirmation: false,
	transactionDelayProtection: true,
	marketOrderSlippagePercent: MARKET_ORDER_SLIPPAGE_MIN_PERCENT,
};

const PROTECTION_KEYS = {
	skipOrderConfirmation: STORAGE_KEYS.SKIP_ORDER_CONFIRMATION,
	transactionDelayProtection: STORAGE_KEYS.TRANSACTION_DELAY_PROTECTION,
	marketOrderSlippagePercent: STORAGE_KEYS.MARKET_ORDER_SLIPPAGE,
} as const satisfies Record<keyof TradingProtections, string>;

const PROTECTION_FIELDS = Object.keys(PROTECTION_KEYS) as (keyof TradingProtections)[];

export const TRADING_PROTECTION_STORAGE_KEYS: ReadonlySet<string> = new Set([
	STORAGE_KEYS.TRADING_PROTECTION_BASELINE,
	...Object.values(PROTECTION_KEYS),
]);

export function clampMarketOrderSlippage(percent: number): number {
	return Math.min(Math.max(percent, MARKET_ORDER_SLIPPAGE_MIN_PERCENT), MARKET_ORDER_SLIPPAGE_MAX_PERCENT);
}

export function stricterTradingProtections(a: TradingProtections, b: TradingProtections): TradingProtections {
	return {
		skipOrderConfirmation: a.skipOrderConfirmation && b.skipOrderConfirmation,
		transactionDelayProtection: a.transactionDelayProtection || b.transactionDelayProtection,
		marketOrderSlippagePercent: Math.min(a.marketOrderSlippagePercent, b.marketOrderSlippagePercent),
	};
}

export function tradingProtectionsEqual(a: TradingProtections, b: TradingProtections): boolean {
	return PROTECTION_FIELDS.every((field) => Object.is(a[field], b[field]));
}

// How a release before ADR 0057 reads the three fields of its settings record: a missing or
// mistyped field falls back to the default.
export function legacyTradingProtections(
	state: Partial<Record<keyof TradingProtections, unknown>>,
): TradingProtections {
	const { skipOrderConfirmation, transactionDelayProtection, marketOrderSlippagePercent } = state;
	return {
		skipOrderConfirmation:
			typeof skipOrderConfirmation === "boolean"
				? skipOrderConfirmation
				: DEFAULT_TRADING_PROTECTIONS.skipOrderConfirmation,
		transactionDelayProtection:
			typeof transactionDelayProtection === "boolean"
				? transactionDelayProtection
				: DEFAULT_TRADING_PROTECTIONS.transactionDelayProtection,
		marketOrderSlippagePercent: clampMarketOrderSlippage(
			typeof marketOrderSlippagePercent === "number" && Number.isFinite(marketOrderSlippagePercent)
				? marketOrderSlippagePercent
				: DEFAULT_TRADING_PROTECTIONS.marketOrderSlippagePercent,
		),
	};
}

function parseJSON(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

function readBaseline(storage: Storage): TradingProtections | null {
	const raw = storage.getItem(STORAGE_KEYS.TRADING_PROTECTION_BASELINE);
	if (raw === null) return null;
	const parsed = baselineSchema.safeParse(parseJSON(raw));
	return parsed.success ? parsed.data : STRICTEST_TRADING_PROTECTIONS;
}

export function hasTradingProtectionBaseline(storage: Storage): boolean {
	return storage.getItem(STORAGE_KEYS.TRADING_PROTECTION_BASELINE) !== null;
}

// Each protection: its own key when present (the strictest value when that key is unreadable),
// otherwise the migration baseline (or the fallback a refused baseline write leaves in memory),
// otherwise the default.
export function readTradingProtections(
	storage: Storage,
	fallbackBaseline: TradingProtections | null = null,
): TradingProtections {
	const baseline = readBaseline(storage) ?? fallbackBaseline ?? DEFAULT_TRADING_PROTECTIONS;
	const read = <K extends keyof TradingProtections>(field: K): TradingProtections[K] => {
		const raw = storage.getItem(PROTECTION_KEYS[field]);
		if (raw === null) return baseline[field];
		const parsed = protectionSchemas[field].safeParse(parseJSON(raw));
		return parsed.success ? (parsed.data as TradingProtections[K]) : STRICTEST_TRADING_PROTECTIONS[field];
	};
	return {
		skipOrderConfirmation: read("skipOrderConfirmation"),
		transactionDelayProtection: read("transactionDelayProtection"),
		marketOrderSlippagePercent: clampMarketOrderSlippage(read("marketOrderSlippagePercent")),
	};
}

// Writes the baseline only when none exists. A baseline never overrides a protection's own key, so
// two windows initialising at once cannot undo an explicit change either of them made.
export function ensureTradingProtectionBaseline(storage: Storage, legacy: TradingProtections) {
	if (hasTradingProtectionBaseline(storage)) return;
	storage.setItem(STORAGE_KEYS.TRADING_PROTECTION_BASELINE, JSON.stringify(legacy));
}

// Cold start. Writing is best effort and never decides what is read: a refused baseline write
// answers from the legacy values it would have stored, and a storage that throws on reading yields
// the strictest values, never the defaults.
export function readStartupTradingProtections(storage: Storage, legacy: TradingProtections | null): TradingProtections {
	let fallbackBaseline: TradingProtections | null = null;
	if (legacy) {
		try {
			ensureTradingProtectionBaseline(storage, legacy);
		} catch {
			fallbackBaseline = legacy;
		}
	}
	try {
		return readTradingProtections(storage, fallbackBaseline);
	} catch {
		return STRICTEST_TRADING_PROTECTIONS;
	}
}

export function writeTradingProtection<K extends keyof TradingProtections>(
	storage: Storage,
	field: K,
	value: TradingProtections[K],
) {
	storage.setItem(PROTECTION_KEYS[field], JSON.stringify(value));
}
