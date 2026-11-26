import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import shared from "./vite.config";

const mock = fileURLToPath(new URL("./mobile-history-cards.browser.tsx", import.meta.url));
export default mergeConfig(
	{ ...shared, resolve: undefined, optimizeDeps: undefined },
	{
		cacheDir: fileURLToPath(new URL("../../node_modules/.vite-mobile-history-cards", import.meta.url)),
		optimizeDeps: { entries: ["mobile-history-cards.html"] },
		resolve: {
			dedupe: ["react", "react-dom"],
			alias: [
				{ find: /^@\/lib\/hyperliquid$/u, replacement: mock },
				{ find: /^@\/hooks\/wallet\/use-wallet-session$/u, replacement: mock },
				{
					find: /^@\/hooks\/trade\/(?:use-user-fills|use-trade-history|use-historical-orders|use-order-history|use-funding-history|use-user-funding|use-history-csv-export|use-market-navigation)$/u,
					replacement: mock,
				},
			],
		},
	},
);
