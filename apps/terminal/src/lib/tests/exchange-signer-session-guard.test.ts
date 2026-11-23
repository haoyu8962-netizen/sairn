// @vitest-environment jsdom

import type { IRequestTransport } from "@nktkas/hyperliquid";
import { createExchangeClient } from "@sairn/hl-react/clients";
import {
	captureExchangeRequestGeneration,
	ExchangeRequestInvalidatedError,
	invalidateExchangeRequestIdentity,
	markExchangeIdentityReplaced,
	scheduleExchangeRequest,
	unwrapExchangeSignerGuardError,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isExchangeRequestInvalidatedError } from "@/lib/errors/action-error";

const ACCOUNT = privateKeyToAccount(`0x${"0".repeat(63)}7`);
const OWNER = ACCOUNT.address.toLowerCase() as `0x${string}`;
const DESTINATION = "0x2222222222222222222222222222222222222222";
const AGENT_A = "0x3333333333333333333333333333333333333333";
const AGENT_B = "0x4444444444444444444444444444444444444444";

interface Gate {
	reached: Promise<void>;
	release: () => void;
}

function gate(): Gate & { wait: () => Promise<void> } {
	let release: () => void = () => {};
	let markReached: () => void = () => {};
	const reached = new Promise<void>((resolve) => {
		markReached = resolve;
	});
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		reached,
		release,
		wait: async () => {
			markReached();
			await released;
		},
	};
}

function setup(options: {
	holdChainId?: Gate & { wait: () => Promise<void> };
	holdSignature?: Gate & { wait: () => Promise<void> };
}) {
	const signTypedData = vi.fn(async (params: Parameters<typeof ACCOUNT.signTypedData>[0]) => {
		const signature = await ACCOUNT.signTypedData(params);
		await options.holdSignature?.wait();
		return signature;
	});
	const wallet = {
		signTypedData,
		getAddresses: async () => [ACCOUNT.address],
		getChainId: async () => {
			await options.holdChainId?.wait();
			return 42_161;
		},
	};
	const request = vi.fn(async () => ({ status: "ok", response: { type: "default" } }));
	const transport = { isTestnet: false, request } as unknown as IRequestTransport;
	const client = createExchangeClient(wallet as never, false, undefined, transport);
	return { client, signTypedData, request };
}

function withdraw(
	client: ReturnType<typeof setup>["client"],
	signer: "user" | "agent" = "user",
	proof: { agentPublicKey?: string; registrationEpoch?: string } = {},
) {
	const generation = captureExchangeRequestGeneration("Mainnet", OWNER, "wallet", { signer, ...proof });
	return scheduleExchangeRequest(
		client,
		"normal",
		() => client.withdraw3({ destination: DESTINATION, amount: "1" }).catch(unwrapExchangeSignerGuardError),
		generation,
	);
}

describe("exchange signer session guard (ADR 0058)", () => {
	beforeAll(() => {
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: {
				request(name: string, options: unknown, maybeCallback?: (lock: Lock | null) => unknown) {
					const callback = (typeof options === "function" ? options : maybeCallback) as (lock: Lock | null) => unknown;
					return Promise.resolve(callback({ name, mode: "exclusive" } as Lock));
				},
			},
		});
	});

	afterEach(() => {
		markExchangeIdentityReplaced("Mainnet", OWNER);
	});

	it("never asks the wallet to sign once the session became unresolved before the signature", async () => {
		const holdChainId = gate();
		const { client, signTypedData, request } = setup({ holdChainId });
		const pending = withdraw(client);
		await holdChainId.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		holdChainId.release();

		const error = await pending.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ExchangeRequestInvalidatedError);
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("before-signature");
		expect(isExchangeRequestInvalidatedError(error)).toBe(true);
		expect(signTypedData).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});

	it("sends what the owner signed when the session is only unresolved after the signature", async () => {
		const holdSignature = gate();
		const { client, signTypedData, request } = setup({ holdSignature });
		const pending = withdraw(client);
		await holdSignature.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		holdSignature.release();

		await expect(pending).resolves.toMatchObject({ status: "ok" });
		expect(signTypedData).toHaveBeenCalledOnce();
		expect(request).toHaveBeenCalledOnce();
	});

	it("does not send a signature once the unresolved session settled on another identity", async () => {
		const holdSignature = gate();
		const { client, request } = setup({ holdSignature });
		const pending = withdraw(client);
		await holdSignature.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		markExchangeIdentityReplaced("Mainnet", OWNER);
		holdSignature.release();

		const error = await pending.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ExchangeRequestInvalidatedError);
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("after-signature");
		expect(request).not.toHaveBeenCalled();
	});

	it("does not send a signature after a direct switch to another identity", async () => {
		const holdSignature = gate();
		const { client, request } = setup({ holdSignature });
		const pending = withdraw(client);
		await holdSignature.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet");
		holdSignature.release();

		await expect(pending).rejects.toMatchObject({ phase: "after-signature" });
		expect(request).not.toHaveBeenCalled();
	});

	it("does not send an unresolved Agent signature once the Agent key was replaced", async () => {
		const holdSignature = gate();
		const { client, request } = setup({ holdSignature });
		const pending = withdraw(client, "agent", { agentPublicKey: AGENT_A });
		await holdSignature.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		invalidateExchangeRequestIdentity("Mainnet", OWNER, undefined, "agent");
		holdSignature.release();

		const error = await pending.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ExchangeRequestInvalidatedError);
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("after-signature");
		expect(request).not.toHaveBeenCalled();
	});

	it("keeps an unresolved owner signature when only the Agent signer was replaced", async () => {
		const holdSignature = gate();
		const { client, request } = setup({ holdSignature });
		const pending = withdraw(client, "user");
		await holdSignature.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		invalidateExchangeRequestIdentity("Mainnet", OWNER, undefined, "agent");
		holdSignature.release();

		await expect(pending).resolves.toMatchObject({ status: "ok" });
		expect(request).toHaveBeenCalledOnce();
	});

	it("does not send an unresolved signature once the session came back with another Agent key", async () => {
		const holdSignature = gate();
		const { client, request } = setup({ holdSignature });
		const pending = withdraw(client, "agent", { agentPublicKey: AGENT_A });
		await holdSignature.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		captureExchangeRequestGeneration("Mainnet", OWNER, "wallet", { signer: "agent", agentPublicKey: AGENT_B });
		holdSignature.release();

		const error = await pending.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ExchangeRequestInvalidatedError);
		expect((error as ExchangeRequestInvalidatedError).phase).toBe("after-signature");
		expect(request).not.toHaveBeenCalled();
	});

	it("sends an unresolved signature when the session came back with the same proof", async () => {
		const holdSignature = gate();
		const { client, request } = setup({ holdSignature });
		const pending = withdraw(client, "agent", { agentPublicKey: AGENT_A });
		await holdSignature.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		captureExchangeRequestGeneration("Mainnet", OWNER, "wallet", { signer: "agent", agentPublicKey: AGENT_A });
		holdSignature.release();

		await expect(pending).resolves.toMatchObject({ status: "ok" });
		expect(request).toHaveBeenCalledOnce();
	});

	it("does not send an unresolved signature once the returned session later changed its Agent key", async () => {
		const holdSignature = gate();
		const { client, request } = setup({ holdSignature });
		const pending = withdraw(client, "agent", { agentPublicKey: AGENT_A });
		await holdSignature.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		captureExchangeRequestGeneration("Mainnet", OWNER, "wallet", { signer: "agent", agentPublicKey: AGENT_A });
		captureExchangeRequestGeneration("Mainnet", OWNER, "wallet", { signer: "agent", agentPublicKey: AGENT_B });
		holdSignature.release();

		await expect(pending).rejects.toMatchObject({ phase: "after-signature" });
		expect(request).not.toHaveBeenCalled();
	});

	it("lets an Agent signature through an unresolved session, since it prompts no wallet", async () => {
		const holdChainId = gate();
		const { client, signTypedData, request } = setup({ holdChainId });
		const pending = withdraw(client, "agent");
		await holdChainId.reached;

		invalidateExchangeRequestIdentity("Mainnet", OWNER, "wallet", undefined, "unresolved");
		holdChainId.release();

		await expect(pending).resolves.toMatchObject({ status: "ok" });
		expect(signTypedData).toHaveBeenCalledOnce();
		expect(request).toHaveBeenCalledOnce();
	});
});
