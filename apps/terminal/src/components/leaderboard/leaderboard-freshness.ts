import { useMemo, useSyncExternalStore } from "react";

export const LEADERBOARD_STALE_TIME_MS = 30_000;

export interface LeaderboardEmptySnapshotReceipt {
	monotonicReceivedAt: number;
	receivedAt: number;
}

export function getLeaderboardSnapshotRemainingMs(
	receipt: LeaderboardEmptySnapshotReceipt,
	wallNow: number,
	monotonicNow: number,
	maxAgeMs: number,
): number {
	const wallAgeMs = wallNow - receipt.receivedAt;
	const monotonicAgeMs = monotonicNow - receipt.monotonicReceivedAt;
	if (!Number.isFinite(wallAgeMs) || !Number.isFinite(monotonicAgeMs) || wallAgeMs < 0) return 0;
	return Math.max(0, maxAgeMs - Math.max(wallAgeMs, monotonicAgeMs));
}

function createEmptySnapshotFreshnessClock(receipt: LeaderboardEmptySnapshotReceipt | undefined, maxAgeMs: number) {
	let fresh =
		receipt !== undefined && getLeaderboardSnapshotRemainingMs(receipt, Date.now(), performance.now(), maxAgeMs) > 0;
	return {
		getSnapshot: () => fresh,
		subscribe(onExpired: () => void) {
			if (receipt === undefined || !fresh) return () => {};
			let timeout: ReturnType<typeof setTimeout> | undefined;
			function checkFreshness() {
				if (!fresh || receipt === undefined) return;
				if (timeout !== undefined) clearTimeout(timeout);
				timeout = undefined;
				const remainingMs = getLeaderboardSnapshotRemainingMs(receipt, Date.now(), performance.now(), maxAgeMs);
				if (remainingMs > 0) {
					timeout = setTimeout(checkFreshness, remainingMs);
					return;
				}
				fresh = false;
				onExpired();
			}
			checkFreshness();
			window.addEventListener("focus", checkFreshness);
			document.addEventListener("visibilitychange", checkFreshness);
			return () => {
				if (timeout !== undefined) clearTimeout(timeout);
				window.removeEventListener("focus", checkFreshness);
				document.removeEventListener("visibilitychange", checkFreshness);
			};
		},
	};
}

export function useLeaderboardEmptySnapshotFreshness(
	receipt: LeaderboardEmptySnapshotReceipt | undefined,
	maxAgeMs: number = LEADERBOARD_STALE_TIME_MS,
): boolean {
	const clock = useMemo(() => createEmptySnapshotFreshnessClock(receipt, maxAgeMs), [receipt, maxAgeMs]);
	return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}
