// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmationScreen } from "@/components/trade/tradebox/bridge/confirmation-screen";
import { PoweredByLiFi } from "@/components/trade/tradebox/bridge/shared-ui";
import { formatDuration } from "@/lib/format";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import type { BridgeQuote } from "@/lib/lifi/use-quote";

const testState = vi.hoisted(() => ({
	query: {} as Record<string, unknown>,
	lastQuoteParams: null as unknown,
}));

vi.mock("@/lib/lifi/use-quote", async () => {
	const actual = await vi.importActual<typeof import("@/lib/lifi/use-quote")>("@/lib/lifi/use-quote");
	return {
		...actual,
		useBridgeQuote: (params: unknown) => {
			testState.lastQuoteParams = params;
			return testState.query;
		},
	};
});

const TOKEN: BridgeToken = {
	chainId: 42161,
	address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
	symbol: "USDC",
	name: "USD Coin",
	decimals: 6,
	logoURI: undefined,
	priceUSD: "1",
	amount: "10000000",
	amountUSD: 10,
	chainName: "Arbitrum",
	chainLogoURI: undefined,
	isDust: false,
};

function createQuote(overrides: Partial<BridgeQuote> = {}): BridgeQuote {
	return {
		step: {} as BridgeQuote["step"],
		fromAmount: "1000000",
		fromAmountUSD: "1",
		toAmount: "997500",
		toAmountMin: "992512",
		toAmountUSD: "0.9965",
		executionDuration: 30,
		gasCosts: [],
		feeCosts: [],
		totalFeesUSD: "0.01",
		...overrides,
	};
}

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
	if (!button) throw new Error(`Missing button: ${label}`);
	return button;
}

describe("bridge quote confirmation", () => {
	let container: HTMLDivElement;
	let root: Root;
	const onConfirm = vi.fn();

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		onConfirm.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render(query: Record<string, unknown>) {
		testState.query = query;
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={TOKEN}
						tokenAmount="1"
						address={TOKEN.address}
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});
	}

	it("refreshes an expired quote without executing it", async () => {
		const quote = createQuote();
		const refreshedAt = Date.now();
		const refetch = vi.fn().mockResolvedValue({ isError: false, data: quote, dataUpdatedAt: refreshedAt });
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt - 31_000,
			refetch,
		});

		await act(async () => findButton(container, "Refresh quote").click());

		expect(refetch).toHaveBeenCalledOnce();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("executes the exact freshly fetched quote when terms did not worsen", async () => {
		const quote = createQuote();
		const refreshedQuote = createQuote({ toAmount: "998000", toAmountMin: "993000" });
		const refreshedAt = Date.now();
		const refetch = vi.fn().mockResolvedValue({ isError: false, data: refreshedQuote, dataUpdatedAt: refreshedAt });
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt,
			refetch,
		});

		await act(async () => findButton(container, "Confirm").click());

		expect(onConfirm).toHaveBeenCalledWith(refreshedQuote);
	});

	it("requires another review when refreshed terms are worse", async () => {
		const quote = createQuote();
		const worseQuote = createQuote({ toAmountMin: "900000" });
		const refreshedAt = Date.now();
		const refetch = vi.fn().mockResolvedValue({ isError: false, data: worseQuote, dataUpdatedAt: refreshedAt + 1 });
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt,
			refetch,
		});

		await act(async () => findButton(container, "Confirm").click());

		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("names the quote countdown and the LI.FI credit in the language that is currently active", () => {
		const quote = createQuote();
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: Date.now(),
			refetch: vi.fn(),
		});
		const countdown = () => container.querySelector('svg[role="img"][aria-label]:not([aria-label="LI.FI"])');
		expect(countdown()?.getAttribute("aria-label")).toBe("Quote countdown");

		act(() => {
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[messageId("Quote countdown")]: "报价倒计时",
					[messageId("Powered by <0/>")]: "由 <0/> 提供支持",
				},
			});
		});
		expect(countdown()?.getAttribute("aria-label")).toBe("报价倒计时");

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<PoweredByLiFi />
				</I18nProvider>,
			);
		});
		const credit = container.querySelector('a[href="https://li.fi"]');
		expect(credit?.textContent?.replace(/\s+/g, " ").trim()).toBe("由 提供支持");
		expect(credit?.querySelector('svg[aria-label="LI.FI"]')).not.toBeNull();
	});

	it("does not execute a stale confirmation when the user goes back before quote refresh finishes", async () => {
		const quote = createQuote();
		const refreshedQuote = createQuote({ toAmount: "998000", toAmountMin: "993000" });
		let resolveRefetch!: (value: { isError: false; data: BridgeQuote; dataUpdatedAt: number }) => void;
		const refetch = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((resolve) => {
					resolveRefetch = resolve;
				}),
		);
		const onBack = vi.fn();
		const refreshedAt = Date.now();
		testState.query = {
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt,
			refetch,
		};
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={TOKEN}
						tokenAmount="1"
						address={TOKEN.address}
						onBack={onBack}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});

		act(() => findButton(container, "Confirm").click());
		expect(refetch).toHaveBeenCalledOnce();
		act(() => findButton(container, "Back").click());
		expect(onBack).toHaveBeenCalledOnce();

		await act(async () => {
			resolveRefetch({ isError: false, data: refreshedQuote, dataUpdatedAt: refreshedAt + 1 });
			await Promise.resolve();
		});

		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("does not execute a stale confirmation when unmounted before quote refresh finishes", async () => {
		const quote = createQuote();
		const refreshedQuote = createQuote({ toAmount: "998000", toAmountMin: "993000" });
		let resolveRefetch!: (value: { isError: false; data: BridgeQuote; dataUpdatedAt: number }) => void;
		const refetch = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((resolve) => {
					resolveRefetch = resolve;
				}),
		);
		const refreshedAt = Date.now();
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt,
			refetch,
		});

		act(() => findButton(container, "Confirm").click());
		act(() => root.render(null));

		await act(async () => {
			resolveRefetch({ isError: false, data: refreshedQuote, dataUpdatedAt: refreshedAt + 1 });
			await Promise.resolve();
		});

		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("announces quote updates and refresh failures in a pre-mounted polite live region linked to Confirm", async () => {
		const quote = createQuote();
		const worseQuote = createQuote({ toAmountMin: "900000" });
		const refreshedAt = Date.now();
		const refetch = vi
			.fn()
			.mockImplementationOnce(async () => {
				testState.query = { ...testState.query, data: worseQuote, dataUpdatedAt: refreshedAt + 1 };
				return { isError: false, data: worseQuote, dataUpdatedAt: refreshedAt + 1 };
			})
			.mockResolvedValueOnce({ isError: true, data: undefined, dataUpdatedAt: refreshedAt + 1 });
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt,
			refetch,
		});

		const liveRegion = container.querySelector('[aria-live="polite"]');
		expect(liveRegion).not.toBeNull();
		expect(liveRegion?.id).toBeTruthy();
		expect(liveRegion?.querySelector('svg[aria-label="Quote countdown"]')).toBeNull();
		expect(findButton(container, "Confirm").getAttribute("aria-describedby")).toBeNull();

		await act(async () => findButton(container, "Confirm").click());
		expect(liveRegion?.textContent).toContain("Quote updated. Review the new amount before confirming.");
		expect(findButton(container, "Confirm").getAttribute("aria-describedby")).toBe(liveRegion?.id);

		await act(async () => findButton(container, "Confirm").click());
		expect(liveRegion?.textContent).toContain("Quote refresh failed. Try again before confirming.");
		expect(findButton(container, "Confirm").getAttribute("aria-describedby")).toBe(liveRegion?.id);
	});

	it("gives the Back button shared press feedback and a mobile touch target", () => {
		const quote = createQuote();
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: Date.now(),
			refetch: vi.fn(),
		});
		const back = findButton(container, "Back");
		expect(back.className).toContain("active:not-data-disabled:scale-[0.97]");
		expect(back.className).toContain("active:bg-fill-press");
		expect(back.className).toContain("max-[1000px]:min-h-11");
	});

	it("updates the estimated duration when the active language changes", () => {
		const quote = createQuote({ executionDuration: 120 });
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: Date.now(),
			refetch: vi.fn(),
		});
		const enDuration = formatDuration(2, { locale: "en" });
		const zhDuration = formatDuration(2, { locale: "zh" });
		expect(zhDuration).not.toBe(enDuration);
		expect(container.textContent).toContain(`~${enDuration}`);

		act(() => {
			i18n.loadAndActivate({ locale: "zh", messages: {} });
		});

		expect(container.textContent).toContain(`~${zhDuration}`);
		expect(container.textContent).not.toContain(`~${enDuration}`);
	});

	it("discards in-flight confirmation and clears confirming state when parameters change on the same mount", async () => {
		const quoteA = createQuote({ fromAmount: "1000000", toAmount: "997500", toAmountMin: "992512" });
		const quoteB = createQuote({ fromAmount: "2000000", toAmount: "1995000", toAmountMin: "1985000" });
		const refreshedQuoteA = createQuote({ fromAmount: "1000000", toAmount: "998000", toAmountMin: "993000" });
		const refreshedQuoteB = createQuote({ fromAmount: "2000000", toAmount: "1996000", toAmountMin: "1986000" });
		let resolveRefetchA!: (value: { isError: false; data: BridgeQuote; dataUpdatedAt: number }) => void;
		const refetchA = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((resolve) => {
					resolveRefetchA = resolve;
				}),
		);
		const now = Date.now();
		const refetchB = vi.fn().mockResolvedValue({ isError: false, data: refreshedQuoteB, dataUpdatedAt: now + 2 });

		testState.query = {
			data: quoteA,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now,
			refetch: refetchA,
		};
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={TOKEN}
						tokenAmount="1"
						address="0x1111111111111111111111111111111111111111"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});

		act(() => findButton(container, "Confirm").click());
		expect(refetchA).toHaveBeenCalledOnce();
		expect(findButton(container, "Preparing your quote...").disabled).toBe(true);

		testState.query = {
			data: quoteB,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now + 1,
			refetch: refetchB,
		};
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={TOKEN}
						tokenAmount="2"
						address="0x2222222222222222222222222222222222222222"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});

		const confirmB = findButton(container, "Confirm");
		expect(confirmB.disabled).toBe(false);

		await act(async () => {
			resolveRefetchA({ isError: false, data: refreshedQuoteA, dataUpdatedAt: now + 1 });
			await Promise.resolve();
		});
		expect(onConfirm).not.toHaveBeenCalled();

		await act(async () => findButton(container, "Confirm").click());
		expect(refetchB).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledWith(refreshedQuoteB);
	});

	it("remains confirmable when parameters switch A -> B -> A while A's first refresh is still in flight", async () => {
		const quoteA = createQuote({ fromAmount: "1000000", toAmount: "997500", toAmountMin: "992512" });
		const quoteB = createQuote({ fromAmount: "2000000", toAmount: "1995000", toAmountMin: "1985000" });
		const refreshedQuoteA1 = createQuote({ fromAmount: "1000000", toAmount: "997900", toAmountMin: "992900" });
		const refreshedQuoteA2 = createQuote({ fromAmount: "1000000", toAmount: "998100", toAmountMin: "993100" });
		let resolveRefetchA1!: (value: { isError: false; data: BridgeQuote; dataUpdatedAt: number }) => void;
		const refetchA1 = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((resolve) => {
					resolveRefetchA1 = resolve;
				}),
		);
		const now = Date.now();
		const refetchA2 = vi.fn().mockResolvedValue({ isError: false, data: refreshedQuoteA2, dataUpdatedAt: now + 3 });

		testState.query = {
			data: quoteA,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now,
			refetch: refetchA1,
		};
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={TOKEN}
						tokenAmount="1"
						address="0x1111111111111111111111111111111111111111"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});

		act(() => findButton(container, "Confirm").click());
		expect(findButton(container, "Preparing your quote...").disabled).toBe(true);

		testState.query = {
			data: quoteB,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now + 1,
			refetch: vi.fn(),
		};
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={TOKEN}
						tokenAmount="2"
						address="0x1111111111111111111111111111111111111111"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});

		testState.query = {
			data: quoteA,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now + 2,
			refetch: refetchA2,
		};
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={TOKEN}
						tokenAmount="1"
						address="0x1111111111111111111111111111111111111111"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});

		expect(findButton(container, "Confirm").disabled).toBe(false);

		await act(async () => {
			resolveRefetchA1({ isError: false, data: refreshedQuoteA1, dataUpdatedAt: now + 1 });
			await Promise.resolve();
		});
		expect(onConfirm).not.toHaveBeenCalled();

		await act(async () => findButton(container, "Confirm").click());
		expect(refetchA2).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledWith(refreshedQuoteA2);
	});

	it("gives the Transaction breakdown collapsible trigger shared touch press feedback", () => {
		const quote = createQuote();
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: Date.now(),
			refetch: vi.fn(),
		});

		const trigger = findButton(container, "Transaction breakdown");
		expect(trigger.className).toContain("active:bg-fill-weak");
		expect(trigger.className).toContain("duration-[120ms]");
	});

	it("keeps a newer A -> B confirmation attempt locked and clean when A1 resolves or rejects mid-flight", async () => {
		const quoteA = createQuote({ fromAmount: "1000000", toAmount: "997500", toAmountMin: "992512" });
		const quoteB = createQuote({ fromAmount: "2000000", toAmount: "1995000", toAmountMin: "1985000" });
		const refreshedQuoteA = createQuote({ fromAmount: "1000000", toAmount: "998000", toAmountMin: "993000" });
		const refreshedQuoteB = createQuote({ fromAmount: "2000000", toAmount: "1996000", toAmountMin: "1986000" });
		let resolveRefetchA!: (value: { isError: false; data: BridgeQuote; dataUpdatedAt: number }) => void;
		let rejectRefetchA!: (reason?: unknown) => void;
		let resolveRefetchB!: (value: { isError: false; data: BridgeQuote; dataUpdatedAt: number }) => void;
		const refetchA = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((resolve, reject) => {
					resolveRefetchA = resolve;
					rejectRefetchA = reject;
				}),
		);
		const refetchB = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((resolve) => {
					resolveRefetchB = resolve;
				}),
		);
		const now = Date.now();
		const renderParams = (tokenAmount: string, address = "0x1111111111111111111111111111111111111111") => {
			act(() => {
				root.render(
					<I18nProvider i18n={i18n}>
						<ConfirmationScreen
							token={TOKEN}
							tokenAmount={tokenAmount}
							address={address}
							onBack={vi.fn()}
							onConfirm={onConfirm}
						/>
					</I18nProvider>,
				);
			});
		};

		testState.query = {
			data: quoteA,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now,
			refetch: refetchA,
		};
		renderParams("1");
		act(() => findButton(container, "Confirm").click());
		expect(findButton(container, "Preparing your quote...").disabled).toBe(true);

		testState.query = {
			data: quoteB,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now + 1,
			refetch: refetchB,
		};
		renderParams("2");
		act(() => findButton(container, "Confirm").click());
		expect(refetchB).toHaveBeenCalledOnce();
		expect(findButton(container, "Preparing your quote...").disabled).toBe(true);

		await act(async () => {
			resolveRefetchA({ isError: false, data: refreshedQuoteA, dataUpdatedAt: now + 1 });
			await Promise.resolve();
		});

		const busyButtonAfterResolve = findButton(container, "Preparing your quote...");
		expect(busyButtonAfterResolve.disabled).toBe(true);
		act(() => busyButtonAfterResolve.click());
		expect(refetchB).toHaveBeenCalledOnce();
		expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("");
		expect(onConfirm).not.toHaveBeenCalled();

		await act(async () => {
			resolveRefetchB({ isError: false, data: refreshedQuoteB, dataUpdatedAt: now + 2 });
			await Promise.resolve();
		});
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledWith(refreshedQuoteB);

		onConfirm.mockReset();
		refetchA.mockClear();
		refetchB.mockClear();

		testState.query = {
			data: quoteA,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now + 3,
			refetch: refetchA,
		};
		renderParams("1");
		act(() => findButton(container, "Confirm").click());

		testState.query = {
			data: quoteB,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now + 4,
			refetch: refetchB,
		};
		renderParams("2");
		act(() => findButton(container, "Confirm").click());
		expect(refetchB).toHaveBeenCalledOnce();

		await act(async () => {
			rejectRefetchA(new Error("stale failure"));
			await Promise.resolve();
		});

		const busyButtonAfterReject = findButton(container, "Preparing your quote...");
		expect(busyButtonAfterReject.disabled).toBe(true);
		act(() => busyButtonAfterReject.click());
		expect(refetchB).toHaveBeenCalledOnce();
		expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("");
		expect(onConfirm).not.toHaveBeenCalled();

		await act(async () => {
			resolveRefetchB({ isError: false, data: refreshedQuoteB, dataUpdatedAt: now + 5 });
			await Promise.resolve();
		});
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledWith(refreshedQuoteB);
	});

	it("keeps A2 locked and clean when A1 resolves or rejects mid-flight across A -> B -> A", async () => {
		const quoteA = createQuote({ fromAmount: "1000000", toAmount: "997500", toAmountMin: "992512" });
		const quoteB = createQuote({ fromAmount: "2000000", toAmount: "1995000", toAmountMin: "1985000" });
		const worseQuoteA1 = createQuote({ fromAmount: "1000000", toAmount: "900000", toAmountMin: "890000" });
		const refreshedQuoteA2 = createQuote({ fromAmount: "1000000", toAmount: "998100", toAmountMin: "993100" });
		let resolveRefetchA1!: (value: { isError: boolean; data?: BridgeQuote; dataUpdatedAt: number }) => void;
		let rejectRefetchA1!: (reason?: unknown) => void;
		let resolveRefetchA2!: (value: { isError: false; data: BridgeQuote; dataUpdatedAt: number }) => void;
		const refetchA1 = vi.fn(
			() =>
				new Promise<{ isError: boolean; data?: BridgeQuote; dataUpdatedAt: number }>((resolve, reject) => {
					resolveRefetchA1 = resolve;
					rejectRefetchA1 = reject;
				}),
		);
		const refetchA2 = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((resolve) => {
					resolveRefetchA2 = resolve;
				}),
		);
		const now = Date.now();
		const renderAmount = (tokenAmount: string) => {
			act(() => {
				root.render(
					<I18nProvider i18n={i18n}>
						<ConfirmationScreen
							token={TOKEN}
							tokenAmount={tokenAmount}
							address="0x1111111111111111111111111111111111111111"
							onBack={vi.fn()}
							onConfirm={onConfirm}
						/>
					</I18nProvider>,
				);
			});
		};

		for (const settleA1 of [
			() => resolveRefetchA1({ isError: false, data: worseQuoteA1, dataUpdatedAt: now + 1 }),
			() => rejectRefetchA1(new Error("stale A1 rejection")),
		]) {
			onConfirm.mockReset();
			refetchA1.mockClear();
			refetchA2.mockClear();

			testState.query = {
				data: quoteA,
				isLoading: false,
				isError: false,
				error: null,
				dataUpdatedAt: now,
				refetch: refetchA1,
			};
			renderAmount("1");
			act(() => findButton(container, "Confirm").click());

			testState.query = {
				data: quoteB,
				isLoading: false,
				isError: false,
				error: null,
				dataUpdatedAt: now + 1,
				refetch: vi.fn(),
			};
			renderAmount("2");

			testState.query = {
				data: quoteA,
				isLoading: false,
				isError: false,
				error: null,
				dataUpdatedAt: now + 2,
				refetch: refetchA2,
			};
			renderAmount("1");
			act(() => findButton(container, "Confirm").click());
			expect(refetchA2).toHaveBeenCalledOnce();
			expect(findButton(container, "Preparing your quote...").disabled).toBe(true);

			await act(async () => {
				settleA1();
				await Promise.resolve();
			});

			const busyA2 = findButton(container, "Preparing your quote...");
			expect(busyA2.disabled).toBe(true);
			act(() => busyA2.click());
			expect(refetchA2).toHaveBeenCalledOnce();
			expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("");
			expect(onConfirm).not.toHaveBeenCalled();

			await act(async () => {
				resolveRefetchA2({ isError: false, data: refreshedQuoteA2, dataUpdatedAt: now + 3 });
				await Promise.resolve();
			});
			expect(onConfirm).toHaveBeenCalledOnce();
			expect(onConfirm).toHaveBeenCalledWith(refreshedQuoteA2);
		}
	});

	it("deduplicates synchronous double-clicks, invalidates on single-field changes, and ignores post-completion stale rejections", async () => {
		const quote = createQuote();
		const refreshedQuote = createQuote({ toAmount: "998000", toAmountMin: "993000" });
		let rejectFirst!: (reason?: unknown) => void;
		let resolveCurrent!: (value: { isError: false; data: BridgeQuote; dataUpdatedAt: number }) => void;
		const refetchFirst = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((_resolve, reject) => {
					rejectFirst = reject;
				}),
		);
		const refetchCurrent = vi.fn(
			() =>
				new Promise<{ isError: false; data: BridgeQuote; dataUpdatedAt: number }>((resolve) => {
					resolveCurrent = resolve;
				}),
		);
		const now = Date.now();
		const renderScreen = (token: BridgeToken, tokenAmount: string, address: string) => {
			act(() => {
				root.render(
					<I18nProvider i18n={i18n}>
						<ConfirmationScreen
							token={token}
							tokenAmount={tokenAmount}
							address={address}
							onBack={vi.fn()}
							onConfirm={onConfirm}
						/>
					</I18nProvider>,
				);
			});
		};

		testState.query = {
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now,
			refetch: refetchFirst,
		};
		renderScreen(TOKEN, "1", "0x1111111111111111111111111111111111111111");
		const confirmBtn = findButton(container, "Confirm");
		act(() => {
			confirmBtn.click();
			confirmBtn.click();
		});
		expect(refetchFirst).toHaveBeenCalledOnce();

		testState.query = {
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: now + 1,
			refetch: refetchCurrent,
		};
		renderScreen(TOKEN, "1", "0x2222222222222222222222222222222222222222");
		expect(findButton(container, "Confirm").disabled).toBe(false);
		act(() => findButton(container, "Confirm").click());
		expect(findButton(container, "Preparing your quote...").disabled).toBe(true);

		renderScreen({ ...TOKEN, chainId: 10 }, "1", "0x2222222222222222222222222222222222222222");
		expect(findButton(container, "Confirm").disabled).toBe(false);
		act(() => findButton(container, "Confirm").click());
		expect(findButton(container, "Preparing your quote...").disabled).toBe(true);

		renderScreen(
			{ ...TOKEN, chainId: 10, address: "0x0000000000000000000000000000000000000009" },
			"1",
			"0x2222222222222222222222222222222222222222",
		);
		expect(findButton(container, "Confirm").disabled).toBe(false);
		act(() => findButton(container, "Confirm").click());
		await act(async () => {
			resolveCurrent({ isError: false, data: refreshedQuote, dataUpdatedAt: now + 2 });
			await Promise.resolve();
		});
		expect(onConfirm).toHaveBeenCalledOnce();

		await act(async () => {
			rejectFirst(new Error("late rejection after completion"));
			await Promise.resolve();
		});
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("");
	});

	it("shows the real sent token amount and requests that exact amount for explicit Max submissions", () => {
		const wholeToken: BridgeToken = {
			...TOKEN,
			symbol: "WHOLE",
			name: "Whole Token",
			decimals: 0,
			priceUSD: "2.004",
			amount: "1",
			amountUSD: 2.004,
		};
		testState.query = {
			data: createQuote({ fromAmount: "1", fromAmountUSD: "2.004" }),
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: Date.now(),
			refetch: vi.fn(),
		};
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={wholeToken}
						tokenAmount="1"
						address="0x1111111111111111111111111111111111111111"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});
		expect(container.textContent).toContain("1 WHOLE");
		expect(container.textContent).toContain("$2.00");
		expect(testState.lastQuoteParams).toEqual({
			fromChainId: wholeToken.chainId,
			fromTokenAddress: wholeToken.address,
			fromTokenDecimals: 0,
			fromAddress: "0x1111111111111111111111111111111111111111",
			amount: "1",
		});

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={{ ...TOKEN, amount: "10006000", amountUSD: 10.006 }}
						tokenAmount="10.006000"
						address="0x1111111111111111111111111111111111111111"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});
		expect(container.textContent).toContain("10.006 USDC");
	});

	it("displays exact send amounts without rounding up across the display boundary and allows wrapping without truncation", () => {
		const nearTenDai: BridgeToken = {
			...TOKEN,
			symbol: "DAI",
			name: "Dai Stablecoin",
			decimals: 18,
			priceUSD: "1",
			amount: "9999999999999999999",
			amountUSD: 10,
		};
		testState.query = {
			data: createQuote({ fromAmount: "9999999999999999999", fromAmountUSD: "10" }),
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: Date.now(),
			refetch: vi.fn(),
		};
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={nearTenDai}
						tokenAmount="9.999999999999999999"
						address="0x1111111111111111111111111111111111111111"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});

		const sendRow = [...container.querySelectorAll('[data-slot="info-row"]')].find(
			(row) => row.querySelector('[data-slot="info-row-label"]')?.textContent?.trim() === "You send",
		);
		expect(sendRow).toBeDefined();
		const sendValue = sendRow?.querySelector('[data-slot="info-row-value"]');
		expect(sendValue?.textContent?.trim()).toBe("9.999999999999999999 DAI");
		expect(sendValue?.textContent).not.toContain("10.000");
		expect(sendValue?.className).toContain("min-w-0");
		expect(sendValue?.innerHTML).toContain("[overflow-wrap:anywhere]");
		expect(sendValue?.innerHTML).not.toContain("truncate");
		expect(sendValue?.innerHTML).not.toContain("text-ellipsis");
		expect(testState.lastQuoteParams).toEqual({
			fromChainId: nearTenDai.chainId,
			fromTokenAddress: nearTenDai.address,
			fromTokenDecimals: 18,
			fromAddress: "0x1111111111111111111111111111111111111111",
			amount: "9.999999999999999999",
		});

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={{ ...TOKEN, amount: "10006000", amountUSD: 10.006 }}
						tokenAmount="10.006000"
						address="0x1111111111111111111111111111111111111111"
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});
		const usdcSendValue = [...container.querySelectorAll('[data-slot="info-row"]')]
			.find((row) => row.querySelector('[data-slot="info-row-label"]')?.textContent?.trim() === "You send")
			?.querySelector('[data-slot="info-row-value"]');
		expect(usdcSendValue?.textContent?.trim()).toBe("10.006 USDC");
	});
});
