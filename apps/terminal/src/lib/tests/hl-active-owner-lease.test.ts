import {
	captureActiveAgentOwnerExecutionLease,
	runWithActiveAgentOwnerExecutionLease,
} from "@sairn/hl-react/signing/agent-session";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const OTHER = "0x1111111111111111111111111111111111111111";
const EPOCH = "activation-epoch-one";
const STORAGE_KEY = "hyperliquid_active_agent_owner";
let records: Map<string, string>;

function writeOwner(overrides: Record<string, unknown> = {}) {
	records.set(STORAGE_KEY, JSON.stringify({ env: "Mainnet", address: OWNER, activationEpoch: EPOCH, ...overrides }));
}

beforeEach(() => {
	records = new Map();
	vi.stubGlobal("window", { localStorage: { getItem: (key: string) => records.get(key) ?? null } });
	vi.stubGlobal("navigator", {
		locks: { request: vi.fn(async (_name: string, _options: unknown, action: () => unknown) => action()) },
	});
	writeOwner();
});

afterEach(() => vi.unstubAllGlobals());

describe("active Agent-only owner execution lease", () => {
	it("captures the exact owner, network and activation with case-insensitive owner matching", () => {
		const checksummed = getAddress(OWNER);
		expect(checksummed).not.toBe(OWNER);
		expect(captureActiveAgentOwnerExecutionLease("Mainnet", checksummed)).toEqual({
			env: "Mainnet",
			address: OWNER,
			activationEpoch: EPOCH,
		});
		expect(captureActiveAgentOwnerExecutionLease("Testnet", OWNER)).toBeNull();
		expect(captureActiveAgentOwnerExecutionLease("Mainnet", OTHER)).toBeNull();
	});

	it.each([undefined, "short", null])("cannot authorize a record without a valid activation epoch: %s", (epoch) => {
		writeOwner({ activationEpoch: epoch });
		expect(captureActiveAgentOwnerExecutionLease("Mainnet", OWNER)).toBeNull();
	});

	it("fails closed for missing, malformed or inaccessible storage", () => {
		records.clear();
		expect(captureActiveAgentOwnerExecutionLease("Mainnet", OWNER)).toBeNull();
		records.set(STORAGE_KEY, "not-json");
		expect(captureActiveAgentOwnerExecutionLease("Mainnet", OWNER)).toBeNull();
		vi.stubGlobal("window", {
			get localStorage() {
				throw new Error("storage unavailable");
			},
		});
		expect(captureActiveAgentOwnerExecutionLease("Mainnet", OWNER)).toBeNull();
	});

	it("runs once and returns the action result for the current activation", async () => {
		const lease = captureActiveAgentOwnerExecutionLease("Mainnet", OWNER);
		if (!lease) throw new Error("Missing fixture lease");
		const result = { submitted: true };
		const action = vi.fn(() => result);
		await expect(runWithActiveAgentOwnerExecutionLease(lease, action)).resolves.toBe(result);
		expect(action).toHaveBeenCalledOnce();
	});

	it.each([{ env: "Testnet" }, { address: OTHER }, { activationEpoch: "activation-epoch-two" }])(
		"rejects an owner, network or activation changed since capture: %j",
		async (changed) => {
			const lease = captureActiveAgentOwnerExecutionLease("Mainnet", OWNER);
			if (!lease) throw new Error("Missing fixture lease");
			writeOwner(changed);
			const action = vi.fn();
			await expect(runWithActiveAgentOwnerExecutionLease(lease, action)).resolves.toBeNull();
			expect(action).not.toHaveBeenCalled();
		},
	);

	it("rechecks the activation after acquiring the lock, so waiting cannot revive a retired session", async () => {
		const lease = captureActiveAgentOwnerExecutionLease("Mainnet", OWNER);
		if (!lease) throw new Error("Missing fixture lease");
		let unlock: (() => void) | undefined;
		const waiting = new Promise<void>((resolve) => {
			unlock = resolve;
		});
		vi.stubGlobal("navigator", {
			locks: {
				request: async (_name: string, _options: unknown, action: () => unknown) => {
					await waiting;
					return action();
				},
			},
		});
		const action = vi.fn();
		const pending = runWithActiveAgentOwnerExecutionLease(lease, action);
		expect(action).not.toHaveBeenCalled();
		writeOwner({ activationEpoch: "activation-epoch-two" });
		unlock?.();
		await expect(pending).resolves.toBeNull();
		expect(action).not.toHaveBeenCalled();
	});

	it("does not execute when the owner disappears or the locking API is unavailable", async () => {
		const lease = captureActiveAgentOwnerExecutionLease("Mainnet", OWNER);
		if (!lease) throw new Error("Missing fixture lease");
		const action = vi.fn();
		records.clear();
		await expect(runWithActiveAgentOwnerExecutionLease(lease, action)).resolves.toBeNull();
		writeOwner();
		vi.stubGlobal("navigator", {});
		await expect(runWithActiveAgentOwnerExecutionLease(lease, action)).resolves.toBeNull();
		expect(action).not.toHaveBeenCalled();
	});
});
