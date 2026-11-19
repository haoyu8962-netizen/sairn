// The reviewed registry behind mobile-data-presentation-contract. docs/mobile-data-presentation.md owns the
// policy; this file records, for every covered source file, each thing in it that could present a state
// to the user as a warning, a failure or a status, and why it is not a passive data notice.
//
// A covered file may not gain an announcer role, a warning icon, a warning-coloured class or a string
// with status wording without an entry here: the contract compares this registry with what
// harness/presentation-markers.ts reads from the source, exactly, in both directions. When you add,
// change or remove such a presentation, update the counts and say which kind it is. Do not register a
// passive data notice (loading, stale, unavailable, failed, reconnecting text or colour driven by a
// read state): the policy forbids it. An existing one that waits for a fix is registered as "pending",
// listed in the policy, and removed from here together with the fix.

export type PresentationKind =
	// Result or progress of an action the user requested, including an unknown outcome.
	| "action-feedback"
	// What the user typed, shown only when the data it is checked against is ready.
	| "input-validation"
	// A restriction known to hold: region, account mode, Agent-only session, a protocol or API limit, or a
	// wallet session that is definitively not connected (useWalletSession().isResolving is false).
	| "confirmed-restriction"
	// The object being edited or confirmed differs from what the surface opened with.
	| "confirmed-change"
	// An empty or no-match statement drawn from a complete, current, successful snapshot.
	| "confirmed-empty"
	// Colour or wording that expresses a value (direction, sign, order status, risk band, fee).
	| "data-value"
	// Static styling or naming of a destructive control.
	| "destructive-action"
	// Static risk or irreversibility wording, or a risk notice derived from a successful answer.
	| "risk-disclosure"
	// The global real offline and back-online banner.
	| "offline-banner"
	// Screen-reader-only description of a busy or unavailable region.
	| "busy-description"
	// Screen-reader-only live region that announces a displayed count or total.
	| "value-announcement"
	// Screen-reader-only reason attached to a disabled control.
	| "disabled-reason"
	// Neutral Retry or Refresh control; no error text beside it.
	| "neutral-retry"
	// A placeholder that is the same for an empty draft, loading and a failed read.
	| "stable-placeholder"
	// Explanations, control names and calls to action unrelated to any read state.
	| "static-copy"
	// A passive notice, or a statement drawn from data that may not be current, that was verified
	// and waits for a fix or a decision. Listed in docs/mobile-data-presentation.md (待处理).
	| "pending";

export interface ReviewedPresentation {
	announcers?: Record<string, number>;
	icons?: Record<string, number>;
	tones?: Record<string, number>;
	rawErrors?: number;
	reasonFields?: Record<string, number>;
	// Status wording by exact text; a pair gives the number of occurrences when it is not one.
	copy?: Record<string, PresentationKind | readonly [PresentationKind, number]>;
	// One sentence per kind present in the file: what belongs to it and what drives it.
	why: Partial<Record<PresentationKind, string>>;
}

// Every .ts and .tsx file of components/trade/mobile is covered. These are the surfaces outside it
// that the phone terminal uses and that the policy names (受约束的入口).
export const NAMED_PRESENTATION_FILES = [
	"trade/positions/send-modal.tsx",
	"trade/positions/position-isolated-margin-modal.tsx",
	"trade/positions/position-market-close-modal.tsx",
	"trade/positions/position-limit-close-modal.tsx",
	"trade/positions/position-tpsl-modal.tsx",
	"trade/components/spot-swap-modal.tsx",
	"trade/positions/account-transfers-tab.tsx",
	"trade/positions/transfer-modal.tsx",
	"trade-history/trade-history-page.tsx",
	"historical-orders/historical-orders-page.tsx",
	"funding-history/funding-history-page.tsx",
	"ui/history-page-unavailable.tsx",
] as const;

// Keyed by path relative to apps/terminal/src/components.
export const REVIEWED_PRESENTATION: Record<string, ReviewedPresentation> = {
	"trade/mobile/mobile-account-transfers-tab.tsx": {
		tones: { "text-error": 1 },
		copy: {
			"No deposits or withdrawals found.": "confirmed-empty",
		},
		why: {
			"confirmed-empty":
				"Rendered only when useAccountLedger().canConfirmEmpty holds (last request succeeded, nothing refreshing).",
			"data-value":
				"The Fee cell is red when the ledger row carries a fee; the official terminal colours a non-zero fee the same way.",
		},
	},
	"trade/mobile/mobile-account-view.tsx": {
		announcers: { "<output>": 2 },
		tones: { "bg-error": 1, "bg-warning": 1, "text-error": 1 },
		why: {
			"confirmed-restriction":
				"One <output> shows getFundsAvailabilityNotice() for Deposit, which returns only confirmed reasons (Agent-only session, region, deposits disabled on this network).",
			"static-copy":
				"The other <output> shows, to an email session whose embedded wallet is not the active address yet, a confirmed deposit restriction or the hint to open Deposit (the sponsored email-deposit exception).",
			"data-value":
				"Margin-ratio bar coloured by risk band and drawn only once the ratio is ready; unrealized PnL red when negative.",
		},
	},
	"trade/mobile/mobile-balances-tab.tsx": {
		copy: {
			"No balances found. Deposit funds to start trading.": "confirmed-empty",
		},
		why: {
			"confirmed-empty":
				"Rendered only when the balance snapshot is complete, current and successful (isDataReady) and holds no balance.",
		},
	},
	"trade/mobile/mobile-book-chrome-view.tsx": {
		tones: { "text-trading-panel-error": 1 },
		why: {
			"data-value": "Compact mid price in the down colour when the live mid moved down.",
		},
	},
	"trade/mobile/mobile-book-view.tsx": {
		announcers: { "<output>": 1, "aria-live": 1 },
		copy: {
			"No orders": "confirmed-empty",
			"Waiting for order book...": "busy-description",
		},
		why: {
			"busy-description":
				'Screen-reader-only <output aria-live="polite"> while the book waits for its first live frame.',
			"confirmed-empty":
				'An empty side of the split book says "No orders" only on a live frame; while the book is transitioning (a cached snapshot, no live frame yet) that side holds placeholder rows.',
		},
	},
	"trade/mobile/mobile-funding-tab.tsx": {
		announcers: { "aria-live": 1 },
		tones: { "text-market-close-danger": 1 },
		copy: {
			"No funding payments found.": "confirmed-empty",
			"No funding payments match this direction.": "confirmed-empty",
			Retry: "neutral-retry",
		},
		why: {
			"value-announcement":
				"Screen-reader-only live region announcing the funding total; a number only for a ready snapshot with no error, not offline and not stale and, while the direction filter is on, a 30-day backfill that allows a conclusion; the stable placeholder otherwise.",
			"confirmed-empty":
				'"No funding payments found." only for a ready live snapshot with no error, not offline, not stale and no filter; the direction no-match comes from getFilteredHistoryEmptyPresentation() on the 30-day userFunding backfill and current live payments, otherwise a blank busy region.',
			"neutral-retry": "Neutral Retry after the backfill failed or no longer reaches the live payments.",
			"data-value": "Short direction in the danger colour.",
		},
	},
	"trade/mobile/mobile-history-tab.tsx": {
		announcers: { "aria-live": 1 },
		tones: { "text-market-close-danger": 2 },
		copy: {
			"Loading trade history": "busy-description",
			Retry: "neutral-retry",
			"No fills match these filters among the latest {…}.": "confirmed-empty",
			"No fills match these filters.": "confirmed-empty",
			"No fills found.": "confirmed-empty",
		},
		why: {
			"value-announcement": "Screen-reader-only live region announcing the number of trades shown.",
			"busy-description": "Screen-reader-only label of the blank busy block while the filter backfill loads.",
			"neutral-retry": "Neutral Retry after the backfill failed or no longer reaches the live fills.",
			"confirmed-empty":
				'The no-match pair comes from getFilteredFillsEmptyPresentation() on a current backfill and current live fills; "No fills found." only when the live fills are ready with no error, online, not stale and no filter is active.',
			"data-value": "Direction label in the danger colour for a sell or a liquidation.",
		},
	},
	"trade/mobile/mobile-market-bar.tsx": {
		tones: { "text-trading-panel-error": 1 },
		copy: {
			"Hourly rate paid by longs to shorts (if negative, shorts pay longs). Funding has no associated fee; it is a peer-to-peer transfer between users to push the price toward the spot price. See the documentation for details.":
				"static-copy",
		},
		why: {
			"static-copy": "The funding-rate explanation in the info sheet.",
			"data-value": "24h change and funding rate in the down colour when negative.",
		},
	},
	"trade/mobile/mobile-nav-drawer.tsx": {
		announcers: { 'role="alert"': 1, "<output>": 1 },
		tones: { "text-error": 1 },
		copy: {
			"Try again": "action-feedback",
		},
		why: {
			"action-feedback":
				'role="alert" "Try again" after the user tapped Deposit, Settings or a link and the chunk or navigation failed.',
			"confirmed-restriction": "The <output> under Deposit shows getFundsAvailabilityNotice(), confirmed reasons only.",
		},
	},
	"trade/mobile/mobile-order-modification-modal.tsx": {
		announcers: { "aria-invalid": 3, 'role="alert"': 1 },
		tones: { "text-market-close-danger": 2, "border-market-close-danger": 3 },
		why: {
			"input-validation":
				'The role="alert" message and the red field borders are passed in by mobile-orders-tab.tsx, which decides what may be shown.',
			"data-value": "Sell direction in the danger colour.",
		},
	},
	"trade/mobile/mobile-orders-history-tab.tsx": {
		announcers: { "aria-live": 1 },
		tones: { "text-market-close-danger": 1, "bg-error-soft": 1, "text-error": 1 },
		copy: {
			"No order history found.": "confirmed-empty",
			"No orders match these filters.": "confirmed-empty",
			Retry: "neutral-retry",
		},
		why: {
			"value-announcement":
				"Screen-reader-only live region announcing the number of orders shown; a number only for a ready snapshot with no error, not offline and not stale and, while a filter is on, a historicalOrders backfill that allows a conclusion; the stable placeholder otherwise.",
			"confirmed-empty":
				'"No order history found." only for a ready live snapshot with no error, not offline, not stale and no filter; the filter no-match comes from getFilteredHistoryEmptyPresentation() on the historicalOrders backfill and current live orders (naming the 2,000-order limit when the backfill reached it), otherwise a blank busy region.',
			"neutral-retry": "Neutral Retry after the backfill failed or no longer reaches the live orders.",
			"data-value":
				"Sell direction in the danger colour; Canceled and Rejected status badge in the error colours (the official terminal leaves the status uncoloured).",
		},
	},
	"trade/mobile/mobile-orders-tab.tsx": {
		announcers: { "toast.warning()": 1, "toast.error()": 1, "toast.info()": 1, 'role="alert"': 1 },
		tones: { 'intent="error"': 1, "text-market-close-danger": 3, "text-error": 1, "text-market-close-warning": 1 },
		copy: {
			"This order changed or is no longer open. Refresh and try again.": "confirmed-change",
			"Orders with linked TP/SL orders cannot be modified here.": "confirmed-restriction",
			"Market metadata changed. Refresh and try again.": "confirmed-change",
			"This order has incomplete data and cannot be modified. Refresh and try again.": "confirmed-restriction",
			"Reconnect the trading account before modifying this order.": "action-feedback",
			"Mark price is unavailable. Wait for market data and try again.": "action-feedback",
			"The trading account or network changed. Reopen the editor and try again.": "confirmed-change",
			"Size cannot exceed the order's remaining size.": "input-validation",
			"Open orders are refreshing. Wait for live data and try again.": ["action-feedback", 2],
			"Market orders cannot be modified after submission.": "confirmed-restriction",
			"This order type cannot be modified safely. Cancel and replace it instead.": "confirmed-restriction",
			"The cancellation response could not be confirmed. Refresh open orders before retrying.": "action-feedback",
			"Failed to cancel order.": "action-feedback",
			"Failed to modify order.": "action-feedback",
			"Some order markets are unavailable. Refresh and try again.": "action-feedback",
			"The previous order modification is still unconfirmed. Refresh open orders before retrying.": "action-feedback",
			"The order update was not confirmed by live data. Refresh before retrying; cancellation remains available.":
				"action-feedback",
			"Open orders changed. Reopen the confirmation and try again.": "action-feedback",
			"The trading account or network changed. Reopen the confirmation and try again.": "action-feedback",
			"No open orders.": "confirmed-empty",
			"No orders match the filters.": "confirmed-empty",
		},
		why: {
			"action-feedback":
				'The role="alert" line and the toasts report a Cancel or Modify the user requested, including the reply to a Modify tap while the trading client is not a valid owner; getDisplayableOpenOrderModifyBlock() keeps the snapshot-not-ready and mark-price sentences out of the draft, so they only follow a confirmed submit.',
			"input-validation":
				"What the user typed in the modify drawer against the order it edits; the message, the red border and aria-invalid come from the same displayable block.",
			"confirmed-change":
				"The order, the account, the network or the market binding differs from what the editor opened with. The market sentence needs a loaded market catalog everywhere it is shown: in a draft, and as the reply to a Modify tap for a market the loaded catalog cannot bind. While the catalog is loading or failed, Modify Order is disabled and a tap is ignored.",
			"confirmed-restriction":
				"Modify capabilities derived from the order record itself (linked TP/SL, market order, unsupported type, incomplete record, outcome market).",
			"confirmed-empty": "Rendered only when the open-orders snapshot is active, received and not stale (isDataReady).",
			"data-value":
				"Sell direction in the danger colour; distance to mark in the warning colour when a live mark is within 10%.",
			"destructive-action": "Static danger colour of Cancel all and Cancel.",
		},
	},
	"trade/mobile/mobile-position-actions.tsx": {
		reasonFields: { unavailableReason: 1 },
		why: {
			"disabled-reason":
				"Screen-reader-only reason attached to the disabled Close all button; it is never rendered visibly.",
		},
	},
	"trade/mobile/mobile-position-card.tsx": {
		tones: { "bg-market-close-danger": 1, "text-market-close-danger": 4, "text-error": 1 },
		why: {
			"data-value":
				"Short side bar and label, stop-loss price, and the liquidation price in the error colour when a live mark is within 10% of it (the official terminal does not highlight it).",
			"destructive-action": "Static danger colour of Market Close and Reverse.",
		},
	},
	"trade/mobile/mobile-positions-tab.tsx": {
		reasonFields: { unavailableReason: 1 },
		copy: {
			"No active positions.": "confirmed-empty",
			"No positions match the selected filters.": "confirmed-empty",
		},
		why: {
			"disabled-reason":
				"Passes the Close all reason to mobile-position-actions.tsx, which renders it screen-reader-only.",
			"confirmed-empty": "Rendered only when positions are not loading, not failed and not stale.",
		},
	},
	"trade/mobile/mobile-terminal.tsx": {
		announcers: { "<output>": 2 },
		copy: {
			"Loading {…}...": ["busy-description", 2],
		},
		why: {
			"busy-description":
				"Screen-reader-only <output> of the empty busy workspace while the lazy pieces or the market catalog load.",
		},
	},
	"trade/mobile/mobile-trade-size-control.tsx": {
		announcers: { "aria-invalid": 1 },
		why: {
			"input-validation":
				"aria-invalid on the size input follows validationSnapshot.hasSizeError, which only holds displayable size errors.",
		},
	},
	"trade/mobile/mobile-trade-view.tsx": {
		announcers: { 'role="alert"': 1, "<output>": 1 },
		tones: { "text-trading-panel-error": 1, "text-error": 2 },
		rawErrors: 1,
		copy: {
			"Connect Wallet": "confirmed-restriction",
			"N/A": "stable-placeholder",
			"Trading is not available in your region": "confirmed-restriction",
			"Failed to enable trading": "action-feedback",
		},
		why: {
			"input-validation":
				'The role="alert" summary and the one .message read show order validation errors filtered by getOrderValidationPresentation(), which drops errors whose market, account or wallet data is not ready.',
			"action-feedback": "Failure of Enable Trading after the user pressed it.",
			"confirmed-restriction":
				"The disabled region button and the <output> reason under the order button (Agent-only, activate trading on desktop) for resolved states only; the order button reads Connect Wallet only once the session is definitively not connected, and keeps the order's name, disabled, while useWalletSession().isResolving holds.",
			"data-value":
				"Estimated liquidation price in the error colour when it is within 5% of the order price and its data is ready; 24h change red when negative.",
			"stable-placeholder": "The order summary N/A, identical for an empty draft, loading and a failed read.",
		},
	},
	"trade/mobile/mobile-twap-fill-history-list.tsx": {
		tones: { "text-market-close-danger": 1 },
		copy: {
			"No TWAP fills found.": "confirmed-empty",
		},
		why: {
			"data-value": "Sell direction in the danger colour.",
			"confirmed-empty":
				"Rendered only when useTwapSliceFills().canConfirmEmpty holds (online, the last REST request succeeded, none is running or paused, the stream is active and not stale).",
		},
	},
	"trade/mobile/mobile-twap-history-list.tsx": {
		tones: { "text-market-close-danger": 2 },
		copy: {
			"No TWAP history found.": "confirmed-empty",
		},
		why: {
			"data-value": "Failed status and the exchange description of a TWAP that ended in error, in the danger colour.",
			"confirmed-empty":
				"Rendered only when useTwapHistory().canConfirmEmpty holds (online, the last REST request succeeded, none is running or paused, the stream is active and not stale).",
		},
	},
	"trade/mobile/mobile-twap-tab.tsx": {
		announcers: { 'role="alert"': 1, 'role="status"': 1 },
		tones: {
			"text-market-close-danger": 2,
			"text-warning": 1,
			"bg-market-close-danger": 2,
			"border-stroke-error-weak": 1,
		},
		rawErrors: 1,
		copy: {
			"No active TWAP orders.": "confirmed-empty",
			"Pause unavailable: Hyperliquid does not support pausing active TWAP orders.": "confirmed-restriction",
			"Hyperliquid does not support pausing active TWAP orders.": "confirmed-restriction",
			Pause: "static-copy",
		},
		why: {
			"action-feedback":
				'role="alert" and role="status" lines with the message of a Terminate the user requested (the one .message read).',
			"confirmed-empty": "Rendered only when the TWAP states view is ready and active.",
			"confirmed-restriction":
				"The exchange has no pause action for a TWAP (twapOrder and twapCancel only), so Pause stays disabled with that reason.",
			"static-copy": "The name of the disabled Pause control.",
			"data-value": "Sell side pill and progress fill in the danger colour.",
			"destructive-action": "Static danger styling of Terminate.",
		},
	},
	"trade/mobile/offline-banner.tsx": {
		announcers: { 'role="alert"': 1, "aria-live": 1 },
		icons: { WifiSlashIcon: 1 },
		tones: { "bg-warning-soft": 3, "text-warning": 1, "border-stroke-warning-weak/20": 1, "bg-warning-soft/80": 1 },
		copy: {
			"Back online": "offline-banner",
			"You're offline": "offline-banner",
			Retry: "offline-banner",
		},
		why: {
			"offline-banner":
				"The global real offline and back-online banner (navigator connectivity), which the policy excludes from passive data notices; the official terminal has one too.",
		},
	},
	"trade/positions/send-modal.tsx": {
		announcers: { "toast.error()": 4, "toast.success()": 1, "toast.warning()": 1 },
		icons: { STATUS_GLYPH_UNKNOWN: 1, InfoIcon: 1, WarningCircleIcon: 3 },
		tones: {
			"border-stroke-info-weak": 1,
			"bg-info-soft": 1,
			"text-info": 1,
			"text-icon-info": 1,
			"border-stroke-warning-weak": 3,
			"bg-warning-soft": 3,
			"text-warning": 3,
			"text-icon-warning": 2,
			"border-stroke-error-strong": 2,
		},
		copy: {
			"Unable to send funds to this address.": "action-feedback",
			"Unable to check the destination address. Nothing was sent.": ["action-feedback", 2],
			"Send status unknown": "action-feedback",
			"Check your balances and the Deposits & Withdrawals history before retrying.": "action-feedback",
			"Send failed": "action-feedback",
			"Connect your wallet to send funds.": "confirmed-restriction",
		},
		why: {
			"action-feedback": "Toasts for the outcome of a Send the user confirmed, including the unknown outcome.",
			"risk-disclosure":
				"Review-step notices from the destination check the user triggered: the one-time activation fee and the warning that the destination never sent a transaction (the official Send confirmation warns the same way).",
			"confirmed-restriction":
				"The region or Agent-only notice from getFundsAvailabilityNotice(), and the Connect warning, which shows only once the session is definitively not connected: not while it resolves and not to an Agent-only session.",
			"input-validation": "Red border of an amount above the confirmed balance.",
		},
	},
	"trade/positions/position-isolated-margin-modal.tsx": {
		icons: { WarningIcon: 1 },
		tones: {
			"text-error": 4,
			"border-stroke-warning-strong/20": 1,
			"bg-warning-soft/10": 1,
			"text-warning": 2,
			"border-stroke-error-strong/20": 1,
			"bg-error-soft": 1,
		},
		copy: {
			"This isolated position is no longer open.": ["confirmed-change", 2],
			"This position is no longer using isolated margin.": "confirmed-change",
		},
		why: {
			"input-validation": "Amount and target-leverage errors for what the user typed.",
			"risk-disclosure": "Static warning that removing margin raises liquidation risk.",
			"confirmed-change":
				"The position status box once markets and positions are loaded, not failed and not stale; its identity branch reports an owner or network that differs from the one the dialog opened with, and stays silent while the wallet session resolves.",
		},
	},
	"trade/positions/position-market-close-modal.tsx": {
		announcers: { "<output>": 1, "aria-live": 2, 'role="alert"': 1 },
		icons: { WarningIcon: 2 },
		tones: {
			"text-market-close-danger": 1,
			"bg-warning-soft": 1,
			"text-warning": 1,
			"bg-error-soft": 1,
			"text-error": 1,
			'intent="error"': 1,
			"bg-market-close-danger": 3,
			"text-market-close-danger-text": 1,
			"bg-market-close-danger-disabled": 1,
		},
		copy: {
			"This position is no longer open.": "confirmed-change",
			"Reduce this position at the current market price. Filled trades cannot be reversed.": "risk-disclosure",
			"Click to submit · Filled trades cannot be reversed": "risk-disclosure",
		},
		why: {
			"confirmed-change":
				'The size-changed notice (aria-live="polite", docs/confirmation-surfaces.md) and the box that reports a closed or reversed position.',
			"input-validation": 'Sizing errors of the close size the user set, in the same role="alert" box.',
			"risk-disclosure": "Static wording that filled trades cannot be reversed.",
			"destructive-action": "Static danger styling of the confirm control.",
			"data-value": "Estimated PnL in the danger colour when negative.",
		},
	},
	"trade/positions/position-limit-close-modal.tsx": {
		announcers: { "aria-invalid": 1, 'role="alert"': 1, "aria-live": 1 },
		icons: { WarningIcon: 1 },
		tones: {
			"text-market-close-danger": 1,
			"bg-error-soft": 1,
			"text-error": 1,
			'intent="error"': 1,
			"bg-market-close-danger": 3,
			"text-market-close-danger-text": 1,
			"bg-market-close-danger-disabled": 1,
		},
		copy: {
			"This position is no longer open.": "confirmed-change",
		},
		why: {
			"confirmed-change": "The box that reports a closed or reversed position.",
			"input-validation": 'Limit price and sizing errors in the same role="alert" box.',
			"destructive-action": "Static danger styling of the confirm control.",
			"data-value": "Estimated PnL in the danger colour when negative.",
		},
	},
	"trade/positions/position-tpsl-modal.tsx": {
		icons: { WarningIcon: 1 },
		tones: {
			"text-warning": 3,
			"text-error": 4,
			"border-stroke-warning-weak": 2,
			"bg-warning-soft": 2,
			"text-icon-warning": 1,
			"bg-error": 1,
		},
		rawErrors: 1,
		copy: {
			"Connect wallet to view positions": "confirmed-restriction",
			"No active positions.": "confirmed-empty",
			"Safe action coordination across tabs is unavailable in this browser.": "action-feedback",
			"TP/SL may have changed. Review this position's TP/SL before retrying.": "action-feedback",
			"Amount must be greater than zero and no more than the current position.": "input-validation",
		},
		why: {
			"action-feedback": "Classified outcome of a TP/SL submission the user confirmed.",
			"input-validation": "Amount, limit and configuration errors for what the user entered.",
			"confirmed-empty": "Rendered only once positions and open orders are loaded and the position is gone.",
			"confirmed-change":
				"The guard notice for a TP/SL configuration or position that changed while the dialog was open.",
			"risk-disclosure":
				"The large-size slippage warning, derived from a successful maxMarketOrderNtls answer (the official dialog shows the same warning).",
			"data-value":
				"Mark price in the warning colour once a live mark exists (the official dialog leaves it uncoloured), unrealized PnL by sign, short side bar.",
			"static-copy":
				"The one destructured message is the prop of the status body component, which receives the sentences registered here; it is not error text.",
			"confirmed-restriction":
				"The Connect body, only once the session is definitively not connected; while it resolves, or while the account data reloads afterwards, the form that was shown stays mounted and disabled, or a busy body shows when no form was.",
		},
	},
	"trade/components/spot-swap-modal.tsx": {
		icons: { WarningIcon: 6 },
		tones: {
			"border-stroke-warning-weak": 1,
			"bg-warning-soft": 6,
			"text-icon-warning": 1,
			"text-warning": 12,
			"border-stroke-warning-strong/20": 5,
			"border-stroke-warning-strong/40": 2,
			"bg-warning-soft/50": 1,
			"border-stroke-warning-strong": 1,
		},
		copy: {
			"Trading is not available in your region": "confirmed-restriction",
			"No trading pair available for {…}/ {…}": "confirmed-restriction",
			"No liquidity was available within the {…}% slippage limit.": "input-validation",
		},
		why: {
			"confirmed-restriction": "The region notice, and the missing-pair notice from a loaded spot market catalog.",
			"input-validation":
				"Insufficient balance, minimum order value, partial fill and no-liquidity notices computed from a ready balance and a live order book.",
		},
	},
	"trade/positions/account-transfers-tab.tsx": {
		tones: { "text-error": 1 },
		copy: {
			"Connect your wallet to view deposits and withdrawals.": "confirmed-restriction",
			Retry: ["neutral-retry", 2],
			"No deposits or withdrawals found.": "confirmed-empty",
		},
		why: {
			"neutral-retry": "Neutral Retry after a failed read; no error text.",
			"confirmed-empty": "Rendered only when useAccountLedger().canConfirmEmpty holds.",
			"data-value": "Fee cell in the error colour when the row carries a fee.",
			"confirmed-restriction":
				"The Connect sentence, rendered through the shared ConnectPlaceholder of the desktop account tabs: only once the session is definitively not connected; a busy region shows while useWalletSession().isResolving holds.",
		},
	},
	"trade/positions/transfer-modal.tsx": {
		announcers: { "toast.error()": 2, "toast.warning()": 1, "toast.success()": 1 },
		icons: { STATUS_GLYPH_UNKNOWN: 1, WarningCircleIcon: 2 },
		tones: {
			"border-stroke-warning-weak": 1,
			"bg-warning-soft": 1,
			"text-warning": 1,
			"border-stroke-info-weak": 1,
			"bg-info-soft": 1,
			"text-info": 1,
			"border-stroke-error-strong": 2,
		},
		copy: {
			"Transfer status unknown": "action-feedback",
			"Check your balances and the Deposits & Withdrawals history before retrying.": "action-feedback",
			"Transfer failed": "action-feedback",
			"Connect your wallet to transfer funds.": "confirmed-restriction",
		},
		why: {
			"action-feedback": "Toasts for the outcome of a Transfer the user confirmed, including the unknown outcome.",
			"confirmed-restriction":
				"The notice from getFundsAvailabilityNotice() (Agent-only session, region), and the Connect warning, which shows only once the session is definitively not connected: not while it resolves and not to an Agent-only session.",
			"input-validation": "Red border of an amount above the confirmed balance.",
		},
	},
	"trade-history/trade-history-page.tsx": {
		announcers: { 'role="alert"': 1, "<output>": 4, "aria-live": 3 },
		icons: { WarningCircleIcon: 1 },
		tones: { "text-error": 3, "border-stroke-warning-weak": 1, "bg-warning-soft": 1, "text-warning": 1 },
		copy: {
			"You are offline. Trade history will load when the connection returns.": ["busy-description", 2],
			"Loading trade history": ["busy-description", 2],
			"The recent trade snapshot could not be loaded or validated.": ["busy-description", 2],
			"No fills found in the recent trade snapshot.": "confirmed-empty",
			"No fills found": "confirmed-empty",
			"The account has no fills in the public API snapshot.": "confirmed-empty",
			"No fills match the selected filters.": "confirmed-empty",
			"No matching fills": "confirmed-empty",
			Refresh: "neutral-retry",
			"The page loads one recent-fill snapshot. Export CSV to request a broader accessible history.": "static-copy",
		},
		why: {
			"busy-description":
				"Screen-reader-only descriptions handed to HistoryPageUnavailable or the skeleton; nothing of them is visible.",
			"neutral-retry": "The Refresh control of the page header.",
			"confirmed-empty":
				"The empty statements and the filter no-match pair are rendered only for a ready snapshot with no error, online and not refreshing; otherwise the region below the filters is HistoryPageUnavailable.",
			"input-validation": 'role="alert" for an invalid account address in the route.',
			"confirmed-restriction": "The <output> notice that the snapshot reached its confirmed size limit.",
			"static-copy": "The standing explanation of what the page loads.",
			"data-value": "Direction in the error colour for a sell or a liquidation.",
		},
	},
	"historical-orders/historical-orders-page.tsx": {
		announcers: { 'role="alert"': 1, "<output>": 4, "aria-live": 3 },
		icons: { WarningCircleIcon: 1 },
		tones: {
			"bg-error-soft": 1,
			"text-error": 2,
			"border-stroke-warning-weak": 1,
			"bg-warning-soft": 1,
			"text-warning": 1,
		},
		copy: {
			"You are offline. Order history will load when the connection returns.": ["busy-description", 2],
			"Loading order history": ["busy-description", 2],
			"The response could not be verified. No partial order history is shown.": ["busy-description", 2],
			"No ordinary orders found.": "confirmed-empty",
			"No order history found": "confirmed-empty",
			"The account has no ordinary orders in the available history.": "confirmed-empty",
			"No orders match the selected filters.": "confirmed-empty",
			"No matching orders": "confirmed-empty",
			Refresh: "neutral-retry",
			"This account reached the {…}-order API limit. Older orders are not available from this endpoint.":
				"confirmed-restriction",
		},
		why: {
			"busy-description":
				"Screen-reader-only descriptions handed to HistoryPageUnavailable or the skeleton; nothing of them is visible.",
			"neutral-retry": "The Refresh control of the page header.",
			"confirmed-empty":
				"The empty statements and the filter no-match pair are rendered only for a ready snapshot with no error, online and not refreshing; otherwise the region below the filters is HistoryPageUnavailable.",
			"input-validation": 'role="alert" for an invalid account address in the route.',
			"confirmed-restriction": "The <output> notice that the account reached the documented historicalOrders limit.",
			"data-value": "Rejected status badge in the error colours.",
		},
	},
	"funding-history/funding-history-page.tsx": {
		announcers: { 'role="alert"': 1, "<output>": 3, "aria-live": 3 },
		icons: { WarningCircleIcon: 1 },
		tones: { "text-error": 1, "text-market-close-danger": 2 },
		copy: {
			"You are offline. Funding payments will load when the connection returns.": ["busy-description", 2],
			"Loading funding payments": ["busy-description", 2],
			"The requested 30-day window could not be verified. No partial history is shown.": ["busy-description", 2],
			"No funding payments found in the confirmed 30-day window.": "confirmed-empty",
			"No funding payments found": "confirmed-empty",
			"The account has no funding payments in the confirmed 30-day window.": "confirmed-empty",
			"No funding payments match the selected filters.": "confirmed-empty",
			"No matching funding payments": "confirmed-empty",
			Refresh: "neutral-retry",
			"Only this requested time window is shown. Older payments have not been loaded and are not included in this count.":
				"static-copy",
		},
		why: {
			"busy-description":
				"Screen-reader-only descriptions handed to HistoryPageUnavailable or the skeleton; nothing of them is visible.",
			"neutral-retry": "The Refresh control of the page header.",
			"confirmed-empty":
				"The empty statements and the filter no-match pair are rendered only for a ready snapshot with no error, online and not refreshing; otherwise the region below the filters is HistoryPageUnavailable.",
			"input-validation": 'role="alert" for an invalid account address in the route.',
			"static-copy": "The standing explanation of the time window the page shows.",
			"data-value": "Short side label in the danger colour.",
		},
	},
	"ui/history-page-unavailable.tsx": {
		announcers: { "<output>": 1, "aria-live": 1 },
		copy: {
			Retry: "neutral-retry",
		},
		why: {
			"busy-description": 'The screen-reader-only <output aria-live="polite"> that carries the caller description.',
			"neutral-retry": "The neutral Retry button, the only visible element.",
		},
	},
};
