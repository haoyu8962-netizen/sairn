import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MOBILE_ACCOUNT_SUBROW_CLASS } from "@/components/trade/mobile/mobile-account-subrow";
import { positionsFade, positionsTab, positionsTabs } from "@/components/trade/mobile/mobile-positions-tabs-view";

function source(file: string) {
	return readFileSync(resolve(__dirname, "../../components/trade", file), "utf8");
}

const INLINE_MOBILE_SUBROWS = ["mobile/mobile-positions-tab.tsx", "mobile/mobile-orders-tab.tsx"] as const;

const SHARED_MOBILE_SUBROWS = [
	"mobile/mobile-history-tab.tsx",
	"mobile/mobile-funding-tab.tsx",
	"mobile/mobile-orders-history-tab.tsx",
] as const;

const SUBROW_TOKENS = ["h-9", "shrink-0", "border-b", "border-market-close-stroke-card", "px-3.5"] as const;

describe("account tab second row", () => {
	it("gives every phone filter row the same height, divider and side padding", () => {
		const sharedTokens = MOBILE_ACCOUNT_SUBROW_CLASS.split(" ");
		for (const token of [...SUBROW_TOKENS, "overflow-x-auto", "overflow-y-hidden"]) {
			expect(sharedTokens, `MOBILE_ACCOUNT_SUBROW_CLASS: ${token}`).toContain(token);
		}
		for (const file of SHARED_MOBILE_SUBROWS) {
			expect(source(file), file).toContain("className={MOBILE_ACCOUNT_SUBROW_CLASS}");
		}
		for (const file of INLINE_MOBILE_SUBROWS) {
			const rows = [...source(file).matchAll(/className="(flex h-9 [^"]*)"/g)].map((match) => match[1].split(" "));
			expect(rows, file).toHaveLength(1);
			for (const token of SUBROW_TOKENS) expect(rows[0], `${file}: ${token}`).toContain(token);
		}
	});

	it("starts the TWAP sub-tabs on the text edge of the account tabs, at their weight", () => {
		expect(positionsTabs.split(" ")).toContain("ps-3.5");
		expect(positionsTab.split(" ")).toContain("px-2.5");
		expect(positionsTab.split(" ")).toContain("font-medium");

		const tabs = source("twap/twap-subview-tabs.tsx");
		expect(tabs).toContain("MOBILE_ACCOUNT_SUBROW_CLASS");
		expect(tabs).toContain(
			"h-10 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-market-close-stroke-card px-5",
		);
		expect(tabs).toMatch(/"h-full min-h-0 px-2\.5 after:inset-x-2\.5 /);
		expect(tabs).toMatch(/ px-3 py-0 text-xs font-medium [^"]*after:inset-x-3 /);
		expect(tabs).not.toContain("font-semibold");
		expect(tabs.match(/border-b border-market-close-stroke-card/g)).toHaveLength(1);

		const desktopHeader = source("positions/account-table-header-view.tsx");
		expect(desktopHeader).toMatch(/border-b border-market-close-stroke-card px-5"/);
		const desktopTab = /ACCOUNT_TAB_TRIGGER_CLASS =\s*"([^"]*)"/.exec(desktopHeader)?.[1].split(" ") ?? [];
		expect(desktopTab).toContain("px-3");
		expect(desktopTab).toContain("font-medium");
	});

	it("names an unfiltered Order History filter the same way on both layouts", () => {
		for (const file of ["positions/orders-history-tab.tsx", "mobile/mobile-orders-history-tab.tsx"]) {
			const text = source(file);
			expect(text, file).toContain('{ value: "all", label: t`Type` }');
			expect(text, file).toContain('{ value: "all", label: t`Status` }');
			expect(text, file).not.toMatch(/t`All (?:types|statuses)`/);
		}
	});

	it("forbids vertical scrolling on phone second-row strips and desktop TWAP sub-tabs", () => {
		for (const file of [
			"mobile/mobile-history-tab.tsx",
			"mobile/mobile-funding-tab.tsx",
			"mobile/mobile-orders-history-tab.tsx",
			"twap/twap-subview-tabs.tsx",
		]) {
			const text = source(file);
			expect(text, file).toContain("MOBILE_ACCOUNT_SUBROW_CLASS");
		}
		const tabs = source("twap/twap-subview-tabs.tsx");
		expect(tabs).toContain("overflow-y-hidden");
		expect(tabs).not.toContain("min-h-10");
	});

	it("uses logical inline padding and edge fade on the phone account tab strip", () => {
		const tabsTokens = positionsTabs.split(" ");
		expect(tabsTokens).toContain("pe-7");
		expect(tabsTokens).not.toContain("pr-7");
		const fadeTokens = positionsFade.split(" ");
		expect(fadeTokens).toContain("end-0");
		expect(fadeTokens).not.toContain("right-0");
		expect(fadeTokens).toContain("rtl:bg-linear-to-l");
	});
});
