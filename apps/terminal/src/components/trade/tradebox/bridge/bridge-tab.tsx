import { useLingui } from "@lingui/react/macro";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LIFI_BRIDGE_FEATURES } from "@/config/lifi-bridge";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { describeActionFailure } from "@/lib/errors/action-error";
import { useNumberFormat } from "@/lib/format";
import { getBridgeMaxTokenAmount, getBridgeUsdShortcut } from "@/lib/lifi/bridge-amount";
import { initLiFi } from "@/lib/lifi/config";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { useBridgeExecutor } from "@/lib/lifi/use-bridge";
import type { BridgeQuote } from "@/lib/lifi/use-quote";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { AmountEntryScreen } from "./amount-entry-screen";
import { AssetSelectionScreen } from "./asset-selection-screen";
import { BridgeErrorScreen } from "./bridge-error-screen";
import { ConfirmationScreen } from "./confirmation-screen";
import { ExecutingScreen } from "./executing-screen";
import { BridgeCreationPaused, BridgeWalletMismatch, BridgeWalletNotConnected } from "./shared-ui";
import { SuccessScreen } from "./success-screen";
import type { BridgeScreen } from "./types";

export function BridgeTab() {
	const { t } = useLingui();
	const numberFormat = useNumberFormat();
	const { walletAddress, hasWalletAccess } = useWalletSession();
	const [screen, setScreen] = useState<BridgeScreen>("select");
	const [selectedToken, setSelectedToken] = useState<BridgeToken | null>(null);
	const [usdInput, setUsdInput] = useState("");
	const [tokenAmount, setTokenAmount] = useState("");
	const [confirmSessionId, setConfirmSessionId] = useState(0);
	const mountedRef = useRef(false);
	const confirmSessionCounterRef = useRef(0);
	const activeConfirmSessionRef = useRef<number | null>(null);
	const bridge = useBridgeExecutor();
	const { close: closeDepositModal } = useDepositModalActions();
	const { continueInBackground, restoreInForeground } = bridge;

	const isConfirmScreenActive =
		bridge.status === "idle" &&
		hasWalletAccess &&
		Boolean(walletAddress) &&
		LIFI_BRIDGE_FEATURES.createNewRoute &&
		screen === "confirm" &&
		Boolean(selectedToken) &&
		Boolean(tokenAmount);

	useEffect(() => {
		mountedRef.current = true;
		initLiFi();
		restoreInForeground();
		return () => {
			mountedRef.current = false;
			activeConfirmSessionRef.current = null;
			continueInBackground();
		};
	}, [continueInBackground, restoreInForeground]);

	useLayoutEffect(() => {
		activeConfirmSessionRef.current = isConfirmScreenActive ? confirmSessionId : null;
		return () => {
			activeConfirmSessionRef.current = null;
		};
	}, [confirmSessionId, isConfirmScreenActive]);

	function handleTokenSelect(token: BridgeToken) {
		activeConfirmSessionRef.current = null;
		setSelectedToken(token);
		setScreen("amount");
	}

	function handleAmountContinue(amount: string, usd: string) {
		const nextSessionId = ++confirmSessionCounterRef.current;
		activeConfirmSessionRef.current = nextSessionId;
		setConfirmSessionId(nextSessionId);
		setTokenAmount(amount);
		setUsdInput(usd);
		setScreen("confirm");
	}

	function handleBackFromAmount() {
		activeConfirmSessionRef.current = null;
		setScreen("select");
		setSelectedToken(null);
		setUsdInput("");
		setTokenAmount("");
	}

	function handleBackFromConfirm() {
		activeConfirmSessionRef.current = null;
		setScreen("amount");
	}

	async function runBridge(quote: BridgeQuote) {
		const outcome = await bridge.execute(quote);
		if (!mountedRef.current) return;
		if (outcome === "rejected" || outcome === "disabled") {
			const nextSessionId = ++confirmSessionCounterRef.current;
			setConfirmSessionId(nextSessionId);
			setScreen("confirm");
		}
	}

	function handleConfirm(quote: BridgeQuote, sessionId: number) {
		if (!mountedRef.current || activeConfirmSessionRef.current !== sessionId) return;
		activeConfirmSessionRef.current = null;
		void runBridge(quote);
	}

	function handleRetry() {
		void bridge.retry();
	}

	function handleExecutionClose() {
		activeConfirmSessionRef.current = null;
		bridge.continueInBackground();
		closeDepositModal();
	}

	function resetToSelect() {
		activeConfirmSessionRef.current = null;
		if (!bridge.reset()) return;
		setScreen("select");
		setSelectedToken(null);
		setUsdInput("");
		setTokenAmount("");
	}

	function handleSuccessClose() {
		resetToSelect();
		closeDepositModal();
	}

	const ownsExistingExecution =
		bridge.status === "idle" ||
		(!!walletAddress && !!bridge.sourceAddress && walletAddress.toLowerCase() === bridge.sourceAddress.toLowerCase());
	if (!ownsExistingExecution) {
		return <BridgeWalletMismatch />;
	}

	if (bridge.status === "error") {
		const retryUnavailableMessage =
			bridge.retryMode === null && !LIFI_BRIDGE_FEATURES.createNewRoute
				? t`Bridge creation is paused. A route without a submitted source transaction cannot be retried.`
				: null;
		return (
			<BridgeErrorScreen
				error={[
					bridge.error
						? describeActionFailure(bridge.error, (descriptor) => t(descriptor), numberFormat)
						: t`Unknown error`,
					bridge.recoveryWarning ? t(bridge.recoveryWarning) : null,
					retryUnavailableMessage,
				]
					.filter(Boolean)
					.join(" ")}
				onRetry={bridge.retryMode ? handleRetry : undefined}
				retryMode={bridge.retryMode ?? undefined}
				onBack={bridge.canAbandon ? resetToSelect : undefined}
			/>
		);
	}

	if (bridge.status === "success" && bridge.receivedAmount) {
		return (
			<SuccessScreen
				address={bridge.sourceAddress ?? walletAddress ?? ""}
				receivedAmount={bridge.receivedAmount}
				txHash={bridge.txHash}
				startTime={bridge.startTime}
				endTime={bridge.endTime}
				processDetails={bridge.processDetails}
				onDone={handleSuccessClose}
				onNewDeposit={resetToSelect}
			/>
		);
	}

	if (bridge.status === "executing") {
		return (
			<ExecutingScreen
				address={bridge.sourceAddress ?? walletAddress ?? ""}
				statusText={bridge.statusText ? t(bridge.statusText) : ""}
				txHash={bridge.txHash}
				onDone={handleExecutionClose}
				recoveryWarning={bridge.recoveryWarning ? t(bridge.recoveryWarning) : null}
			/>
		);
	}

	if (!hasWalletAccess || !walletAddress) {
		return <BridgeWalletNotConnected />;
	}

	if (!LIFI_BRIDGE_FEATURES.createNewRoute) {
		return <BridgeCreationPaused />;
	}

	if (screen === "confirm" && selectedToken && tokenAmount) {
		return (
			<ConfirmationScreen
				key={`${confirmSessionId}:${selectedToken.chainId}:${selectedToken.address}:${tokenAmount}:${walletAddress}`}
				token={selectedToken}
				tokenAmount={tokenAmount}
				address={walletAddress}
				onBack={handleBackFromConfirm}
				onConfirm={(quote) => handleConfirm(quote, confirmSessionId)}
			/>
		);
	}

	if (screen === "amount" && selectedToken) {
		const initialIsMax =
			Boolean(tokenAmount) &&
			tokenAmount === getBridgeMaxTokenAmount(selectedToken) &&
			usdInput === getBridgeUsdShortcut(selectedToken, 100);
		return (
			<AmountEntryScreen
				token={selectedToken}
				initialUsd={usdInput}
				initialIsMax={initialIsMax}
				onBack={handleBackFromAmount}
				onContinue={handleAmountContinue}
			/>
		);
	}

	return <AssetSelectionScreen address={walletAddress} onSelect={handleTokenSelect} />;
}
