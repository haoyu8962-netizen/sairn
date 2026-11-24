import { expect, type Page, test } from "@playwright/test";
import { findLayoutIntegrityIssues } from "./layout-integrity";

const VIEWPORTS = [
	{ width: 320, height: 720 },
	{ width: 375, height: 812 },
	{ width: 393, height: 852 },
] as const;

const HISTORY_SECTIONS = [
	{ id: "trade-history", cardCount: 5 },
	{ id: "order-history", cardCount: 4 },
	{ id: "funding-history", cardCount: 3 },
] as const;

async function open(page: Page, locale: string) {
	await page.goto(`/mobile-history-cards.html?locale=${locale}`);
	for (const { id, cardCount } of HISTORY_SECTIONS) {
		const section = page.getByTestId(id);
		await expect(section.getByRole("article")).toHaveCount(cardCount);
		await expect(section.getByTestId("expand-all-details")).toBeEnabled();
	}
}

async function expandAll(page: Page) {
	for (const { id, cardCount } of HISTORY_SECTIONS) {
		const section = page.getByTestId(id);
		await section.getByTestId("expand-all-details").click();
		const expanded = section.getByRole("article").getByRole("button", { expanded: true });
		await expect(expanded).toHaveCount(cardCount);
		for (const disclosure of await expanded.all()) {
			const detailsId = await disclosure.getAttribute("aria-controls");
			await expect(section.locator(`[id=${JSON.stringify(detailsId ?? "")}]`)).toBeVisible();
		}
	}
}

async function waitForFonts(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
}

/**
 * Cut-off text the probe found that is not fixed yet (first read 2026-11-21; re-read 2026-11-24 after
 * the probe began to look inside `display: contents` wrappers, which added the card headers), per
 * locale and width. The count in `kind region «field» ×count` is the number of findings in that
 * group. One card can contribute more than one finding. The test catches changes in group counts.
 * The same counts can occur on different cards. The fixture's amounts are deliberately large, while
 * the liquidation direction and order status are ordinary values.
 */
const PENDING: Record<string, Record<number, readonly string[]>> = {
	en: {
		320: [
			"clipped funding-history «Position» ×2",
			"clipped mobile-trade-history-list «Size» ×3",
			"clipped order-history «Trigger$97,000» ×1",
			"truncated funding-history «Market» ×1",
			"truncated funding-history «Payment» ×3",
			"truncated funding-history «Position» ×3",
			"truncated mobile-trade-history-list «Direction» ×1",
			"truncated mobile-trade-history-list «Fee» ×5",
			"truncated mobile-trade-history-list «Market» ×1",
			"truncated mobile-trade-history-list «Realized PNL» ×1",
			"truncated mobile-trade-history-list «Size» ×7",
			"truncated order-history «Market» ×1",
			"truncated order-history «Size» ×1",
			"truncated order-history «Status» ×1",
			"truncated order-history «Time» ×4",
			"truncated order-history «Type» ×1",
		],
		375: [
			"clipped funding-history «Position» ×1",
			"clipped mobile-trade-history-list «Size» ×1",
			"truncated funding-history «Market» ×1",
			"truncated funding-history «Payment» ×3",
			"truncated funding-history «Position» ×3",
			"truncated mobile-trade-history-list «Direction» ×1",
			"truncated mobile-trade-history-list «Fee» ×5",
			"truncated mobile-trade-history-list «Market» ×1",
			"truncated mobile-trade-history-list «Realized PNL» ×1",
			"truncated mobile-trade-history-list «Size» ×5",
			"truncated order-history «Market» ×1",
			"truncated order-history «Time» ×4",
			"truncated order-history «Type» ×1",
		],
		393: [
			"clipped funding-history «Position» ×1",
			"clipped mobile-trade-history-list «Size» ×1",
			"truncated funding-history «Market» ×1",
			"truncated funding-history «Payment» ×3",
			"truncated funding-history «Position» ×3",
			"truncated mobile-trade-history-list «Direction» ×1",
			"truncated mobile-trade-history-list «Market» ×1",
			"truncated mobile-trade-history-list «Realized PNL» ×1",
			"truncated mobile-trade-history-list «Size» ×5",
			"truncated order-history «Market» ×1",
			"truncated order-history «Time» ×1",
		],
	},
	zh: {
		320: [
			"clipped funding-history «仓位» ×2",
			"clipped mobile-trade-history-list «数量» ×3",
			"truncated funding-history «仓位» ×3",
			"truncated funding-history «市场» ×1",
			"truncated funding-history «支付» ×3",
			"truncated mobile-trade-history-list «已实现盈亏» ×1",
			"truncated mobile-trade-history-list «市场» ×1",
			"truncated mobile-trade-history-list «手续费» ×5",
			"truncated mobile-trade-history-list «数量» ×7",
			"truncated mobile-trade-history-list «方向» ×1",
			"truncated order-history «市场» ×1",
			"truncated order-history «数量» ×1",
			"truncated order-history «时间» ×4",
			"truncated order-history «状态» ×1",
		],
		375: [
			"clipped funding-history «仓位» ×1",
			"clipped mobile-trade-history-list «数量» ×1",
			"truncated funding-history «仓位» ×3",
			"truncated funding-history «市场» ×1",
			"truncated funding-history «支付» ×3",
			"truncated mobile-trade-history-list «已实现盈亏» ×1",
			"truncated mobile-trade-history-list «市场» ×1",
			"truncated mobile-trade-history-list «手续费» ×5",
			"truncated mobile-trade-history-list «数量» ×5",
			"truncated order-history «市场» ×1",
			"truncated order-history «时间» ×4",
		],
		393: [
			"clipped funding-history «仓位» ×1",
			"clipped mobile-trade-history-list «数量» ×1",
			"truncated funding-history «仓位» ×3",
			"truncated funding-history «市场» ×1",
			"truncated funding-history «支付» ×3",
			"truncated mobile-trade-history-list «已实现盈亏» ×1",
			"truncated mobile-trade-history-list «市场» ×1",
			"truncated mobile-trade-history-list «数量» ×5",
			"truncated order-history «市场» ×1",
		],
	},
};

function summarize(findings: Awaited<ReturnType<typeof findLayoutIntegrityIssues>>) {
	const counts = new Map<string, number>();
	for (const finding of findings) {
		const [region, field] = finding.path.split(" › ");
		const key = `${finding.kind} ${region} ${field?.startsWith("«") ? field : ""}`.trim();
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts].map(([key, count]) => `${key} ×${count}`).sort();
}

for (const locale of ["en", "zh"]) {
	for (const viewport of VIEWPORTS) {
		test(`matches the pending phone history card findings at ${viewport.width}px in ${locale}`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await open(page, locale);
			await expandAll(page);
			await waitForFonts(page);
			const findings = await findLayoutIntegrityIssues(page, { root: "#root" });
			expect(summarize(findings)).toEqual([...(PENDING[locale]?.[viewport.width] ?? [])].sort());
		});
	}
}

test("names the SMALL2000 HIP-3 market with its deployer and keeps its marker whole", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 720 });
	await open(page, "en");
	const tradeHistory = page.getByTestId("trade-history");
	const market = tradeHistory.getByRole("button", { name: "Switch to SMALL2000 (xyz) market" });
	await expect(market).toBeVisible();
	await expect(market.getByText("xyz", { exact: true })).toBeVisible();
	await expect(tradeHistory).not.toContainText("xyz:SMALL2000");
	await waitForFonts(page);
	const findings = await findLayoutIntegrityIssues(page, { root: '[data-testid="trade-history"]' });
	expect(findings.filter((finding) => finding.text === "xyz")).toEqual([]);
});
