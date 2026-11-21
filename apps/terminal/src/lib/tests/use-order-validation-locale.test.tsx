// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { perpInput, spotInput, useOrderValidation } from "@/lib/trade/use-order-validation";
import { createI18nRoot } from "./harness/react";

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const BASE_INPUT = {
	assetId: 0,
	szDecimals: 2,
	isConnected: true,
	isWalletLoading: false,
	availableBalance: 1_000,
	hasMarket: true,
	hasAssetIndex: true,
	markPriceStatus: "success",
	requiresLiveMarkPrice: false,
	needsAgentApproval: false,
	isReadyToTrade: true,
	price: 100,
	sizeValue: 0,
	orderValue: 0,
	side: "buy",
	usesLimitPrice: true,
	usesTriggerPrice: false,
	limitPriceInput: "100",
	triggerPriceInput: "",
	triggerPriceNum: null,
	formatDecimalString: (value) => value,
	scaleOrder: false,
	twapOrder: false,
	scaleStartPriceNum: null,
	scaleEndPriceNum: null,
	scaleLevelsNum: null,
	scaleSkewNum: null,
	twapMinutesNum: null,
	twapTriggerPriceNum: null,
	twapStopPriceNum: null,
	twapPricesEnabled: false,
	twapTriggerPriceInput: "",
	twapStopPriceInput: "",
} satisfies Parameters<typeof perpInput>[0];

const PERP_INPUT = perpInput(BASE_INPUT, {
	orderType: "limit",
	markPx: 100,
	maxSize: 100,
	stopOrder: false,
	takeProfitOrder: false,
	positionSize: null,
	reduceOnly: false,
	openInterestCapped: false,
	tpSlEnabled: false,
	canUseTpSl: false,
	tpSlReturnInvalid: false,
	tpPriceNum: null,
	slPriceNum: null,
});

const SPOT_INPUT = spotInput(BASE_INPUT, {
	markPx: 100,
	baseAvailable: 10,
	quoteAvailable: 1_000,
	baseToken: "HYPE",
	quoteToken: "USDC",
});

function ValidationProbe({ spot }: { spot: boolean }) {
	const validation = useOrderValidation(spot ? SPOT_INPUT : PERP_INPUT);
	return createElement("output", null, validation.errors.join("|"));
}

describe("useOrderValidation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		i18n.load("zh", { [messageId("Enter size")]: "请输入数量" });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.activate("en");
	});

	it.each([false, true])(
		"re-translates validation messages after a language switch while the draft stays unchanged (spot: %s)",
		(spot) => {
			act(() => root.render(createElement(ValidationProbe, { spot })));
			expect(container.textContent).toContain("Enter size");

			act(() => i18n.activate("zh"));
			expect(container.textContent).toContain("请输入数量");
			expect(container.textContent).not.toContain("Enter size");

			act(() => i18n.activate("en"));
			expect(container.textContent).toContain("Enter size");
		},
	);
});
