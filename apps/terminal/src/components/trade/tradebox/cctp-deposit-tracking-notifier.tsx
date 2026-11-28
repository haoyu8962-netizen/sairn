import { useLingui } from "@lingui/react/macro";
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";
import type { Hash } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import { useCctpDepositTracking } from "@/hooks/trade/use-cctp-deposit-tracking";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatTransferError } from "@/lib/errors/format";
import { useNumberFormat } from "@/lib/format";
import { isDefinitiveDepositSourceFailure } from "@/lib/hyperliquid/deposit-source-error";
import { CctpDepositOutcomeUnknownError } from "@/lib/trade/cctp-deposit-tracking";
import { useDepositModalOpen } from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { DepositExplorerLink } from "./deposit-explorer-link";

interface DepositNotification {
	presentationId: string;
	sourceHash: Hash;
	phase: "forwarding" | "success" | "failed" | "unknown";
	error: Error | null;
	statusUnavailable: boolean;
	locale: string;
	dismissed: boolean;
	retired: boolean;
}

let presentationSequence = 0;

export function CctpDepositTrackingNotifier() {
	const { t, i18n } = useLingui();
	const numberFormat = useNumberFormat();
	const isTestnet = useIsTestnet();
	const depositModalOpen = useDepositModalOpen();
	const { walletAddress, embeddedWalletAddress, walletIntent } = useWalletSession();
	const isEmbeddedOwner = walletIntent === "embedded";
	const owner = isEmbeddedOwner ? embeddedWalletAddress : walletAddress;
	const tracking = useCctpDepositTracking({
		enabled: !!owner,
		env: isTestnet ? "Testnet" : "Mainnet",
		owner,
		poll: !isEmbeddedOwner && !depositModalOpen,
		removeOnForwardSubmitted: !isEmbeddedOwner && !depositModalOpen,
	});
	const notificationsRef = useRef(new Map<string, DepositNotification>());
	const identity = `${isTestnet ? "Testnet" : "Mainnet"}:${owner?.toLowerCase() ?? "disconnected"}`;
	const sourceHash = tracking.recoveryRecord?.sourceHash ?? tracking.trackedSourceHash;
	const notificationKey = sourceHash && owner ? `cctp-deposit:${identity}:${sourceHash.toLowerCase()}` : null;
	const forwardSubmitted = tracking.data?.status === "forward-submitted";
	const definitiveFailure = isDefinitiveDepositSourceFailure(tracking.error) ? tracking.error : null;
	const outcomeUnknown = tracking.error instanceof CctpDepositOutcomeUnknownError;
	const statusUnavailable = tracking.isError && !definitiveFailure && !outcomeUnknown;
	const txChain = isTestnet ? arbitrumSepolia : arbitrum;
	const { acknowledgeOutcome, unacknowledgedOutcomes } = tracking;

	useLayoutEffect(() => {
		const notifications = notificationsRef.current;
		const prefix = `cctp-deposit:${identity}:`;
		return () => {
			for (const [id, notification] of notifications) {
				if (!id.startsWith(prefix)) continue;
				notification.retired = true;
				toast.dismiss(notification.presentationId);
				notifications.delete(id);
			}
		};
	}, [identity]);

	const describeNotificationError = useEffectEvent((error: Error | null) =>
		formatTransferError(error, (descriptor) => t(descriptor), numberFormat),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: describeNotificationError is an effect event, so a number-format change does not re-run the notices
	useEffect(() => {
		const notifications = notificationsRef.current;
		for (const [id, notification] of notifications) {
			if (notification.phase === "forwarding" && (depositModalOpen || id !== notificationKey)) {
				notification.retired = true;
				toast.dismiss(notification.presentationId);
				notifications.delete(id);
			}
		}
		if (owner && !depositModalOpen) {
			for (const outcome of unacknowledgedOutcomes) {
				const outcomeKey = `cctp-deposit:${identity}:${outcome.sourceHash.toLowerCase()}`;
				const previous = notifications.get(outcomeKey);
				if (!previous || previous.phase === "forwarding") {
					const failure = isDefinitiveDepositSourceFailure(outcome.error) ? outcome.error : null;
					const presentationId = previous?.dismissed ? undefined : previous?.presentationId;
					notifications.set(outcomeKey, {
						presentationId: presentationId ?? `${outcomeKey}:presentation:${++presentationSequence}`,
						sourceHash: outcome.sourceHash,
						phase: failure ? "failed" : "unknown",
						error: failure,
						statusUnavailable: false,
						locale: "",
						dismissed: false,
						retired: false,
					});
				}
			}
		}
		if (notificationKey && sourceHash && !depositModalOpen && !definitiveFailure && !outcomeUnknown) {
			const previous = notifications.get(notificationKey);
			const phase: DepositNotification["phase"] = forwardSubmitted ? "success" : "forwarding";
			if (
				!previous ||
				(previous.phase === "forwarding" &&
					(previous.phase !== phase || previous.statusUnavailable !== statusUnavailable))
			) {
				const presentationId = previous?.dismissed ? undefined : previous?.presentationId;
				notifications.set(notificationKey, {
					presentationId: presentationId ?? `${notificationKey}:presentation:${++presentationSequence}`,
					sourceHash,
					phase,
					error: null,
					statusUnavailable,
					locale: "",
					dismissed: false,
					retired: false,
				});
			}
		}

		for (const notification of notifications.values()) {
			if (notification.dismissed || notification.locale === i18n.locale) continue;
			notification.locale = i18n.locale;
			const explorerLink = (
				<DepositExplorerLink txHash={notification.sourceHash} txChain={txChain} label={t`View on explorer`} />
			);
			const onDismiss = () => {
				notification.dismissed = true;
				if (!notification.retired && (notification.phase === "failed" || notification.phase === "unknown")) {
					acknowledgeOutcome(notification.sourceHash);
				}
			};
			const lifecycle = { id: notification.presentationId, onDismiss, onAutoClose: onDismiss };
			if (notification.phase === "failed") {
				toast.error(t`Deposit failed`, {
					...lifecycle,
					description: (
						<span className="flex flex-col gap-1">
							<span>{describeNotificationError(notification.error)}</span>
							{explorerLink}
						</span>
					),
					duration: Number.POSITIVE_INFINITY,
					closeButton: true,
				});
			} else if (notification.phase === "unknown") {
				toast.warning(t`Deposit status unknown`, {
					...lifecycle,
					description: (
						<span className="flex flex-col gap-1">
							<span>
								{t`The Arbitrum transaction was submitted, but its final status could not be verified. Check the transaction before retrying.`}
							</span>
							{explorerLink}
						</span>
					),
					duration: Number.POSITIVE_INFINITY,
					closeButton: true,
				});
			} else if (notification.phase === "success") {
				toast.success(t`Deposit submitted to Hyperliquid`, {
					...lifecycle,
					description: (
						<span className="flex flex-col gap-1">
							<span>{t`Your balance updates once Hyperliquid credits it.`}</span>
							{explorerLink}
						</span>
					),
					duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
				});
			} else {
				toast.loading(t`Forwarding deposit`, {
					...lifecycle,
					description: (
						<span className="flex flex-col gap-1">
							<span>
								{notification.statusUnavailable
									? t`The Arbitrum transaction was submitted, but Circle status is temporarily unavailable. Tracking will resume when you return.`
									: t`Circle is forwarding your USDC to Hyperliquid. Do not submit this deposit again.`}
							</span>
							{explorerLink}
						</span>
					),
					duration: Number.POSITIVE_INFINITY,
				});
			}
		}
	}, [
		acknowledgeOutcome,
		definitiveFailure,
		depositModalOpen,
		forwardSubmitted,
		i18n.locale,
		identity,
		outcomeUnknown,
		owner,
		sourceHash,
		statusUnavailable,
		t,
		notificationKey,
		txChain,
		unacknowledgedOutcomes,
	]);

	return null;
}
