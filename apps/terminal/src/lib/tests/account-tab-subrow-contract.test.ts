import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { positionsTab, positionsTabs } from "@/components/trade/mobile/mobile-positions-tabs-view";

function source(file: string) {
	return readFileSync(resolve(__dirname, "../../components/trade", file), "utf8");
}

const MOBILE_SUBROWS = [
	"mobile/mobile-positions-tab.tsx",
	"mobile/mobile-orders-tab.tsx",
	"mobile/mobile-history-tab.tsx",
	"mobile/mobile-funding-tab.tsx",
	"mobile/mobile-orders-history-tab.tsx",
] as const;

const SUBROW_TOKENS = ["h-9", "shrink-0", "border-b", "border-market-close-stroke-card", "px-3.5"] as const;

describe("account tab second row", () => {
	it("gives every phone filter row the same height, divider and side padding", () => {
		for (const file of MOBILE_SUBROWS) {
			const rows = [...source(file).matchAll(/className="(flex h-9 [^"]*)"/g)].map((match) => match[1].split(" "));
			expect(rows, file).toHaveLength(1);
			for (const token of SUBROW_TOKENS) expect(rows[0], `${file}: ${token}`).toContain(token);
		}
	});

	it("starts the TWAP sub-tabs on the text edge of the account tabs, at their weight", () => {
		expect(positionsTabs.split(" ")).toContain("px-3.5");
		expect(positionsTab.split(" ")).toContain("px-2.5");
		expect(positionsTab.split(" ")).toContain("font-medium");

		const tabs = source("twap/twap-subview-tabs.tsx");
		expect(tabs).toContain('mobile ? "h-9 px-3.5" : "h-10 px-5"');
		expect(tabs).toMatch(/"h-9 min-h-0 px-2\.5 after:inset-x-2\.5 /);
		expect(tabs).toMatch(/ px-3 text-xs font-medium [^"]*after:inset-x-3 /);
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
});
