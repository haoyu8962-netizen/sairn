interface FundsAvailability {
	reason: string | null;
	unavailableReason: string | null;
}

const PASSIVE_DATA_REASONS = new Set([
	"account-data-unavailable",
	"account-mode-unresolved",
	"geo-unresolved",
	"wallet-session-required",
]);

export function getFundsAvailabilityNotice(availability: FundsAvailability): string | null {
	return availability.reason && PASSIVE_DATA_REASONS.has(availability.reason) ? null : availability.unavailableReason;
}

/**
 * A funds control keeps its action name while its data or region is still being resolved; only a
 * confirmed restriction, which has a notice to show, may rename it (docs/mobile-data-presentation.md).
 */
export function isFundsActionRestricted(availability: FundsAvailability & { available: boolean }): boolean {
	return !availability.available && getFundsAvailabilityNotice(availability) !== null;
}
