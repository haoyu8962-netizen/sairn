/**
 * The account-table fixture's clock: its data is dated relative to this instant and the test pins the
 * browser's `Date` to it (`page.clock.setFixedTime`), so durations, dates and freshness read the same on
 * every run and machine.
 */
export const ACCOUNT_TABLES_NOW = Date.UTC(2026, 10, 20, 9, 30, 0);
