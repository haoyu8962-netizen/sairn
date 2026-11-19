export const tradeMarketLinks = [
	{
		market: { kind: "builderPerp", name: "xyz:BRK.B", pairName: "BRK.B-USDC" },
		pathnames: ["/trade/xyz:BRK.B", "/trade/xyz:BRK.B/", "/trade/xyz%3ABRK.B", "/trade/xyz%3ABRK.B/"],
	},
	{
		market: { kind: "spot", name: "@107", pairName: "BTC/USD.C" },
		pathnames: ["/trade/BTC/USD.C", "/trade/BTC/USD.C/"],
	},
	{
		market: { kind: "spot", name: "@108", pairName: "BRK.B/USDC" },
		pathnames: ["/trade/BRK.B/USDC", "/trade/BRK.B/USDC/"],
	},
] as const;

export const shellNavigationPaths = [
	...tradeMarketLinks.flatMap(({ pathnames }) => [...pathnames]),
	`/missing.${"a".repeat(17)}`,
];

export const nonShellNavigationPaths = [
	"/assets/missing.js",
	"/api/geo",
	"/api/unknown.js",
	"/charting_library/bundles/example.js",
	`/missing.${"a".repeat(16)}`,
	"/trade//BRK.B",
	"/trade/BTC/USD.C/extra.js",
	"/trade-history/BRK.B",
];
