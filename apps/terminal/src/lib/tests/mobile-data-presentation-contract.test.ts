import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import {
	createImportedTextResolver,
	isEmptyMarkers,
	type PresentationMarkers,
	scanPresentationMarkers,
} from "./harness/presentation-markers";
import {
	NAMED_PRESENTATION_FILES,
	type PresentationKind,
	REVIEWED_PRESENTATION,
	type ReviewedPresentation,
} from "./mobile-data-presentation-registry";

const root = resolve(import.meta.dirname, "../../../../..");
const mobile = resolve(root, "apps/terminal/src/components/trade/mobile");

describe("mobile passive data presentation contract", () => {
	it.each(["account-data-unavailable", "account-mode-unresolved", "geo-unresolved", "wallet-session-required"])(
		"suppresses %s without making the action available",
		(reason) => {
			const availability = { available: false, reason, unavailableReason: "Internal data status" };
			expect(getFundsAvailabilityNotice(availability)).toBeNull();
			expect(availability.available).toBe(false);
		},
	);

	it.each([
		"account-mode-unsupported",
		"agent-only-session",
		"geo-restricted",
		"external-deposit-disabled",
		"internal-transfers-unavailable",
	])("preserves a confirmed restriction: %s", (reason) => {
		expect(getFundsAvailabilityNotice({ reason, unavailableReason: "Confirmed restriction" })).toBe(
			"Confirmed restriction",
		);
	});

	it("does not reintroduce retired passive warning copy in mobile components", () => {
		const retired = [
			"Balance data is stale",
			"Failed to load balance",
			"Failed to load order book",
			"Failed to load open orders",
			"Failed to load positions",
			"Failed to load TWAP",
			"Failed to load deposits and withdrawals",
			"Trade history updates paused",
			"Order history updates paused",
			"Funding updates paused",
			"TWAP updates paused",
			"Checking regional availability",
			"Deposits and withdrawals are not allowed",
		];
		for (const file of readdirSync(mobile).filter((file) => file.endsWith(".tsx"))) {
			const source = readFileSync(resolve(mobile, file), "utf8");
			for (const text of retired) expect(source, `${file}: ${text}`).not.toContain(text);
		}
	});

	it("keeps the shared modal read-state warnings removed", () => {
		for (const file of [
			"positions/send-modal.tsx",
			"positions/position-isolated-margin-modal.tsx",
			"positions/position-market-close-modal.tsx",
			"positions/position-limit-close-modal.tsx",
			"positions/position-tpsl-modal.tsx",
			"components/spot-swap-modal.tsx",
		]) {
			const source = readFileSync(resolve(mobile, "..", file), "utf8");
			for (const message of [
				"<Trans>Waiting for order book...</Trans>",
				"<Trans>Failed to load order book.</Trans>",
				"t`Live position data is stale.",
				"t`Failed to load positions.",
				"<Trans>Loading account mode...</Trans>",
				"guardMessage = t`Loading...`",
			])
				expect(source, file).not.toContain(message);
		}
	});

	it("keeps the history pages free of passive read-failure banners and empty conclusions", () => {
		for (const file of [
			"../../trade-history/trade-history-page.tsx",
			"../../historical-orders/historical-orders-page.tsx",
			"../../funding-history/funding-history-page.tsx",
		]) {
			const source = readFileSync(resolve(mobile, file), "utf8");
			for (const marker of [
				"Refresh failed.",
				"Previously loaded",
				"bg-warning/",
				"border-warning/",
				'role="alert" className="border-b',
			])
				expect(source, `${file}: ${marker}`).not.toContain(marker);
			expect(source, file).toContain("HistoryPageUnavailable");
		}
		const placeholder = readFileSync(resolve(mobile, "../../ui/history-page-unavailable.tsx"), "utf8");
		for (const marker of ["Icon", "text-error", "text-warning", 'role="alert"'])
			expect(placeholder, `history-page-unavailable.tsx: ${marker}`).not.toContain(marker);
		expect(placeholder).toContain('className="sr-only"');
	});

	it("keeps the desktop deposits and withdrawals tab free of read-failure text", () => {
		const source = readFileSync(resolve(mobile, "../positions/account-transfers-tab.tsx"), "utf8");
		expect(source).not.toContain("Failed to load deposits and withdrawals");
		expect(source).not.toContain('variant="error"');
	});

	it("does not couple transfer controls to the presence of a notice", () => {
		const source = readFileSync(resolve(mobile, "../positions/transfer-modal.tsx"), "utf8");
		expect(source).not.toContain("!!internalTransfersDisabledReason");
		expect(source).not.toContain("if (internalTransfersDisabledReason");
	});

	it("requires the presentation policy in project guidance", () => {
		expect(readFileSync(resolve(root, "AGENTS.md"), "utf8")).toContain("docs/mobile-data-presentation.md");
	});

	describe("staking, referral, Vault and API wallet pages (desktop and phone)", () => {
		const components = resolve(root, "apps/terminal/src/components");
		const directories = ["staking", "referrals", "vaults", "api-wallet"];
		const sources = directories.flatMap((directory) =>
			readdirSync(resolve(components, directory))
				.filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
				.map((file) => ({
					file: `${directory}/${file}`,
					source: readFileSync(resolve(components, directory, file), "utf8"),
				})),
		);

		function count(source: string, marker: string): number {
			return source.split(marker).length - 1;
		}

		it("scans every component directory of these pages", () => {
			for (const directory of directories) {
				expect(
					sources.some(({ file }) => file.startsWith(`${directory}/`)),
					directory,
				).toBe(true);
			}
		});

		it("does not bring back the passive refresh, failure and unknown-value copy", () => {
			const retired = [
				"Refreshing staking data",
				"Refreshing referral data",
				"Refreshing Vault data",
				"Account staking data unavailable",
				"Balances remain unknown",
				"Validator data unavailable",
				"Reward history unavailable",
				"Staking action history unavailable",
				"Estimated APR unavailable",
				"Referral data unavailable",
				"Recent reward claims could not be verified",
				"Vault details are unavailable",
				"Vault data is unavailable",
				"Account Vault data could not be verified",
				"Your Vault balance could not be verified",
				"Retry account data",
				"Verifying the owner Vault balance",
				"until the owner balance is verified",
				"Checking regional availability",
				"Unable to verify regional availability",
				"Verified Vault details are unavailable",
				"API wallet list is temporarily unavailable",
				"The extraAgents request failed",
				'"0 HYPE"',
			];
			for (const { file, source } of sources) {
				for (const text of retired) expect(source, `${file}: ${text}`).not.toContain(text);
			}
		});

		it("keeps failure banners and warning icons to the reviewed confirmed states", () => {
			// Each remaining use, with its reason and count. A passive read shows only a neutral Retry.
			const reviewed: Record<string, Record<string, { count: number; reason: string }>> = {
				'role="alert"': {
					"vaults/vaults-page.tsx": { count: 1, reason: "confirmed Vault not found answer, not a read failure" },
					"vaults/vault-action-modal.tsx": {
						count: 2,
						reason: "failure and unknown outcome of a requested Vault transfer (action feedback)",
					},
					"api-wallet/api-wallet-action-modal.tsx": {
						count: 2,
						reason: "failure of a requested approval and the removal consequence in the action dialog",
					},
					"api-wallet/api-wallet-credential-box.tsx": {
						count: 1,
						reason: "one-time private key download warning after a verified approval",
					},
					"api-wallet/api-wallet-view.tsx": {
						count: 1,
						reason: "confirmed signer mismatch: the active wallet is not the account's master wallet",
					},
				},
				WarningCircleIcon: {
					"vaults/vaults-page.tsx": { count: 2, reason: "import and the confirmed Vault not found answer" },
					"vaults/vault-detail-view.tsx": { count: 2, reason: "import and the static Vault risk disclosure" },
					"vaults/vaults-list.tsx": { count: 2, reason: "import and the warning tone of unavailable classification" },
					"vaults/vault-action-modal.tsx": { count: 2, reason: "import and the transfer risk in the action dialog" },
					"referrals/referral-action-modal.tsx": {
						count: 2,
						reason: "import and the signing notice in the action dialog",
					},
					"api-wallet/api-wallet-credential-box.tsx": {
						count: 2,
						reason: "import and the one-time private key download warning",
					},
					"api-wallet/api-wallet-view.tsx": { count: 2, reason: "import and the confirmed signer mismatch" },
				},
			};
			for (const [marker, allowed] of Object.entries(reviewed)) {
				const actual = Object.fromEntries(
					sources
						.filter(({ source }) => count(source, marker) > 0)
						.map(({ file, source }) => [file, count(source, marker)]),
				);
				const expected = Object.fromEntries(Object.entries(allowed).map(([file, entry]) => [file, entry.count]));
				expect(actual, marker).toEqual(expected);
			}
		});

		it("disables Vault actions from availability booleans, not from a displayed explanation", () => {
			const view = sources.find(({ file }) => file === "vaults/vault-detail-view.tsx")?.source ?? "";
			expect(view).not.toMatch(/disabled=\{\w*UnavailableReason\s*!==\s*null\}/);
			expect(view).toContain("const depositDisabled = !actionAvailability.deposit.available || !onRequestAction;");
			expect(view).toContain("const withdrawDisabled = !actionAvailability.withdraw.available || !onRequestAction;");
			expect(view).toContain("isPassiveVaultActionReason(availability.reason)");
		});
	});

	// The lists above only catch copy that was already retired. This registry is the other half: every
	// announcer role, warning icon, warning-coloured class, status wording, raw error read and passive
	// reason field in the covered files is counted from the source and compared with a reviewed entry,
	// so a newly written passive notice fails until it is reviewed (docs/mobile-data-presentation.md,
	// 回归入口, lists what the scan does not see).
	describe("reviewed registry of warning-like presentation", () => {
		const components = resolve(root, "apps/terminal/src/components");
		const mobileEntries = readdirSync(mobile, { withFileTypes: true });
		const covered = [
			...mobileEntries
				.filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
				.map((entry) => `trade/mobile/${entry.name}`),
			...NAMED_PRESENTATION_FILES,
		];

		const resolveImportedText = createImportedTextResolver(resolve(root, "apps/terminal/src"));

		function expectedMarkers(entry: ReviewedPresentation): PresentationMarkers {
			return {
				announcers: entry.announcers ?? {},
				icons: entry.icons ?? {},
				tones: entry.tones ?? {},
				copy: Object.fromEntries(
					Object.entries(entry.copy ?? {}).map(([text, kind]) => [text, typeof kind === "string" ? 1 : kind[1]]),
				),
				rawErrors: entry.rawErrors ?? 0,
				reasonFields: entry.reasonFields ?? {},
			};
		}

		function copyKinds(entry: ReviewedPresentation): PresentationKind[] {
			return Object.values(entry.copy ?? {}).map((kind) => (typeof kind === "string" ? kind : kind[0]));
		}

		it("covers every source file of the mobile directory", () => {
			expect(
				mobileEntries.filter((entry) => !entry.isFile() || !/\.tsx?$/.test(entry.name)).map((entry) => entry.name),
				"components/trade/mobile holds something the scan does not read (a subdirectory or another extension): extend the coverage first",
			).toEqual([]);
			expect(covered.length).toBeGreaterThan(NAMED_PRESENTATION_FILES.length + 40);
			expect(new Set(covered).size).toBe(covered.length);
		});

		it.each(covered)("%s presents only what was reviewed", (file) => {
			const markers = scanPresentationMarkers(readFileSync(resolve(components, file), "utf8"), file, {
				resolveImportedText,
			});
			const entry = REVIEWED_PRESENTATION[file];
			const hint = `${file}: review the change against docs/mobile-data-presentation.md, then update mobile-data-presentation-registry.ts`;
			if (!entry) {
				expect(markers, hint).toEqual(expectedMarkers({ why: {} }));
				return;
			}
			expect(markers, hint).toEqual(expectedMarkers(entry));
		});

		it("registers covered files only, and none that has nothing to review", () => {
			for (const [file, entry] of Object.entries(REVIEWED_PRESENTATION)) {
				expect(covered, file).toContain(file);
				expect(isEmptyMarkers(expectedMarkers(entry)), `${file}: an empty entry hides nothing and must go`).toBe(false);
			}
		});

		it("gives every registered kind its reason", () => {
			for (const [file, entry] of Object.entries(REVIEWED_PRESENTATION)) {
				const reasons = Object.entries(entry.why);
				expect(reasons.length, file).toBeGreaterThan(0);
				for (const [kind, reason] of reasons) expect(reason.trim().length, `${file}: ${kind}`).toBeGreaterThan(20);
				for (const kind of copyKinds(entry)) expect(Object.keys(entry.why), `${file}: ${kind}`).toContain(kind);
			}
		});

		// The file names of the 待处理 table, or null when the section or its table header is missing. The
		// table may be empty once every pending item is fixed, so the check anchors on the header instead of
		// on a row count: without the header there is no table this reader could have read.
		const PENDING_TABLE_HEADER = "| 文件 | 现状 | 依据 | 建议的修法 |\n| --- | --- | --- | --- |\n";

		function readPendingPolicyRows(policy: string): string[] | null {
			const start = policy.indexOf("\n## 待处理\n");
			if (start === -1) return null;
			const end = policy.indexOf("\n## ", start + 1);
			const section = policy.slice(start, end === -1 ? undefined : end);
			const header = section.indexOf(`\n${PENDING_TABLE_HEADER}`);
			if (header === -1) return null;
			const table = section.slice(header + 1 + PENDING_TABLE_HEADER.length).split("\n\n")[0] ?? "";
			return [...table.matchAll(/^\| `([\w-]+\.tsx?)` \|/gm)].flatMap((match) => (match[1] ? [match[1]] : []));
		}

		it("lists every pending presentation in the policy", () => {
			const policy = readFileSync(resolve(root, "docs/mobile-data-presentation.md"), "utf8");
			const rows = readPendingPolicyRows(policy);
			const pending = Object.entries(REVIEWED_PRESENTATION).filter(
				([, entry]) => entry.why.pending !== undefined || copyKinds(entry).includes("pending"),
			);
			const pendingNames = pending.map(([file]) => file.split("/").at(-1));
			expect(
				rows,
				"docs/mobile-data-presentation.md needs its 待处理 section and that section's table header, even when the table is empty",
			).not.toBeNull();
			expect(new Set(rows).size, "one row per file in 待处理").toBe(rows?.length);
			for (const [file, entry] of pending) expect(entry.why.pending, `${file}: say what is pending`).toBeDefined();
			expect([...(rows ?? [])].sort(), "待处理 rows and pending registry entries must be the same files").toEqual(
				[...pendingNames].sort(),
			);
		});

		it("reads the 待处理 table by its header, so an empty table is not a missing one", () => {
			const table = (rows: string) =>
				`# 规范\n\n## 待处理\n\n说明。\n\n${PENDING_TABLE_HEADER}${rows}\n后记。\n\n## 下一节\n`;

			expect(
				readPendingPolicyRows(table("| `a-modal.tsx` | 现状 | 依据 | 修法 |\n| `b-hook.ts` | 现状 | 依据 | 修法 |\n")),
			).toEqual(["a-modal.tsx", "b-hook.ts"]);
			expect(readPendingPolicyRows(table(""))).toEqual([]);
			expect(
				readPendingPolicyRows(
					table("| `a-modal.tsx` | 现状 | 依据 | 修法 |\n| `a-modal.tsx` | 另一行 | 依据 | 修法 |\n"),
				),
			).toEqual(["a-modal.tsx", "a-modal.tsx"]);
			expect(readPendingPolicyRows("# 规范\n\n## 待处理\n\n| `a-modal.tsx` | 没有表头 |\n\n## 下一节\n")).toBeNull();
			expect(
				readPendingPolicyRows(`# 规范\n\n## 别的\n\n${PENDING_TABLE_HEADER}| \`a-modal.tsx\` | x | y | z |\n`),
			).toBeNull();
			expect(
				readPendingPolicyRows(
					`# 规范\n\n## 待处理\n\n${PENDING_TABLE_HEADER}\n另一张表：\n\n| \`later.tsx\` | 不属于待处理表 |\n\n## 下一节\n\n| \`next.tsx\` | x |\n`,
				),
			).toEqual([]);
		});

		describe("scanner", () => {
			function scan(source: string) {
				return scanPresentationMarkers(source, "fixture.tsx");
			}

			it("reads the passive warning the retired-copy lists could not catch", () => {
				expect(
					scan(
						'const notice = <p role="alert" className="text-warning">Positions data is delayed. Reconnecting...</p>;',
					),
				).toEqual({
					announcers: { 'role="alert"': 1 },
					icons: {},
					tones: { "text-warning": 1 },
					copy: { "Positions data is delayed. Reconnecting...": 1 },
					rawErrors: 0,
					reasonFields: {},
				});
			});

			it.each([
				["plain JSX text", "const a = <p>Balance data is stale</p>;", "Balance data is stale"],
				["a single word in JSX", "const a = <button>Retry</button>;", "Retry"],
				["a Lingui template", "const a = t`Failed to load positions.`;", "Failed to load positions."],
				["a Lingui descriptor", "const a = msg`Order history updates paused`;", "Order history updates paused"],
				["a message property", 'const a = t({ message: "Unavailable" });', "Unavailable"],
				["an interpolated template", `const a = t\`Loading \${name}...\`;`, "Loading {…}..."],
				["Trans children", "const a = <Trans>Waiting for order book...</Trans>;", "Waiting for order book..."],
				[
					"a prose literal in an attribute",
					'const a = <i aria-label="Could not verify the balance" />;',
					"Could not verify the balance",
				],
				["a prose literal in a call", 'toast.error("Connection lost, try again");', "Connection lost, try again"],
				["an empty conclusion", "const a = <p>No positions found.</p>;", "No positions found."],
				["text split by an expression", "const a = <p>No {name} found</p>;", "No {…} found"],
				["a hyphenated form", "const a = <Trans>Prices may be out-of-date</Trans>;", "Prices may be out-of-date"],
				["wording about updating", "const a = <Trans>Updating positions…</Trans>;", "Updating positions…"],
				[
					"a bare word in a label attribute",
					'const a = <div aria-label={stale ? "Reconnecting" : undefined} />;',
					"Reconnecting",
				],
				["a bare word rendered directly", 'const a = <span>{stale ? "Stale" : price}</span>;', "Stale"],
				["a bare word passed to a translate call", 'const a = i18n._("Offline");', "Offline"],
				["a Plural branch", 'const a = <Plural value={n} one="Syncing" other="# rows" />;', "Syncing"],
				["a warning symbol", 'const a = <span>{stale ? "⚠" : null}</span>;', "⚠"],
			])("counts status wording in %s", (_name, source, text) => {
				expect(scan(source).copy).toEqual({ [text]: 1 });
			});

			it.each([
				["a status discriminant", 'const a = status === "loading" || tone === "error";'],
				["a type union", 'type Tone = "error" | "warning" | "loading";'],
				["identifiers", "const isStale = isLoading || hasError || retryCount > 0;"],
				[
					"class lists",
					'const a = <div className="flex items-center gap-2 text-fg-muted data-[pending]:opacity-60" />;',
				],
				["ordinary wording", "const a = <p>Deposit funds to start trading.</p>;"],
				["an import", 'import { WarningIcon } from "@phosphor-icons/react";'],
			])("ignores %s", (_name, source) => {
				expect(isEmptyMarkers(scan(source)), JSON.stringify(scan(source))).toBe(true);
			});

			it("reads a label that lives in another module", () => {
				const source = 'import { BOOK_LABELS } from "@/config/book-labels"; const a = <p>{t(BOOK_LABELS.waiting)}</p>;';
				expect(isEmptyMarkers(scan(source))).toBe(true);
				const markers = scanPresentationMarkers(source, "fixture.tsx", {
					resolveImportedText: (moduleSpecifier, exportName, property) =>
						moduleSpecifier === "@/config/book-labels" && exportName === "BOOK_LABELS" && property === "waiting"
							? "Waiting for order book..."
							: undefined,
				});
				expect(markers.copy).toEqual({ "Waiting for order book...": 1 });
				expect(resolveImportedText("@/config/orderbook-labels", "ORDERBOOK_LABELS", "waiting")).toBe(
					"Waiting for order book...",
				);
			});

			it("counts announcers in every form", () => {
				expect(
					scan(
						'const a = <><div role="status" /><div role={failed ? "alert" : undefined} /><span aria-live="polite" /><output /></>;',
					).announcers,
				).toEqual({ 'role="status"': 1, 'role="alert"': 1, "aria-live": 1, "<output>": 1 });
				expect(scan('const a = <div role={kind === "alert" ? "log" : undefined} />;').announcers).toEqual({
					'role="log"': 1,
				});
				expect(scan('const a = <p {...{ role: "alert", "aria-live": "polite" }} />;').announcers).toEqual({
					'role="alert"': 1,
					"aria-live": 1,
				});
				expect(scan('toast("x"); toast.warning(message); toast.success(done); toast.dismiss(id);').announcers).toEqual({
					"toast()": 1,
					"toast.warning()": 1,
					"toast.success()": 1,
				});
			});

			it("counts warning icons as elements and as values, and the Alert primitive", () => {
				expect(
					scan("const a = <><WarningCircleIcon /><Row icon={XCircleIcon} /><InfoIcon /><Alert>Text</Alert></>;").icons,
				).toEqual({ WarningCircleIcon: 1, XCircleIcon: 1, InfoIcon: 1, Alert: 1 });
				expect(
					scan(
						'import { WarningIcon as Caution } from "@phosphor-icons/react"; const a = <><Caution /><StatusGlyph glyph={STATUS_GLYPH_UNKNOWN} /><StatusGlyph glyph={STATUS_GLYPH_SUCCESS} /><ArrowClockwiseIcon /></>;',
					).icons,
				).toEqual({ Caution: 1, STATUS_GLYPH_UNKNOWN: 1 });
			});

			it("counts warning-coloured classes through variants, opacity and helpers", () => {
				expect(
					scan(
						'const a = cn("text-fg", failed && "max-[1000px]:hover:!text-error/80 border-stroke-warning-weak", tone === "x" ? "bg-market-close-danger" : "bg-surface");',
					).tones,
				).toEqual({ "text-error/80": 1, "border-stroke-warning-weak": 1, "bg-market-close-danger": 1 });
				expect(
					scan('const a = <div className="text-success bg-market-down text-fg-muted" data-testid="size-error" />;')
						.tones,
				).toEqual({});
			});

			it("counts invalid-field marks and tone props of primitives", () => {
				const markers = scan(
					'const a = <><input aria-invalid={bad || undefined} aria-errormessage="e" /><Button intent="error" /><Glyph tone={failed ? "attention" : "neutral"} /><input type="error" data-state="error" /></>;',
				);
				expect(markers.announcers).toEqual({ "aria-invalid": 1, "aria-errormessage": 1 });
				expect(markers.tones).toEqual({ 'intent="error"': 1, 'tone="attention"': 1 });
				expect(
					scan(
						'const a = <Row render={() => <Glyph tone="error" />} onClick={() => setTone("warning")} valueClassName={tone === "danger" ? "x" : "y"} />;',
					).tones,
				).toEqual({ 'tone="error"': 1 });
				expect(
					scan(
						'const a = <p className="border-stroke-info-weak bg-info-soft text-info text-amber-500 text-[var(--text-error)]" style={{ color: "var(--text-warning)" }} />;',
					).tones,
				).toEqual({
					"border-stroke-info-weak": 1,
					"bg-info-soft": 1,
					"text-info": 1,
					"text-amber-500": 1,
					"--text-error": 1,
					"--text-warning": 1,
				});
			});

			it("counts raw error reads and passive reason fields", () => {
				const markers = scan(
					"const a = error.message; const { unavailableReason } = availability; const b = deposit.unavailableLabel;",
				);
				expect(markers.rawErrors).toBe(1);
				expect(markers.reasonFields).toEqual({ unavailableReason: 1, unavailableLabel: 1 });
				expect(
					scan(
						[
							"const { message } = failure; const a = String(error); const b = cause.toString();",
							"const c = `$" + "{queryError}`; const d = e.shortMessage; const f = total.toString();",
						].join(" "),
					).rawErrors,
				).toBe(5);
				expect(scan('const a = availability["unavailableReason"];').reasonFields).toEqual({ unavailableReason: 1 });
			});
		});
	});
});
