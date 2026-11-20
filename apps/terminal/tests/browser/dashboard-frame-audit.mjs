import { chromium } from "@playwright/test";

// Rendered frame of every data dashboard page: side gutter, top padding, content width, title size.
// Exits 1 when the pages differ at any width. Headless Chromium against a running dev server; it
// reads only the states a page reaches without a wallet.
// Usage: node apps/terminal/tests/browser/dashboard-frame-audit.mjs [origin] [address]
const origin = (process.argv[2] ?? "http://localhost:3005").replace(/\/+$/, "");
const address = process.argv[3] ?? "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";

const ROUTES = [
	"/portfolio",
	"/earn",
	"/vaults",
	`/vaults/${address}`,
	"/staking",
	"/referrals",
	"/leaderboard",
	"/fundingComparison",
	`/fundingHistory/${address}`,
	`/historicalOrders/${address}`,
	`/tradeHistory/${address}`,
	"/api-wallet",
];
const VIEWPORTS = [
	[1720, 1000],
	[1440, 900],
	[1266, 800],
	[1100, 800],
	[375, 812],
];

function measure() {
	const main = document.querySelector("main");
	if (!main) return null;
	const mainBox = main.getBoundingClientRect();
	const style = getComputedStyle(main);
	const painted = [...main.querySelectorAll("*")].filter((element) => {
		const box = element.getBoundingClientRect();
		return getComputedStyle(element).backgroundColor !== "rgba(0, 0, 0, 0)" && box.width > mainBox.width * 0.6;
	});
	const surfaces = painted.filter((element) => !painted.some((other) => other !== element && other.contains(element)));
	const title = main.querySelector("h1");
	return {
		gutter: Number.parseFloat(style.paddingLeft),
		top: Number.parseFloat(style.paddingTop),
		content: Math.round(mainBox.width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)),
		surfaceWidths: [...new Set(surfaces.map((element) => Math.round(element.getBoundingClientRect().width)))].join(","),
		surfaceLeft: surfaces[0] ? Math.round(surfaces[0].getBoundingClientRect().left) : null,
		radius: surfaces[0] ? getComputedStyle(surfaces[0]).borderRadius : null,
		title: title ? getComputedStyle(title).fontSize : null,
		overflow: document.documentElement.scrollWidth - window.innerWidth,
	};
}

const browser = await chromium.launch();
let mismatches = 0;
for (const [width, height] of VIEWPORTS) {
	const page = await browser.newPage({ viewport: { width, height } });
	const seen = new Map();
	for (const route of ROUTES) {
		await page.goto(origin + route, { waitUntil: "domcontentloaded" });
		await page
			.waitForFunction(() => document.querySelector("main h1") && !document.querySelector('[aria-busy="true"]'), null, {
				timeout: 20_000,
			})
			.catch(() => {});
		await page.waitForTimeout(800);
		const reading = await page.evaluate(measure);
		console.log(String(width).padEnd(5), route.replace(address, "<address>").padEnd(28), JSON.stringify(reading));
		if (reading) seen.set(route, `${reading.gutter}/${reading.top}/${reading.content}/${reading.title}/${reading.overflow > 0}`);
	}
	const distinct = new Set(seen.values());
	if (distinct.size > 1 || seen.size !== ROUTES.length) {
		mismatches += 1;
		console.log(`MISMATCH at ${width}px: ${[...distinct].join(" | ")} (${seen.size}/${ROUTES.length} routes read)`);
	}
	await page.close();
}
await browser.close();
process.exit(mismatches > 0 ? 1 : 0);
