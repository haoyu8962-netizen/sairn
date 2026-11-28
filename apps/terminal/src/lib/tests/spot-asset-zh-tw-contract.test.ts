import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { UnifiedMarket } from "@sairn/hl-react";
import { describe, expect, it } from "vitest";
import { getMarketAssetReference } from "@/domain/market/asset-info";
import {
	SPOT_ASSET_DESCRIPTIONS,
	SPOT_ASSET_INFO_GENERATED_AT,
	SPOT_ASSET_INFO_SOURCE_SHA256,
} from "@/domain/market/spot-asset-descriptions.generated";
import {
	SPOT_ASSET_ZH_TW_SOURCE_GENERATED_AT,
	SPOT_ASSET_ZH_TW_SOURCE_SHA256,
	SPOT_ASSET_DESCRIPTIONS as ZH_TW_DESCRIPTIONS,
} from "@/domain/market/spot-asset-descriptions-zh-tw";
import type { SpotAssetDescriptionEntry } from "@/domain/market/spot-asset-info";
import { SPOT_ASSET_ZH_TW_SOURCE_FINGERPRINTS } from "./fixtures/spot-asset-zh-tw-sources";
import { readPoEntries } from "./harness/po-catalog";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, "../../../../..");

// Pairs whose dialog slot is already filled by reviewed Lingui copy (docs/spot-asset-information.md).
const EXPECTED_LOCAL_COPY_PAIRS = ["@107", "@142", "@156", "@207", "@232", "@255", "@465"];

// Simplified-only characters found in the translated Simplified sources: every character that OpenCC's
// cn→tw conversion changes, minus those Taiwan text also uses (于 冲 准 几 占 台 后 征 扑 杠 采 游 里 党 着 么 并 划 术).
const SOURCE_SIMPLIFIED_ONLY =
	"万与专丝丢个为义乐习书买争亚产亲仅从们价众优会传伦体侣储内军农决况凭击创务动励势区协厌发变听启噜团围国场块声处备复够奖学宝实审宾对导将尝尽层币师带帮库应开弃弥强忧态戏战户执扩护报拥据数断无时机杂权条来极构标栈桥梦欢气汇沟没测济润溃满点热爱独猫献环现码础确碍种积税稳约级线练组终绍经结绕给络绝统绪续综编缝缩网脑节荣药获虑见观视誉计认让训议许论设访证识试诚该语说读谁调谋贡财货质购贵贷费资赋赌赚赛赞趋跃踪轻输边过运还这进远连适钞钱链销锋锐镜长门问间队阴险隐页项预领额风马驱验鲸鸡鹳";
const COMMON_SIMPLIFIED_ONLY = "东业关车题单卖账择头图电话写记讯请谢银钟错张难简乡乱亏亩亿仑仓仪伞伟伤伪";
const SIMPLIFIED_ONLY = new Set([...SOURCE_SIMPLIFIED_ONLY, ...COMMON_SIMPLIFIED_ONLY]);
// Measured when the list was written: 130 of the 133 translated sources contain a listed character; @24, @25 and
// @72 contain none.
const MIN_SIMPLIFIED_SOURCE_ENTRIES = 130;

const BANNED_TERMS: readonly RegExp[] = [
	/社區/,
	/數字資產/,
	/數字本體/,
	/燃氣費/,
	/燃料費/,
	/滑點/,
	/公用程式/,
	/實用程式/,
	/即期/,
	/令牌/,
	/權杖/,
	/模因/,
	/梅姆/,
	/梗幣/,
	/用戶/,
	/信息/,
	/網絡/,
	/軟件/,
	/超流動/,
	/超流體/,
	/產量農場/,
	/複製交易/,
	/技術棧/,
	/界面/,
	/訪問/,
	/內置/,
	/實時/,
	/互操作性/,
	/知識產權/,
	/特朗普/,
	/賬/,
	/傭金/,
	/橋接/,
	/抵押/,
	/生態系(?!統)/,
	/過度流動/,
	/啟動平台/,
	/\s[-|]\s/,
];

// Where the Simplified or English source says the left side, the translation must use the glossary term on the right.
const REQUIRED_TERMS: readonly { source: RegExp; target: RegExp }[] = [
	{ source: /最大供应量|max supply/i, target: /最大發行量/ },
	{ source: /delta-neutral/i, target: /Delta 中性/ },
	{ source: /现货|即期/, target: /現貨/ },
	{ source: /社区/, target: /社群/ },
	{ source: /用户/, target: /使用者/ },
	{ source: /桥接/, target: /跨鏈/ },
	{ source: /质押/, target: /質押/ },
	{ source: /钱包/, target: /錢包/ },
	{ source: /滑点/, target: /滑價/ },
	{ source: /燃气费|燃料费/, target: /Gas 費/ },
	{ source: /生态系统/, target: /生態系統/ },
	{ source: /实用程序/, target: /實際用途/ },
	{ source: /迷因|模因|梅姆|梗币|\bmeme(?:coin)?s?\b/i, target: /迷因/ },
];

const PRESERVED_PATTERNS: Readonly<Record<string, RegExp>> = {
	ticker: /\$[A-Za-z0-9_]+/g,
	number: /\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:%|万|萬|亿|億|千|百))?/g,
	domain: /(?:https?:\/\/)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
	hexAddress: /0x[0-9a-fA-F]+/g,
	longHex: /[0-9a-fA-F]{16,}/g,
	handle: /@[A-Za-z0-9_]+/g,
	hashtag: /#[A-Za-z0-9_]+/g,
	link: /\{link\}/g,
};

const LATIN_WORD = /[A-Za-z][A-Za-z0-9]*/g;

// Latin words of the Simplified source that a reviewed correction translated, with the reason in the task record:
// @70 joins the English pun (hypurrfried eggs for hypurrfried brains); @155 writes delta-neutral as Delta 中性.
const DROPPED_LATIN_WORDS: Readonly<Record<string, readonly string[]>> = {
	"@70": ["fried"],
	"@155": ["neutral"],
};

// Latin words the glossary introduces where the source has the concept (燃气费 → Gas 費), and words it translates
// (meme, memecoin → 迷因, 迷因幣).
const GLOSSARY_LATIN_WORDS: Readonly<Record<string, RegExp>> = { gas: /燃气费|燃料费|\bgas\b/gi };
const GLOSSARY_TRANSLATED_LATIN_WORDS = new Set(["meme", "memecoin"]);

// Latin words a reviewed translation repeats beyond both sources, with the exact count: @40 keeps the English name and
// repeats the brand in its Chinese gloss (注意力不足 Hyperliquid 障礙).
const REPEATED_LATIN_WORDS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
	"@40": { hyperliquid: 2 },
};

// Values, tickers and Latin words follow the source order, because a Traditional Chinese translation of Simplified
// Chinese keeps its word order. Reordered on purpose, so each is pinned to its reviewed sequence instead: @70 repeats
// Hypurrfried for the English pun, @129 and @243 move 除了 Hyperliquid before the exchanges when correcting the reversed
// source, @133 puts Hyperliquid before AI 代理.
const PRESERVED_ORDER = /\$[A-Za-z0-9_]+|\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:%|万|萬|亿|億|千|百))?|[A-Za-z][A-Za-z0-9]*/g;
const MON_SEQUENCE = [
	"$mon",
	"pixelmon",
	"ip",
	"pixelmon",
	"ip",
	"pixelmon",
	"nft",
	"$mon",
	"evm",
	"erc20",
	"2025",
	"hyperliquid",
	"l1",
	"hyperliquid",
	"cex",
	"dex",
];
const REORDERED_SEQUENCES: Readonly<Record<string, readonly string[]>> = {
	"@70": ["hypurrfried", "hypurrfried"],
	"@129": MON_SEQUENCE,
	"@133": ["hyperliquid", "ai"],
	"@243": MON_SEQUENCE,
};

// Token allocations and supply figures are pinned to the reviewed sentence: preserved values and their order cannot
// tell which share goes to which recipient. Every source that states a percentage must be listed here.
const REVIEWED_ALLOCATIONS: Readonly<Record<string, string>> = {
	"@1": "$HFUN 的最大發行量為 100 萬。30% 的 $HFUN 分配給了 $PURR 持有者，30% 給了創建這款代幣的人，還有 40% 給了 Hyperliquidity。",
};

// Preserved values a reviewed translation adds, with the reason: @256 writes the source 一层 as Layer 1 after the
// English layer one.
const ADDED_PRESERVED_VALUES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
	"@256": { number: ["1"] },
};

// Entries whose source term was corrected away after the English: @105 translates 匿名用户 (lurker) as 潛水.
const REQUIRED_TERM_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
	"@105": ["使用者"],
};

interface BrandRule {
	source: RegExp;
	target: RegExp;
}

const BRAND_RULES: Readonly<Record<string, BrandRule>> = {
	Hyperliquid: { source: /\bhyperliquid\b/gi, target: /\bHyperliquid\b/g },
	HyperEVM: { source: /\bHyperEVM\b/g, target: /\bHyperEVM\b/g },
	HyperCore: { source: /\bHyperCore\b/g, target: /\bHyperCore\b/g },
	HyperBFT: { source: /\bHyperBFT\b/g, target: /\bHyperBFT\b/g },
	Unit: { source: /\bUnit\b/g, target: /\bUnit\b/g },
};

// @103 writes the brand in capitals in both languages; it is kept as written.
const CASE_INSENSITIVE_BRAND_PAIRS = new Set(["@103"]);

// @59: the Simplified and English copy are different texts and the translation follows the Simplified one,
// which does not mention Hyperliquid (docs/work-memory/sessions/2026-11-28-zh-tw-spot-asset-descriptions.md).
const BRAND_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = { "@59": ["Hyperliquid"] };

const MAIN_ENTRIES = Object.entries(SPOT_ASSET_DESCRIPTIONS);
const ZH_TW_ENTRIES = Object.entries(ZH_TW_DESCRIPTIONS);
const TRANSLATED_SOURCES = ZH_TW_ENTRIES.map(([pair]) => {
	const source = SPOT_ASSET_DESCRIPTIONS[pair]?.descriptions["zh-CN"];
	if (!source) throw new Error(`${pair} has no Simplified source`);
	return source;
});

function getTraditional(entry: SpotAssetDescriptionEntry): string {
	const text = entry.descriptions["zh-TW"];
	if (!text) throw new Error(`${entry.base}/${entry.quote} has no Traditional Chinese text`);
	return text;
}

function isCoveredByLocalCopy(entry: SpotAssetDescriptionEntry): boolean {
	const reference = getMarketAssetReference({
		kind: "spot",
		name: `${entry.base}/${entry.quote}`,
		tokensInfo: [
			{ name: entry.base, displayName: entry.base, tokenId: entry.baseTokenId },
			{ name: entry.quote, displayName: entry.quote, tokenId: entry.quoteTokenId },
		],
	} as unknown as UnifiedMarket);
	if (reference?.kind !== "spot") throw new Error(`${entry.base}/${entry.quote} is not a spot reference`);
	return entry.descriptionKind === "asset" ? reference.localDescriptionId !== null : reference.localProviderId !== null;
}

function fingerprint(entry: SpotAssetDescriptionEntry): string {
	return createHash("sha256")
		.update(JSON.stringify([entry.descriptions["zh-CN"], entry.descriptions.en ?? null]))
		.digest("hex");
}

function countMatches(text: string, pattern: RegExp): Map<string, number> {
	const counts = new Map<string, number>();
	for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
		counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
	}
	return counts;
}

function normalizePreserved(value: string): string {
	return value.replace(/\s+/g, "").replace("万", "萬").replace("亿", "億");
}

function listPreserved(text: string, pattern: RegExp): string[] {
	return [...text.matchAll(new RegExp(pattern.source, pattern.flags))]
		.map((match) => normalizePreserved(match[0]))
		.sort();
}

function countLatinWords(text: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const match of text.matchAll(LATIN_WORD)) {
		const word = match[0].toLowerCase();
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
	return counts;
}

function countAll(text: string, pattern: RegExp): number {
	return [...countMatches(text, pattern).values()].reduce((total, count) => total + count, 0);
}

function findSimplifiedOnly(text: string): string[] {
	return [...new Set([...text].filter((character) => SIMPLIFIED_ONLY.has(character)))];
}

describe("Traditional Chinese spot asset descriptions", () => {
	it("records the snapshot it was translated from", () => {
		expect(SPOT_ASSET_ZH_TW_SOURCE_GENERATED_AT).toBe(SPOT_ASSET_INFO_GENERATED_AT);
		expect(SPOT_ASSET_ZH_TW_SOURCE_SHA256).toBe(SPOT_ASSET_INFO_SOURCE_SHA256);
	});

	it("keeps every entry identical to the official snapshot identity", () => {
		for (const [pair, entry] of ZH_TW_ENTRIES) {
			const official = SPOT_ASSET_DESCRIPTIONS[pair];
			expect(official, pair).toBeDefined();
			expect(
				{
					base: entry.base,
					quote: entry.quote,
					baseTokenId: entry.baseTokenId,
					quoteTokenId: entry.quoteTokenId,
					descriptionKind: entry.descriptionKind,
				},
				pair,
			).toEqual({
				base: official?.base,
				quote: official?.quote,
				baseTokenId: official?.baseTokenId,
				quoteTokenId: official?.quoteTokenId,
				descriptionKind: official?.descriptionKind,
			});
			expect(Object.keys(entry.descriptions), pair).toEqual(["zh-TW"]);
		}
	});

	it("contains only usable, trimmed text", async () => {
		const { isUsableDescription } = (await import(
			resolve(REPOSITORY_ROOT, "scripts/spot-asset-info-generator.mjs")
		)) as {
			isUsableDescription: (value: unknown) => boolean;
		};
		for (const [pair, entry] of ZH_TW_ENTRIES) {
			const text = getTraditional(entry);
			expect(isUsableDescription(text), pair).toBe(true);
			expect(text, pair).toBe(text.trim());
			expect(text, pair).not.toMatch(/[\r\n\u2028\u2029]/);
		}
	});

	it("translates every Simplified entry except the ones the dialog shows from local copy", () => {
		const translated = new Set(ZH_TW_ENTRIES.map(([pair]) => pair));
		const localCopy: string[] = [];
		for (const [pair, entry] of MAIN_ENTRIES) {
			if (!entry.descriptions["zh-CN"]) {
				expect(translated.has(pair), pair).toBe(false);
				continue;
			}
			const covered = isCoveredByLocalCopy(entry);
			if (covered) localCopy.push(pair);
			expect(translated.has(pair), `${pair} ${covered ? "is shown from local copy" : "needs a translation"}`).toBe(
				!covered,
			);
		}
		expect(localCopy.sort()).toEqual(EXPECTED_LOCAL_COPY_PAIRS);
	});

	it("fails when a translated source changes", () => {
		expect(Object.keys(SPOT_ASSET_ZH_TW_SOURCE_FINGERPRINTS).sort()).toEqual(
			ZH_TW_ENTRIES.map(([pair]) => pair).sort(),
		);
		for (const [pair] of ZH_TW_ENTRIES) {
			const official = SPOT_ASSET_DESCRIPTIONS[pair];
			if (!official) throw new Error(`${pair} is missing from the snapshot`);
			expect(fingerprint(official), `${pair}: the source changed; translate it again and update its fingerprint`).toBe(
				SPOT_ASSET_ZH_TW_SOURCE_FINGERPRINTS[pair],
			);
		}
	});

	it("uses a simplified-only character list that detects the sources and spares Taiwanese copy", () => {
		const corpus = TRANSLATED_SOURCES.join("");
		for (const character of SOURCE_SIMPLIFIED_ONLY) {
			expect(corpus.includes(character), character).toBe(true);
		}
		const detected = TRANSLATED_SOURCES.filter((source) => findSimplifiedOnly(source).length > 0);
		expect(detected.length).toBeGreaterThanOrEqual(MIN_SIMPLIFIED_SOURCE_ENTRIES);
		const catalogHits = readPoEntries("zh-TW").flatMap(({ message, translation }) =>
			findSimplifiedOnly(translation).map((character) => `${character} in ${message}`),
		);
		expect(catalogHits).toEqual([]);
	});

	it("contains no simplified-only characters", () => {
		const hits = ZH_TW_ENTRIES.flatMap(([pair, entry]) =>
			findSimplifiedOnly(getTraditional(entry)).map((character) => `${pair}: ${character}`),
		);
		expect(hits).toEqual([]);
	});

	it("avoids mainland and machine-translation wording", () => {
		const hits = ZH_TW_ENTRIES.flatMap(([pair, entry]) =>
			BANNED_TERMS.filter((term) => term.test(getTraditional(entry))).map((term) => `${pair}: ${term.source}`),
		);
		expect(hits).toEqual([]);
	});

	it("preserves tickers, numbers, domains, addresses, handles, tags and placeholders", () => {
		for (const [name, pattern] of Object.entries(PRESERVED_PATTERNS)) {
			expect(
				TRANSLATED_SOURCES.some((source) => countAll(source, pattern) > 0),
				name,
			).toBe(true);
		}
		const differences: string[] = [];
		for (const [pair, entry] of ZH_TW_ENTRIES) {
			const source = SPOT_ASSET_DESCRIPTIONS[pair]?.descriptions["zh-CN"] ?? "";
			const text = getTraditional(entry);
			for (const [name, pattern] of Object.entries(PRESERVED_PATTERNS)) {
				const expected = [...listPreserved(source, pattern), ...(ADDED_PRESERVED_VALUES[pair]?.[name] ?? [])].sort();
				const actual = listPreserved(text, pattern);
				if (JSON.stringify(actual) !== JSON.stringify(expected)) {
					differences.push(`${pair} ${name}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
				}
			}
		}
		expect(differences).toEqual([]);
		expect(ZH_TW_DESCRIPTIONS["@24"]?.descriptions["zh-TW"]).toBe(
			SPOT_ASSET_DESCRIPTIONS["@24"]?.descriptions["zh-CN"],
		);
	});

	it("keeps the Latin-script words of the source and adds none of its own", () => {
		const differences: string[] = [];
		for (const [pair, entry] of ZH_TW_ENTRIES) {
			const official = SPOT_ASSET_DESCRIPTIONS[pair];
			const sourceWords = countLatinWords(official?.descriptions["zh-CN"] ?? "");
			const englishWords = countLatinWords(official?.descriptions.en ?? "");
			const translatedWords = countLatinWords(getTraditional(entry));
			const dropped = DROPPED_LATIN_WORDS[pair] ?? [];
			for (const [word, count] of sourceWords) {
				if (
					!dropped.includes(word) &&
					!GLOSSARY_TRANSLATED_LATIN_WORDS.has(word) &&
					(translatedWords.get(word) ?? 0) < count
				) {
					differences.push(`${pair} lost ${word}`);
				}
			}
			for (const [word, count] of translatedWords) {
				const glossaryConcept = GLOSSARY_LATIN_WORDS[word];
				const allowed =
					REPEATED_LATIN_WORDS[pair]?.[word] ??
					Math.max(
						sourceWords.get(word) ?? 0,
						englishWords.get(word) ?? 0,
						glossaryConcept ? countAll(official?.descriptions["zh-CN"] ?? "", glossaryConcept) : 0,
					);
				if (count > allowed) {
					differences.push(`${pair} added ${word} (${count} > ${allowed})`);
				}
			}
		}
		expect(differences).toEqual([]);
	});

	it("keeps values, tickers and Latin words in the source order", () => {
		const differences: string[] = [];
		for (const [pair, entry] of ZH_TW_ENTRIES) {
			const normalize = (value: string) => normalizePreserved(value).toLowerCase();
			const source = (SPOT_ASSET_DESCRIPTIONS[pair]?.descriptions["zh-CN"]?.match(PRESERVED_ORDER) ?? []).map(
				normalize,
			);
			const translated = (getTraditional(entry).match(PRESERVED_ORDER) ?? []).map(normalize);
			const shared = (values: string[], other: string[]) => values.filter((value) => other.includes(value));
			const expected = REORDERED_SEQUENCES[pair] ?? shared(source, translated);
			const actual = shared(translated, source);
			if (JSON.stringify(actual) !== JSON.stringify(expected)) {
				differences.push(`${pair}: ${expected.join(" ")} → ${actual.join(" ")}`);
			}
		}
		expect(differences).toEqual([]);
		for (const pair of Object.keys(REORDERED_SEQUENCES)) expect(ZH_TW_DESCRIPTIONS[pair], pair).toBeDefined();
	});

	it("keeps every reviewed allocation sentence", () => {
		const withPercentages = ZH_TW_ENTRIES.filter(([pair]) =>
			/\d\s*%/.test(
				`${SPOT_ASSET_DESCRIPTIONS[pair]?.descriptions["zh-CN"] ?? ""}\n${SPOT_ASSET_DESCRIPTIONS[pair]?.descriptions.en ?? ""}`,
			),
		).map(([pair]) => pair);
		expect(withPercentages.sort()).toEqual(Object.keys(REVIEWED_ALLOCATIONS).sort());
		for (const [pair, sentence] of Object.entries(REVIEWED_ALLOCATIONS)) {
			expect(ZH_TW_DESCRIPTIONS[pair]?.descriptions["zh-TW"], pair).toContain(sentence);
		}
	});

	it("uses the glossary term wherever the source uses the concept", () => {
		const misses = ZH_TW_ENTRIES.flatMap(([pair, entry]) => {
			const official = SPOT_ASSET_DESCRIPTIONS[pair];
			const source = `${official?.descriptions["zh-CN"] ?? ""}\n${official?.descriptions.en ?? ""}`;
			return REQUIRED_TERMS.filter(
				({ source: pattern, target }) =>
					pattern.test(source) &&
					!target.test(getTraditional(entry)) &&
					!REQUIRED_TERM_EXCEPTIONS[pair]?.includes(target.source),
			).map(({ target }) => `${pair}: ${target.source}`);
		});
		expect(misses).toEqual([]);
	});

	it("keeps brand and product names", () => {
		const losses: string[] = [];
		for (const [pair, entry] of ZH_TW_ENTRIES) {
			const official = SPOT_ASSET_DESCRIPTIONS[pair];
			const text = getTraditional(entry);
			for (const [brand, rule] of Object.entries(BRAND_RULES)) {
				const simplifiedCount = countAll(official?.descriptions["zh-CN"] ?? "", rule.source);
				const englishCount = countAll(official?.descriptions.en ?? "", rule.source);
				const expected = BRAND_EXCEPTIONS[pair]?.includes(brand)
					? simplifiedCount
					: Math.max(simplifiedCount, englishCount);
				const target = CASE_INSENSITIVE_BRAND_PAIRS.has(pair) ? rule.source : rule.target;
				if (countAll(text, target) < expected) losses.push(`${pair} ${brand}: expected ${expected}`);
			}
		}
		expect(losses).toEqual([]);
	});

	it("translates identical sources identically", () => {
		const bySource = new Map<string, string[]>();
		for (const [pair, source] of ZH_TW_ENTRIES.map(([pair], index) => [pair, TRANSLATED_SOURCES[index]] as const)) {
			bySource.set(source ?? "", [...(bySource.get(source ?? "") ?? []), pair]);
		}
		const groups = [...bySource.values()].filter((pairs) => pairs.length > 1);
		expect(groups.length).toBeGreaterThan(0);
		for (const pairs of groups) {
			const texts = new Set(pairs.map((pair) => ZH_TW_DESCRIPTIONS[pair]?.descriptions["zh-TW"]));
			expect(texts.size, pairs.join(" ")).toBe(1);
		}
	});
});
