// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Modal, ModalPopup } from "@sairn/ui";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralActionModal } from "@/components/referrals/referral-action-modal";
import { Hip3DeployerDisclaimer } from "@/components/trade/components/hip3-deployer-disclaimer";
import { LegalStatusMessage } from "@/components/trade/components/legal-status-message";
import { MobileOrderModificationModal } from "@/components/trade/mobile/mobile-order-modification-modal";
import { CancelAllOrdersModal } from "@/components/trade/positions/cancel-all-orders-modal";
import { PositionCloseDialogHeader } from "@/components/trade/positions/position-close-dialog-header";
import { PositionCloseDialogShell } from "@/components/trade/positions/position-close-dialog-shell";
import { PositionReverseConfirmationModal } from "@/components/trade/positions/position-reverse-confirmation-modal";
import { OrderConfirmationModal } from "@/components/trade/tradebox/order-confirmation-modal";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const testState = vi.hoisted(() => ({
	isMobile: true,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) => (
		<button type="button" disabled={disabled} onClick={onClick}>
			{children}
		</button>
	),
}));

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	useHip3DisclaimerActions: () => ({ accept: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", env: "Mainnet" }),
}));

const sampleDraft: OrderConfirmationDraft = {
	assetId: 0,
	marketLabel: "HYPE-USDC",
	marketKind: "perp",
	isLeveraged: true,
	side: "buy",
	orderType: "market",
	tif: "Gtc",
	baseToken: "HYPE",
	szDecimals: 2,
	sizeValue: 1,
	orderValue: 110,
	limitPrice: null,
	triggerPrice: null,
	scaleStartPrice: null,
	scaleEndPrice: null,
	scaleLevels: null,
	scaleSkew: null,
	twapMinutes: null,
	twapRandomize: false,
	twapTriggerPrice: null,
	twapStopPrice: null,
	tpSlEnabled: false,
	tpPrice: null,
	slPrice: null,
	reduceOnly: false,
	leverage: 5,
	marginMode: "cross",
	marginRequired: 22,
	feeQuote: buildOrderFeeQuote({
		orderValue: 110,
		protocolRate: "0.00045",
		builderFeeTenthsBps: 0,
		marketKind: "perp",
		side: "buy",
		execution: "order",
	}),
	liqPrice: null,
	liqWarning: false,
	slippagePercent: 2.5,
};

function readSrc(relativePath: string): string {
	return readFileSync(resolve(process.cwd(), "src", relativePath), "utf8");
}

function getActiveDialog(): HTMLElement {
	const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
	const dialog = dialogs.at(-1);
	if (!dialog) throw new Error("Expected an active dialog");
	return dialog;
}

function parseSpacingPx(token: string): number {
	const arbitraryPx = /^\[(\d+(?:\.\d+)?)px\]$/.exec(token);
	if (arbitraryPx) return Number(arbitraryPx[1]);
	const scale = Number(token);
	if (!Number.isNaN(scale)) return scale * 4;
	throw new Error(`Unsupported spacing token: ${token}`);
}

function resolveUtilityValue(tokens: string[], matcher: RegExp, viewport: "mobile" | "desktop"): number | undefined {
	let matched: number | undefined;
	for (const raw of tokens) {
		const isDesktop = raw.startsWith("min-[1001px]:");
		const isMobile = raw.startsWith("max-[1000px]:");
		if (viewport === "mobile" && isDesktop) continue;
		if (viewport === "desktop" && isMobile) continue;
		const stripped = raw.replace(/^(?:min-\[1001px\]|max-\[1000px\]):/, "");
		const result = matcher.exec(stripped);
		if (result?.[1]) matched = parseSpacingPx(result[1]);
	}
	return matched;
}

function measureCloseHitClearance(
	dialog: HTMLElement,
	header: HTMLElement,
	viewport: "mobile" | "desktop",
): { closeHitExtentPx: number; headerEndPaddingPx: number } {
	const closeButton = [...dialog.children].find((child): child is HTMLButtonElement => child.tagName === "BUTTON");
	if (!closeButton) throw new Error("Expected direct-child close button in dialog");
	const dialogTokens = dialog.className.split(/\s+/).filter(Boolean);
	const buttonTokens = closeButton.className.split(/\s+/).filter(Boolean);
	const headerTokens = header.className.split(/\s+/).filter(Boolean);

	const buttonEndPx =
		resolveUtilityValue(dialogTokens, /^\[&>button\]:!?end-(.+)$/, viewport) ??
		resolveUtilityValue(buttonTokens, /^!?end-(.+)$/, viewport);
	const buttonSizePx =
		resolveUtilityValue(dialogTokens, /^\[&>button\]:!?size-(.+)$/, viewport) ??
		resolveUtilityValue(buttonTokens, /^!?size-(.+)$/, viewport);
	const hitSizePx =
		resolveUtilityValue(dialogTokens, /^\[&>button\]:after:!?size-(.+)$/, viewport) ??
		resolveUtilityValue(buttonTokens, /^after:!?size-(.+)$/, viewport) ??
		buttonSizePx;
	const headerEndPaddingPx = resolveUtilityValue(headerTokens, /^!?pe-(.+)$/, viewport);

	if (
		buttonEndPx === undefined ||
		buttonSizePx === undefined ||
		hitSizePx === undefined ||
		headerEndPaddingPx === undefined
	) {
		throw new Error(
			`Missing geometry classes (${viewport}): end=${buttonEndPx}, size=${buttonSizePx}, hit=${hitSizePx}, pe=${headerEndPaddingPx}`,
		);
	}

	const hitOverhangPx = Math.max(0, (hitSizePx - buttonSizePx) / 2);
	return {
		closeHitExtentPx: buttonEndPx + buttonSizePx + hitOverhangPx,
		headerEndPaddingPx,
	};
}

describe("Modal close button and ModalHeader RTL/LTR alignment", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.isMobile = true;
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	it("uses logical end offsets and explicit logical header padding in OrderConfirmationModal", () => {
		act(() =>
			root.render(
				<OrderConfirmationModal
					open
					draft={sampleDraft}
					dontShowAgain={false}
					onDontShowAgainChange={vi.fn()}
					onOpenChange={vi.fn()}
					onConfirm={vi.fn()}
				/>,
			),
		);

		const dialog = getActiveDialog();
		const header = dialog.querySelector("h2")?.parentElement;
		expect(dialog.className).toContain("[&>button]:!end-4");
		expect(dialog.className).toContain("min-[1001px]:[&>button]:!end-6");
		expect(dialog.className).not.toMatch(/\[&>button\]:!?right-/);
		expect(header?.className).toContain("ps-4");
		expect(header?.className).toContain("pe-14");
		expect(header?.className).toContain("min-[1001px]:ps-6");
		expect(header?.className).toContain("min-[1001px]:pe-16");
		expect(header?.className).not.toContain("min-[1001px]:pe-14");
		expect(header?.className).not.toMatch(/(?:^|\s)(?:min-\[1001px\]:)?px-/);
	});

	it("uses logical end offsets and explicit logical header padding in PositionReverseConfirmationModal", () => {
		act(() =>
			root.render(
				<PositionReverseConfirmationModal
					open
					marketLabel="BTC-USD"
					currentDirection="long"
					reverseSizeLabel="2 BTC"
					onOpenChange={vi.fn()}
					onConfirm={vi.fn()}
				/>,
			),
		);

		const dialog = getActiveDialog();
		const header = dialog.querySelector("h2")?.parentElement;
		expect(dialog.className).toContain("[&>button]:!end-4");
		expect(dialog.className).toContain("min-[1001px]:[&>button]:!end-6");
		expect(dialog.className).not.toMatch(/\[&>button\]:!?right-/);
		expect(header?.className).toContain("ps-4");
		expect(header?.className).toContain("pe-14");
		expect(header?.className).toContain("min-[1001px]:ps-6");
		expect(header?.className).toContain("min-[1001px]:pe-16");
		expect(header?.className).not.toContain("min-[1001px]:pe-14");
		expect(header?.className).not.toMatch(/(?:^|\s)(?:min-\[1001px\]:)?px-/);
	});

	it("removes physical right override and clears the 44px close control in MobileOrderModificationModal", () => {
		act(() =>
			root.render(
				<MobileOrderModificationModal
					open
					marketLabel="ETH-USD"
					directionLabel="Buy"
					directionTone="positive"
					typeLabel="Limit"
					sizeValue="1"
					limitPriceValue="3000"
					sizeInvalid={false}
					triggerPriceInvalid={false}
					limitPriceInvalid={false}
					isInteractionLocked={false}
					isConfirmDisabled={false}
					onSizeChange={vi.fn()}
					onTriggerPriceChange={vi.fn()}
					onLimitPriceChange={vi.fn()}
					onOpenChange={vi.fn()}
					onConfirm={vi.fn()}
				/>,
			),
		);

		const dialog = getActiveDialog();
		const header = dialog.querySelector("h2")?.parentElement;
		expect(dialog.className).not.toMatch(/\[&>button\]:!?right-/);
		expect(header?.className).toContain("ps-4");
		expect(header?.className).toContain("pe-16");
		expect(header?.className).not.toContain("pe-14");
		expect(header?.className).not.toMatch(/(?:^|\s)px-/);
	});

	it("uses logical end offsets in PositionCloseDialogShell and explicit logical padding in PositionCloseDialogHeader", () => {
		act(() =>
			root.render(
				<PositionCloseDialogShell open onOpenChange={vi.fn()} isMobile dismissible closeLabel="Close">
					<PositionCloseDialogHeader>
						<h2>Close Position</h2>
					</PositionCloseDialogHeader>
				</PositionCloseDialogShell>,
			),
		);

		const dialog = getActiveDialog();
		const header = dialog.querySelector("h2")?.parentElement;
		expect(dialog.className).toContain("max-[1000px]:[&>button]:end-3");
		expect(dialog.className).toContain("min-[1001px]:[&>button]:!end-6");
		expect(dialog.className).not.toMatch(/\[&>button\]:!?right-/);
		expect(header?.className).toContain("ps-5");
		expect(header?.className).toContain("pe-14");
		expect(header?.className).toContain("min-[1001px]:ps-6");
		expect(header?.className).toContain("min-[1001px]:pe-16");
		expect(header?.className).not.toContain("min-[1001px]:pe-14");
		expect(header?.className).not.toMatch(/(?:^|\s)(?:min-\[1001px\]:)?px-/);
	});

	it("clears inherited pe-14 on dialogs without a close button so header padding stays symmetric", () => {
		act(() => root.render(<CancelAllOrdersModal open orderCount={2} onOpenChange={vi.fn()} onConfirm={vi.fn()} />));
		const cancelHeader = getActiveDialog().querySelector("h2")?.parentElement;
		expect(cancelHeader?.className).toContain("ps-4");
		expect(cancelHeader?.className).toContain("pe-4");
		expect(cancelHeader?.className).toContain("min-[1001px]:ps-6");
		expect(cancelHeader?.className).toContain("min-[1001px]:pe-6");
		expect(cancelHeader?.className).not.toContain("pe-14");

		act(() =>
			root.render(
				<Hip3DeployerDisclaimer open exit="cancel" documentationUrl="https://example.com" onExit={vi.fn()} />,
			),
		);
		const hip3Header = getActiveDialog().querySelector("h2")?.parentElement;
		expect(hip3Header?.className).toContain("ps-6");
		expect(hip3Header?.className).toContain("pe-6");
		expect(hip3Header?.className).not.toContain("pe-14");

		act(() =>
			root.render(
				<Modal open>
					<ModalPopup showClose={false}>
						<LegalStatusMessage title="Status" description="Details" actionLabel="Retry" onAction={vi.fn()} />
					</ModalPopup>
				</Modal>,
			),
		);
		const legalHeader = getActiveDialog().querySelector("h2")?.parentElement;
		expect(legalHeader?.className).toContain("ps-6");
		expect(legalHeader?.className).toContain("pe-6");
		expect(legalHeader?.className).not.toContain("pe-14");
	});

	it("keeps remaining owned modal callers free of physical close-button right offsets and unmerged ModalHeader px/pr overrides", () => {
		const marketAssetInfo = readSrc("components/trade/components/market-asset-info.tsx");
		expect(marketAssetInfo).toContain("min-[1001px]:[&>button]:end-[14px]");
		expect(marketAssetInfo).not.toContain("[&>button]:right-");
		expect(marketAssetInfo).toContain(
			"items-center ps-12 pe-12 pt-9 pb-0 min-[1001px]:ps-6 min-[1001px]:pe-6 min-[1001px]:pt-8",
		);

		const marginModeModal = readSrc("components/trade/tradebox/margin-mode-modal.tsx");
		expect(marginModeModal).toContain('className="ps-4 pe-14 pt-7 pb-2"');
		expect(marginModeModal).toContain('className="ps-4 pe-4 pt-7 pb-2"');
		expect(marginModeModal).not.toMatch(/<ModalHeader[^>]*\bpr-/);

		const tpslModal = readSrc("components/trade/positions/position-tpsl-modal.tsx");
		expect(tpslModal).not.toMatch(/<ModalHeader[^>]*\bpr-/);
		expect(tpslModal).toContain(
			'className="pe-4 max-[1000px]:gap-1 max-[1000px]:border-b-0 max-[1000px]:pt-7 max-[1000px]:pb-0"',
		);

		const isolatedModal = readSrc("components/trade/positions/position-isolated-margin-modal.tsx");
		expect(isolatedModal).not.toMatch(/<ModalHeader[^>]*\bpr-/);
		expect(isolatedModal).toContain(
			'className="pe-4 max-[1000px]:gap-1 max-[1000px]:border-b-0 max-[1000px]:pt-7 max-[1000px]:pb-0"',
		);

		const spotSwapModal = readSrc("components/trade/components/spot-swap-modal.tsx");
		expect(spotSwapModal).toContain('"items-center ps-14 pe-14 py-5 text-center"');

		const establishModal = readSrc("components/trade/components/establish-connection-modal.tsx");
		expect(establishModal).toContain('className="ps-6 pe-14 pt-5 pb-2"');

		const vaultModal = readSrc("components/vaults/vault-action-modal.tsx");
		expect(vaultModal).toContain('className="ps-4 pe-4 pt-5 pb-2 min-[1001px]:ps-6 min-[1001px]:pe-14"');

		const apiWalletModal = readSrc("components/api-wallet/api-wallet-action-modal.tsx");
		expect(apiWalletModal).toContain('className="ps-4 pe-4 pt-6 pb-2 min-[1001px]:pe-14"');
	});

	it("uses symmetric mobile header padding and desktop close-button clearance in ReferralActionModal", () => {
		testState.isMobile = true;
		act(() =>
			root.render(<ReferralActionModal action="create" unclaimedRewards={[]} onClose={vi.fn()} onSubmit={vi.fn()} />),
		);
		const mobileHeader = getActiveDialog().querySelector("h2")?.parentElement;
		expect(mobileHeader?.className).toContain("ps-4");
		expect(mobileHeader?.className).toContain("pe-4");
		expect(mobileHeader?.className).toContain("min-[1001px]:ps-6");
		expect(mobileHeader?.className).toContain("min-[1001px]:pe-14");
		expect(mobileHeader?.className).not.toMatch(/(?:^|\s)pe-14(?:\s|$)/);
		expect(mobileHeader?.className).not.toMatch(/(?:^|\s)(?:min-\[1001px\]:)?px-/);

		testState.isMobile = false;
		act(() =>
			root.render(<ReferralActionModal action="create" unclaimedRewards={[]} onClose={vi.fn()} onSubmit={vi.fn()} />),
		);
		const desktopHeader = getActiveDialog().querySelector("h2")?.parentElement;
		expect(desktopHeader?.className).toContain("ps-4");
		expect(desktopHeader?.className).toContain("pe-4");
		expect(desktopHeader?.className).toContain("min-[1001px]:ps-6");
		expect(desktopHeader?.className).toContain("min-[1001px]:pe-14");
		expect(desktopHeader?.className).not.toMatch(/(?:^|\s)pe-14(?:\s|$)/);
		expect(desktopHeader?.className).not.toMatch(/(?:^|\s)(?:min-\[1001px\]:)?px-/);
	});

	it.each(["ltr", "rtl"] as const)(
		"keeps desktop and mobile header inline-end padding at or above the close-button 44px hit box in %s",
		(direction) => {
			document.documentElement.dir = direction;
			try {
				const cases: Array<{
					name: string;
					render: (mobile: boolean) => ReactNode;
				}> = [
					{
						name: "OrderConfirmationModal",
						render: () => (
							<OrderConfirmationModal
								open
								draft={sampleDraft}
								dontShowAgain={false}
								onDontShowAgainChange={vi.fn()}
								onOpenChange={vi.fn()}
								onConfirm={vi.fn()}
							/>
						),
					},
					{
						name: "PositionReverseConfirmationModal",
						render: () => (
							<PositionReverseConfirmationModal
								open
								marketLabel="BTC-USD"
								currentDirection="long"
								reverseSizeLabel="2 BTC"
								onOpenChange={vi.fn()}
								onConfirm={vi.fn()}
							/>
						),
					},
					{
						name: "PositionCloseDialogShell",
						render: (mobile) => (
							<PositionCloseDialogShell open onOpenChange={vi.fn()} isMobile={mobile} dismissible closeLabel="Close">
								<PositionCloseDialogHeader>
									<h2>Close Position</h2>
								</PositionCloseDialogHeader>
							</PositionCloseDialogShell>
						),
					},
				];

				for (const item of cases) {
					for (const viewport of ["mobile", "desktop"] as const) {
						testState.isMobile = viewport === "mobile";
						act(() => root.render(item.render(testState.isMobile)));
						const dialog = getActiveDialog();
						const header = dialog.querySelector("h2")?.parentElement;
						if (!header) throw new Error(`Expected header for ${item.name}`);

						const { closeHitExtentPx, headerEndPaddingPx } = measureCloseHitClearance(dialog, header, viewport);
						expect(
							headerEndPaddingPx,
							`${item.name} (${viewport}, ${direction}): header pe=${headerEndPaddingPx}px must clear close hit box ${closeHitExtentPx}px`,
						).toBeGreaterThanOrEqual(closeHitExtentPx);
						expect(dialog.className).not.toMatch(/\[&>button\]:!?right-/);
						expect(header.className).not.toMatch(/(?:^|\s)(?:min-\[1001px\]:)?(?:pr|px)-/);
					}
				}
			} finally {
				document.documentElement.dir = "ltr";
			}
		},
	);
});
