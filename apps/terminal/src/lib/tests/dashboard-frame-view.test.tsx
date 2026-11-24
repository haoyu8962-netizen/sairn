/** @vitest-environment jsdom */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES, DASHBOARD_MAIN_CLASS } from "@/config/dashboard-frames";

function dom(node: ReactNode) {
	const host = document.createElement("div");
	host.innerHTML = renderToString(node);
	return host;
}

function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Expected rendered element");
	return value;
}

const routes = Object.keys(DASHBOARD_FRAMES) as (keyof typeof DASHBOARD_FRAMES)[];

function pageSource(route: keyof typeof DASHBOARD_FRAMES) {
	if (route === "legal") return { file: "legal/legal-doc-page.tsx", preset: "{...DASHBOARD_FRAMES.legal}" };
	const name = route.slice(1);
	return { file: `${name}/${name}-page.tsx`, preset: `{...DASHBOARD_FRAMES["${route}"]}` };
}

describe("dashboard frame runtime layout", () => {
	it.each([false, true])("preserves desktop offsets and mobile flow for testnet=%s", (testnet) => {
		for (const preset of Object.values(DASHBOARD_FRAMES))
			for (const mobile of [false, true]) {
				const host = dom(
					<DashboardFrameView
						{...preset}
						isMobile={mobile}
						testnet={testnet}
						bannerOffset={testnet}
						header={<header />}
						main={null}
					/>,
				);
				const frame = required(host.firstElementChild);
				expect(frame.className).toBe(
					`${preset.canvasClassName}${mobile ? "" : ` pb-8 ${testnet ? "pt-[5.5rem]" : "pt-14"}`}${testnet ? " testnet-bg" : ""}`,
				);
			}
	});

	it("preserves headerless fixtures and optional footer without header padding", () => {
		const fixture = dom(
			<DashboardFrameView {...DASHBOARD_FRAMES["/vaults"]} headerOffset={false} header={null} main={<section />} />,
		);
		expect(fixture.firstElementChild?.className).toBe(
			"min-h-dvh bg-dashboard-canvas font-sans text-fg min-[1001px]:pb-8",
		);
		expect(fixture.querySelector("header, footer")).toBeNull();
		const apiFixture = dom(
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/api-wallet"]}
				headerOffset={false}
				isMobile={false}
				testnet
				bannerOffset
				header={null}
				main={null}
			/>,
		);
		expect(apiFixture.firstElementChild?.className).toBe(
			"min-h-dvh bg-dashboard-canvas font-sans text-fg pb-8 testnet-bg",
		);
	});

	it.each(routes)("wires the %s page to its preset and preserves real chrome", (route) => {
		const { file, preset } = pageSource(route);
		const source = readFileSync(resolve(__dirname, `../../components/${file}`), "utf8");
		expect(source).toContain("<DashboardFrameView");
		expect(source).toContain(preset);
		expect(source).toContain("<DashboardHeader isMobile={isMobile} />");
		expect(source).toContain("<FooterBar />");
		expect(source).toContain("<GlobalModals");
		expect(source).toContain("isMobile={isMobile}");
		expect(source).toContain("bannerOffset={isTestnet}");
		expect(source).toContain("testnet={isTestnet}");
		expect(source).not.toMatch(/<main\b|min-h-dvh|APP_HEADER_OFFSET_CLASS|APP_HEADER_PLUS_BANNER_OFFSET_CLASS/);
	});

	it("renders the real header chrome from the shared dashboard header", () => {
		const source = readFileSync(resolve(__dirname, "../../components/dashboard/dashboard-chrome.tsx"), "utf8");
		for (const chrome of ["MobileHeader", "TopNav", "TestnetBanner"]) expect(source).toContain(`<${chrome} />`);
	});

	it.each(["dashboard-frame-view.tsx"])("keeps %s pure", (file) => {
		const source = readFileSync(resolve(__dirname, "../../components/dashboard", file), "utf8");
		expect(source).toContain("interface Props");
		expect(source).not.toMatch(
			/\buse[A-Z]|@lingui|@sairn\/ui|\/stores\/|\bwindow\b|\bdocument\b|\bDate\b|Math\.random/,
		);
	});
});

const dataRoutes = routes.filter((route) => route !== "legal");

it("gives every data dashboard page the one shared frame", () => {
	expect(DASHBOARD_MAIN_CLASS).toBe(
		"mx-auto w-full max-w-[var(--dashboard-frame-max)] px-4 py-4 min-[1001px]:px-10 min-[1001px]:py-6",
	);
	expect(dataRoutes.length).toBeGreaterThan(0);
	for (const route of dataRoutes) expect(DASHBOARD_FRAMES[route].mainClassName, route).toBe(DASHBOARD_MAIN_CLASS);

	const frames = readFileSync(resolve(__dirname, "../../config/dashboard-frames.ts"), "utf8");
	expect(frames.match(/\bmax-w-/g)).toHaveLength(2);
	expect(frames.match(/mainClassName: DASHBOARD_MAIN_CLASS,/g)).toHaveLength(dataRoutes.length);

	const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
	expect(styles.match(/--dashboard-frame-max:/g)).toHaveLength(1);
	expect(styles).not.toMatch(/--(?:earn|staking|api-wallet)-frame(?:-wide)?-max\b/);
});

it("keeps the legal pages a reading column with its own gutter", () => {
	expect(DASHBOARD_FRAMES.legal).toEqual({
		canvasClassName: "min-h-dvh bg-background font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-3xl px-5 py-8 min-[1001px]:py-12",
	});
});

it("never rounds a page surface only on desktop", () => {
	const components = resolve(__dirname, "../../components");
	for (const route of dataRoutes) {
		const dir = resolve(components, route.slice(1));
		for (const name of readdirSync(dir).filter((file) => file.endsWith(".tsx"))) {
			const source = readFileSync(resolve(dir, name), "utf8");
			expect(source, name).not.toMatch(/!isMobile && "[^"]*\brounded-/);
			expect(source, name).not.toMatch(/isMobile \? "[^"]*"\s*:\s*"[^"]*\brounded-24\b/);
		}
	}
});

it("gives every page title the same size", () => {
	const titles = {
		"portfolio/portfolio-page.tsx": 1,
		"earn/earn-view.tsx": 1,
		"vaults/vaults-list.tsx": 1,
		"vaults/vault-detail-view.tsx": 1,
		"staking/staking-view.tsx": 1,
		"referrals/referral-dashboard.tsx": 1,
		"leaderboard/leaderboard-view.tsx": 1,
		"funding-comparison/funding-comparison-view.tsx": 1,
		"funding-history/funding-history-page.tsx": 1,
		"historical-orders/historical-orders-page.tsx": 1,
		"trade-history/trade-history-page.tsx": 1,
		"api-wallet/api-wallet-view.tsx": 1,
	} as const;
	for (const [file, count] of Object.entries(titles)) {
		const source = readFileSync(resolve(__dirname, "../../components", file), "utf8");
		const headings = [...source.matchAll(/<h1\b[^>]*?className=(?:"([^"]*)"|\{([^}]*)\})/g)].map(
			(match) => match[1] ?? match[2] ?? "",
		);
		expect(headings, file).toHaveLength(count);
		for (const heading of headings) {
			expect(heading.match(/\btext-(?:3xs|2xs|xs|2sm|sm|base|lg|xl|2xl|3xl)\b/g), file).toEqual(["text-xl"]);
			expect(heading, file).toMatch(/\bfont-bold\b/);
			expect(heading, file).not.toMatch(/isMobile/);
		}
	}
});
