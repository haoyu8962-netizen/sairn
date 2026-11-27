// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultActionModal } from "@/components/vaults/vault-action-modal";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111";
const VAULT = "0x2222222222222222222222222222222222222222";

describe("VaultActionModal Max button touch feedback", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders the Max control with shared Button press feedback, focus style and disabled state", () => {
		const onAmountChange = vi.fn();
		act(() =>
			root.render(
				<VaultActionModal
					open
					action="deposit"
					stage="input"
					detail={{ name: "Safety Vault", vaultAddress: VAULT, leaderCommission: "0.1", alwaysCloseOnWithdraw: false }}
					ownerAddress={OWNER}
					amount=""
					availableAmount="10"
					maxAmount="10"
					minimumAmount="5"
					belowMinimum={false}
					canReview={false}
					canConfirm={false}
					onAmountChange={onAmountChange}
					onReview={vi.fn()}
					onBack={vi.fn()}
					onConfirm={vi.fn()}
					onVerifyAgain={vi.fn()}
					onClose={vi.fn()}
				/>,
			),
		);

		const maxButton = [...document.body.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Max",
		);
		expect(maxButton).toBeDefined();
		expect(maxButton?.className).toContain("active:not-data-disabled:scale-[0.97]");
		expect(maxButton?.className).toContain("active:bg-fill-press");
		expect(maxButton?.className).toContain("focus-visible:outline-stroke-focus");
		act(() => maxButton?.click());
		expect(onAmountChange).toHaveBeenCalledWith("10");
	});
});
