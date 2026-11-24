import { describe, expect, it } from "vitest";
import {
	getInitialTrades,
	getTradeKey,
	getTradePriceDecimals,
	type InitialTrades,
	processTrades,
	type RawTrade,
} from "@/lib/trade/trades";

describe("trades", () => {
	it("builds globally unique trade keys from time, coin, and tid", () => {
		expect(getTradeKey(1_721_977_585_899, "HYPE", 123)).toBe("1721977585899:HYPE:123");
		expect(getTradeKey(1_721_977_585_899, "BTC", "tid")).toBe("1721977585899:BTC:tid");
	});

	it("derives price precision from the market price", () => {
		expect(getTradePriceDecimals("59.046", 2, "perp")).toBe(3);
		expect(getTradePriceDecimals("72.1375", 2, "spot")).toBe(3);
		expect(getTradePriceDecimals("63958", 4, "perp")).toBe(0);
		expect(getTradePriceDecimals(null, 3, "spot")).toBe(5);
	});

	it("caps low-price precision at Hyperliquid market limits", () => {
		expect(getTradePriceDecimals("0.6058", 2, "perp")).toBe(4);
		expect(getTradePriceDecimals("0.0000004", 1, "spot")).toBe(7);
	});

	it("preserves API price and size strings while formatting a 24-hour time", () => {
		const rawTrade = {
			coin: "HYPE",
			side: "B",
			px: "59.046",
			sz: "0.10",
			hash: "0xabc",
			time: 1_721_977_585_899,
			tid: 123,
			users: ["0xbuyer", "0xseller"],
		} as RawTrade;

		const [trade] = processTrades([rawTrade]);
		const [arabicTrade] = processTrades([rawTrade], "ar");
		expect(arabicTrade?.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);

		expect(trade).toMatchObject({
			id: "1721977585899:HYPE:123",
			price: "59.046",
			size: "0.10",
			side: "buy",
		});
		expect(trade?.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});
});

describe("getInitialTrades", () => {
	const rows = (...ids: string[]) => ids.map((id) => ({ id }));

	it("captures the first displayable snapshot and then keeps the stored value identical", () => {
		const empty: InitialTrades = { coin: "HYPE", ids: null };
		expect(getInitialTrades(empty, "HYPE", [])).toBe(empty);
		const captured = getInitialTrades(empty, "HYPE", rows("1", "2"));
		expect([...(captured.ids ?? [])]).toEqual(["1", "2"]);
		expect(getInitialTrades(captured, "HYPE", rows("3", "1", "2"))).toBe(captured);
	});

	it("drops the baseline as soon as the coin changes, before the new coin has a snapshot", () => {
		const hype: InitialTrades = { coin: "HYPE", ids: new Set(["1", "2"]) };
		const pending = getInitialTrades(hype, "BTC", []);
		expect(pending).toEqual({ coin: "BTC", ids: null });
		const back = getInitialTrades(pending, "HYPE", rows("7", "1", "2"));
		expect([...(back.ids ?? [])]).toEqual(["7", "1", "2"]);
		expect(getInitialTrades(hype, "BTC", rows("3")).ids).toEqual(new Set(["3"]));
	});
});
