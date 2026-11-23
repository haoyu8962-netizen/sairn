// @vitest-environment jsdom

import { act, type ComponentProps, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalModals } from "@/components/trade/components/global-modals";
import { WALLET_SESSION_RESOLVING_MAX_MS } from "@/lib/wallet/session-resolving-clock";
import {
	useDepositModalActions,
	useGlobalModalType,
	useSendModalActions,
	useSwapModalActions,
	useTransferModalActions,
} from "@/stores/use-global-modal-store";
import { createI18nRoot } from "./harness/react";
import {
	resetWalletSessionStage,
	setWalletSessionStage,
	type WalletSessionStage,
} from "./harness/wallet-session-stage";

vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);
vi.mock("@/lib/hyperliquid", async () => ({
	...(await import("./harness/wallet-session-stage")).hyperliquidSessionMock,
	classifyLegalStatusError: () => "unknown",
	useLegalStatus: () => ({
		data: { acceptedTerms: true, userAllowed: true, canPerformActions: true },
		error: null,
		isError: false,
		isPending: false,
		refetch: () => {},
	}),
}));
vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		embeddedWalletAddress: undefined,
		needsEmbeddedWallet: false,
		isCreatingEmbeddedWallet: false,
		embeddedWalletError: null,
		ensureEmailEmbeddedWallet: async () => {},
	}),
}));
vi.mock("@/hooks/wallet/use-explicit-terms-acceptance", () => ({
	useExplicitTermsAcceptance: () => ({ isPending: false, mutateAsync: async () => {}, error: null, reset: () => {} }),
}));
vi.mock("@/lib/error-reporting/client", () => ({ reportClientError: () => {} }));
vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	hasAcceptedHip3Disclaimer: () => true,
	useHasAcceptedHip3Disclaimer: () => true,
}));
vi.mock("@/hooks/trade/use-hip3-disclaimer", () => ({
	useHip3DisclaimerRequirement: () => ({ isRequired: false, dex: undefined, documentationUrl: undefined }),
}));
vi.mock("@/components/trade/components/legal-acceptance-modal", async () => {
	const { createElement: h } = await import("react");
	return { LegalAcceptanceModal: () => h("div", { "data-testid": "legal-acceptance" }) };
});
vi.mock("@/components/trade/components/trading-onboarding-gate", () => ({
	TradingOnboardingGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/trade/components/position-dialog-host-gate", () => ({ PositionDialogHostGate: () => null }));
vi.mock("@/components/trade/components/position-market-close-submit-host-gate", () => ({
	PositionMarketCloseSubmitHostGate: () => null,
}));
vi.mock("@/components/trade/components/deposit-modal-host", async () => {
	const { createElement: h } = await import("react");
	return { DepositModalHost: () => h("input", { "aria-label": "deposit draft" }) };
});
vi.mock("@/components/trade/components/lazy-global-modals", async () => {
	const { createElement: h } = await import("react");
	const draft = (name: string) => () => h("input", { "aria-label": `${name} draft` });
	const Stub = () => null;
	return {
		CommandMenu: Stub,
		GlobalSettingsModal: Stub,
		PositionMarketCloseModal: Stub,
		SendModal: draft("send"),
		SpotSwapModal: draft("swap"),
		TransferModal: draft("transfer"),
		useIdleGlobalModalPreload: () => {},
	};
});

const DIALOGS = ["deposit", "transfer", "send", "swap"] as const;
type Dialog = (typeof DIALOGS)[number];

const PAGES: ReadonlyArray<readonly [string, ComponentProps<typeof GlobalModals>]> = [
	["a page without the legal gate", {}],
	["a legal-gated page", { enableLegalGate: true }],
	[
		"a legal-gated trade page with onboarding and HIP-3",
		{ enableLegalGate: true, enableTradingOnboarding: true, enableHip3Disclaimer: true },
	],
];

let openers: Record<Dialog, () => void> | undefined;
let closers: (() => void)[] = [];
let storedModal: ReturnType<typeof useGlobalModalType> = null;

function Openers() {
	storedModal = useGlobalModalType();
	const deposit = useDepositModalActions();
	const transfer = useTransferModalActions();
	const send = useSendModalActions();
	const swap = useSwapModalActions();
	openers = {
		deposit: () => deposit.open("withdraw"),
		transfer: () => transfer.open(),
		send: () => send.open(),
		swap: () => swap.open(),
	};
	closers = [deposit.close, transfer.close, send.close, swap.close];
	return null;
}

describe("GlobalModals keeps funds dialogs mounted while the wallet session resolves", () => {
	let container: HTMLDivElement;
	let root: Root;

	function show(stage: WalletSessionStage) {
		act(() => setWalletSessionStage(stage));
	}

	function render(props: ComponentProps<typeof GlobalModals>) {
		act(() => root.render(createElement("div", null, createElement(Openers), createElement(GlobalModals, props))));
	}

	function open(dialog: Dialog) {
		act(() => openers?.[dialog]());
	}

	function draft(dialog: Dialog): HTMLInputElement | null {
		return container.querySelector<HTMLInputElement>(`input[aria-label="${dialog} draft"]`);
	}

	function type(input: HTMLInputElement, value: string) {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
	}

	beforeEach(() => {
		window.sessionStorage.clear();
		resetWalletSessionStage("connected");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => {
			for (const close of closers) close();
		});
		act(() => root.unmount());
		container.remove();
	});

	describe.each(PAGES)("on %s", (_page, props) => {
		it.each(DIALOGS)("keeps the %s dialog node and draft through a reconnect to the same owner", (dialog) => {
			render(props);
			open(dialog);
			const input = draft(dialog);
			if (!input) throw new Error(`${dialog} dialog did not open`);
			type(input, "125.5");

			show("reconnecting");
			expect(draft(dialog)).toBe(input);
			show("directory-initialising");
			expect(draft(dialog)).toBe(input);
			show("connected");
			expect(draft(dialog)).toBe(input);
			expect(input.value).toBe("125.5");
		});

		it.each(DIALOGS)("remounts the %s dialog when the session settles on another owner", (dialog) => {
			render(props);
			open(dialog);
			const input = draft(dialog);
			if (!input) throw new Error(`${dialog} dialog did not open`);
			type(input, "125.5");

			show("reconnecting");
			show("connected-other-owner");
			const remounted = draft(dialog);
			expect(remounted).not.toBeNull();
			expect(remounted).not.toBe(input);
			expect(remounted?.value).toBe("");
		});
	});

	describe.each(PAGES)("on %s", (_page, props) => {
		it.each(DIALOGS)("stops holding the %s dialog at once when the wallet switches to another account", (dialog) => {
			render(props);
			open(dialog);
			const input = draft(dialog);
			if (!input) throw new Error(`${dialog} dialog did not open`);
			type(input, "125.5");

			show("connected-other-account");
			expect(draft(dialog)).not.toBe(input);
			expect(draft(dialog)?.value ?? "").toBe("");
			expect(container.querySelector('[data-testid="legal-acceptance"]') !== null).toBe(props.enableLegalGate === true);
		});

		it.each(DIALOGS)(
			"stops holding the %s dialog at once when a resolving wallet already reports another account",
			(dialog) => {
				render(props);
				open(dialog);
				const input = draft(dialog);
				if (!input) throw new Error(`${dialog} dialog did not open`);
				type(input, "125.5");

				show("reconnecting");
				expect(draft(dialog)).toBe(input);
				show("reconnecting-other-account");
				expect(draft(dialog)).not.toBe(input);
				expect(draft(dialog)?.value ?? "").toBe("");
				show("connected");
				expect(draft(dialog)).not.toBe(input);
			},
		);
	});

	it("releases a dialog at once when the signed-in wallet leaves the directory and nothing resolves (E2)", () => {
		render({ enableLegalGate: true });
		open("send");
		const input = draft("send");
		if (!input) throw new Error("send dialog did not open");
		type(input, "125.5");
		show("wallet-missing");
		expect(draft("send")).not.toBe(input);
		expect(container.querySelector('[data-testid="legal-acceptance"]')).not.toBeNull();
	});

	it.each(DIALOGS)(
		"adopts the first settled owner without remounting the %s dialog opened while resolving",
		(dialog) => {
			resetWalletSessionStage("reconnecting");
			render({});
			open(dialog);
			const input = draft(dialog);
			if (!input) throw new Error(`${dialog} dialog did not open`);
			type(input, "125.5");

			show("connected");
			expect(draft(dialog)).toBe(input);
			expect(input.value).toBe("125.5");
		},
	);

	it("keeps only the dialog that was open while a legal-gated page holds its decision", () => {
		render({ enableLegalGate: true });
		open("deposit");
		const input = draft("deposit");
		show("activating");
		expect(draft("deposit")).toBe(input);
		expect(container.querySelector('[data-testid="legal-acceptance"]')).toBeNull();

		open("transfer");
		expect(draft("transfer")).toBeNull();
		show("connected");
		expect(draft("transfer")).not.toBeNull();
	});

	it("does not let a closed dialog open again while a legal-gated page holds its decision", () => {
		render({ enableLegalGate: true });
		open("deposit");
		show("activating");
		act(() => closers[0]?.());
		open("deposit");
		expect(draft("deposit")).toBeNull();
		show("connected");
		expect(draft("deposit")).not.toBeNull();
	});

	it("lets the held dialog run its exit when a different dialog waits for the session", () => {
		render({ enableLegalGate: true });
		open("deposit");
		const input = draft("deposit");
		show("activating");
		open("transfer");
		expect(draft("deposit")).toBe(input);
		expect(draft("transfer")).toBeNull();
	});

	it("opens the command menu over an opening that waits for the session to settle", () => {
		render({ enableLegalGate: true });
		open("deposit");
		show("activating");
		open("transfer");
		expect(draft("transfer")).toBeNull();
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
		});
		expect(storedModal).toBe("commandMenu");
	});

	it("shows the wallet requirement once a held legal decision runs out of time", () => {
		vi.useFakeTimers();
		try {
			resetWalletSessionStage("connected");
			render({ enableLegalGate: true });
			open("deposit");
			show("activating");
			expect(draft("deposit")).not.toBeNull();
			expect(container.querySelector('[data-testid="legal-acceptance"]')).toBeNull();
			act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS - 1));
			expect(draft("deposit")).not.toBeNull();
			expect(container.querySelector('[data-testid="legal-acceptance"]')).toBeNull();
			act(() => vi.advanceTimersByTime(2));
			expect(container.querySelector('[data-testid="legal-acceptance"]')).not.toBeNull();
			expect(draft("deposit")).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("drops a legal-gated dialog's draft when the wallet leaves the directory and comes back, as before the hold (E2)", () => {
		render({ enableLegalGate: true });
		open("deposit");
		const input = draft("deposit");
		if (!input) throw new Error("deposit dialog did not open");
		type(input, "125.5");
		show("wallet-missing");
		expect(draft("deposit")).toBeNull();
		expect(container.querySelector('[data-testid="legal-acceptance"]')).not.toBeNull();
		show("connected");
		expect(draft("deposit")).not.toBe(input);
		expect(draft("deposit")?.value ?? "").toBe("");
	});

	it("asks for the wallet at once when no funds dialog is open", () => {
		render({ enableLegalGate: true });
		show("wallet-missing");
		expect(container.querySelector('[data-testid="legal-acceptance"]')).not.toBeNull();
	});

	it("stops holding a legal-gated page once the resolving window ends", () => {
		vi.useFakeTimers();
		try {
			resetWalletSessionStage("connected");
			render({ enableLegalGate: true });
			open("deposit");
			show("reconnecting");
			expect(draft("deposit")).not.toBeNull();
			act(() => vi.advanceTimersByTime(WALLET_SESSION_RESOLVING_MAX_MS - 1));
			expect(draft("deposit")).not.toBeNull();
			act(() => vi.advanceTimersByTime(2));
			expect(draft("deposit")).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});
