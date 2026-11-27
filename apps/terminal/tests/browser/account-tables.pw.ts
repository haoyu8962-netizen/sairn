import { writeFile } from "node:fs/promises";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { findLayoutIntegrityIssues, type LayoutIntegrityFinding } from "./layout-integrity";

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
}

const VIEWS: readonly View[] = [
	{ name: "positions", tab: "positions" },
	{ name: "orders", tab: "orders" },
	{ name: "twap-current", tab: "twap", subview: "current" },
	{ name: "twap-history", tab: "twap", subview: "history" },
	{ name: "twap-fills", tab: "twap", subview: "fills" },
	{ name: "history", tab: "history" },
	{ name: "funding", tab: "funding" },
	{ name: "orders-history", tab: "orders-history" },
];

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
		"orders clipped table-scroll-container «Price» ×1",
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
		"orders clipped table-scroll-container «Price» ×1",
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
		"funding clipped «Position» ×1",
		"funding truncated «Market» ×1",
		"funding truncated «Payment» ×5",
		"funding truncated «Position» ×4",
		"history clipped mobile-trade-history-list «Size» ×1",
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
			"orders-history clipped «タイプ» ×1",
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
			"orders-history clipped «Loại» ×1",
			"orders-history truncated «Loại» ×2",
		],
	},
	id: {
		390: [
			"orders-history clipped «Jenis» ×1",
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
			"orders-history clipped «Tipo» ×2",
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
			"orders-history clipped «Tipo» ×1",
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
			"orders-history clipped «Type» ×2",
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
		390: [
			"orders-history clipped «Tür» ×1",
		],
	},
	ru: {
		390: [
			"orders truncated «Тип» ×2",
			"orders-history clipped «Тип» ×4",
			"orders-history truncated «Тип» ×2",
		],
	},
	ar: {
		390: [
			"orders-history clipped «النوع» ×1",
			"orders-history truncated «النوع» ×1",
			"orders-history truncated «الوقت» ×10",
		],
	},
};

/**
 * `spilled`: text that runs past its table cell into the next column. The desktop tables are `table-fixed`
 * with `white-space: nowrap` values, so a value wider than its column overlaps its neighbour instead of being
 * hidden, which `findLayoutIntegrityIssues` does not report. Text under an ancestor that hides overflow is
 * left to the probe.
 */
type FindingKind = LayoutIntegrityFinding["kind"] | "spilled";
type ViewFinding = Omit<LayoutIntegrityFinding, "kind"> & { kind: FindingKind; view: string };

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

async function settle(page: Page) {
	await page.evaluate(async () => {
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		await document.fonts.ready;
	});
	await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
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
	if (!isDesktop(width)) {
		const collapsed = panel.locator('article button[aria-expanded="false"][aria-controls]');
		while ((await collapsed.count()) > 0) await collapsed.first().click();
	}
	await settle(page);
	return root;
}

async function findCellSpill(page: Page, root: string): Promise<Omit<ViewFinding, "view">[]> {
	return page.evaluate((rootSelector) => {
		const rootElement = document.querySelector(rootSelector);
		if (!rootElement) throw new Error(`Missing account table root ${rootSelector}`);
		const anchorOf = (element: Element) => {
			const steps: number[] = [];
			for (let current: Element | null = element; current && current !== rootElement; current = current.parentElement) {
				const parent: Element | null = current.parentElement;
				if (!parent) break;
				steps.unshift(Array.prototype.indexOf.call(parent.children, current));
			}
			return steps.join(".");
		};
		const hidesOverflow = (element: Element, cell: Element) => {
			for (let current: Element | null = element; current; current = current.parentElement) {
				const style = getComputedStyle(current);
				if (style.overflowX !== "visible" || style.visibility !== "visible" || style.display === "none") return true;
				if (current === cell) return false;
			}
			return false;
		};
		const results: { kind: "spilled"; path: string; text: string; detail: string; anchor: string }[] = [];
		for (const cell of rootElement.querySelectorAll("td, th")) {
			if (!(cell instanceof HTMLTableCellElement) || cell.getClientRects().length === 0) continue;
			const box = cell.getBoundingClientRect();
			const header = cell.closest("table")?.tHead?.rows[0]?.cells[cell.cellIndex]?.textContent?.trim() ?? "";
			const reported = new Set<Element>();
			const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const element = node.parentElement;
				const text = node.textContent?.trim();
				if (!element || !text || reported.has(element) || hidesOverflow(element, cell)) continue;
				const range = document.createRange();
				range.selectNodeContents(node);
				const rect = range.getBoundingClientRect();
				if (rect.width === 0) continue;
				const spill = Math.max(box.left - rect.left, rect.right - box.right);
				if (spill <= 1) continue;
				reported.add(element);
				results.push({
					kind: "spilled",
					path: `cell-spill › «${header}» › ${element.tagName.toLowerCase()}`,
					text,
					detail: `extends ${Math.round(spill)}px beyond its ${cell.tagName.toLowerCase()}`,
					anchor: anchorOf(element),
				});
			}
		}
		return results;
	}, root);
}

async function readLocale(page: Page, width: number, locale: Locale): Promise<ViewFinding[]> {
	await page.goto(`/account-tables.html?locale=${locale}`);
	await expect(page.locator("html")).toHaveAttribute("lang", locale);
	const findings: ViewFinding[] = [];
	for (const view of VIEWS) {
		const root = await openView(page, width, view);
		for (const finding of await findLayoutIntegrityIssues(page, { root })) findings.push({ ...finding, view: view.name });
		for (const finding of await findCellSpill(page, root)) findings.push({ ...finding, view: view.name });
	}
	return findings;
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
		await page.setViewportSize(viewport);
		const english = await readLocale(page, viewport.width, "en");
		const englishKeys = new Set(english.map(key));
		const report: Record<string, unknown> = { en: english };
		expect.soft(summarize(english), "en").toEqual([...EN_PENDING[viewport.width]].sort());
		for (const locale of LOCALES) {
			const findings = await readLocale(page, viewport.width, locale);
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
