/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PositionCloseSummary } from "@/components/trade/positions/position-close-summary";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("PositionCloseSummary", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("wraps long labels and values instead of truncating confirmation figures", () => {
		act(() =>
			root.render(
				<PositionCloseSummary
					testId="close-summary"
					ariaLabel="Position summary"
					items={[
						{ key: "available", label: "Disponible pour fermer", value: "12,345.6789 LONGTOKEN" },
						{ key: "entry", label: "Prix d'entrée", value: "$123,456.78" },
						{ key: "mark", label: "Prix de référence", value: "$124,567.89" },
						{ key: "pnl", label: "PnL estimé", value: "+$987,654.32", emphasized: true },
					]}
				/>,
			),
		);

		const section = container.querySelector<HTMLElement>('[data-testid="close-summary"]');
		const rowContainer = section?.firstElementChild;
		expect(rowContainer?.className).toContain("flex-wrap");
		expect(rowContainer?.className).toContain("justify-between");

		const spans = [...(section?.querySelectorAll("span") ?? [])];
		expect(spans).toHaveLength(8);
		for (const span of spans) {
			expect(span.className).not.toMatch(/\btruncate\b/);
			expect(span.className).toContain("[overflow-wrap:anywhere]");
		}
	});
});
