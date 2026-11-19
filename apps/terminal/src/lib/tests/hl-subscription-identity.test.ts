import { getSubscriptionBaseKey, getSubscriptionMethodForKey } from "@sairn/hl-react/internal/websocket/reliability";
import { describe, expect, it } from "vitest";

describe("subscription identity", () => {
	it("refresh generations share a base identity while preserving environment and full parameters", () => {
		const base = ["subscription", "Mainnet", "l2Book", { coin: "BTC", nSigFigs: 5, fast: true }];
		const first = JSON.stringify([...base, { refreshKey: 1 }]);
		const next = JSON.stringify([...base, { refreshKey: 2 }]);
		expect(getSubscriptionBaseKey(first)).toBe(JSON.stringify(base));
		expect(getSubscriptionBaseKey(next)).toBe(getSubscriptionBaseKey(first));
		for (const changed of [
			["subscription", "Testnet", "l2Book", base[3]],
			["subscription", "Mainnet", "l2Book", { coin: "BTC", nSigFigs: 4, fast: true }],
			["subscription", "Mainnet", "l2Book", { coin: "BTC", nSigFigs: 5 }],
			["subscription", "Mainnet", "l2Book", { coin: "ETH", nSigFigs: 5, fast: true }],
		]) {
			expect(getSubscriptionBaseKey(JSON.stringify(changed))).not.toBe(getSubscriptionBaseKey(first));
		}
	});

	it.each(["not-json", "null", "{}", "[]", '["subscription","Mainnet","trades"]'])(
		"does not invent a base identity for malformed or incomplete keys: %s",
		(key) => expect(getSubscriptionBaseKey(key)).toBeUndefined(),
	);

	it("reads the method independently of refresh generation and parameters", () => {
		expect(getSubscriptionMethodForKey('["subscription","Mainnet","trades",{}, {"refreshKey":2}]')).toBe("trades");
		expect(getSubscriptionMethodForKey('["subscription","Testnet","userFills",{"user":"owner"}]')).toBe("userFills");
	});

	it.each(["not-json", "null", "{}", "[]", '["subscription","Mainnet",7,{}]'])(
		"does not treat an absent or non-string method as a subscription method: %s",
		(key) => expect(getSubscriptionMethodForKey(key)).toBeUndefined(),
	);
});
