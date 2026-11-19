import {
	evictAgentSigner,
	evictAllAgentSigners,
	getCachedAgentSigner,
} from "@sairn/hl-react/signing/agent-signer-cache";
import { numberToHex } from "viem";
import { afterEach, describe, expect, it } from "vitest";

// Public deterministic fixtures, generated in memory; no stored key is read and nothing is signed.
const FIRST = numberToHex(1n, { size: 32 });
const SECOND = numberToHex(2n, { size: 32 });

afterEach(() => evictAllAgentSigners());

describe("Agent signer revocation", () => {
	it("evicts only the selected signer, keeping another owner's signer reusable", () => {
		const first = getCachedAgentSigner(FIRST);
		const second = getCachedAgentSigner(SECOND);
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		expect(getCachedAgentSigner(FIRST)).toBe(first);

		evictAgentSigner(FIRST);

		const replacement = getCachedAgentSigner(FIRST);
		expect(replacement).not.toBeNull();
		expect(replacement).not.toBe(first);
		expect(getCachedAgentSigner(SECOND)).toBe(second);
	});

	it("evicts every cached signer on a global session reset", () => {
		const first = getCachedAgentSigner(FIRST);
		const second = getCachedAgentSigner(SECOND);

		evictAllAgentSigners();

		expect(getCachedAgentSigner(FIRST)).not.toBe(first);
		expect(getCachedAgentSigner(SECOND)).not.toBe(second);
	});

	it("revoking an absent signer is harmless to existing signers", () => {
		const kept = getCachedAgentSigner(FIRST);
		evictAgentSigner(SECOND);
		evictAgentSigner(SECOND);
		expect(getCachedAgentSigner(FIRST)).toBe(kept);
	});
});
