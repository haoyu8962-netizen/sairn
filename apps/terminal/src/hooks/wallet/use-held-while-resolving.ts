import { useState } from "react";

/**
 * `value` as it was when the wallet session last settled, for as long as `held` is true; otherwise `value`
 * itself. Callers pass `useFundsSessionHold()`: true while the wallet session is resolving
 * (`useWalletSession().isResolving`: a reconnect, the wallet directory initialising, the expected wallet not
 * activated yet), unless another connected account is already observed. A reconnect briefly reports the
 * session as disconnected, and an identity that follows it would invalidate a dialog's draft or an in-flight
 * request only to settle back on the same account. A signed-in session whose wallet left the directory is not
 * resolving, so nothing is held then. When nothing has settled since mount, the live value is returned. The
 * held value is adopted with React's "adjust state during render" pattern, so an abandoned render never
 * changes it.
 *
 * Presentation and the outcome of a request that was already sent. Work that has not reached the exchange or a
 * wallet prompt yet follows the live session instead (`useLiveSessionToken`). The app-level submission and
 * context identity checks of Send, Transfer and Withdraw compare the held value, so they do not see a change
 * during the hold; what stops a request during the hold is hl-react: whenever the hold is on, the session
 * exposes no wallet address, the client key is `"disconnected"`, and the session provider invalidates the
 * request generation of the previous client key, so the scheduler drops a request that has not started and
 * `useExchange` captures no registration lease for a new one (pinned by `wallet-session-resolving.test.tsx`).
 */
export function useHeldWhileResolving<T>(value: T, held: boolean): T {
	const [settled, setSettled] = useState<{ value: T } | null>(() => (held ? null : { value }));
	if (!held && (settled === null || !Object.is(settled.value, value))) setSettled({ value });
	return held && settled !== null ? settled.value : value;
}
