import {
	captureExchangeRequestGeneration,
	ExchangeRequestInvalidatedError,
	ExchangeRequestScheduler,
	invalidateAllExchangeRequestIdentities,
	invalidateExchangeProviderLifecycle,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => invalidateAllExchangeRequestIdentities());

describe("exchange Provider lifecycle invalidation", () => {
	it("retires both signers of that lifecycle without retiring another Provider", async () => {
		const retired = { id: Symbol("retired"), active: true };
		const kept = { id: Symbol("kept"), active: true };
		const user = captureExchangeRequestGeneration("Mainnet", "owner-a", "wallet", { lifecycle: retired });
		const agent = captureExchangeRequestGeneration("Mainnet", "owner-a", "wallet", {
			lifecycle: retired,
			signer: "agent",
		});
		const other = captureExchangeRequestGeneration("Mainnet", "owner-b", "wallet", { lifecycle: kept });
		const scheduler = new ExchangeRequestScheduler();
		const run = vi.fn(async () => "sent");

		invalidateExchangeProviderLifecycle(retired);

		for (const generation of [user, agent]) {
			await expect(scheduler.schedule("normal", run, generation)).rejects.toBeInstanceOf(
				ExchangeRequestInvalidatedError,
			);
		}
		expect(run).not.toHaveBeenCalled();
		await expect(scheduler.schedule("normal", run, other)).resolves.toBe("sent");
	});

	it("aborts a waiting start gate immediately and allows the next request to start", async () => {
		const lifecycle = { id: Symbol("waiting"), active: true };
		const generation = captureExchangeRequestGeneration("Testnet", "owner", "agent-only", { lifecycle });
		const scheduler = new ExchangeRequestScheduler();
		const run = vi.fn(async () => "sent");
		let signal: AbortSignal | undefined;
		let resume: (() => void) | undefined;
		let entered: (() => void) | undefined;
		const gateEntered = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const pending = scheduler.schedule("normal", run, generation, (start, abortSignal) => {
			signal = abortSignal;
			entered?.();
			return new Promise((resolve) => {
				resume = () => resolve(start());
				abortSignal.addEventListener("abort", () => resolve({ status: "invalidated" }), { once: true });
			});
		});
		const rejected = expect(pending).rejects.toBeInstanceOf(ExchangeRequestInvalidatedError);
		await gateEntered;

		invalidateExchangeProviderLifecycle(lifecycle);

		expect(signal?.aborted).toBe(true);
		await rejected;
		resume?.();
		await expect(scheduler.schedule("urgent", async () => "next")).resolves.toBe("next");
		expect(run).not.toHaveBeenCalled();
	});

	it("leaves an already started submission to settle normally", async () => {
		const lifecycle = { id: Symbol("started"), active: true };
		const generation = captureExchangeRequestGeneration("Mainnet", "owner", "wallet", { lifecycle });
		const scheduler = new ExchangeRequestScheduler();
		let finish: ((value: string) => void) | undefined;
		let entered: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const pending = scheduler.schedule(
			"normal",
			() => {
				entered?.();
				return new Promise<string>((resolve) => {
					finish = resolve;
				});
			},
			generation,
		);
		await started;

		invalidateExchangeProviderLifecycle(lifecycle);
		finish?.("accepted");

		await expect(pending).resolves.toBe("accepted");
	});
});
