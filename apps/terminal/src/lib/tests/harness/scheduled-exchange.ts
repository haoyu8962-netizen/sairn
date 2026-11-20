import * as clients from "@sairn/hl-react/hooks/useClients";
import { useExchange } from "@sairn/hl-react/hooks/useExchange";
import * as provider from "@sairn/hl-react/provider";
import { activateAgentRegistrationSession } from "@sairn/hl-react/signing/agent-registration-session";
import { onTestFinished, vi } from "vitest";
import * as app from "@/lib/hyperliquid";
import * as ownerSigner from "../../../../../../packages/hl-react/src/signing/owner-signer-provider";
import { createExchangeHarness } from "./hyperliquid-exchange";

const OWNER = "0x1111111111111111111111111111111111111111";

export async function installScheduledExchange() {
	const sdk = createExchangeHarness(false);
	const heldLocks = new Set<string>();
	const previousLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
	Object.defineProperty(navigator, "locks", {
		configurable: true,
		value: {
			async request(name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) {
				if (heldLocks.has(name)) throw new Error(`Unexpected concurrent lock request: ${name}`);
				heldLocks.add(name);
				try {
					return await callback({ name, mode: options.mode ?? "exclusive" } as Lock);
				} finally {
					heldLocks.delete(name);
				}
			},
		},
	});
	const sessionKey = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;
	const oldSession = localStorage.getItem(sessionKey);
	onTestFinished(() => {
		if (previousLocks) Object.defineProperty(navigator, "locks", previousLocks);
		else Reflect.deleteProperty(navigator, "locks");
		if (oldSession === null) localStorage.removeItem(sessionKey);
		else localStorage.setItem(sessionKey, oldSession);
	});
	if (!(await activateAgentRegistrationSession("Mainnet", OWNER))) throw new Error("Could not activate test owner");

	const allowed = { acceptedTerms: true, userAllowed: true, restrictions: "n" };
	const legalCheck = vi.fn(async () => allowed);
	function delayLegalCheck() {
		let release!: () => void;
		legalCheck.mockReturnValueOnce(
			new Promise((resolve) => {
				release = () => resolve(allowed);
			}),
		);
		return release;
	}
	const context = vi.spyOn(provider, "useHyperliquid").mockReturnValue({
		clientKey: OWNER,
		sessionMode: "wallet",
		env: "Mainnet",
		exchangeLifecycle: { active: true, id: Symbol() },
		info: { legalCheck },
		enforceLegalActions: true,
	} as unknown as provider.HyperliquidContextValue);
	const wallet = vi
		.spyOn(ownerSigner, "useHyperliquidOwnerSigner")
		.mockReturnValue({ ownerAddress: OWNER, wallet: null, assertCurrent: () => {} });
	const sdkClients = vi.spyOn(clients, "useHyperliquidClients").mockReturnValue({
		trading: sdk.client,
		user: sdk.client,
		userWalletMismatch: false,
		agentPublicKey: null,
	} as unknown as clients.HyperliquidClients);
	const exchange = vi.spyOn(app, "useExchange").mockImplementation(useExchange);
	onTestFinished(() => {
		exchange.mockRestore();
		sdkClients.mockRestore();
		wallet.mockRestore();
		context.mockRestore();
	});
	return { ...sdk, legalCheck, delayLegalCheck, allowed, heldLocks };
}
