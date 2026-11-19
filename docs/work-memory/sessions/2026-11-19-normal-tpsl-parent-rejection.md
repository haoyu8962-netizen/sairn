<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-normal-tpsl-parent-rejection",
  "date": "2026-11-19",
  "title": "附带 TP/SL 的父单被拒与等待标记并存时保留对账",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry"],
  "summary": "normalTpsl 父项报错且附属项有等待标记时，受理解析器不再算成部分受理，交给既有 cloid 对账。官方文档没有说明这种回包；交易所是否返回它仍待真实回包证实。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-12-global-defect-review.md" },
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/adr/0019-global-trading-notifications.md" },
    { "path": "apps/terminal/src/lib/tests/order-tracking.test.ts" },
    { "path": "apps/terminal/src/lib/tests/tracked-order-hook.test.tsx" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint" },
    { "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/order" }
  ],
  "supersedes": []
}
-->
# 附带 TP/SL 的父单被拒与等待标记并存时保留对账

## 背景与范围

同步任务记录，未取得任务标识。2026-11-12 全局审查第 2 项（附带 TP/SL 的父单被拒却显示「部分受理」）由 Codex 核实并给出候选补丁，Claude 对照官方文档核对、复现并裁定。范围限于 `resolveOrderBatchResponse` 与 `useTrackedOrder` 的受理判定；共享参考文档、ADR 补记与变更日志由主会话归并。

## 结论与依据

- 官方依据。Hyperliquid 文档 Exchange endpoint「Place an order」只给出 `resting`、`filled`、`error` 三种回包示例，`grouping` 只列出 `na | normalTpsl | positionTpsl` 三个取值；Error responses 只说明批量错误通常与请求等长、预校验错误只返回一项；官方文档全文检索不到 `waitingForFill`、`waitingForTrigger`。SDK `@nktkas/hyperliquid` 0.33.3 的类型与 SDK 文档 `order` 页只把两个字符串列为合法取值，没有说明含义；`assertSuccessResponse` 在任一项含 `error` 时抛 `ApiRequestError` 并保留原回包。结论：官方没有说明父项报错时附属项会怎样回填，也没有说明等待标记的含义。
- 官方 TP/SL 页说明附带的 TP/SL 只在父单完全成交、或部分成交后因保证金不足被取消时才下达；父单未成交而被取消时附属单一并取消。据此，父项被拒时附属单通常不会下达，但父项的 `{ error }` 是否一定意味着零成交（保证金不足的例外是否也以 `error` 呈现），官方没有写。所以既不能按「部分受理 2/3」下结论，也没有足够证据直接判整批拒绝。
- 裁定：保留候选补丁的做法。`normalTpsl` 且首项报错、后续任一项为等待标记时返回 `null`，两条受理路径（正常返回与 SDK 抛出的 `ApiRequestError.response`）都传入原请求的分组，走既有确认中、按 `cloid` 查询、两分钟超时转未确认的路径。`filled` 确认模式不传分组，原本就因等待标记没有成交量而交给对账，行为不变。`na`、`positionTpsl` 与父项已挂单或成交时的计数不变。
- 两种协议行为下的后果。附属单实际已受理：对账查到父项 `rejected`、附属项 `open`，通知更新为部分受理 2/3 并带批次拒绝说明，结论来自查询证据（新增用例钉住）。附属单实际未受理：父项查到 `rejected`，附属 `cloid` 若一直查不到，确认中最多两分钟后转为结果待确认，而不是失败；这两分钟内同一资产的非减仓下单和同一意图会被挡住；草稿在进入对账时清空，与原先的部分受理路径相同。若查询对附属项给出明确的拒绝或取消，按对账既有规则结算。
- 对 Codex 测试的调整：恢复原有「单项预校验拒绝」用例的无分组四项输入，另加 `normalTpsl` 三项变体，不再改写原用例；新增附属单实际已受理的对账用例。

## 验证与限制

- Node `v22.15.0`。撤掉生产代码补丁、只保留测试时，`order-tracking.test.ts` 与 `tracked-order-hook.test.tsx` 共 8 项失败、58 项通过，解析器实际得到 `partial`。恢复补丁并加入 Claude 的用例后两文件 68 项通过。
- `pnpm exec vitest run --maxWorkers=2 order-tracking tracked-order order-submit order-reconciliation order-submission pending-order order-execution-summary`：`Test Files 11 passed (11)`，`Tests 285 passed (285)`，退出码 0。`pnpm --filter @sairn/terminal typecheck` 无错误输出。Biome 对四个文件输出 `Checked 4 files in 57ms. No fixes applied.`。
- 变异（各自还原后再跑）：去掉 `normalTpsl` 限制，2 项失败；把「任一附属项」改成「全部附属项」，2 项失败；SDK 错误路径漏传分组，3 项失败。Codex 另报告 13 项变异，本次未重跑。
- 全部为本地合成回包与模拟查询；没有真实签名、下单或交易所请求。交易所是否真的返回父项报错加等待标记的组合，以及未下达附属单的 `cloid` 用 `orderStatus` 查到的是 `unknownOid` 还是明确状态，都没有证据。`memory:test` 未运行。

## 后续与替代关系

保留原审查记录的当时结论。主会话在 `docs/trading-notifications.md`「结果语义与批次明细」表、ADR 0019 补记与 `CHANGELOG.md` 的 `Unreleased` / `Fixed` 归并本规则。待运营方决定：用测试网一笔保证金不足的 `normalTpsl` 下单取得真实回包和三个 `cloid` 的查询结果；若交易所对每次父单被拒都返回等待标记、且附属 `cloid` 查不到，本修复会让这类常见拒单变成两分钟的确认中加同资产限制，届时应改为依据官方 TP/SL 规则直接判整批拒绝，或在对账中以父项拒绝结算附属项。
