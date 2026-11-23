import { useState } from "react";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";

function isSameAddress(a: string | undefined, b: string | undefined): boolean {
	return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

/**
 * Whether funds dialogs keep what the session last settled on: only while the wallet session is resolving
 * (`useWalletSession().isResolving`: a reconnect, the wallet directory initialising, the expected wallet not
 * activated yet; bounded by `WALLET_SESSION_RESOLVING_MAX_MS`). A signed-in session that settles without its
 * wallet (the wallet reported a disconnect and Privy removed it from its directory,
 * docs/wallet-session-reconnect-practice.md E2) is not held: the dialogs follow the live session at once and
 * their drafts are lost, as before this hold existed; keeping them in that case is a follow-up.
 * A session that already observes another active wallet account (wagmi is connected to a `connectedWalletAddress`
 * that is not the wallet the session last settled on) is not held either, even while it is still resolving, so
 * nothing held for the previous account is shown in front of the new one. Before the first settled wallet nothing
 * is held for a previous account, so a resolving session keeps holding and the first settled identity is adopted
 * (`useFundsSessionKey`). The address wagmi still reports for the same wallet while it reconnects is not another
 * account, so that reconnect stays held.
 * Presentation and outcome attribution only. The app-level submission and context identity checks of Send,
 * Transfer and Withdraw compare the identity held through this hook, so they cannot see a change during the
 * hold. Liveness during the hold comes from hl-react: while the session resolves it exposes no wallet address,
 * so the client key is `"disconnected"`, and the session provider invalidates the request generation of the
 * previous client key when that happens; a request that has not started is dropped by the scheduler, and a new
 * one gets no registration lease (`wallet-session-resolving.test.tsx` pins the first half).
 */
export function useFundsSessionHold(): boolean {
	const { isResolving, walletAddress, connectedWalletAddress, walletConnected } = useWalletSession();
	const [settledWalletAddress, setSettledWalletAddress] = useState(walletAddress);
	if (walletAddress && !isSameAddress(walletAddress, settledWalletAddress)) {
		setSettledWalletAddress(walletAddress);
	}
	const anotherAccountObserved =
		settledWalletAddress !== undefined &&
		walletConnected &&
		connectedWalletAddress !== undefined &&
		!isSameAddress(connectedWalletAddress, settledWalletAddress);
	return isResolving && !anotherAccountObserved;
}
