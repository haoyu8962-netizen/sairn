/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeHeader } from "@/components/trade/tradebox/trade-header";
import type { OrderType } from "@/config/trade";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function getMessageId(message: string, context = ""): string {
	return createHash("sha256").update(`${message}\x1f${context}`).digest("base64").slice(0, 6);
}

describe("TradeHeader desktop order-type accessibility and RTL underline", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function renderDesktopHeader(orderType: OrderType) {
		act(() => {
			root.render(
				<TradeHeader
					accountMode="unifiedAccount"
					isLeveraged
					layout="desktop"
					leverage={10}
					marginMode="cross"
					marketKind="perp"
					onOrderTypeChange={vi.fn()}
					onAccountModeClick={vi.fn()}
					onSideChange={vi.fn()}
					orderType={orderType}
					side="buy"
					sideLabels={{ buy: "Buy", sell: "Sell", buyAria: "Buy", sellAria: "Sell" }}
				/>,
			);
		});
	}

	it("positions the active order-type underline with logical start and RTL-inverted translateX", () => {
		renderDesktopHeader("twap");

		const indicator = container.querySelector<HTMLDivElement>(".h-0\\.5.w-1\\/3");
		expect(indicator).not.toBeNull();
		expect(indicator?.className).toContain("start-0");
		expect(indicator?.className).not.toContain("left-0");
		expect(indicator?.className).toContain("rtl:[--order-type-direction:-1]");
		expect(indicator?.style.transform).toBe("translateX(calc(2 * 100% * var(--order-type-direction, 1)))");
	});

	it("announces the selected advanced order type on the closed menu trigger and updates on locale switch", () => {
		renderDesktopHeader("market");
		const advancedTriggerWhenMarket = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Advanced order types"]',
		);
		expect(advancedTriggerWhenMarket?.getAttribute("aria-label")).toBe("Advanced order types");

		renderDesktopHeader("twap");
		const marketButton = container.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
		expect(marketButton).not.toBeNull();
		const advancedTriggerWhenTwap = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Advanced order types"]',
		);
		expect(advancedTriggerWhenTwap?.getAttribute("aria-label")).toBe("Advanced order types: TWAP");

		renderDesktopHeader("stopLimit");
		const advancedTriggerWhenStopLimit = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Advanced order types"]',
		);
		expect(advancedTriggerWhenStopLimit?.getAttribute("aria-label")).toBe("Advanced order types: Stop Limit");

		const zhMessages: Messages = {
			[getMessageId("Advanced order types")]: "高级订单类型",
			[getMessageId("Stop Limit")]: "止损限价",
		};
		act(() => i18n.loadAndActivate({ locale: "zh", messages: zhMessages }));
		const localizedTrigger = container.querySelector<HTMLButtonElement>('button[aria-label^="高级订单类型"]');
		expect(localizedTrigger?.getAttribute("aria-label")).toBe("高级订单类型: 止损限价");
	});
});
