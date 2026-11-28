import { useLingui } from "@lingui/react/macro";
import { type ExchangeSigningIdentity, isSameExchangeSigningIdentity } from "@sairn/hl-react/hooks/useExchange";
import {
	EXCHANGE_ACTION_START_DEADLINE_MS,
	ExchangeActionDeadlineError,
	hasExchangeActionDeadlinePassed,
	startExchangeActionDeadline,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isConfirmedTwapCancelResponse } from "@/domain/trade/open-order-cancel";
import { isAmbiguousOrderRequestError } from "@/domain/trade/order-tracking";
import { type ActionFailure, classifyActionError, formatActionFailure } from "@/lib/errors/action-error";
import { type NumberFormatters, useNumberFormat } from "@/lib/format";
import { type ExchangeParams, useExchange, useHyperliquid, useMarkets } from "@/lib/hyperliquid";
import { runWithOrderAssetLocks } from "@/lib/trade/order-asset-lock";
import {
	formatOrderSubmissionFeedback,
	getOrderSubmissionFeedback,
	type OrderSubmissionFeedback,
	orderSubmissionFeedback,
	orderSubmissionFeedbackCause,
} from "@/lib/trade/order-submission-feedback";
import {
	ensurePendingTradingActionFeedback,
	syncPendingTradingActionFeedback,
	updatePendingTradingActionFeedback,
} from "@/lib/trade/pending-trading-action-feedback";
import { classifyTradingActionError } from "@/lib/trade/trading-action-failure";
import type { Translate } from "@/lib/translate";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	usePendingTwapCancellations,
} from "@/stores/use-pending-trading-action-store";

export interface TwapCancelFeedback {
	tone: "error" | "warning";
	message: string;
}

type StoredTwapCancelFeedbackValue = OrderSubmissionFeedback | ActionFailure;

interface StoredTwapCancelFeedback {
	actionId?: string;
	env: "Mainnet" | "Testnet";
	owner: string | null;
	tone: "error" | "warning";
	value: StoredTwapCancelFeedbackValue;
}

interface TwapCancelExecutionContext {
	actionId: string;
	guardPasses: number;
	env: "Mainnet" | "Testnet";
	owner: string;
	params: ExchangeParams<"twapCancel">;
	lockWait: AbortController;
	signingIdentity: ExchangeSigningIdentity;
}

type QueuedTwapCancellations = Set<TwapCancelExecutionContext>;

const TWAP_CANCEL_LOCK_WAIT_MS = EXCHANGE_ACTION_START_DEADLINE_MS;

export function useTwapCancel() {
	const { t } = useLingui();
	const numberFormat = useNumberFormat();
	const markets = useMarkets();
	const { clientKey, env, exchangeSession } = useHyperliquid();
	const executionsRef = useRef(new Map<ExchangeParams<"twapCancel">["t"], TwapCancelExecutionContext>());
	const queuedRef = useRef<QueuedTwapCancellations>(new Set());

	function assertTwapCancelExecution(params: ExchangeParams<"twapCancel">) {
		const execution = executionsRef.current.get(params.t);
		const liveIdentity = liveIdentityRef.current;
		const pending = execution
			? getPendingTradingActionSnapshot().twapCancellations.find((action) => action.id === execution.actionId)
			: undefined;
		if (
			!execution ||
			params.a !== execution.params.a ||
			params.t !== execution.params.t ||
			!isTwapExecutionIdentityCurrent(execution, liveIdentity) ||
			!isSameExchangeSigningIdentity(execution.signingIdentity, liveIdentity.captureSigningIdentity()) ||
			pending?.phase !== "submitting" ||
			pending.env !== execution.env ||
			pending.owner !== execution.owner ||
			pending.twapId !== execution.params.t ||
			pending.assetId !== execution.params.a
		) {
			throw orderSubmissionFeedbackCause("twap-cancel-identity-changed");
		}
		execution.guardPasses += 1;
		if (execution.guardPasses >= 2) {
			getPendingTradingActionActions().markTwapCancellationRequestStarted(execution.actionId);
		}
	}

	const {
		mutateAsync: cancel,
		reset,
		captureSigningIdentity,
	} = useExchange("twapCancel", {
		executionGuard: assertTwapCancelExecution,
	});
	const liveIdentityRef = useRef({ clientKey, env, captureSigningIdentity });
	liveIdentityRef.current = { clientKey, env, captureSigningIdentity };
	const cancellations = usePendingTwapCancellations();
	const mountedRef = useRef(false);
	const [storedFeedback, setFeedback] = useState<StoredTwapCancelFeedback | null>(null);
	const normalizedOwner = clientKey === "disconnected" ? null : clientKey.toLowerCase();
	const activeCancellations = normalizedOwner
		? cancellations.filter((action) => action.env === env && action.owner === normalizedOwner)
		: [];
	const cancellingTwapId = activeCancellations[0]?.twapId ?? null;
	const storedFeedbackMatchesIdentity = storedFeedback?.env === env && storedFeedback.owner === normalizedOwner;
	const storedFeedbackActionActive =
		!storedFeedback?.actionId || activeCancellations.some((action) => action.id === storedFeedback.actionId);
	const feedback =
		storedFeedback && storedFeedbackMatchesIdentity && storedFeedbackActionActive
			? {
					tone: storedFeedback.tone,
					message: formatStoredTwapCancelFeedback(storedFeedback.value, (descriptor) => t(descriptor), numberFormat),
				}
			: null;

	useEffect(() => {
		mountedRef.current = true;
		const queued = queuedRef.current;
		return () => {
			mountedRef.current = false;
			for (const execution of queued) {
				voidQueuedTwapCancellation(queued, execution, orderSubmissionFeedback("twap-cancel-not-sent"));
			}
		};
	}, []);

	useEffect(() => {
		const queued = queuedRef.current;
		for (const execution of queued) {
			if (
				!exchangeSession.active ||
				!isTwapExecutionIdentityCurrent(execution, { clientKey, env }) ||
				!isSameExchangeSigningIdentity(execution.signingIdentity, liveIdentityRef.current.captureSigningIdentity())
			) {
				voidQueuedTwapCancellation(queued, execution, orderSubmissionFeedback("twap-cancel-identity-changed"));
			}
		}
	}, [clientKey, env, exchangeSession]);

	async function cancelTwap(coin: string, twapId: number): Promise<void> {
		if (activeCancellations.some((action) => action.twapId === twapId)) return;

		function reportBeforeQueue(value: OrderSubmissionFeedback) {
			const message = formatStoredTwapCancelFeedback(value, (descriptor) => t(descriptor), numberFormat);
			setFeedback({ tone: "error", value, env, owner: normalizedOwner });
			toast.error(message);
		}

		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			reportBeforeQueue(orderSubmissionFeedback("twap-cancel-not-sent"));
			return;
		}
		const assetId = markets.getAssetId(coin);
		if (typeof assetId !== "number") {
			reportBeforeQueue(orderSubmissionFeedback("twap-cancel-market-unavailable"));
			return;
		}

		if (clientKey === "disconnected") {
			reportBeforeQueue(orderSubmissionFeedback("coordination-unavailable"));
			return;
		}
		const signingIdentity = captureSigningIdentity();
		if (!signingIdentity) {
			reportBeforeQueue(orderSubmissionFeedback("twap-cancel-not-sent"));
			return;
		}

		const action = getPendingTradingActionActions().claimTwapCancellation({
			env,
			owner: clientKey,
			twapId,
			assetId,
		});
		if (!action) return;
		ensurePendingTradingActionFeedback(action, "twap-cancel");
		const execution: TwapCancelExecutionContext = {
			actionId: action.id,
			guardPasses: 0,
			env: action.env,
			owner: action.owner,
			params: { a: assetId, t: twapId },
			lockWait: new AbortController(),
			signingIdentity,
		};
		const executions = executionsRef.current;
		executions.set(twapId, execution);
		const queued = queuedRef.current;
		queued.add(execution);
		const lockWaitDeadline = startExchangeActionDeadline();
		function abandonLockWait(): void {
			const value = classifyActionError(new ExchangeActionDeadlineError());
			if (!voidQueuedTwapCancellation(queued, execution, value)) return;
			if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
				setFeedback({ tone: "error", value, env: execution.env, owner: execution.owner });
			}
		}
		const lockWaitTimer = setTimeout(abandonLockWait, TWAP_CANCEL_LOCK_WAIT_MS);
		reset();
		setFeedback(null);
		const pendingAction = action;
		function reportUnconfirmed(): void {
			getPendingTradingActionActions().markTwapCancellationUnconfirmed(pendingAction.id);
			syncPendingTradingActionFeedback({ ...pendingAction, phase: "unconfirmed" }, "twap-cancel");
			if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
				setFeedback({
					tone: "warning",
					value: orderSubmissionFeedback("twap-cancel-unconfirmed"),
					actionId: pendingAction.id,
					env: execution.env,
					owner: execution.owner,
				});
			}
		}
		let response: unknown;
		let sent = false;
		try {
			const lockResult = await runWithOrderAssetLocks(
				{ env: execution.env, owner: execution.owner, assetIds: [assetId] },
				async () => {
					clearTimeout(lockWaitTimer);
					if (hasExchangeActionDeadlinePassed(lockWaitDeadline)) abandonLockWait();
					if (!queued.delete(execution)) return false;
					sent = true;
					response = await cancel(execution.params);
					return true;
				},
				execution.lockWait.signal,
			);
			if (lockResult.supported && !lockResult.value) return;
			if (!lockResult.supported) {
				getPendingTradingActionActions().resolveTwapCancellation(action.id);
				const value = orderSubmissionFeedback("coordination-unavailable");
				updatePendingTradingActionFeedback(action, "twap-cancel", { status: "failed", error: value });
				if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
					setFeedback({ tone: "error", value, env: execution.env, owner: execution.owner });
				}
				return;
			}
			if (!isConfirmedTwapCancelResponse(response)) {
				reportUnconfirmed();
				return;
			}
			getPendingTradingActionActions().markTwapCancellationAccepted(action.id);
			syncPendingTradingActionFeedback({ ...action, phase: "awaiting" }, "twap-cancel");
		} catch (error) {
			if (!sent && !queued.has(execution)) return;
			if (execution.guardPasses >= 2 && isAmbiguousOrderRequestError(error)) {
				reportUnconfirmed();
				return;
			}

			getPendingTradingActionActions().resolveTwapCancellation(action.id);
			const value =
				getOrderSubmissionFeedback(error) ??
				classifyTradingActionError(error) ??
				orderSubmissionFeedback("twap-cancel-failed");
			updatePendingTradingActionFeedback(action, "twap-cancel", { status: "failed", error: value });
			if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
				setFeedback({ tone: "error", value, env: execution.env, owner: execution.owner });
			}
		} finally {
			clearTimeout(lockWaitTimer);
			queued.delete(execution);
			if (executions.get(twapId) === execution) executions.delete(twapId);
		}
	}

	return { cancelTwap, cancellingTwapId, feedback };
}

function formatStoredTwapCancelFeedback(
	value: StoredTwapCancelFeedbackValue,
	translate: Translate,
	numberFormat: NumberFormatters,
): string {
	if ("kind" in value && value.kind === "order-submission") return formatOrderSubmissionFeedback(value, translate);
	return (
		formatActionFailure(value, translate, numberFormat) ??
		formatOrderSubmissionFeedback(orderSubmissionFeedback("twap-cancel-failed"), translate)
	);
}

function voidQueuedTwapCancellation(
	queued: QueuedTwapCancellations,
	execution: TwapCancelExecutionContext,
	value: StoredTwapCancelFeedbackValue,
): boolean {
	if (!queued.delete(execution)) return false;
	execution.lockWait.abort();
	getPendingTradingActionActions().resolveTwapCancellation(execution.actionId);
	updatePendingTradingActionFeedback(
		{ id: execution.actionId, owner: execution.owner, env: execution.env },
		"twap-cancel",
		{ status: "failed", error: value },
	);
	return true;
}

function isTwapExecutionIdentityCurrent(
	execution: TwapCancelExecutionContext,
	liveIdentity: { clientKey: string; env: "Mainnet" | "Testnet" },
): boolean {
	return (
		liveIdentity.clientKey !== "disconnected" &&
		liveIdentity.clientKey.toLowerCase() === execution.owner &&
		liveIdentity.env === execution.env
	);
}
