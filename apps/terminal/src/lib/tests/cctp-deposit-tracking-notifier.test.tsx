// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import { CctpDepositOutcomeUnknownError } from "@/lib/trade/cctp-deposit-tracking";
import { createI18nRoot } from "./harness/react";

const SOURCE_HASH = `0x${"a".repeat(64)}`;
const EXTERNAL_WALLET = "0x1111111111111111111111111111111111111111";
const EMBEDDED_WALLET = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	depositModalOpen: false,
	isTestnet: false,
	trackingOptions: null as Record<string, unknown> | null,
	tracking: {
		data: undefined as { status: "waiting" | "forward-submitted" } | undefined,
		error: null as Error | null,
		isError: false,
		recoveryRecord: null as { sourceHash: string } | null,
		trackedSourceHash: undefined as string | undefined,
		unacknowledgedOutcomes: [] as Array<{ acknowledged: boolean; error: Error; sourceHash: string }>,
	},
	acknowledgedOutcomes: [] as string[],
	walletSession: {
		walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
		embeddedWalletAddress: undefined as string | undefined,
		walletIntent: "external" as "external" | "embedded",
	},
}));
const toastMocks = vi.hoisted(() => ({
	dismiss: vi.fn(),
	error: vi.fn(),
	loading: vi.fn(),
	success: vi.fn(),
	warning: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/hooks/trade/use-cctp-deposit-tracking", () => ({
	useCctpDepositTracking: (options: Record<string, unknown>) => {
		testState.trackingOptions = options;
		return {
			...testState.tracking,
			unacknowledgedOutcomes: testState.tracking.unacknowledgedOutcomes.filter(
				(outcome) => !testState.acknowledgedOutcomes.includes(outcome.sourceHash),
			),
			acknowledgeOutcome: (sourceHash: string) => {
				testState.acknowledgedOutcomes.push(sourceHash);
			},
		};
	},
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({ useWalletSession: () => testState.walletSession }));
vi.mock("@/stores/use-global-modal-store", () => ({ useDepositModalOpen: () => testState.depositModalOpen }));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => testState.isTestnet }));

import { CctpDepositTrackingNotifier } from "@/components/trade/tradebox/cctp-deposit-tracking-notifier";

describe("CctpDepositTrackingNotifier", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.depositModalOpen = false;
		testState.isTestnet = false;
		testState.trackingOptions = null;
		testState.tracking = {
			data: undefined,
			error: null,
			isError: false,
			recoveryRecord: null,
			trackedSourceHash: undefined,
			unacknowledgedOutcomes: [],
		};
		testState.acknowledgedOutcomes = [];
		testState.walletSession = {
			walletAddress: EXTERNAL_WALLET,
			embeddedWalletAddress: undefined,
			walletIntent: "external",
		};
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render() {
		act(() => root.render(createElement(CctpDepositTrackingNotifier)));
	}

	function settle(error: Error, sourceHash = SOURCE_HASH) {
		testState.tracking.error = error;
		testState.tracking.isError = true;
		testState.tracking.unacknowledgedOutcomes = [
			...testState.tracking.unacknowledgedOutcomes,
			{ acknowledged: false, error, sourceHash },
		];
	}

	function trackWaitingDeposit() {
		testState.tracking.recoveryRecord = { sourceHash: SOURCE_HASH };
		testState.tracking.trackedSourceHash = SOURCE_HASH;
		testState.tracking.data = { status: "waiting" };
	}

	it("stays silent while nothing is being tracked", () => {
		render();

		expect(toastMocks.loading).not.toHaveBeenCalled();
		expect(testState.trackingOptions).toMatchObject({ owner: EXTERNAL_WALLET, poll: true });
	});

	it("keeps one persistent notification for a deposit that is still forwarding", () => {
		trackWaitingDeposit();
		render();
		render();

		expect(toastMocks.loading).toHaveBeenCalledWith(
			"Forwarding deposit",
			expect.objectContaining({
				id: expect.stringMatching(
					new RegExp(`^cctp-deposit:Mainnet:${EXTERNAL_WALLET}:${SOURCE_HASH}:presentation:\\d+$`),
				),
				duration: Number.POSITIVE_INFINITY,
			}),
		);
		expect(testState.trackingOptions).toMatchObject({ poll: true, removeOnForwardSubmitted: true });
	});

	it("turns the same notification into the result once Circle forwards the deposit", () => {
		trackWaitingDeposit();
		render();
		testState.tracking.data = { status: "forward-submitted" };
		render();
		expect(toastMocks.success.mock.calls[0]?.[1]?.id).toBe(toastMocks.loading.mock.calls[0]?.[1]?.id);
		testState.tracking = { ...testState.tracking, data: undefined, recoveryRecord: null, trackedSourceHash: undefined };
		render();

		expect(toastMocks.success).toHaveBeenCalledExactlyOnceWith(
			"Deposit submitted to Hyperliquid",
			expect.objectContaining({
				id: expect.stringMatching(
					new RegExp(`^cctp-deposit:Mainnet:${EXTERNAL_WALLET}:${SOURCE_HASH}:presentation:\\d+$`),
				),
			}),
		);
		expect(toastMocks.dismiss).not.toHaveBeenCalled();
	});

	it("keeps a definitive source failure on screen until it is dismissed", () => {
		trackWaitingDeposit();
		render();
		settle(new DefinitiveDepositSourceFailureError("source-transaction-reverted", "Reverted"));
		render();
		render();

		expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(
			"Deposit failed",
			expect.objectContaining({
				closeButton: true,
				duration: Number.POSITIVE_INFINITY,
				id: expect.stringMatching(
					new RegExp(`^cctp-deposit:Mainnet:${EXTERNAL_WALLET}:${SOURCE_HASH}:presentation:\\d+$`),
				),
			}),
		);
	});

	it("keeps a deposit whose outcome could not be determined on screen as status unknown, not as a failure", () => {
		trackWaitingDeposit();
		render();
		settle(new CctpDepositOutcomeUnknownError());
		render();
		testState.tracking = { ...testState.tracking, data: undefined, recoveryRecord: null };
		render();

		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(toastMocks.warning).toHaveBeenCalledExactlyOnceWith(
			"Deposit status unknown",
			expect.objectContaining({
				closeButton: true,
				duration: Number.POSITIVE_INFINITY,
				id: toastMocks.loading.mock.calls[0]?.[1]?.id,
			}),
		);
		const description = toastMocks.warning.mock.calls[0]?.[1]?.description;
		const descriptionContainer = document.createElement("div");
		const descriptionRoot = createI18nRoot(descriptionContainer);
		act(() => descriptionRoot.render(description));
		expect(descriptionContainer.textContent).toContain(
			"The Arbitrum transaction was submitted, but its final status could not be verified. Check the transaction before retrying.",
		);
		act(() => descriptionRoot.unmount());
	});

	it("leaves the status to the deposit dialog while it is open and resumes after it closes", () => {
		trackWaitingDeposit();
		render();
		expect(toastMocks.loading).toHaveBeenCalledOnce();

		testState.depositModalOpen = true;
		render();
		expect(toastMocks.dismiss).toHaveBeenCalledExactlyOnceWith(
			expect.stringMatching(new RegExp(`^cctp-deposit:Mainnet:${EXTERNAL_WALLET}:${SOURCE_HASH}:presentation:\\d+$`)),
		);
		expect(testState.trackingOptions).toMatchObject({ poll: false, removeOnForwardSubmitted: false });

		testState.depositModalOpen = false;
		render();
		expect(toastMocks.loading).toHaveBeenCalledTimes(2);
	});

	it("announces an outcome that settled while the dialog was open after it closes, even once a later deposit is tracked", () => {
		const laterHash = `0x${"d".repeat(64)}`;
		testState.depositModalOpen = true;
		trackWaitingDeposit();
		render();
		settle(new CctpDepositOutcomeUnknownError());
		render();
		testState.tracking = {
			...testState.tracking,
			data: { status: "waiting" },
			error: null,
			isError: false,
			recoveryRecord: { sourceHash: laterHash },
			trackedSourceHash: laterHash,
		};
		render();
		expect(toastMocks.warning).not.toHaveBeenCalled();

		testState.depositModalOpen = false;
		render();
		render();

		expect(toastMocks.warning).toHaveBeenCalledExactlyOnceWith(
			"Deposit status unknown",
			expect.objectContaining({
				duration: Number.POSITIVE_INFINITY,
				id: expect.stringMatching(
					new RegExp(`^cctp-deposit:Mainnet:${EXTERNAL_WALLET}:${SOURCE_HASH}:presentation:\\d+$`),
				),
			}),
		);
		expect(toastMocks.loading).toHaveBeenCalledExactlyOnceWith(
			"Forwarding deposit",
			expect.objectContaining({ id: expect.stringContaining(laterHash) }),
		);
		expect(testState.acknowledgedOutcomes).toEqual([]);

		const options = toastMocks.warning.mock.calls[0]?.[1] as { onDismiss: () => void };
		options.onDismiss();
		expect(testState.acknowledgedOutcomes).toEqual([SOURCE_HASH]);
	});

	it("does not announce again an outcome the deposit dialog already showed", () => {
		testState.depositModalOpen = true;
		trackWaitingDeposit();
		render();
		settle(new CctpDepositOutcomeUnknownError());
		testState.acknowledgedOutcomes.push(SOURCE_HASH);
		testState.tracking = { ...testState.tracking, data: undefined, recoveryRecord: null };
		testState.depositModalOpen = false;
		render();

		expect(toastMocks.warning).not.toHaveBeenCalled();
		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(toastMocks.loading).not.toHaveBeenCalled();
	});

	it("dismisses the progress notification when the tracked record disappears", () => {
		trackWaitingDeposit();
		render();
		testState.tracking = { ...testState.tracking, data: undefined, recoveryRecord: null, trackedSourceHash: undefined };
		render();

		expect(toastMocks.dismiss).toHaveBeenCalledExactlyOnceWith(
			expect.stringMatching(new RegExp(`^cctp-deposit:Mainnet:${EXTERNAL_WALLET}:${SOURCE_HASH}:presentation:\\d+$`)),
		);
	});

	it("reads an embedded wallet's record without polling or removing it", () => {
		testState.walletSession = {
			walletAddress: EXTERNAL_WALLET,
			embeddedWalletAddress: EMBEDDED_WALLET,
			walletIntent: "embedded",
		};
		trackWaitingDeposit();
		render();

		expect(testState.trackingOptions).toMatchObject({
			owner: EMBEDDED_WALLET,
			poll: false,
			removeOnForwardSubmitted: false,
		});
		expect(toastMocks.loading).toHaveBeenCalledOnce();
	});
	it.each(["owner", "network"])("clears even a persistent terminal error when the %s changes", (change) => {
		trackWaitingDeposit();
		settle(new DefinitiveDepositSourceFailureError("source-transaction-reverted", "Reverted"));
		render();
		if (change === "owner") testState.walletSession.walletAddress = EMBEDDED_WALLET;
		else testState.isTestnet = true;
		testState.tracking = { ...testState.tracking, data: undefined, recoveryRecord: null, trackedSourceHash: undefined };
		render();
		expect(toastMocks.dismiss).toHaveBeenCalledWith(
			expect.stringMatching(new RegExp(`^cctp-deposit:Mainnet:${EXTERNAL_WALLET}:${SOURCE_HASH}:presentation:\\d+$`)),
		);
	});

	it("retranslates a terminal notification using its original ID after the source record is removed", () => {
		trackWaitingDeposit();
		testState.tracking.data = { status: "forward-submitted" };
		render();
		testState.tracking = { ...testState.tracking, data: undefined, recoveryRecord: null, trackedSourceHash: undefined };
		render();
		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [msg`Deposit submitted to Hyperliquid`.id]: "存款已提交至 Hyperliquid" },
			}),
		);
		expect(toastMocks.success).toHaveBeenLastCalledWith("存款已提交至 Hyperliquid", expect.anything());
		expect(toastMocks.success).toHaveBeenCalledTimes(2);
		expect(toastMocks.success.mock.calls[1]?.[1]?.id).toBe(toastMocks.success.mock.calls[0]?.[1]?.id);
		expect(toastMocks.success.mock.calls[1]?.[1]).toMatchObject({
			id: expect.stringMatching(
				new RegExp(`^cctp-deposit:Mainnet:${EXTERNAL_WALLET}:${SOURCE_HASH}:presentation:\\d+$`),
			),
		});
	});

	it("does not replay a dismissed terminal notification during a language switch", () => {
		trackWaitingDeposit();
		testState.tracking.data = { status: "forward-submitted" };
		render();
		const options = toastMocks.success.mock.calls[0]?.[1] as { onAutoClose: () => void };
		options.onAutoClose();
		act(() => i18n.loadAndActivate({ locale: "zh", messages: {} }));
		expect(toastMocks.success).toHaveBeenCalledOnce();
	});
});
