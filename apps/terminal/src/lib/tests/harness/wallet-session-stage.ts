// Drives the real useWalletSession() in component tests. Only the SDK boundary is replaced: Privy
// (usePrivy, useWallets), wagmi (useConnection) and the Hyperliquid session context that the real
// provider derives from the wallet session. A stage is one observable combination of those inputs.
//
// Usage, in a test file:
//   vi.mock("@privy-io/react-auth", async () => (await import("./harness/wallet-session-stage")).privyMock);
//   vi.mock("wagmi", async () => (await import("./harness/wallet-session-stage")).wagmiMock);
//   vi.mock("@privy-io/wagmi", async () => (await import("./harness/wallet-session-stage")).privyWagmiMock);
// and spread hyperliquidSessionMock into the test's "@/lib/hyperliquid" mock.

import { useSyncExternalStore } from "react";
import { resetWalletSessionResolvingClock } from "@/lib/wallet/session-resolving-clock";

export const SESSION_OWNER = "0x1111111111111111111111111111111111111111";
export const OTHER_OWNER = "0x3333333333333333333333333333333333333333";
export const AGENT_ONLY_OWNER = "0x5555555555555555555555555555555555555555";

export type WalletSessionStage =
	// Privy has not finished initialising, in a browser that holds a stored Privy session.
	| "authentication-initialising"
	// Privy has not finished initialising, in a browser that never signed in.
	| "authentication-initialising-first-visit"
	// Signed in, Privy's wallet directory is still initialising.
	| "directory-initialising"
	// Signed in, the expected wallet is in the directory, wagmi has not connected it yet.
	| "activating"
	// Signed in, wagmi is connecting for the first time.
	| "connecting"
	// Signed in, wagmi is reconnecting the wallet it had (Privy refreshed the user object, ADR 0033).
	| "reconnecting"
	// The exact owner wallet is the active wagmi account.
	| "connected"
	// Another user's wallet is the session now: a real owner change.
	| "connected-other-owner"
	// The same user's wallet extension switched to another account: wagmi's account is not the expected wallet.
	| "connected-other-account"
	// Signed in, but the expected wallet is not in the directory and wagmi is idle.
	| "wallet-missing"
	// Privy is ready and nobody is signed in.
	| "signed-out"
	// A desktop-approved key imported on this phone; the Privy identity is masked.
	| "agent-only"
	// The same imported key in front of a signed-in Privy session whose wallet is not active.
	| "agent-only-over-wallet";

interface StageInputs {
	// Whether this browser holds Privy's session tokens (lib/wallet/privy-session-hint.ts).
	storedSession: boolean;
	ready: boolean;
	authenticated: boolean;
	walletsReady: boolean;
	// The wallet the signed-in user is expected to trade with, and the wallets Privy lists as connected.
	userWallet: string;
	directory: readonly string[];
	connectedAddress: string | undefined;
	isConnecting: boolean;
	isReconnecting: boolean;
	agentOnly: boolean;
}

const BASE: StageInputs = {
	storedSession: true,
	ready: true,
	authenticated: true,
	walletsReady: true,
	userWallet: SESSION_OWNER,
	directory: [SESSION_OWNER],
	connectedAddress: undefined,
	isConnecting: false,
	isReconnecting: false,
	agentOnly: false,
};

const STAGES: Record<WalletSessionStage, StageInputs> = {
	"authentication-initialising": { ...BASE, ready: false, authenticated: false, walletsReady: false, directory: [] },
	"authentication-initialising-first-visit": {
		...BASE,
		storedSession: false,
		ready: false,
		authenticated: false,
		walletsReady: false,
		directory: [],
	},
	"directory-initialising": { ...BASE, walletsReady: false, directory: [] },
	activating: BASE,
	connecting: { ...BASE, isConnecting: true },
	reconnecting: { ...BASE, connectedAddress: SESSION_OWNER, isReconnecting: true },
	connected: { ...BASE, connectedAddress: SESSION_OWNER },
	"connected-other-owner": {
		...BASE,
		userWallet: OTHER_OWNER,
		directory: [OTHER_OWNER],
		connectedAddress: OTHER_OWNER,
	},
	"connected-other-account": { ...BASE, directory: [SESSION_OWNER, OTHER_OWNER], connectedAddress: OTHER_OWNER },
	"wallet-missing": { ...BASE, directory: [] },
	"signed-out": { ...BASE, storedSession: false, authenticated: false, directory: [] },
	"agent-only": { ...BASE, authenticated: false, directory: [], agentOnly: true },
	"agent-only-over-wallet": { ...BASE, agentOnly: true },
};

const listeners = new Set<() => void>();
let stage: WalletSessionStage = "connected";

/** Starts a test case: sets the stage and closes any resolving wait the previous case left open. */
export function resetWalletSessionStage(next: WalletSessionStage): void {
	resetWalletSessionResolvingClock();
	setWalletSessionStage(next);
}

export function setWalletSessionStage(next: WalletSessionStage): void {
	stage = next;
	if (STAGES[next].storedSession) window.localStorage.setItem("privy:token", "stage");
	else window.localStorage.removeItem("privy:token");
	for (const listener of listeners) listener();
}

export function getWalletSessionStage(): WalletSessionStage {
	return stage;
}

export function subscribeWalletSessionStage(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function inputs(): StageInputs {
	return STAGES[stage];
}

// The stubs subscribe like the real SDK hooks do, so a stage change re-renders every consumer even
// where React Compiler has cached the component around an unchanged prop set.
function useStageInputs(): StageInputs {
	return STAGES[useSyncExternalStore(subscribeWalletSessionStage, getWalletSessionStage)];
}

function privyUser(address: string) {
	const wallet = { type: "wallet", address, walletClientType: "metamask", connectorType: "injected" };
	return { id: "did:privy:session-stage", wallet, linkedAccounts: [wallet] };
}

function directoryWallets() {
	return inputs().directory.map((address) => ({ address, walletClientType: "metamask", connectorType: "injected" }));
}

const noop = () => {};

export const privyMock = {
	usePrivy: () => {
		const current = useStageInputs();
		return {
			ready: current.ready,
			authenticated: current.authenticated,
			isModalOpen: false,
			login: noop,
			logout: async () => {},
			user: current.authenticated ? privyUser(current.userWallet) : null,
		};
	},
	useWallets: () => ({ ready: useStageInputs().walletsReady, wallets: directoryWallets() }),
	useConnectWallet: () => ({ connectWallet: noop }),
	useCreateWallet: () => ({ createWallet: async () => ({ address: SESSION_OWNER }) }),
};

export const wagmiMock = {
	useConnection: () => {
		const current = useStageInputs();
		const settled = !current.isConnecting && !current.isReconnecting;
		return {
			address: current.connectedAddress,
			isConnected: !!current.connectedAddress,
			isConnecting: current.isConnecting,
			isReconnecting: current.isReconnecting,
			status: settled ? (current.connectedAddress ? "connected" : "disconnected") : "reconnecting",
		};
	},
};

export const privyWagmiMock = {
	useSetActiveWallet: () => ({ setActiveWallet: async () => {} }),
};

/** What HyperliquidProvider resolves from the wallet session of the current stage (signing/agent-session.ts). */
export function useHyperliquidSession(): {
	clientKey: string;
	env: "Mainnet";
	sessionMode: "wallet" | "agent-only" | "disconnected";
} {
	const current = useStageInputs();
	if (current.agentOnly) return { clientKey: AGENT_ONLY_OWNER, env: "Mainnet", sessionMode: "agent-only" };
	const settled = current.ready && current.walletsReady && !current.isConnecting && !current.isReconnecting;
	const expectedWalletActive =
		current.directory.includes(current.userWallet) && current.connectedAddress === current.userWallet;
	if (settled && current.authenticated && expectedWalletActive) {
		return { clientKey: current.userWallet, env: "Mainnet", sessionMode: "wallet" };
	}
	return { clientKey: "disconnected", env: "Mainnet", sessionMode: "disconnected" };
}

export const hyperliquidSessionMock = {
	useHyperliquidOptional: useHyperliquidSession,
	useHyperliquid: useHyperliquidSession,
	getActiveAgentOwner: () => (inputs().agentOnly ? { env: "Mainnet", address: AGENT_ONLY_OWNER } : null),
	closeAgentRegistrationSessionAndRemove: async () => ({ status: "closed" }),
};
