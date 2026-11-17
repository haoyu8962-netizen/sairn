// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IsolatedMarginPositionTarget } from "@/components/trade/positions/position-dialog-types";
import { PositionIsolatedMarginModal } from "@/components/trade/positions/position-isolated-margin-modal";
import type { Position } from "@/lib/hyperliquid";
import { createI18nRoot } from "./harness/react";
import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

const testState = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	walletAddress: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	market: {
		kind: "builderPerp",
		name: "xyz:CXMT",
		assetId: 120_031,
		dex: "xyz",
		marginMode: "noCross",
		onlyIsolated: true,
	} as {
		kind: "builderPerp" | "perp" | "spot";
		name: string;
		assetId: number;
		dex?: string;
		marginMode?: "strictIsolated" | "noCross";
		onlyIsolated?: true;
	} | null,
	marketLoading: false,
	marketError: null as Error | null,
	position: {
		dex: "xyz",
		coin: "xyz:CXMT",
		szi: "205.9",
		entryPx: "7.79995",
		positionValue: "1559.84",
		unrealizedPnl: "-46.18",
		returnOnEquity: "-0.3366",
		liquidationPx: "7.27304",
		marginUsed: "137.19",
		maxLeverage: 10,
		leverage: { type: "isolated", value: 10, rawUsd: "-18.794" },
		cumFunding: { allTime: "-22.59", sinceChange: "0", sinceOpen: "-22.59" },
	} as Position | null,
	positionLoading: false,
	positionError: false,
	positionStale: false,
	positionReceivedAt: Date.now(),
	isMobile: false,
	pendingMethods: new Set<string>(),
	updateMargin: vi.fn(),
	topUpMargin: vi.fn(),
	beforeQueuedExecution: null as null | ((method: string) => Promise<void>),
	executionGuards: {} as Record<
		string,
		((params: { asset: number; isBuy?: boolean; ntli?: number; leverage?: string }) => void) | undefined
	>,
}));

vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);

vi.mock("@sairn/ui", async () => {
	const React = await import("react");
	const SegmentedContext = React.createContext<((value: string) => void) | null>(null);

	return {
		AdaptiveModal: ({
			children,
			dismissible,
			onOpenChange,
			open,
			presentation,
			showHandle,
		}: {
			children: ReactNode;
			dismissible: boolean;
			onOpenChange: (open: boolean) => void;
			open: boolean;
			presentation: string;
			showHandle: boolean;
		}) =>
			open
				? createElement(
						"section",
						{
							"data-testid": "position-risk-dialog",
							"data-presentation": presentation,
							"data-dismissible": String(dismissible),
							"data-show-handle": String(showHandle),
						},
						createElement("button", {
							"aria-label": "Request adaptive dismiss",
							type: "button",
							onClick: () => onOpenChange(false),
						}),
						children,
					)
				: null,
		Button: ({
			children,
			iconLeft: _iconLeft,
			iconRight: _iconRight,
			intent: _intent,
			variant: _variant,
			...props
		}: {
			children: ReactNode;
			[key: string]: unknown;
		}) => createElement("button", { ...props, type: "button" }, children),
		ModalContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
			createElement("div", props, children),
		ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
		ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
		ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
		ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
		SegmentedControls: ({ children, onValueChange }: { children: ReactNode; onValueChange: (value: string) => void }) =>
			createElement(SegmentedContext.Provider, { value: onValueChange }, children),
		SegmentedControlItem: ({
			children,
			className,
			disabled,
			value,
		}: {
			children: ReactNode;
			className?: string;
			disabled?: boolean;
			value: string;
		}) => {
			const onValueChange = React.useContext(SegmentedContext);
			return createElement(
				"button",
				{
					type: "button",
					className,
					disabled,
					onClick: () => onValueChange?.(value),
				},
				children,
			);
		},
	};
});

vi.mock("@/components/ui/info-row", () => ({
	InfoRow: ({ label, value }: { label: ReactNode; value: ReactNode }) =>
		createElement("div", null, createElement("span", null, label), createElement("span", null, value)),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		"aria-label": ariaLabel,
		className,
		onChange,
		value,
	}: {
		"aria-label": string;
		className?: string;
		onChange: (event: { target: { value: string } }) => void;
		value: string;
	}) => createElement("input", { "aria-label": ariaLabel, className, onChange, value }),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		containerClassName: _containerClassName,
		requiresBuilderFee: _requiresBuilderFee,
		...props
	}: {
		children: ReactNode;
		containerClassName?: string;
		[key: string]: unknown;
	}) => createElement("button", { ...props, type: "button" }, children),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	},
}));

vi.mock("@/lib/hyperliquid", async () => ({
	...(await import("./harness/wallet-session-stage")).hyperliquidSessionMock,
	useExchange: (
		method: string,
		options?: {
			executionGuard?: (params: { asset: number; isBuy?: boolean; ntli?: number; leverage?: string }) => void;
		},
	) => {
		testState.executionGuards[method] = options?.executionGuard;
		return {
			isPending: testState.pendingMethods.has(method),
			mutateAsync: async (params: { asset: number; isBuy?: boolean; ntli?: number; leverage?: string }) => {
				options?.executionGuard?.(params);
				await testState.beforeQueuedExecution?.(method);
				options?.executionGuard?.(params);
				const mutation = method === "updateIsolatedMargin" ? testState.updateMargin : testState.topUpMargin;
				return mutation(params);
			},
		};
	},
	useMarkets: () => ({
		error: testState.marketError,
		getMarket: (coin: string) => (testState.market?.name === coin ? testState.market : undefined),
		isLoading: testState.marketLoading,
	}),
	useUserPositions: () => ({
		getPosition: (coin: string, dex?: string) =>
			testState.position?.coin === coin && (dex === undefined || testState.position.dex === dex)
				? testState.position
				: null,
		hasError: testState.positionError,
		isLoading: testState.positionLoading,
		isStale: testState.positionStale,
		receivedAt: testState.positionReceivedAt,
	}),
}));

const basePositionRef: IsolatedMarginPositionTarget = {
	owner: "0x1111111111111111111111111111111111111111",
	env: "Mainnet",
	coin: "xyz:CXMT",
	dex: "xyz",
	assetId: 120_031,
	isLong: true,
	szDecimals: 1,
	marginConstraint: "noCross",
	marginUsed: "137.19",
	positionValue: "1559.84",
	liquidationPx: "7.27304",
};

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

function getInput(container: HTMLElement, label: string): HTMLInputElement {
	const input = container.querySelector(`input[aria-label="${label}"]`);
	if (!(input instanceof HTMLInputElement)) throw new Error(`${label} input not found`);
	return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (!valueSetter) throw new Error("Native input value setter not found");
	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PositionIsolatedMarginModal while the wallet session resolves", () => {
	const CHANGED = "Trading data changed while this dialog was open. Close and reopen it before submitting.";
	let container: HTMLDivElement;
	let root: Root;

	function show(stage: WalletSessionStage) {
		act(() => setWalletSessionStage(stage));
	}

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		window.localStorage.clear();
		window.sessionStorage.clear();
		resetWalletSessionStage("connected");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => {
			root.render(
				createElement(PositionIsolatedMarginModal, {
					session: { sessionId: "margin-1", position: basePositionRef },
					onSessionEnd: vi.fn(),
				}),
			);
		});
		act(() => setInputValue(getInput(container, "Margin amount"), "10"));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("is ready to submit for the exact owner", () => {
		expect(container.textContent).not.toContain(CHANGED);
		expect(getButton(container, "Add Margin").disabled).toBe(false);
	});

	it.each(["reconnecting", "directory-initialising", "activating"] as const)(
		"stays quiet and disabled while the session is %s, and keeps the draft",
		(stage) => {
			show(stage);

			expect(container.textContent).not.toContain(CHANGED);
			expect(getButton(container, "Add Margin").disabled).toBe(true);
			expect(getInput(container, "Margin amount").value).toBe("10");

			act(() => getButton(container, "Add Margin").click());
			expect(testState.updateMargin).not.toHaveBeenCalled();

			show("connected");
			expect(container.textContent).not.toContain(CHANGED);
			expect(getButton(container, "Add Margin").disabled).toBe(false);
			expect(getInput(container, "Margin amount").value).toBe("10");
		},
	);

	it.each(["connected-other-owner", "connected-other-account", "signed-out", "wallet-missing", "agent-only"] as const)(
		"reports the change once the session is %s",
		(stage) => {
			show(stage);

			expect(container.textContent).toContain(CHANGED);
			expect(getButton(container, "Add Margin").disabled).toBe(true);
		},
	);

	it("reports the change after a reconnect that ends on another owner", () => {
		show("reconnecting");
		expect(container.textContent).not.toContain(CHANGED);

		show("connected-other-owner");
		expect(container.textContent).toContain(CHANGED);
		expect(getButton(container, "Add Margin").disabled).toBe(true);
	});
});
