import { writeFile } from "node:fs/promises";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { ACCOUNT_TABLES_NOW } from "./account-tables-clock";
import { findLayoutIntegrityIssues, findTableCellSpill, type LayoutIntegrityFinding } from "./layout-integrity";

/**
 * Account tables with data (positions, open orders, TWAP, trade history, funding, order history) in every
 * interface language at the widths of docs/layout-integrity.md. 1440 and 1100 render the desktop grid with
 * the real account panel; 390 renders the phone account view with every card expanded. Each language is
 * compared with English element by element (`anchor`): a finding English shares is an existing limitation
 * (EN_PENDING), a finding only the language has is new (LOCALE_ONLY_PENDING). docs/work-memory holds the
 * dated reading with the texts and measurements.
 */

const LOCALES = ["zh", "zh-TW", "ja", "ko", "vi", "id", "hi", "es", "pt", "fr", "tr", "ru", "ar"] as const;
type Locale = "en" | (typeof LOCALES)[number];

const VIEWPORTS = [
	{ width: 1440, height: 900 },
	{ width: 1100, height: 900 },
	{ width: 390, height: 844 },
] as const;
type Width = (typeof VIEWPORTS)[number]["width"];

interface View {
	name: string;
	tab: string;
	subview?: "current" | "history" | "fills";
	/** Rows in the desktop table and cards on the phone that the fixture data must produce. */
	items: number;
	/** Whether every phone card of this view has a details disclosure to expand. */
	disclosures: boolean;
}

const VIEWS: readonly View[] = [
	{ name: "positions", tab: "positions", items: 5, disclosures: true },
	{ name: "orders", tab: "orders", items: 8, disclosures: true },
	{ name: "twap-current", tab: "twap", subview: "current", items: 2, disclosures: false },
	{ name: "twap-history", tab: "twap", subview: "history", items: 6, disclosures: false },
	{ name: "twap-fills", tab: "twap", subview: "fills", items: 3, disclosures: false },
	{ name: "history", tab: "history", items: 8, disclosures: true },
	{ name: "funding", tab: "funding", items: 5, disclosures: true },
	{ name: "orders-history", tab: "orders-history", items: 17, disclosures: true },
];

const PHONE_CARD = ":is(article, [data-account-card])";

const LOCAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#888"/></svg>`;

/**
 * Cut-off text English already shows (first read 2026-11-27), per width, as `view kind region «field» ×count`.
 * Every other language is checked against English element by element, so these are not repeated per language.
 * At 390px `orders truncated «Market» ×8` is not cut text: the market button's 44px `::after` touch target
 * makes its `scrollHeight` 31px in a 17px box while the name renders whole.
 */
const EN_PENDING: Record<Width, readonly string[]> = {
	1440: [
		"history spilled cell-spill «Direction» ×1",
		"orders spilled cell-spill «Price» ×2",
		"orders spilled cell-spill «TP/SL» ×1",
		"orders truncated table-scroll-container «Price» ×1",
		"orders truncated table-scroll-container «Stop Limit» ×1",
		"orders truncated table-scroll-container «Take Profit Limit» ×1",
		"orders truncated table-scroll-container ×6",
		"positions spilled cell-spill «Funding» ×1",
		"positions spilled cell-spill «Market» ×1",
		"positions spilled cell-spill «Position Value» ×4",
		"positions spilled cell-spill «Size» ×3",
	],
	1100: [
		"history spilled cell-spill «Direction» ×1",
		"orders spilled cell-spill «Price» ×2",
		"orders spilled cell-spill «TP/SL» ×1",
		"orders truncated table-scroll-container «Price» ×1",
		"orders truncated table-scroll-container «Stop Limit» ×1",
		"orders truncated table-scroll-container «Take Profit Limit» ×1",
		"orders truncated table-scroll-container ×6",
		"positions spilled cell-spill «Funding» ×1",
		"positions spilled cell-spill «Market» ×1",
		"positions spilled cell-spill «Position Value» ×4",
		"positions spilled cell-spill «Size» ×3",
	],
	390: [
		"funding truncated «Market» ×1",
		"funding truncated «Payment» ×5",
		"funding truncated «Position» ×4",
		"history truncated mobile-trade-history-list «Direction» ×1",
		"history truncated mobile-trade-history-list «Market» ×1",
		"history truncated mobile-trade-history-list «Realized PNL» ×1",
		"history truncated mobile-trade-history-list «Size» ×8",
		"orders truncated «Market» ×8",
		"orders truncated «Time» ×8",
		"orders-history clipped «ExecutionMarket» ×2",
		"orders-history truncated «Market» ×2",
		"orders-history truncated «Time» ×6",
		"orders-history truncated «Type» ×3",
		"positions clipped «87,000» ×1",
		"twap-fills truncated mobile-twap-fill-history-list «Closed PNL» ×1",
		"twap-fills truncated mobile-twap-fill-history-list «Fee» ×3",
		"twap-fills truncated mobile-twap-fill-history-list «Size» ×2",
		"twap-history truncated «Executed Size» ×1",
		"twap-history truncated «Total Size» ×1",
	],
};

/**
 * Findings only a language has (no English finding on the same element), per language and width, with the
 * language's own field labels. Each entry is an open decision in
 * docs/work-memory/sessions/2026-11-27-account-tables-layout-integrity.md.
 */
const LOCALE_ONLY_PENDING: Partial<Record<Locale, Partial<Record<Width, readonly string[]>>>> = {
	"zh-TW": {
		1440: [
			"orders-history spilled cell-spill «時間» ×6",
		],
		1100: [
			"orders-history spilled cell-spill «時間» ×6",
		],
		390: [
			"orders-history truncated «時間» ×11",
		],
	},
	ja: {
		1440: [
			"orders-history spilled cell-spill «状態» ×1",
		],
		1100: [
			"orders-history spilled cell-spill «状態» ×1",
		],
		390: [
			"history truncated mobile-trade-history-list «方向» ×1",
			"orders-history truncated «タイプ» ×1",
			"orders-history truncated «状態» ×1",
		],
	},
	ko: {
		390: [
			"orders-history truncated «시간» ×11",
		],
	},
	vi: {
		1440: [
			"positions spilled cell-spill «Thao tácĐóng tất cả vị thế» ×5",
			"twap-current spilled cell-spill «Thao tác» ×2",
		],
		1100: [
			"positions spilled cell-spill «Thao tácĐóng tất cả vị thế» ×5",
			"twap-current spilled cell-spill «Thao tác» ×2",
		],
		390: [
			"orders-history truncated «Loại» ×2",
		],
	},
	id: {
		390: [
			"orders-history truncated «Jenis» ×1",
		],
	},
	hi: {
		390: [
			"orders-history truncated «प्रकार» ×2",
		],
	},
	es: {
		1440: [
			"orders truncated table-scroll-container ×1",
			"orders-history spilled cell-spill «Estado» ×1",
			"orders-history spilled cell-spill «Precio» ×2",
			"positions spilled cell-spill «Precio de liquidación» ×1",
		],
		1100: [
			"orders truncated table-scroll-container ×1",
			"orders-history spilled cell-spill «Estado» ×1",
			"orders-history spilled cell-spill «Precio» ×2",
			"orders-history spilled cell-spill «Tipo» ×1",
			"positions spilled cell-spill «Precio de liquidación» ×1",
		],
		390: [
			"orders truncated «Condición de activación-» ×4",
			"orders truncated «Condición de activación≤ 2,100.5» ×1",
			"orders truncated «Condición de activación≤ 87,000» ×1",
			"orders truncated «Condición de activación≥ 120,000» ×1",
			"orders truncated «Condición de activación≥ 2,600.25» ×1",
			"orders truncated «Precio$1.5678» ×1",
			"orders truncated «Precio$2,090.8» ×1",
			"orders truncated «Precio$2,650.5» ×1",
			"orders truncated «Precio$34.567» ×1",
			"orders truncated «Precio$340.12» ×1",
			"orders truncated «Precio$95,000» ×1",
			"orders truncated «PrecioMercado» ×2",
			"orders truncated «Tipo» ×1",
			"orders-history truncated «Estado» ×1",
			"orders-history truncated «Tipo» ×2",
			"twap-history truncated «Precio de disparo$2,300.5» ×1",
			"twap-history truncated «Precio de disparo-» ×5",
			"twap-history truncated «Precio medio$1.12341» ×1",
			"twap-history truncated «Precio medio$2,234.56» ×1",
			"twap-history truncated «Precio medio$3,456.78» ×1",
			"twap-history truncated «Precio medio$356.78» ×1",
			"twap-history truncated «Precio medio$97,654.3» ×1",
			"twap-history truncated «Precio medio-» ×1",
		],
	},
	pt: {
		1440: [
			"orders-history spilled cell-spill «Preço» ×2",
		],
		1100: [
			"orders-history spilled cell-spill «Preço» ×2",
		],
		390: [
			"orders truncated «Tipo» ×1",
			"orders-history truncated «Tipo» ×1",
		],
	},
	fr: {
		1440: [
			"orders-history spilled cell-spill «Prix» ×2",
			"orders-history spilled cell-spill «Statut» ×1",
			"positions spilled cell-spill «ActionsFermer toutes les positions» ×5",
		],
		1100: [
			"orders-history spilled cell-spill «Prix» ×2",
			"orders-history spilled cell-spill «Statut» ×1",
			"orders-history spilled cell-spill «Type» ×1",
			"positions spilled cell-spill «ActionsFermer toutes les positions» ×5",
		],
		390: [
			"orders truncated «Prix$1.5678» ×1",
			"orders truncated «Prix$2,090.8» ×1",
			"orders truncated «Prix$2,650.5» ×1",
			"orders truncated «Prix$34.567» ×1",
			"orders truncated «Prix$340.12» ×1",
			"orders truncated «Prix$95,000» ×1",
			"orders truncated «PrixMarché» ×2",
			"orders truncated «Taille d'origine1,234,567.8» ×1",
			"orders truncated «Taille d'origine1,234.567» ×1",
			"orders truncated «Taille d'origine12,345.67» ×1",
			"orders truncated «Taille d'origine12.34567» ×2",
			"orders truncated «Taille d'origine123.456» ×1",
			"orders truncated «Taille d'origine2.50000» ×1",
			"orders truncated «Taille d'origine617.283» ×1",
			"orders-history truncated «Statut» ×1",
			"orders-history truncated «Type» ×2",
			"twap-fills truncated mobile-twap-fill-history-list «Taille0.41234 BTC» ×1",
			"twap-fills truncated mobile-twap-fill-history-list «Taille12,345.6 FARTCOIN» ×1",
			"twap-fills truncated mobile-twap-fill-history-list «Taille61.728 SMALL2000» ×1",
			"twap-history truncated «Prix de déclenchement$2,300.5» ×1",
			"twap-history truncated «Prix de déclenchement-» ×5",
		],
	},
	tr: {
		1440: [
			"positions spilled cell-spill «İşlemlerTüm pozisyonları kapat» ×5",
		],
		1100: [
			"positions spilled cell-spill «İşlemlerTüm pozisyonları kapat» ×5",
		],
	},
	ru: {
		390: [
			"orders truncated «Тип» ×2",
			"orders-history truncated «Тип» ×2",
		],
	},
	ar: {
		390: [
			"orders-history truncated «النوع» ×1",
			"orders-history truncated «الوقت» ×10",
		],
	},
};

type ViewFinding = Omit<LayoutIntegrityFinding, "kind"> & { kind: LayoutIntegrityFinding["kind"] | "spilled"; view: string };

function isDesktop(width: number) {
	return width > 1000;
}

async function guardNetwork(page: Page, outside: string[]) {
	await page.route(
		(url) => !["127.0.0.1", "localhost"].includes(url.hostname),
		async (route) => {
			const url = new URL(route.request().url());
			if (url.hostname === "app.hyperliquid.xyz" && url.pathname.startsWith("/coins/")) {
				await route.fulfill({ contentType: "image/svg+xml", body: LOCAL_ICON });
				return;
			}
			outside.push(route.request().url());
			await route.abort();
		},
	);
}

/**
 * Every webfont face (Inter, IBM Plex) whose unicode range covers a character drawn in that family under
 * `root` must have loaded, none may have failed, and some text under `root` must use one of them. `document.fonts.status` alone reads `loaded` after a failed or
 * never-requested face.
 */
async function webFontProblems(page: Page, root: string) {
	return page.evaluate((rootSelector) => {
		const rootElement = document.querySelector(rootSelector);
		if (!rootElement) throw new Error(`Missing account table root ${rootSelector}`);
		const unquote = (family: string) => family.trim().replace(/^["']|["']$/g, "");
		const faces = [...document.fonts].map((face) => ({
			face,
			family: unquote(face.family),
			ranges: face.unicodeRange.split(",").map((part) => {
				const [start, end = start] = part.trim().replace(/^U\+/i, "").split("-");
				return [Number.parseInt(start.replace(/\?/g, "0"), 16), Number.parseInt(end.replace(/\?/g, "F"), 16)];
			}),
		}));
		const problems = new Set<string>();
		for (const { face, family } of faces) if (face.status === "error") problems.add(`${family} ${face.unicodeRange} failed`);
		const used = new Set<string>();
		const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const element = node.parentElement;
			if (!element || element.getClientRects().length === 0) continue;
			const family = unquote(getComputedStyle(element).fontFamily.split(",")[0] ?? "");
			const declared = faces.filter((entry) => entry.family === family);
			if (declared.length === 0) continue;
			used.add(family);
			for (const character of node.textContent ?? "") {
				const code = character.codePointAt(0) ?? 0;
				if (code <= 0x20) continue;
				const covering = declared.filter(({ ranges }) => ranges.some(([start, end]) => code >= start && code <= end));
				if (covering.length > 0 && !covering.some(({ face }) => face.status === "loaded")) {
					problems.add(`${family} has not loaded U+${code.toString(16).toUpperCase()} (${character})`);
				}
			}
		}
		if (used.size === 0) problems.add("no text under the root is set in a declared webfont");
		return [...problems];
	}, root);
}

async function settle(page: Page, root: string) {
	await page.evaluate(async () => {
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		await document.fonts.ready;
	});
	await expect.poll(() => webFontProblems(page, root)).toEqual([]);
}

async function openView(page: Page, width: number, view: View) {
	const root = isDesktop(width) ? '[data-panel="accountTable"]' : '[data-panel="mobileAccount"]';
	const tab = page.locator(
		isDesktop(width) ? `[data-positions-tab="${view.tab}"]` : `[data-mobile-account-tab="${view.tab}"]`,
	);
	await tab.click();
	await expect(tab).toHaveAttribute("aria-selected", "true");
	let panel = page.locator(`${root} [role="tabpanel"]:visible`).first();
	if (view.subview) {
		const subview = panel.locator(`[role="tab"][id$="-${view.subview}-tab"]`);
		await subview.click();
		await expect(subview).toHaveAttribute("aria-selected", "true");
		panel = panel.locator(`[id$="-${view.subview}-panel"]`);
	}
	await expect(panel.getByText("SMALL2000").first()).toBeVisible();
	await expect(page.locator(`${root} [aria-busy="true"]`)).toHaveCount(0);
	if (isDesktop(width)) {
		await expect(panel.locator("tbody tr")).toHaveCount(view.items);
	} else {
		await expect(panel.locator(PHONE_CARD)).toHaveCount(view.items);
		const disclosures = panel.locator(`${PHONE_CARD} button[aria-expanded][aria-controls]`);
		await expect(disclosures).toHaveCount(view.disclosures ? view.items : 0);
		const collapsed = panel.locator(`${PHONE_CARD} button[aria-expanded="false"][aria-controls]`);
		while ((await collapsed.count()) > 0) await collapsed.first().click();
		await expect(panel.locator(`${PHONE_CARD} button[aria-expanded="true"][aria-controls]`)).toHaveCount(
			view.disclosures ? view.items : 0,
		);
	}
	await settle(page, root);
	return root;
}

async function readLocale(page: Page, width: number, locale: Locale) {
	await page.goto(`/account-tables.html?locale=${locale}`);
	await expect(page.locator("html")).toHaveAttribute("lang", locale);
	const root = isDesktop(width) ? '[data-panel="accountTable"]' : '[data-panel="mobileAccount"]';
	const tabs = await page.locator(`${root} [role="tablist"]`).first().innerText();
	const findings: ViewFinding[] = [];
	for (const view of VIEWS) {
		await openView(page, width, view);
		for (const finding of await findLayoutIntegrityIssues(page, { root })) findings.push({ ...finding, view: view.name });
		for (const finding of await findTableCellSpill(page, { root })) findings.push({ ...finding, view: view.name });
	}
	return { findings, tabs };
}

function key(finding: ViewFinding) {
	return `${finding.view} ${finding.kind} ${finding.anchor}`;
}

function summarize(findings: readonly ViewFinding[]) {
	const counts = new Map<string, number>();
	for (const finding of findings) {
		const [region, field] = finding.path.split(" › ");
		const label = `${finding.view} ${finding.kind} ${region} ${field?.startsWith("«") ? field : ""}`.trim();
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	return [...counts].map(([label, count]) => `${label} ×${count}`).sort();
}

async function attachReport(testInfo: TestInfo, width: number, report: Record<string, unknown>) {
	const path = testInfo.outputPath(`account-tables-${width}.json`);
	await writeFile(path, JSON.stringify(report, null, "\t"));
	await testInfo.attach(`account-tables-${width}.json`, { path, contentType: "application/json" });
}

for (const viewport of VIEWPORTS) {
	test(`compares account tables at ${viewport.width}px in every language with English`, async ({ page }, testInfo) => {
		const outside: string[] = [];
		await guardNetwork(page, outside);
		await page.clock.setFixedTime(ACCOUNT_TABLES_NOW);
		await page.setViewportSize(viewport);
		const { findings: english, tabs: englishTabs } = await readLocale(page, viewport.width, "en");
		const englishKeys = new Set(english.map(key));
		const report: Record<string, unknown> = { en: english };
		expect.soft(summarize(english), "en").toEqual([...EN_PENDING[viewport.width]].sort());
		for (const locale of LOCALES) {
			const { findings, tabs } = await readLocale(page, viewport.width, locale);
			expect.soft(tabs, `${locale} renders its own catalog`).not.toBe(englishTabs);
			const localeOnly = findings.filter((finding) => !englishKeys.has(key(finding)));
			const localeKeys = new Set(findings.map(key));
			report[locale] = {
				localeOnly,
				sharedWithEnglish: findings.length - localeOnly.length,
				englishOnly: english.filter((finding) => !localeKeys.has(key(finding))).map(key),
			};
			expect
				.soft(summarize(localeOnly), locale)
				.toEqual([...(LOCALE_ONLY_PENDING[locale]?.[viewport.width] ?? [])].sort());
		}
		await attachReport(testInfo, viewport.width, report);
		expect(outside).toEqual([]);
	});
}
