import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { Hash } from "viem";
import { isDefinitiveDepositSourceFailure } from "@/lib/hyperliquid/deposit-source-error";
import {
	CctpAuthorizationConsumerNotFoundError,
	type CctpDepositEnvironment,
	CctpDepositOutcomeUnknownError,
	type CctpDepositTrackingRecord,
	CctpDirectAuthorizationExpiredError,
	fetchArbitrumCctpSourceReceiptStatus,
	fetchCircleCctpDepositStatus,
	getCctpDepositTrackingStorageSnapshot,
	readCctpDepositAuthorizationConsumer,
	readCctpDepositTrackingRecords,
	removeCctpDepositTrackingRecord,
	removeCctpSponsoredAuthorizationIntent,
	saveCctpDepositAuthorizationConsumer,
	subscribeCctpDepositTrackingRecords,
} from "@/lib/trade/cctp-deposit-tracking";

const CCTP_DEPOSIT_STATUS_POLL_MS = 5_000;
// Polls (one request round each, without query retries, so at least one poll interval apart) whose
// complete authorization-log search came back empty before the deposit is settled as status unknown.
export const CCTP_CONSUMER_NOT_FOUND_POLLS_BEFORE_UNKNOWN = 3;
const EMPTY_TRACKING_SNAPSHOT = "";
const consumerNotFoundPolls = new WeakMap<QueryClient, Map<string, number>>();

function getConsumerNotFoundPolls(queryClient: QueryClient): Map<string, number> {
	let polls = consumerNotFoundPolls.get(queryClient);
	if (!polls) {
		polls = new Map();
		consumerNotFoundPolls.set(queryClient, polls);
	}
	return polls;
}

function isSettledTrackingOutcome(error: unknown): boolean {
	return isDefinitiveDepositSourceFailure(error) || error instanceof CctpDepositOutcomeUnknownError;
}

function readStoredAuthorizationConsumer(record: CctpDepositTrackingRecord): Hash | undefined {
	try {
		return readCctpDepositAuthorizationConsumer(record) ?? undefined;
	} catch {
		return undefined;
	}
}

function getServerTrackingSnapshot() {
	return EMPTY_TRACKING_SNAPSHOT;
}

export function useCctpDepositTracking({
	enabled,
	env,
	owner,
	poll = true,
	removeOnForwardSubmitted = false,
	sourceHash,
}: {
	enabled: boolean;
	env: CctpDepositEnvironment;
	owner: string | undefined;
	poll?: boolean;
	removeOnForwardSubmitted?: boolean;
	sourceHash?: Hash;
}) {
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			if (!enabled || !owner) return () => undefined;
			try {
				return subscribeCctpDepositTrackingRecords(env, owner, onStoreChange);
			} catch {
				return () => undefined;
			}
		},
		[enabled, env, owner],
	);
	const getSnapshot = useCallback(() => {
		if (!enabled || !owner) return EMPTY_TRACKING_SNAPSHOT;
		try {
			return getCctpDepositTrackingStorageSnapshot(env, owner);
		} catch {
			return "unavailable";
		}
	}, [enabled, env, owner]);
	const trackingSnapshot = useSyncExternalStore(subscribe, getSnapshot, getServerTrackingSnapshot);
	const recoveryRecord = (() => {
		void trackingSnapshot;
		if (!enabled || !owner) return null;
		try {
			const records = readCctpDepositTrackingRecords(env, owner);
			return (sourceHash ? records.find((record) => record.sourceHash === sourceHash) : records[0]) ?? null;
		} catch {
			return null;
		}
	})();
	const activeTrackedSourceHash = sourceHash ?? recoveryRecord?.sourceHash;
	const trackingScope = `${env}:${owner?.toLowerCase() ?? ""}`;
	const queryClient = useQueryClient();
	const definitiveFailureRef = useRef<{
		error: Error;
		scope: string;
		sourceHash: Hash;
	} | null>(null);
	useEffect(() => {
		const previousFailure = definitiveFailureRef.current;
		if (
			previousFailure &&
			(previousFailure.scope !== trackingScope ||
				(activeTrackedSourceHash && previousFailure.sourceHash !== activeTrackedSourceHash))
		) {
			definitiveFailureRef.current = null;
		}
	}, [activeTrackedSourceHash, trackingScope]);
	const retainedDefinitiveFailure =
		definitiveFailureRef.current?.scope === trackingScope &&
		(!activeTrackedSourceHash || definitiveFailureRef.current.sourceHash === activeTrackedSourceHash)
			? definitiveFailureRef.current
			: null;
	const trackedSourceHash = activeTrackedSourceHash ?? retainedDefinitiveFailure?.sourceHash;
	const query = useQuery({
		queryKey: [
			"circle",
			"cctp",
			"deposit-status",
			env,
			trackedSourceHash,
			recoveryRecord?.amount,
			recoveryRecord?.mode,
			recoveryRecord?.authNonce,
		],
		queryFn: async ({ signal }) => {
			if (!recoveryRecord) return { status: "waiting" } as const;
			const notFoundPolls = getConsumerNotFoundPolls(queryClient);
			const notFoundKey = `${env}:${recoveryRecord.owner}:${recoveryRecord.sourceHash}`;
			const sourceReceipt = await fetchArbitrumCctpSourceReceiptStatus({
				amount: recoveryRecord.amount,
				env,
				owner: recoveryRecord.owner,
				sourceHash: trackedSourceHash ?? "",
				...(recoveryRecord.mode === "sponsored"
					? { mode: "sponsored" as const, authNonce: recoveryRecord.authNonce }
					: {
							mode: "direct" as const,
							authNonce: recoveryRecord.authNonce,
							validBefore: recoveryRecord.validBefore,
							sourceBlock: recoveryRecord.sourceBlock,
							consumingHash: readStoredAuthorizationConsumer(recoveryRecord),
						}),
				signal,
			}).catch((error: unknown) => {
				if (!(error instanceof CctpAuthorizationConsumerNotFoundError)) throw error;
				const polls = (notFoundPolls.get(notFoundKey) ?? 0) + 1;
				if (polls < CCTP_CONSUMER_NOT_FOUND_POLLS_BEFORE_UNKNOWN) {
					notFoundPolls.set(notFoundKey, polls);
					throw error;
				}
				notFoundPolls.delete(notFoundKey);
				throw new CctpDepositOutcomeUnknownError();
			});
			notFoundPolls.delete(notFoundKey);
			if (sourceReceipt.status === "pending") return { status: "waiting" } as const;
			if (recoveryRecord.mode === "direct" && sourceReceipt.sourceHash !== recoveryRecord.sourceHash) {
				try {
					saveCctpDepositAuthorizationConsumer({
						consumingHash: sourceReceipt.sourceHash,
						env,
						owner: recoveryRecord.owner,
						sourceHash: recoveryRecord.sourceHash,
					});
				} catch {
					// Without the stored consumer the next poll finds it again from the authorization logs.
				}
			}
			if (recoveryRecord.authNonce) {
				try {
					removeCctpSponsoredAuthorizationIntent(env, recoveryRecord.owner, recoveryRecord.authNonce);
				} catch {
					// A consumed authorization may safely retain its expiring local tombstone.
				}
			}
			return fetchCircleCctpDepositStatus({
				amount: recoveryRecord.amount,
				env,
				mode: recoveryRecord.mode,
				owner: recoveryRecord.owner,
				sourceHash: sourceReceipt.sourceHash,
				signal,
			});
		},
		enabled: enabled && poll && !!owner && !!activeTrackedSourceHash && !!recoveryRecord && !retainedDefinitiveFailure,
		refetchInterval: poll
			? (state) =>
					state.state.data?.status === "forward-submitted" || isSettledTrackingOutcome(state.state.error)
						? false
						: CCTP_DEPOSIT_STATUS_POLL_MS
			: false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: poll,
		retry: (failureCount, error) =>
			!isSettledTrackingOutcome(error) &&
			!(error instanceof CctpAuthorizationConsumerNotFoundError) &&
			failureCount < 2,
		staleTime: 0,
	});

	useEffect(() => {
		if (!owner || !trackedSourceHash || !query.error || !isSettledTrackingOutcome(query.error)) return;
		definitiveFailureRef.current = {
			error: query.error,
			scope: trackingScope,
			sourceHash: trackedSourceHash,
		};
		if (recoveryRecord?.sourceHash !== trackedSourceHash) return;
		if (
			(query.error instanceof CctpDirectAuthorizationExpiredError ||
				query.error instanceof CctpDepositOutcomeUnknownError) &&
			recoveryRecord.authNonce
		) {
			try {
				removeCctpSponsoredAuthorizationIntent(env, owner, recoveryRecord.authNonce);
			} catch {
				// The authorization can no longer execute: expired unused, or used. Another authorization's
				// placeholder, or storage that cannot be updated, stays until it expires.
			}
		}
		try {
			removeCctpDepositTrackingRecord(env, owner, trackedSourceHash);
		} catch {}
	}, [
		env,
		owner,
		query.error,
		recoveryRecord?.authNonce,
		recoveryRecord?.sourceHash,
		trackedSourceHash,
		trackingScope,
	]);

	useEffect(() => {
		if (!removeOnForwardSubmitted || !owner || !trackedSourceHash || query.data?.status !== "forward-submitted") {
			return;
		}
		try {
			removeCctpDepositTrackingRecord(env, owner, trackedSourceHash);
		} catch {
			// Keep the recovery record when browser storage cannot be updated.
		}
	}, [env, owner, query.data?.status, removeOnForwardSubmitted, trackedSourceHash]);

	const definitiveFailure =
		(isSettledTrackingOutcome(query.error) ? query.error : null) ?? retainedDefinitiveFailure?.error ?? null;

	return {
		...query,
		error: definitiveFailure ?? query.error,
		isError: !!definitiveFailure || query.isError,
		recoveryRecord,
		trackedSourceHash,
	};
}
