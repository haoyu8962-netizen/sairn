import { ExchangeClient, type IRequestTransport } from "@nktkas/hyperliquid";
import {
	assertExchangeActionAcknowledged,
	ExchangeResponseUnverifiedError,
} from "@sairn/hl-react/internal/exchange/action-acknowledgement";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { isAmbiguousExchangeActionError } from "@/lib/errors/format";

const DESTINATION = "0x2222222222222222222222222222222222222222";
const ACKNOWLEDGED = { status: "ok", response: { type: "default" } };
const FUNDS_METHODS = [
	"sendAsset",
	"sendToEvmWithData",
	"spotSend",
	"usdClassTransfer",
	"usdSend",
	"withdraw3",
] as const;

function createClient(answer: unknown) {
	const transport: IRequestTransport = {
		isTestnet: true,
		request: async () => answer as never,
	};
	return new ExchangeClient({ transport, wallet: privateKeyToAccount(`0x${"0".repeat(63)}1`) });
}

describe("exchange action acknowledgement", () => {
	it("is needed because the pinned SDK resolves an undocumented answer as success", async () => {
		const client = createClient({});
		await expect(client.withdraw3({ destination: DESTINATION, amount: "2" })).resolves.toEqual({});
		await expect(client.usdClassTransfer({ amount: "2", toPerp: true })).resolves.toEqual({});
		await expect(
			client.spotSend({ destination: DESTINATION, token: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054", amount: "2" }),
		).resolves.toEqual({});
	});

	it.each(FUNDS_METHODS)("accepts the documented acknowledgement of %s", (method) => {
		expect(() => assertExchangeActionAcknowledged(method, ACKNOWLEDGED)).not.toThrow();
	});

	it.each([
		["an empty object", {}],
		["null", null],
		["a string", "ok"],
		["an ok status without a response", { status: "ok" }],
		["another response type", { status: "ok", response: { type: "order", data: {} } }],
		["an unknown status", { status: "pending", response: { type: "default" } }],
	])("reports %s as an unknown outcome for every funds method", (_case, answer) => {
		for (const method of FUNDS_METHODS) {
			let thrown: unknown;
			try {
				assertExchangeActionAcknowledged(method, answer);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(ExchangeResponseUnverifiedError);
			expect(isAmbiguousExchangeActionError(thrown)).toBe(true);
		}
	});

	it("leaves methods with other documented answers to their own handling", () => {
		expect(() => assertExchangeActionAcknowledged("order", {})).not.toThrow();
		expect(() => assertExchangeActionAcknowledged("tokenDelegate", {})).not.toThrow();
	});
});
