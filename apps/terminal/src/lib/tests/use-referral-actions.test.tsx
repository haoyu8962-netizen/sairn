// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { ExchangeActionDeadlineError } from "@sairn/hl-react/internal/exchange/request-scheduler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralActionModal } from "@/components/referrals/referral-action-modal";
import {
	type ReferralAction,
	ReferralActionStatusUnknownError,
	useReferralActions,
} from "@/hooks/trade/use-referral-actions";
import { classifyActionErrorOr, formatActionFailure, isAmbiguousExchangeActionError } from "@/lib/errors/action-error";
import { getNumberFormatters } from "@/lib/format";
import type { ReferralData } from "@/lib/trade/referral";
import type { Translate } from "@/lib/translate";
import { clearFeedback, latestFeedback } from "./harness/order-feedback";
import { createI18nRoot } from "./harness/react";

vi.mock("@phosphor-icons/react", () => ({ WarningCircleIcon: () => null }));

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
		<button type="button" disabled={disabled} onClick={onClick}>
			{children}
		</button>
	),
	ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ModalDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	ModalFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
	ModalHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
	ModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
	TextInput: () => null,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;
const GEO_BLOCKED = msg`Referral actions are not available in your region. This referral request was not submitted.`;
const REFERRAL_FAILURE = msg`Referral request could not be completed.`;
const translate: Translate = (descriptor) => i18n._(descriptor);

const testState = vi.hoisted(() => ({
	claimRewards: vi.fn(),
	clientKey: "0x1111111111111111111111111111111111111111" as string,
	env: "Mainnet" as "Mainnet" | "Testnet",
	executionGuards: {} as Record<string, (() => void) | undefined>,
	geoDelayMs: 0,
	geoDecision: {
		checkedAt: 0,
		country: "GB",
		status: "allowed",
		ttlMs: 60_000,
	} as
		| { checkedAt: number; country: string; status: "allowed"; ttlMs: number }
		| { checkedAt: number; country: string; reason: "jurisdiction" | "proxy"; status: "blocked" }
		| {
				checkedAt: number;
				reason: "invalid_response" | "missing_config" | "missing_ip" | "provider_error";
				status: "unavailable";
		  },
	boundReferral: vi.fn(),
	infoNetworks: [] as boolean[],
	legalRefetch: vi.fn(),
	registerReferrer: vi.fn(),
	setReferrer: vi.fn(),
	walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
}));

vi.mock("@/lib/geo/get-referral-action-geo", () => ({
	getReferralActionGeo: vi.fn(async () => {
		if (testState.geoDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, testState.geoDelayMs));
		return testState.geoDecision;
	}),
}));

vi.mock("@sairn/hl-react", async (importOriginal) => {
	const original = await importOriginal<typeof import("@sairn/hl-react")>();
	return {
		...original,
		getInfoClient: (isTestnet: boolean) => {
			testState.infoNetworks.push(isTestnet);
			return { referral: testState.boundReferral };
		},
	};
});

vi.mock("@/lib/hyperliquid", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/lib/hyperliquid")>();
	return {
		...original,
		useExchange: (method: string, options?: { executionGuard?: () => void }) => {
			testState.executionGuards[method] = options?.executionGuard;
			const mutation =
				method === "setReferrer"
					? testState.setReferrer
					: method === "registerReferrer"
						? testState.registerReferrer
						: testState.claimRewards;
			return {
				isPending: false,
				mutateAsync: async (input: unknown) => {
					options?.executionGuard?.();
					return mutation(input);
				},
			};
		},
		useHyperliquid: () => ({ clientKey: testState.clientKey, env: testState.env }),
		useLegalStatus: () => ({ refetch: testState.legalRefetch }),
	};
});

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: true, walletAddress: testState.walletAddress }),
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

function createReferralData(overrides: Partial<ReferralData> = {}): ReferralData {
	return {
		builderRewards: "0",
		claimedRewards: "0",
		cumVlm: "10000",
		referredBy: null,
		referrerState: { stage: "needToCreateCode" },
		rewardHistory: [],
		tokenToState: [
			[
				0,
				{
					builderRewards: "0",
					claimedRewards: "0",
					cumVlm: "10000",
					unclaimedRewards: "1.01",
				},
			],
		],
		unclaimedRewards: "1.01",
		...overrides,
	};
}

function createHttpRequestError(status?: number): Error {
	const error = new Error("Request failed");
	error.name = "HttpRequestError";
	if (status !== undefined) Object.assign(error, { response: { status } });
	return error;
}

let hookValue: ReturnType<typeof useReferralActions> | null = null;
let hookInput: Parameters<typeof useReferralActions>[0];

function Probe() {
	hookValue = useReferralActions(hookInput);
	return null;
}

function ConfirmationProbe() {
	const actions = useReferralActions(hookInput);
	const [open, setOpen] = useState(true);
	return open ? (
		<ReferralActionModal
			action="apply"
			initialCode="SAIRN"
			unclaimedRewards={[]}
			onClose={() => setOpen(false)}
			onSubmit={actions.submit}
		/>
	) : null;
}

describe("useReferralActions", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		clearFeedback();
		testState.clientKey = OWNER;
		testState.env = "Mainnet";
		testState.executionGuards = {};
		testState.infoNetworks = [];
		testState.geoDelayMs = 0;
		testState.geoDecision = {
			checkedAt: Date.now(),
			country: "GB",
			status: "allowed",
			ttlMs: 60_000,
		};
		testState.walletAddress = OWNER;
		testState.claimRewards.mockResolvedValue({ status: "ok" });
		testState.registerReferrer.mockResolvedValue({ status: "ok" });
		testState.setReferrer.mockResolvedValue({ status: "ok" });
		testState.legalRefetch.mockResolvedValue({
			data: { acceptedTerms: true, canUseReferrals: true, userAllowed: true },
			error: null,
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
		root = createI18nRoot(container);
		hookValue = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		vi.useRealTimers();
		queryClient.clear();
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function renderHook(refetchReferral: () => Promise<ReferralData>) {
		hookInput = { refetchReferral, refreshAfterAction: vi.fn().mockResolvedValue(undefined) };
		renderProbe();
		if (!hookValue) throw new Error("Referral action hook was not captured");
		return hookValue;
	}

	function renderProbe() {
		act(() =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			),
		);
	}

	async function confirmThenChange(change: "owner" | "network" | "unmount", outcome: "accepted" | "ambiguous") {
		const response = deferred<void>();
		testState.setReferrer.mockImplementationOnce(async () => {
			await response.promise;
			if (outcome === "ambiguous") throw createHttpRequestError();
			return { status: "ok" };
		});
		const refetchReferral = vi.fn().mockResolvedValue(createReferralData());
		const refreshAfterAction = vi.fn();
		hookInput = { refetchReferral, refreshAfterAction };
		const renderConfirmation = () =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<ConfirmationProbe />
				</QueryClientProvider>,
			);
		act(renderConfirmation);
		await act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent === "Confirm")
				?.click();
			await vi.waitFor(() => expect(testState.setReferrer).toHaveBeenCalledOnce());
		});
		const pendingId = latestFeedback("pending")?.id;
		expect(pendingId).toBeDefined();
		act(() => {
			if (change === "unmount") {
				root.render(null);
				return;
			}
			if (change === "owner") {
				testState.clientKey = OTHER_OWNER;
				testState.walletAddress = OTHER_OWNER;
			} else {
				testState.env = "Testnet";
			}
			renderConfirmation();
		});
		return { pendingId, refetchReferral, refreshAfterAction, response };
	}

	describe.each(["owner", "network", "unmount"] as const)("after the %s changes once the request is sent", (change) => {
		it.each(["accepted", "ambiguous"] as const)(
			"records the %s request's verified result on the initiating account's task",
			async (outcome) => {
				testState.boundReferral.mockResolvedValue(
					createReferralData({ referredBy: { code: "SAIRN", referrer: OTHER_OWNER } }),
				);
				const { pendingId, refetchReferral, refreshAfterAction, response } = await confirmThenChange(change, outcome);
				await act(async () => {
					response.resolve();
					await vi.waitFor(() => expect(latestFeedback("success")).toBeDefined());
				});
				expect(latestFeedback("success")).toMatchObject({ id: pendingId, owner: OWNER, env: "Mainnet" });
				expect(latestFeedback("failed")).toBeUndefined();
				expect(testState.boundReferral).toHaveBeenCalledWith({ user: OWNER }, expect.any(AbortSignal));
				expect(testState.infoNetworks).toEqual([false]);
				expect(testState.setReferrer).toHaveBeenCalledOnce();
				expect(refetchReferral).toHaveBeenCalledOnce();
				expect(refreshAfterAction).not.toHaveBeenCalled();
			},
		);

		it("reports an unverified result as unconfirmed on the initiating account's task, never as failed", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout"] });
			testState.boundReferral.mockResolvedValue(createReferralData());
			const { pendingId, response } = await confirmThenChange(change, "accepted");
			await act(async () => {
				response.resolve();
				await vi.advanceTimersByTimeAsync(5_000);
			});
			expect(latestFeedback("unconfirmed")).toMatchObject({ id: pendingId, owner: OWNER, env: "Mainnet" });
			expect(latestFeedback("failed")).toBeUndefined();
			expect(testState.boundReferral).toHaveBeenCalledTimes(6);
			expect(testState.setReferrer).toHaveBeenCalledOnce();
		});
	});

	it("sets a referral code only after fresh legal and referral checks", async () => {
		const before = createReferralData();
		const after = createReferralData({ referredBy: { code: "SAIRN", referrer: OWNER } });
		const refetchReferral = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).resolves.toBeUndefined();
		});

		expect(testState.setReferrer).toHaveBeenCalledExactlyOnceWith({ code: "SAIRN" });
		expect(testState.registerReferrer).not.toHaveBeenCalled();
		expect(testState.claimRewards).not.toHaveBeenCalled();
		expect(testState.legalRefetch).toHaveBeenCalledOnce();
		expect(refetchReferral).toHaveBeenCalledTimes(2);
		expect(testState.executionGuards.setReferrer).toBeTypeOf("function");
	});

	it("creates a code through the Agent action without a builder authorization flow", async () => {
		const before = createReferralData();
		const after = createReferralData({
			referrerState: { stage: "ready", data: { code: "MYCODE", nReferrals: 0, referralStates: [] } },
		});
		const hook = renderHook(vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after));

		await act(async () => {
			await expect(hook.submit("create", "MYCODE")).resolves.toBeUndefined();
		});

		expect(testState.registerReferrer).toHaveBeenCalledExactlyOnceWith({ code: "MYCODE" });
	});

	it("claims all rewards with no request parameters and reconciles changed token state", async () => {
		const before = createReferralData();
		const beforeTokenState = before.tokenToState[0]?.[1];
		if (!beforeTokenState) throw new Error("Expected a referral reward token state");
		const after = createReferralData({
			claimedRewards: "1.01",
			tokenToState: [[0, { ...beforeTokenState, claimedRewards: "1.01", unclaimedRewards: "0" }]],
			unclaimedRewards: "0",
		});
		const hook = renderHook(vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after));

		await act(async () => {
			await expect(hook.submit("claim")).resolves.toBeUndefined();
		});

		expect(testState.claimRewards).toHaveBeenCalledExactlyOnceWith(undefined);
	});

	it("fails closed before any SDK action when referral access is unknown", async () => {
		testState.legalRefetch.mockResolvedValue({ data: undefined, error: new Error("offline") });
		const refetchReferral = vi.fn();
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("claim")).rejects.toThrow("Referral access could not be verified");
		});

		expect(refetchReferral).not.toHaveBeenCalled();
		expect(testState.claimRewards).not.toHaveBeenCalled();
	});

	it("fails closed when referral location eligibility is unavailable", async () => {
		testState.geoDecision = { checkedAt: Date.now(), reason: "provider_error", status: "unavailable" };
		const refetchReferral = vi.fn().mockResolvedValue(createReferralData());
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).rejects.toThrow(
				"Unable to verify regional availability. This referral request was not submitted.",
			);
		});

		expect(refetchReferral).toHaveBeenCalledOnce();
		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("reports a blocked location in the language shown when the failure is displayed", async () => {
		testState.geoDecision = { checkedAt: Date.now(), country: "US", reason: "jurisdiction", status: "blocked" };
		const hook = renderHook(vi.fn().mockResolvedValue(createReferralData()));
		let rejection: unknown;

		await act(async () => {
			rejection = await hook.submit("apply", "SAIRN").catch((error: unknown) => error);
		});

		const failure = classifyActionErrorOr(rejection, REFERRAL_FAILURE);
		expect(failure).toEqual(GEO_BLOCKED);
		expect(formatActionFailure(failure, translate, getNumberFormatters())).toBe(
			"Referral actions are not available in your region. This referral request was not submitted.",
		);
		i18n.loadAndActivate({
			locale: "zh",
			messages: { [GEO_BLOCKED.id]: "你所在的地区无法使用推荐操作，此推荐请求未提交。" },
		});
		expect(formatActionFailure(failure, translate, getNumberFormatters())).toBe(
			"你所在的地区无法使用推荐操作，此推荐请求未提交。",
		);
		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("fails closed at the SDK boundary when the referral geo lease has expired", async () => {
		testState.geoDecision = {
			checkedAt: Date.now(),
			country: "GB",
			status: "allowed",
			ttlMs: 0,
		};
		const refetchReferral = vi.fn().mockResolvedValue(createReferralData());
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).rejects.toThrow(
				"The regional availability check expired before signing. This referral request was not submitted.",
			);
		});

		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("uses a monotonic local lease when the wall clock is skewed", async () => {
		const wallClock = vi.spyOn(Date, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);
		const before = createReferralData();
		const after = createReferralData({ referredBy: { code: "SAIRN", referrer: OWNER } });
		const hook = renderHook(vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after));

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).resolves.toBeUndefined();
		});

		expect(testState.setReferrer).toHaveBeenCalledOnce();
		wallClock.mockRestore();
	});

	it("fails closed if the owner changes while fresh referral data is loading", async () => {
		const referral = deferred<ReferralData>();
		testState.legalRefetch.mockResolvedValue({
			data: { acceptedTerms: true, canUseReferrals: true, userAllowed: true },
			error: null,
		});
		const hook = renderHook(() => referral.promise);
		const submission = hook.submit("apply", "SAIRN");
		const rejection = expect(submission).rejects.toThrow("Wallet or network changed");

		await vi.waitFor(() => expect(testState.legalRefetch).toHaveBeenCalledOnce());
		await act(async () => {
			testState.clientKey = OTHER_OWNER;
			testState.walletAddress = OTHER_OWNER;
			renderProbe();
		});
		expect(hookValue?.identity.clientKey).toBe(OTHER_OWNER);
		await act(async () => {
			referral.resolve(createReferralData());
			await Promise.resolve();
		});

		await rejection;
		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("fails closed if the referral route unmounts before signing", async () => {
		const referral = deferred<ReferralData>();
		const hook = renderHook(() => referral.promise);
		const submission = hook.submit("apply", "SAIRN");
		const rejection = expect(submission).rejects.toThrow("Referral request is no longer active");

		await vi.waitFor(() => expect(testState.legalRefetch).toHaveBeenCalledOnce());
		act(() => root.render(<QueryClientProvider client={queryClient}>{null}</QueryClientProvider>));
		await act(async () => {
			referral.resolve(createReferralData());
			await Promise.resolve();
		});

		await rejection;
		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("reconciles an ambiguous transport error before reporting success", async () => {
		const before = createReferralData();
		const after = createReferralData({ referredBy: { code: "SAIRN", referrer: OWNER } });
		testState.setReferrer.mockRejectedValue(createHttpRequestError());
		const refetchReferral = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).resolves.toBeUndefined();
		});

		expect(testState.setReferrer).toHaveBeenCalledOnce();
		expect(refetchReferral).toHaveBeenCalledTimes(2);
	});

	it("does not reconcile or retry a deterministic protocol rejection", async () => {
		const before = createReferralData();
		const rejection = createHttpRequestError(400);
		testState.registerReferrer.mockRejectedValue(rejection);
		const refetchReferral = vi.fn().mockResolvedValue(before);
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("create", "MYCODE")).rejects.toBe(rejection);
		});

		expect(testState.registerReferrer).toHaveBeenCalledOnce();
		expect(refetchReferral).toHaveBeenCalledOnce();
	});

	it("reports an unknown final state instead of replaying a signed action", async () => {
		vi.useFakeTimers();
		const before = createReferralData();
		const refetchReferral = vi.fn().mockResolvedValue(before);
		const hook = renderHook(refetchReferral);

		const submission = hook.submit("create", "MYCODE");
		const rejection = expect(submission).rejects.toBeInstanceOf(ReferralActionStatusUnknownError);
		await act(async () => {
			await vi.runAllTimersAsync();
		});

		await rejection;
		expect(testState.registerReferrer).toHaveBeenCalledOnce();
		expect(refetchReferral).toHaveBeenCalledTimes(7);
	});

	describe("when the checks before the request finish long after the confirmation", () => {
		const LEGAL_ACCESS = {
			data: { acceptedTerms: true, canUseReferrals: true, userAllowed: true },
			error: null,
		};
		const NOT_SENT = "The checks before this request took too long. Nothing was signed or sent. Try again.";
		const CASES: [ReferralAction, string | undefined][] = [
			["apply", "SAIRN"],
			["create", "MYCODE"],
			["claim", undefined],
		];

		function answerLegalCheckAfter(ms: number) {
			testState.legalRefetch.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(LEGAL_ACCESS), ms)),
			);
		}

		function createReconciledData(action: ReferralAction): ReferralData {
			if (action === "apply") return createReferralData({ referredBy: { code: "SAIRN", referrer: OWNER } });
			if (action === "create") {
				return createReferralData({
					referrerState: { stage: "ready", data: { code: "MYCODE", nReferrals: 0, referralStates: [] } },
				});
			}
			return createReferralData({
				claimedRewards: "1.01",
				tokenToState: [[0, { builderRewards: "0", claimedRewards: "1.01", cumVlm: "10000", unclaimedRewards: "0" }]],
				unclaimedRewards: "0",
			});
		}

		function getMutation(action: ReferralAction) {
			if (action === "apply") return testState.setReferrer;
			if (action === "create") return testState.registerReferrer;
			return testState.claimRewards;
		}

		function expectNothingSubmitted() {
			expect(testState.setReferrer).not.toHaveBeenCalled();
			expect(testState.registerReferrer).not.toHaveBeenCalled();
			expect(testState.claimRewards).not.toHaveBeenCalled();
		}

		function expectReportedAsNotSent(rejection: unknown) {
			expect(rejection).toBeInstanceOf(ExchangeActionDeadlineError);
			expect(rejection).not.toBeInstanceOf(ReferralActionStatusUnknownError);
			expect(isAmbiguousExchangeActionError(rejection)).toBe(false);
			expect(
				formatActionFailure(classifyActionErrorOr(rejection, REFERRAL_FAILURE), translate, getNumberFormatters()),
			).toBe(NOT_SENT);
		}

		async function advanceBothClocks(ms: number) {
			const wallClock = Date.now();
			const monotonicClock = performance.now();
			await act(async () => {
				await vi.advanceTimersByTimeAsync(ms);
			});
			expect(Date.now() - wallClock).toBeGreaterThanOrEqual(ms);
			expect(performance.now() - monotonicClock).toBeGreaterThanOrEqual(ms);
		}

		beforeEach(() => {
			vi.useFakeTimers();
		});

		it.each(CASES)(
			"does not submit %s when the legal check answers 16 seconds after the confirmation",
			async (action, code) => {
				answerLegalCheckAfter(16_000);
				const refetchReferral = vi.fn().mockResolvedValue(createReferralData());
				const hook = renderHook(refetchReferral);

				const outcome = hook.submit(action, code).catch((error: unknown) => error);
				await advanceBothClocks(16_000);

				expectNothingSubmitted();
				expectReportedAsNotSent(await outcome);
				expect(refetchReferral).toHaveBeenCalledOnce();

				testState.legalRefetch.mockResolvedValue(LEGAL_ACCESS);
				refetchReferral.mockResolvedValueOnce(createReferralData()).mockResolvedValueOnce(createReconciledData(action));
				await act(async () => {
					await expect(hook.submit(action, code)).resolves.toBeUndefined();
				});
				expect(getMutation(action)).toHaveBeenCalledOnce();
			},
		);

		it("does not submit when the last check before the request answers 16 seconds after the confirmation", async () => {
			testState.geoDelayMs = 16_000;
			const refetchReferral = vi.fn().mockResolvedValue(createReferralData());
			const hook = renderHook(refetchReferral);

			const outcome = hook.submit("apply", "SAIRN").catch((error: unknown) => error);
			await advanceBothClocks(16_000);

			expectNothingSubmitted();
			expectReportedAsNotSent(await outcome);
			expect(refetchReferral).toHaveBeenCalledOnce();
		});

		it("counts the time from the confirmation across every check, not per check", async () => {
			answerLegalCheckAfter(8_000);
			testState.geoDelayMs = 8_000;
			const refetchReferral = vi.fn().mockResolvedValue(createReferralData());
			const hook = renderHook(refetchReferral);

			const outcome = hook.submit("claim").catch((error: unknown) => error);
			await advanceBothClocks(16_000);

			expectNothingSubmitted();
			expectReportedAsNotSent(await outcome);
		});

		it.each(CASES)(
			"still submits %s once when the checks finish 14 seconds after the confirmation",
			async (action, code) => {
				answerLegalCheckAfter(7_000);
				testState.geoDelayMs = 7_000;
				const refetchReferral = vi
					.fn()
					.mockResolvedValueOnce(createReferralData())
					.mockResolvedValueOnce(createReconciledData(action));
				const hook = renderHook(refetchReferral);

				const submission = hook.submit(action, code);
				await advanceBothClocks(14_000);

				await expect(submission).resolves.toBeUndefined();
				expect(getMutation(action)).toHaveBeenCalledExactlyOnceWith(code === undefined ? undefined : { code });
				expect(
					testState.setReferrer.mock.calls.length +
						testState.registerReferrer.mock.calls.length +
						testState.claimRewards.mock.calls.length,
				).toBe(1);
				expect(refetchReferral).toHaveBeenCalledTimes(2);
			},
		);
	});
});

describe("translation sources of this test file", () => {
	it("names every catalog message once, so the committed catalog lists each of its sources", () => {
		const origin = "src/lib/tests/use-referral-actions.test.tsx";
		const source = readFileSync(resolve(__dirname, "use-referral-actions.test.tsx"), "utf8");
		const catalog = readFileSync(resolve(__dirname, "../../locales/en/messages.po"), "utf8");
		const messageUses = source.match(new RegExp(`\\bmsg${"`"}`, "g")) ?? [];
		const listedSources = catalog.split("\n").filter((line) => line === `#: ${origin}`);

		expect(messageUses.length).toBeGreaterThan(0);
		expect(messageUses).toHaveLength(listedSources.length);
	});
});
