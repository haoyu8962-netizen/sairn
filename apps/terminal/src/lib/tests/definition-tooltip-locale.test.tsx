// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefinitionTooltip } from "@/components/ui/definition-tooltip";
import { createI18nRoot } from "./harness/react";

vi.mock("@sairn/ui", () => ({
	Tooltip: ({ children, content }: { children: ReactNode; content: ReactNode }) =>
		createElement("div", null, createElement("div", { "data-testid": "tooltip-content" }, content), children),
}));

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const ONLY = ["Gtc", "Alo"] as const;

describe("DefinitionTooltip", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		i18n.load("zh", {
			[messageId("Time In Force")]: "订单有效期",
			[messageId("GTC (Good Til Cancel)")]: "GTC（撤销前有效）",
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.activate("en");
	});

	it("follows a language switch without remounting its trigger", () => {
		act(() =>
			root.render(
				<DefinitionTooltip topic="tif" only={ONLY}>
					<button type="button">TIF</button>
				</DefinitionTooltip>,
			),
		);
		const trigger = container.querySelector("button");
		const content = () => container.querySelector('[data-testid="tooltip-content"]')?.textContent ?? "";
		expect(content()).toContain("Time In Force");
		expect(content()).not.toContain("IOC");

		act(() => i18n.activate("zh"));
		expect(content()).toContain("订单有效期");
		expect(content()).toContain("GTC（撤销前有效）");
		expect(container.querySelector("button")).toBe(trigger);

		act(() => i18n.activate("en"));
		expect(content()).toContain("Time In Force");
	});
});
