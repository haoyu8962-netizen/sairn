import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = resolve(__dirname, "../../../../..");

function readRepositoryFile(path: string): string {
	return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

describe("mobile device linking documentation (ADR 0039)", () => {
	it("documents trading activation before approval and phone confirmation in docs.md", () => {
		const docs = readRepositoryFile("legal/docs.md");
		expect(docs).toMatch(/deposit.*first order/i);
		expect(docs).toMatch(/Import/i);
	});

	it("documents trading activation prerequisite, phone Import confirmation, and troubleshooting in support.md", () => {
		const support = readRepositoryFile("legal/support.md");
		const howToLinkStart = support.indexOf("**How do I link my phone?**");
		const troubleshootingStart = support.indexOf("### Mobile link not working");
		expect(howToLinkStart).toBeGreaterThan(-1);
		expect(troubleshootingStart).toBeGreaterThan(howToLinkStart);

		const howToLink = support.slice(howToLinkStart, troubleshootingStart);
		expect(howToLink).toMatch(/deposit.*first order/i);
		expect(howToLink).toMatch(/Import/);

		const troubleshooting = support.slice(troubleshootingStart);
		expect(troubleshooting).toMatch(/deposit.*first order/i);
		expect(troubleshooting).toMatch(/Import/);
	});

	it("clarifies that trading activation requires a builder-fee-authorized order (not TWAP alone) and keeps step order", () => {
		const docs = readRepositoryFile("legal/docs.md");
		const mobileStart = docs.indexOf("### Mobile Device Linking");
		const mobileEnd = docs.indexOf("## Getting Started");
		expect(mobileStart).toBeGreaterThan(-1);
		expect(mobileEnd).toBeGreaterThan(mobileStart);
		const mobileSection = docs.slice(mobileStart, mobileEnd);

		expect(mobileSection).toMatch(/builder-fee/i);
		expect(mobileSection).toMatch(/market or limit order/i);
		expect(mobileSection).toMatch(/TWAP/i);

		const docsQrIcon = mobileSection.search(/QR code icon/i);
		const docsApprove = mobileSection.search(/approving the mobile trading key/i);
		const docsRevealScan = mobileSection.search(/revealing and scanning/i);
		const docsVerify = mobileSection.search(/verifying the account address/i);
		const docsImport = mobileSection.search(/\*\*Import\*\*/);
		expect(docsQrIcon).toBeGreaterThan(-1);
		expect(docsApprove).toBeGreaterThan(docsQrIcon);
		expect(docsRevealScan).toBeGreaterThan(docsApprove);
		expect(docsVerify).toBeGreaterThan(docsRevealScan);
		expect(docsImport).toBeGreaterThan(docsVerify);

		const support = readRepositoryFile("legal/support.md");
		const howToLink = support.slice(
			support.indexOf("**How do I link my phone?**"),
			support.indexOf("### Mobile link not working"),
		);
		expect(howToLink).toMatch(/builder-fee/i);
		expect(howToLink).toMatch(/market or limit order/i);
		expect(howToLink).toMatch(/TWAP/i);

		const supportQrIcon = howToLink.search(/QR code icon/i);
		const supportApprove = howToLink.search(/approve the mobile trading key/i);
		const supportReveal = howToLink.search(/reveal the QR code/i);
		const supportAddress = howToLink.search(/review the account address/i);
		const supportImport = howToLink.search(/\*\*Import\*\*/);
		expect(supportQrIcon).toBeGreaterThan(-1);
		expect(supportApprove).toBeGreaterThan(supportQrIcon);
		expect(supportReveal).toBeGreaterThan(supportApprove);
		expect(supportAddress).toBeGreaterThan(supportReveal);
		expect(supportImport).toBeGreaterThan(supportAddress);

		const troubleshooting = support.slice(support.indexOf("### Mobile link not working"));
		expect(troubleshooting).toMatch(/builder-fee/i);
		expect(troubleshooting).toMatch(/market or limit order/i);
		expect(troubleshooting).toMatch(/TWAP/i);
	});
});
