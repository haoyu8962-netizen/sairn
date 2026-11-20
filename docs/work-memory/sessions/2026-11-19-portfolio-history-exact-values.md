<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-portfolio-history-exact-values",
  "date": "2026-11-19",
  "title": "资产组合与历史：抵押品、计价单位与协议值保持精确（事后补记）",
  "kind": "retrospective",
  "status": "recorded",
  "topics": ["hyperliquid-api", "pr-review"],
  "summary": "事后补记，依据提交 f13de42f 的 diff：资金费合计按抵押品分组不再跨币相加；非 USDC 市场的 Closed PNL 用计价币，TWAP 成交表的 PNL 标报价币；CSV 的资金费 Size 保留交易所小数位、Payment Token 写协议名、资金费历史页与手机资金费页签按筛选导出、单元格按 OWASP 规则中和公式但保留协议数字与 @N；账本空结论要求在线、查询空闲、订阅 active 且未过期、首帧已到；资产组合一日视图悬停显示时间。第二轮（筛选补拉）见 2026-11-19-history-filter-backfill-official。验证读数见集成验证。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["f13de42f"],
  "sources": [
    { "path": "apps/terminal/src/lib/trade/funding-history.ts" },
    { "path": "apps/terminal/src/lib/trade/user-fills.ts" },
    { "path": "apps/terminal/src/lib/csv.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-account-ledger.ts" },
    { "path": "apps/terminal/src/domain/portfolio.ts" },
    { "path": "docs/trading-toolbar-redesign.md" },
    { "path": "docs/mobile-data-presentation.md" }
  ],
  "supersedes": []
}
-->
# 资产组合与历史：抵押品、计价单位与协议值保持精确（事后补记）

## 背景与范围

事后补记，由 2026-11-19 集成后的文档同步写成；没有取得任务标识。来源是 Codex 审查 `h3-portfolio-history` 与修复任务 `w21-portfolio-history`（本机 `.worklog/2026-11-19/codex/`，Git 忽略）。Codex 修复任务中断、没有报告；Claude Fable 代理完成第一轮修复（`f13de42f`）。同一分支的第二轮按运营方「照官方做」的决定补拉筛选历史（`f3326295`），有自己的记录 [2026-11-19-history-filter-backfill-official](2026-11-19-history-filter-backfill-official.md)。

## 结论与依据

按 diff 读出的改动：

- 资金费合计：`getFundingTotals` 按 `getFundingCollateralToken` 分组，USDC 在前、其他按协议名、目录说不出抵押品的一组没有金额；桌面资金费页签表头与手机「Funding shown」用 ` · ` 连接各组。原先 `getToolbarFundingTotal` 把不同抵押品加在一起并按美元显示。
- Closed PNL：`getUserFillQuoteToken` 改为导出，`formatUserFillNetPnl` 在 USDC 时用美元格式，其他计价币显示其显示名；桌面成交页签、手机卡片与成交历史页一致。TWAP 成交表（桌面与手机）的 PNL 单位从手续费币改为报价币。目录里没有的市场，成交数量用 `formatDecimalString` 保留协议小数位。
- CSV：资金费 Size 为去掉负号的 `szi` 原文；Payment Token 用协议名（`USDT0`）；资金费历史页按市场与方向筛选导出，手机资金费页签按方向筛选导出；`lib/csv.ts` 的公式中和规则扩到制表、回车、换行与全角 `＝＋－＠`，协议十进制数与现货市场名 `@N` 原样写出。委托导出达到 2,000 条上限时的警告改用既有文案「Up to 2,000 most recent ordinary orders」；TWAP 成交导出只在保留上限真的丢掉记录时才标为截断。
- 账本：`useAccountLedger().canConfirmEmpty` 改为在线、最近一次快照成功、查询 `fetchStatus` 为 `idle`、订阅 `active` 且未过期、订阅首帧已到。
- 资产组合：历史点的解析移到 `getPortfolioHistoryPoints`（`domain/portfolio.ts`），最新值取排序后最后一个有效点；一日视图悬停标签带时间。
- 其他：现货代币美元价只从现货目录解析（`addSpotMarketPriceAliases`），现货目录未通过校验时价格状态为 error；`#` 开头的结果市场成交不归入成交历史类型；资金费记录的数值字段要求是十进制字符串。

文档同步（2026-11-19 集成后补）：`docs/trading-toolbar-redesign.md` History values 的 Funding、Closed PNL 与 CSV exports 三条，`docs/mobile-data-presentation.md` 推荐领取记录处的账本空结论规则，`CHANGELOG.md` Unreleased / Fixed。

## 验证与限制

- 提交改动了 20 多个测试文件（见提交），没有找到修复代理的运行输出；修复前是否失败、变异情况本记录无法证明。集成后的读数见集成验证与总记录 [2026-11-19-codex-review-claude-fixes](2026-11-19-codex-review-claude-fixes.md)。
- 没有真实账户、非 USDC 抵押品的 HIP-3 市场或表格软件中的实际导出核对。

## 后续与替代关系

- 导出与官方的三点差异（跟随筛选、写协议名、列）由运营方知晓，见总记录的待决定事项。
- 本记录不替代任何记录；第二轮记录建立在本提交之上（其 `baseCommit` 为 `f13de42f`）。
