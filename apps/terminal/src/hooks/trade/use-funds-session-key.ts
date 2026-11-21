import { useState } from "react";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid } from "@/lib/hyperliquid";

/**
 * The identity a funds dialog (deposit, transfer, send, swap) is mounted for: network, account,
 * session mode, wallet and wallet kind. A change remounts the dialog and drops its draft, which is
 * what a real change of account or network needs. While the wallet session is still being resolved
 * (`useWalletSession().isResolving`: a reconnect or the wallet directory initialising) the wallet
 * parts are held at their last settled value, so the dialog and its draft survive the transient
 * empty session and remount only if the session settles on a different identity. The network is
 * never held. Presentation only: every dialog still checks the live identity before it signs
 * (docs/mobile-data-presentation.md, wallet session resolving).
 */
export function useFundsSessionKey(): string {
	const { clientKey, env, sessionMode } = useHyperliquid();
	const { walletAddress, walletIntent, isResolving } = useWalletSession();
	const walletIdentity = `${clientKey.toLowerCase()}:${sessionMode}:${walletAddress?.toLowerCase() ?? "disconnected"}:${walletIntent}`;
	const [settledWalletIdentity, setSettledWalletIdentity] = useState(walletIdentity);
	if (!isResolving && settledWalletIdentity !== walletIdentity) setSettledWalletIdentity(walletIdentity);
	return `${env}:${isResolving ? settledWalletIdentity : walletIdentity}`;
}
