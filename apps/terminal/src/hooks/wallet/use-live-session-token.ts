import { useLayoutEffect, useRef } from "react";

/**
 * A token for work that has not reached the exchange or a wallet prompt yet: a destination check,
 * a deposit or withdrawal preflight. It is a new object whenever the live session identity changes,
 * and `null` while the wallet session is resolving (`useWalletSession().isResolving`), so such work
 * captures the token when it starts and stops at its next step unless the token is still the same
 * object. A reconnect therefore cancels it, as any other session change does. `onInvalidate` runs when
 * a token stops being current, so the owner can abort pending reads and release busy states at once
 * instead of waiting for them to answer.
 *
 * This is the counterpart of `useHeldWhileResolving`, which keeps the identity of a request that
 * was already sent, so that its outcome is still reported after a reconnect to the same account.
 */
export function useLiveSessionToken(
	liveSessionKey: string,
	isResolving: boolean,
	onInvalidate?: () => void,
): { readonly current: object | null } {
	const tokenRef = useRef<object | null>(null);
	const onInvalidateRef = useRef(onInvalidate);
	useLayoutEffect(() => {
		onInvalidateRef.current = onInvalidate;
	});
	const settledKey = isResolving ? null : liveSessionKey;
	useLayoutEffect(() => {
		if (settledKey === null) return;
		const token = { key: settledKey };
		tokenRef.current = token;
		return () => {
			if (tokenRef.current === token) tokenRef.current = null;
			onInvalidateRef.current?.();
		};
	}, [settledKey]);
	return tokenRef;
}
