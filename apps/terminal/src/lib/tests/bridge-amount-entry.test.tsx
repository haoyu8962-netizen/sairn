// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmountEntryScreen } from "@/components/trade/tradebox/bridge/amount-entry-screen";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { createI18nRoot } from "./harness/react";

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function createToken(overrides: Partial<BridgeToken> = {}): BridgeToken {
	return {
		chainId: 42161,
		address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
		symbol: "USDC",
		name: "USD Coin",
		decimals: 6,
		logoURI: undefined,
		priceUSD: "1",
		amount: "10006000",
		amountUSD: 10.006,
		chainName: "Arbitrum",
		chainLogoURI: undefined,
		isDust: false,
		...overrides,
	};
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
	if (!button) throw new Error(`Missing button: ${label}`);
	return button;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Bridge AmountEntryScreen", () => {
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
		vi.clearAllMocks();
	});

	it("floors Max and percentage shortcuts to two decimal places so the filled amount stays submittable", () => {
		const onContinue = vi.fn();
		act(() =>
			root.render(
				<AmountEntryScreen
					token={createToken({ amountUSD: 10.006 })}
					initialUsd=""
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			),
		);

		const input = container.querySelector<HTMLInputElement>("input");
		expect(input).not.toBeNull();

		act(() => findButton(container, "Max").click());
		expect(input?.value).toBe("10.00");
		expect(findButton(container, "Continue").disabled).toBe(false);

		act(() => findButton(container, "Continue").click());
		expect(onContinue).toHaveBeenCalledWith("10.006000", "10.00");

		act(() =>
			root.render(
				<AmountEntryScreen
					token={createToken({ amount: "10010000", amountUSD: 10.01 })}
					initialUsd=""
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			),
		);
		act(() => findButton(container, "50%").click());
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("5.00");
		act(() => findButton(container, "75%").click());
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("7.50");
	});

	it("gives the USD input a localized accessible name and visible keyboard focus style", () => {
		act(() =>
			root.render(<AmountEntryScreen token={createToken()} initialUsd="" onBack={vi.fn()} onContinue={vi.fn()} />),
		);

		const input = container.querySelector<HTMLInputElement>("input");
		expect(input?.getAttribute("aria-label")).toBe("Amount in USD");
		expect(input?.className).toContain("focus-visible:border-stroke-focus");
		expect(input?.className).toContain("focus-visible:ring-2");
		expect(input?.className).not.toContain("border-none");

		act(() => {
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[messageId("Amount in USD")]: "美元金额",
				},
			});
		});
		expect(input?.getAttribute("aria-label")).toBe("美元金额");
	});

	it("gives Back, percentage and Max controls shared press feedback and mobile touch targets", () => {
		act(() =>
			root.render(<AmountEntryScreen token={createToken()} initialUsd="" onBack={vi.fn()} onContinue={vi.fn()} />),
		);

		for (const label of ["Back", "25%", "50%", "75%", "Max"]) {
			const control = findButton(container, label);
			expect(control.className, label).toContain("active:not-data-disabled:scale-[0.97]");
			expect(control.className, label).toContain("active:bg-fill-press");
			expect(control.className, label).toContain("max-[1000px]:min-h-11");
		}
	});

	it("computes Max and validation from exact atomic token balance rather than floating-point amountUSD", () => {
		const onContinue = vi.fn();
		const nearTenToken = createToken({
			symbol: "DAI",
			name: "Dai Stablecoin",
			decimals: 18,
			priceUSD: "1",
			amount: "9999999999999999999",
			amountUSD: 10,
		});
		act(() =>
			root.render(<AmountEntryScreen token={nearTenToken} initialUsd="" onBack={vi.fn()} onContinue={onContinue} />),
		);

		const input = container.querySelector<HTMLInputElement>("input");
		expect(input).not.toBeNull();

		act(() => findButton(container, "Max").click());
		expect(input?.value).toBe("9.99");
		expect(findButton(container, "Continue").disabled).toBe(false);

		act(() => findButton(container, "Continue").click());
		expect(onContinue).toHaveBeenCalledWith("9.999999999999999999", "9.99");

		onContinue.mockReset();
		act(() => {
			root.render(
				<AmountEntryScreen
					key="typed-over-max"
					token={nearTenToken}
					initialUsd="10.00"
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			);
		});
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("10.00");
		expect(findButton(container, "Continue").disabled).toBe(true);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).not.toHaveBeenCalled();
	});

	it("disables Continue when a shortcut floors to zero atomic tokens on an indivisible asset", () => {
		const onContinue = vi.fn();
		const indivisibleToken = createToken({
			symbol: "WHOLE",
			name: "Whole Token",
			decimals: 0,
			priceUSD: "2",
			amount: "1",
			amountUSD: 2,
		});
		act(() =>
			root.render(
				<AmountEntryScreen token={indivisibleToken} initialUsd="" onBack={vi.fn()} onContinue={onContinue} />,
			),
		);

		for (const label of ["25%", "50%", "75%"]) {
			act(() => findButton(container, label).click());
			expect(findButton(container, "Continue").disabled, label).toBe(true);
			act(() => findButton(container, "Continue").click());
			expect(onContinue, label).not.toHaveBeenCalled();
		}

		act(() => findButton(container, "Max").click());
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("2.00");
		expect(findButton(container, "Continue").disabled).toBe(false);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).toHaveBeenCalledWith("1", "2.00");

		onContinue.mockReset();
		act(() =>
			root.render(
				<AmountEntryScreen
					key="over-usd-indivisible"
					token={indivisibleToken}
					initialUsd="2.50"
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			),
		);
		expect(findButton(container, "Continue").disabled).toBe(true);
	});

	it("preserves the exact atomic balance on explicit Max for an indivisible asset priced with fractional cents and clears Max on manual edit", () => {
		const onContinue = vi.fn();
		const fractionalCentWhole = createToken({
			symbol: "WHOLE",
			name: "Whole Token",
			decimals: 0,
			priceUSD: "2.004",
			amount: "1",
			amountUSD: 2.004,
		});
		act(() =>
			root.render(
				<AmountEntryScreen token={fractionalCentWhole} initialUsd="" onBack={vi.fn()} onContinue={onContinue} />,
			),
		);

		const input = container.querySelector<HTMLInputElement>("input");
		expect(input).not.toBeNull();

		act(() => findButton(container, "Max").click());
		expect(input?.value).toBe("2.00");
		expect(findButton(container, "Continue").disabled).toBe(false);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).toHaveBeenCalledWith("1", "2.00");

		onContinue.mockReset();
		act(() => {
			i18n.loadAndActivate({ locale: "zh", messages: {} });
		});
		expect(input?.value).toBe("2.00");
		expect(findButton(container, "Continue").disabled).toBe(false);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).toHaveBeenCalledWith("1", "2.00");

		onContinue.mockReset();
		act(() => {
			if (input) setInputValue(input, "2.0");
		});
		expect(findButton(container, "Continue").disabled).toBe(true);
		act(() => {
			if (input) setInputValue(input, "2.00");
		});
		expect(input?.value).toBe("2.00");
		expect(findButton(container, "Continue").disabled).toBe(true);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).not.toHaveBeenCalled();

		act(() => {
			if (input) setInputValue(input, "2.01");
		});
		expect(findButton(container, "Continue").disabled).toBe(true);

		act(() => findButton(container, "Max").click());
		expect(findButton(container, "Continue").disabled).toBe(false);

		act(() => findButton(container, "50%").click());
		expect(input?.value).toBe("1.00");
		expect(findButton(container, "Continue").disabled).toBe(true);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).not.toHaveBeenCalled();

		act(() => findButton(container, "Max").click());
		expect(findButton(container, "Continue").disabled).toBe(false);
		act(() =>
			root.render(
				<AmountEntryScreen
					token={createToken({
						symbol: "WHOLE",
						name: "Whole Token",
						decimals: 0,
						priceUSD: "2.004",
						amount: "2",
						amountUSD: 4.008,
					})}
					initialUsd=""
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			),
		);
		expect(findButton(container, "Continue").disabled).toBe(true);
	});

	it("rejects zero balance or zero price on Max, allows tiny positive Max, and rounds down accurately past 20 decimals", () => {
		const onContinue = vi.fn();
		act(() =>
			root.render(
				<AmountEntryScreen
					token={createToken({ amount: "0", amountUSD: 0 })}
					initialUsd=""
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			),
		);
		act(() => findButton(container, "Max").click());
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("0.00");
		expect(findButton(container, "Continue").disabled).toBe(true);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).not.toHaveBeenCalled();

		act(() =>
			root.render(
				<AmountEntryScreen
					key="zero-price"
					token={createToken({ priceUSD: "0", amountUSD: 0 })}
					initialUsd=""
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			),
		);
		act(() => findButton(container, "Max").click());
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("0.00");
		expect(findButton(container, "Continue").disabled).toBe(true);

		const tinyPositive = createToken({
			symbol: "ETH",
			decimals: 18,
			priceUSD: "1",
			amount: "1",
			amountUSD: 1e-18,
		});
		act(() =>
			root.render(
				<AmountEntryScreen
					key="tiny-positive"
					token={tinyPositive}
					initialUsd=""
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			),
		);
		act(() => findButton(container, "Max").click());
		const tinyInput = container.querySelector<HTMLInputElement>("input");
		expect(tinyInput?.value).toBe("0.00");
		expect(findButton(container, "Continue").disabled).toBe(false);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).toHaveBeenCalledWith("0.000000000000000001", "0.00");

		onContinue.mockReset();
		act(() => {
			if (tinyInput) setInputValue(tinyInput, "0.01");
		});
		expect(findButton(container, "Continue").disabled).toBe(true);
		act(() => {
			if (tinyInput) setInputValue(tinyInput, "0.00");
		});
		expect(findButton(container, "Continue").disabled).toBe(true);

		const highPrecisionToken = createToken({
			symbol: "PREC",
			decimals: 0,
			priceUSD: "1.000000000000000000000001",
			amount: "2",
			amountUSD: 2,
		});
		act(() =>
			root.render(
				<AmountEntryScreen
					key="high-precision"
					token={highPrecisionToken}
					initialUsd="2.00"
					onBack={vi.fn()}
					onContinue={onContinue}
				/>,
			),
		);
		expect(findButton(container, "Continue").disabled).toBe(false);
		act(() => findButton(container, "Continue").click());
		expect(onContinue).toHaveBeenCalledWith("1", "2.00");

		onContinue.mockReset();
		act(() => findButton(container, "Max").click());
		expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("2.00");
		act(() => findButton(container, "Continue").click());
		expect(onContinue).toHaveBeenCalledWith("2", "2.00");
	});
});
