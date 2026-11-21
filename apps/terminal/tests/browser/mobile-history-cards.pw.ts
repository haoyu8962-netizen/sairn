import { expect, type Page, test } from "@playwright/test";
import { findLayoutIntegrityIssues } from "./layout-integrity";

const VIEWPORTS = [
	{ width: 320, height: 720 },
	{ width: 375, height: 812 },
	{ width: 393, height: 852 },
] as const;

async function open(page: Page, query: string) {
	await page.goto(`/mobile-history-cards.html?${query}`);
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
	await expect(page.locator('[data-testid="trade-history"] article').first()).toBeVisible();
}

async function expandAll(page: Page) {
	for (const section of ["trade-history", "order-history", "funding-history"]) {
		const expand = page.locator(`[data-testid="${section}"]`).getByRole("button", { name: /Expand all|全部展开/ });
		if (await expand.count()) await expand.first().click();
	}
}

/**
 * Cut-off text the probe found on 2026-11-21 that is not fixed yet, per locale and width, as
 * `kind region «field»`. The list must stay exact: a new finding fails, and fixing one fails until it
 * is removed here (docs/layout-integrity.md, Pending findings). The fixture's amounts are deliberately
 * large; the liquidation direction and the order status are ordinary values.
 */
const PENDING: Record<string, Record<number, readonly string[]>> = {
	en: {
		320: [
			"clipped order-history «Trigger$97,000»",
			"truncated funding-history «Payment»",
			"truncated mobile-trade-history-list «Direction»",
			"truncated mobile-trade-history-list «Fee»",
			"truncated mobile-trade-history-list «Realized PNL»",
			"truncated mobile-trade-history-list «Size»",
			"truncated order-history «Size»",
			"truncated order-history «Status»",
		],
		375: [
			"truncated funding-history «Payment»",
			"truncated mobile-trade-history-list «Direction»",
			"truncated mobile-trade-history-list «Fee»",
			"truncated mobile-trade-history-list «Realized PNL»",
		],
		393: [
			"truncated funding-history «Payment»",
			"truncated mobile-trade-history-list «Direction»",
			"truncated mobile-trade-history-list «Realized PNL»",
		],
	},
	zh: {
		320: [
			"truncated funding-history «支付»",
			"truncated mobile-trade-history-list «已实现盈亏»",
			"truncated mobile-trade-history-list «手续费»",
			"truncated mobile-trade-history-list «数量»",
			"truncated mobile-trade-history-list «方向»",
			"truncated order-history «数量»",
			"truncated order-history «状态»",
		],
		375: [
			"truncated funding-history «支付»",
			"truncated mobile-trade-history-list «已实现盈亏»",
			"truncated mobile-trade-history-list «手续费»",
		],
		393: ["truncated funding-history «支付»", "truncated mobile-trade-history-list «已实现盈亏»"],
	},
};

function summarize(findings: Awaited<ReturnType<typeof findLayoutIntegrityIssues>>) {
	return [
		...new Set(
			findings.map((finding) => {
				const [region, field] = finding.path.split(" › ");
				return `${finding.kind} ${region} ${field?.startsWith("«") ? field : ""}`.trim();
			}),
		),
	].sort();
}

for (const locale of ["en", "zh"]) {
	for (const viewport of VIEWPORTS) {
		test(`cuts off no phone history card text beyond the pending list at ${viewport.width}px in ${locale}`, async ({
			page,
		}) => {
			await page.setViewportSize(viewport);
			await open(page, `locale=${locale}`);
			await expandAll(page);
			const findings = await findLayoutIntegrityIssues(page, { root: "#root" });
			expect(summarize(findings)).toEqual([...(PENDING[locale]?.[viewport.width] ?? [])].sort());
		});
	}
}

test("names each HIP-3 market with its deployer and keeps the marker whole", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 720 });
	await open(page, "locale=en");
	const deployer = page.locator('[data-testid="trade-history"]').getByRole("button", {
		name: "Switch to SMALL2000 (xyz) market",
	});
	await expect(deployer).toBeVisible();
	await expect(deployer).toContainText("xyz");
	expect(await page.locator('[data-testid="trade-history"]').textContent()).not.toContain("xyz:SMALL2000");
});
