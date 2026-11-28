import { describe, expect, it } from "vitest";
import { createSearcher, type SearchConfig } from "@/lib/search";
import { foldSearchText, normalize } from "@/lib/search/utils";

interface Item {
	symbol: string;
	name: string;
}

const ITEMS: Item[] = [
	{ symbol: "INIT", name: "Initia" },
	{ symbol: "BTC", name: "Bitcoin" },
	{ symbol: "IST", name: "İstanbul Fund" },
	{ symbol: "UBTC", name: "比特币" },
	{ symbol: "KAS", name: "カス" },
	{ symbol: "GAS", name: "ガス" },
	{ symbol: "DONG", name: "Quỹ Đồng" },
];

const COMBINING_ACUTE = String.fromCharCode(0x301);

const CONFIG: SearchConfig<Item> = {
	fields: {
		symbol: { extract: (item) => item.symbol, weight: 2, fuzzy: true },
		name: { extract: (item) => item.name, weight: 1 },
	},
	fuzzyMinLength: 3,
	fuzzyMaxDistance: 1,
};

function symbols(query: string) {
	return createSearcher(ITEMS, CONFIG)
		.search(query)
		.map((result) => result.item.symbol);
}

describe("search text folding", () => {
	it("folds the Turkish dotted and dotless i to the ASCII i", () => {
		expect("İNİT".toLowerCase()).not.toBe("init");
		expect(foldSearchText("İNİT")).toBe("init");
		expect(foldSearchText("ınıt")).toBe("init");
		expect(foldSearchText("İstanbul")).toBe("istanbul");
		expect(foldSearchText("ISTANBUL")).toBe("istanbul");
	});

	it("lowercases ASCII exactly as toLowerCase does", () => {
		const ascii = String.fromCharCode(...Array.from({ length: 128 }, (_, code) => code));
		expect(foldSearchText(ascii)).toBe(ascii.toLowerCase());
		expect(foldSearchText("BTC-PERP")).toBe("btc-perp");
		expect(normalize("  Alpha  ")).toBe("alpha");
	});

	it("strips the combining diacritical marks of Latin, Greek and Cyrillic letters and folds đ to d", () => {
		expect(foldSearchText("Ağ Kasası")).toBe("ag kasasi");
		expect(foldSearchText("Quỹ Ёлка")).toBe("quy елка");
		expect(foldSearchText("Đồng ĐÔ")).toBe("dong do");
		expect(foldSearchText("Май")).toBe("маи");
		expect(foldSearchText("Άλφα")).toBe("αλφα");
		expect(foldSearchText("Straße")).toBe("straße");
	});

	it("trims after folding, so a query of marks alone is empty", () => {
		expect(foldSearchText(COMBINING_ACUTE)).toBe("");
		expect(normalize(` ${COMBINING_ACUTE} İNİT `)).toBe("init");
	});

	it("leaves Chinese, Korean, Japanese voicing marks, Devanagari vowel signs and Arabic harakat intact", () => {
		expect(foldSearchText("比特币")).toBe("比特币");
		expect(foldSearchText("한국")).toBe("한국");
		expect(foldSearchText("ガス")).toBe("ガス");
		expect(foldSearchText("ガス")).not.toBe(foldSearchText("カス"));
		expect(foldSearchText("बाजार")).toBe("बाजार");
		const arabic = "السُّوق".normalize("NFC");
		expect(foldSearchText(arabic)).toBe(arabic);
	});

	it("compares decomposed text in its composed form", () => {
		const decomposed = "\u304b\u3099";
		expect(foldSearchText(decomposed)).toBe(foldSearchText("が"));
		expect(foldSearchText(decomposed).includes(foldSearchText("か"))).toBe(false);
	});

	it("matches a Turkish query against an ASCII symbol and an ASCII query against a Turkish name", () => {
		expect(symbols("İNİT")[0]).toBe("INIT");
		expect(symbols("ınıt")[0]).toBe("INIT");
		expect(symbols("init")[0]).toBe("INIT");
		expect(symbols("istanbul")).toEqual(["IST"]);
		expect(symbols("İSTANBUL")).toEqual(["IST"]);
		expect(symbols("dong")).toEqual(["DONG"]);
	});

	it("keeps ASCII, Chinese and kana matches as before", () => {
		expect(symbols("btc")[0]).toBe("BTC");
		expect(symbols("BTC")[0]).toBe("BTC");
		expect(symbols("比特")).toEqual(["UBTC"]);
		expect(symbols("ガ")).toEqual(["GAS"]);
		expect(symbols("カ")).toEqual(["KAS"]);
		expect(symbols("missing")).toEqual([]);
		expect(symbols("   ")).toEqual([]);
		expect(symbols(COMBINING_ACUTE)).toEqual([]);
	});
});
