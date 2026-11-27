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

for (const locale of ["en", "zh"]) {
	for (const viewport of VIEWPORTS) {
		test(`keeps all phone history cards whole at ${viewport.width}px in ${locale}`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await open(page, locale);
			await expandAll(page);
			await waitForFonts(page);
			const findings = await findLayoutIntegrityIssues(page, { root: "#root" });
			expect(findings).toEqual([]);
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
