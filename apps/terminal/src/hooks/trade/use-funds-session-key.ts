import { useState } from "react";
import { useFundsSessionHold } from "@/hooks/trade/use-funds-session-hold";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid } from "@/lib/hyperliquid";

interface SettledFundsIdentity {
	identity: string | null;
	generation: number;
}

/**
 * The key a funds dialog (deposit, transfer, send, swap) is mounted under. It changes, remounting the
 * dialog and dropping its draft, when the network changes, the user signs out, or the wallet session
 * settles on another account, session mode, wallet or wallet kind. While the session is held
 * (`useFundsSessionHold`: only while it resolves) nothing changes,
 * so the dialog and its draft survive a reconnect to the same account. The first identity to settle after
 * a mount that happened while held is adopted without a remount. The network is never held. Presentation
 * only. It does not make the execution boundary check the live session: the app-level identity checks of Send,
 * Transfer and Withdraw compare the held identity, and a request in flight during the hold is stopped by
 * hl-react invalidating its generation when the client key becomes `"disconnected"` (`useFundsSessionHold`,
 * docs/wallet-session-reconnect-practice.md). Session checks at the signing boundary of an external wallet are
 * not part of this branch.
 */
export function useFundsSessionKey(): string {
	const { clientKey, env, sessionMode } = useHyperliquid();
	const { walletAddress, walletIntent } = useWalletSession();
	const holding = useFundsSessionHold();
	const walletIdentity = `${clientKey.toLowerCase()}:${sessionMode}:${walletAddress?.toLowerCase() ?? "disconnected"}:${walletIntent}`;
	const [settled, setSettled] = useState<SettledFundsIdentity>(() => ({
		identity: holding ? null : walletIdentity,
		generation: 0,
	}));
	if (!holding && settled.identity !== walletIdentity) {
		setSettled({
			identity: walletIdentity,
			generation: settled.identity === null ? settled.generation : settled.generation + 1,
		});
	}
	return `${env}:${settled.generation}`;
}
