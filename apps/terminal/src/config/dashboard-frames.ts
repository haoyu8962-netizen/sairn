export interface DashboardFramePreset {
	canvasClassName: string;
	mainClassName: string;
}

export const DASHBOARD_MAIN_CLASS =
	"mx-auto w-full max-w-[var(--dashboard-frame-max)] px-4 py-4 min-[1001px]:px-10 min-[1001px]:py-6";

export const DASHBOARD_FRAMES = {
	"/portfolio": {
		canvasClassName: "min-h-dvh bg-portfolio-canvas text-fg font-sans",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/vaults": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/earn": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/staking": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/referrals": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/leaderboard": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/funding-comparison": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/funding-history": {
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/historical-orders": {
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/api-wallet": {
		canvasClassName: "min-h-dvh bg-dashboard-canvas font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	"/trade-history": {
		canvasClassName: "min-h-dvh bg-grid-container font-sans text-fg",
		mainClassName: DASHBOARD_MAIN_CLASS,
	},
	legal: {
		canvasClassName: "min-h-dvh bg-background font-sans text-fg",
		mainClassName: "mx-auto w-full max-w-3xl px-5 py-8 min-[1001px]:py-12",
	},
} as const satisfies Record<string, DashboardFramePreset>;
