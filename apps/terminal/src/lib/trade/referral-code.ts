const REFERRAL_CODE_INPUT_PATTERN = /^[A-Za-z0-9]{0,20}$/;
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{1,20}$/;

/**
 * Referral codes are up to 20 letters or digits in upper case, as the official terminal enforces
 * when they are typed or created; anything else returns null so the field keeps its last value.
 *
 * Kept apart from `referral.ts` so the `/join/$code` route, which lives in the application entry chunk,
 * does not pull the referral page's response schemas into trade startup.
 */
export function normalizeReferralCode(value: string): string | null {
	return REFERRAL_CODE_INPUT_PATTERN.test(value) ? value.toUpperCase() : null;
}

export function isValidReferralCode(code: string): boolean {
	return REFERRAL_CODE_PATTERN.test(code);
}
