import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import shared from "./vite.config";

const mock = fileURLToPath(new URL("./account-tables.browser.tsx", import.meta.url));
const balances = fileURLToPath(new URL("./account-tables-balances.browser.ts", import.meta.url));
const markets = fileURLToPath(new URL("./account-tables-markets.browser.ts", import.meta.url));
export default mergeConfig(
	{ ...shared, resolve: undefined, optimizeDeps: undefined },
	{
		cacheDir: fileURLToPath(new URL("../../node_modules/.vite-account-tables", import.meta.url)),
		optimizeDeps: { entries: ["account-tables.html"] },
		resolve: {
			dedupe: ["react", "react-dom"],
			alias: [
				{ find: /^@\/lib\/hyperliquid$/u, replacement: mock },
				{ find: /^@\/lib\/hyperliquid\/markets\/use-markets$/u, replacement: markets },
				{ find: /^@\/hooks\/wallet\/use-wallet-session$/u, replacement: mock },
				{ find: /^@\/hooks\/use-geo-restriction$/u, replacement: mock },
				{ find: /^(?:@\/hooks\/trade\/|\.\/)use-account-balances$/u, replacement: balances },
				{
					find: /^@\/hooks\/trade\/(?:use-account-overview|use-deposit-availability|use-funds-action-availability|use-market-navigation|use-position-market-close-action|use-position-close-all-action|use-twap-cancel|use-twap-history|use-twap-slice-fills|use-twap-fill-history-csv|use-user-fills|use-trade-history|use-historical-orders|use-order-history|use-funding-history|use-user-funding|use-history-csv-export)$/u,
					replacement: mock,
				},
			],
		},
	},
);
