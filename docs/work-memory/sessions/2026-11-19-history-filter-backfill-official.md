<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-history-filter-backfill-official",
  "date": "2026-11-19",
  "title": "委托与资金费筛选按官方做法补拉历史，成交导出 429 等一分钟",
  "kind": "task",
  "status": "recorded",
  "topics": ["hyperliquid-api", "pr-review"],
  "summary": "运营方 2026-11-19 决定需要决定的事项照官方终端做。审查项 P2-6（手机委托与资金费筛选只查最近 30 条，委托的类型与状态选项也只取这 30 条）按官方做法修：筛选开启时委托补拉 historicalOrders 快照（最多 2,000 条），资金费补拉资金费历史页的 30 天 userFunding 窗口，与订阅持有的全部记录合并；桌面委托历史页签同样处理。无匹配判定与手机成交页签共用 getFilteredHistoryEmptyPresentation()，加载时安静、失败只给中性 Retry、衔接不上不下结论、达到 2,000 条时附上既有的上限说明，没有新增可翻译文案。成交导出遇到不带 Retry-After 的 429 改为等 60 秒（原 10 秒），页数上限 200 与重试 3 次本就与官方一致。导出跟随筛选、写协议名两点按既有决定不改，差异列在正文。9 个新用例与 1 个导出用例在修复前失败，三处变异与一处常量变异都让测试变红。没有做浏览器或真机验收。",
  "thread": null,
  "baseCommit": "f13de42f",
  "commits": ["f3326295"],
  "sources": [
    { "path": "docs/trading-toolbar-redesign.md" },
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "apps/terminal/src/lib/trade/history-filter-presentation.ts" },
    { "path": "apps/terminal/src/lib/tests/mobile-order-funding-filter-backfill.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/history-csv-twap.test.tsx" },
    { "path": "docs/adr/0048-official-spot-display-names-and-addresses.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits" }
  ],
  "supersedes": []
}
-->
# 委托与资金费筛选按官方做法补拉历史，成交导出 429 等一分钟

## 背景与范围

同步记录，2026-11-19，未取得任务标识。任务来自编排会话：运营方当天决定「需要决定的事项照官方终端的做法执行」，官方做法取自同日对官方终端生产包的静态阅读（取证报告第 9 项，不在仓库中）。审查报告 `h3-portfolio-history` 的 P2-6 由 Codex 提出，上一轮修复没有处理；本轮由 Claude 对照官方文档核对、写测试并修复。范围有三项：P2-6 筛选补拉；成交导出的翻页上限与 429 处理对照官方；导出与官方的差异只记录、不改。

基线为分支 `codex/portfolio-history` 的 `f13de42f`。

## 结论与依据

官方依据（Hyperliquid 文档）：Info endpoint 页写明 `historicalOrders`「Returns at most 2000 most recent historical orders」，`userFillsByTime`「Returns at most 2000 fills per response and only the 10000 most recent fills are available」，带时间范围的接口每次最多 500 条、用最后的时间作为下一页 `startTime`。Rate limits 页写明 REST 每 IP 每分钟 1200 权重，普通 info 请求权重 20，`historicalOrders`、`userFunding`、`userFills` 等每返回 20 条另加权重。

1. **P2-6 筛选补拉（改）。** 官方终端在筛选设为非默认值后对 `userFills`、`historicalOrders`、`userFunding` 各请求一次完整历史并与订阅合并。实现：
   - 委托（手机与桌面页签）：筛选开启时启用 `useOrderHistory`（委托历史页同一个查询，单次请求，最多 2,000 条，权重 20 加每 20 条 1），与 `useHistoricalOrders` 新公开的 `bufferedOrders`（订阅持有的全部，最多 500 条）按 `oid` 合并，状态较新的一份胜出；类型与状态选项来自合并后的集合。
   - 资金费（手机页签）：方向筛选开启时启用 `useFundingHistory`（资金费历史页同一个 30 天窗口，每页 500 条按 `startTime` 翻页，429 按既有重试处理），与 `bufferedFundings` 按 `(time, coin)` 合并，保留实时副本。官方只请求一次不翻页；这里沿用历史页的 30 天窗口，使无匹配句子有确定范围，代价是持仓多的账户补拉一次可能需要多页。
   - 无匹配判定抽成 `lib/trade/history-filter-presentation.ts`，成交页签原有的两个函数改为调用它。委托的衔接条件是最旧实时委托的状态时间不晚于快照最新一条；资金费是最旧实时记录不晚于窗口终点（终点即请求参数，不受本机时钟偏差影响）。
   - 筛选开启时读屏表头数值也要等到能下结论时才给出。上限说明复用既有的「Up to {ORDER_HISTORY_API_LIMIT} most recent ordinary orders」，数字经 `useNumberFormat()` 格式化；`pnpm i18n:extract` 之后各语言目录只多了出处行，没有新 msgid。
2. **成交导出上限（部分改）。** Sairn 成交导出默认最多 200 页、429 最多重试 3 次，与官方相同；不同在于没有 `Retry-After` 的 429 只等 10 秒（官方 60 秒）。限额按分钟计，10 秒三次共 30 秒可能在窗口恢复前就放弃，因此成交导出改为 60 秒，与 TWAP 导出已有的取值一致。其他导出（资金费、委托、账本）仍用 10 秒，未在本次范围内。
3. **导出与官方的差异（不改，交运营方知晓）。**
   - 筛选：官方导出不应用当前筛选（`filter:null`）；Sairn 自上一轮 P2-5 起导出跟随筛选。依据是上一轮的修复决定与本页筛选所见即所得。
   - 币名：官方写显示名（`displayName`）；Sairn 写协议名 `coin`，依据 [ADR 0048](../../adr/0048-official-spot-display-names-and-addresses.md) 与 `docs/trading-toolbar-redesign.md` History values 的 Token names 与 CSV exports 两条。
   - 时间：两者都用本机时区；官方用浏览器语言、24 小时制 `toLocaleString`，Sairn 用界面语言的短日期加短时间（`formatDateTime(..., { dateStyle: "short", timeStyle: "short" })`，依据同文档 Dates 一条）。
   - 其余（读代码所见）：官方表头是不翻译的列键并有 `ntl` 列，Sairn 表头翻译、无 `ntl`；官方导出净 PnL，Sairn 保留交易所的 `closedPnl` 与 `fee`（同文档 Closed PNL 一条）。

## 验证与限制

运行过并看到结果（Node 22.15.0，Vitest `--maxWorkers=2`，沙盒外运行）：

- 新文件 `mobile-order-funding-filter-backfill.test.tsx` 的 9 个用例在改动前全部失败（7 个手机用例先写、2 个桌面用例随后写，均先红），改动后全部通过。`history-csv-twap.test.tsx` 新增的 429 用例改动前失败（10 秒后已发出第二次请求），改动后通过。
- 变异：手机委托页签始终只搜实时 30 条，2 个用例失败；删去「衔接不上给重试」一行，成交与委托共 4 个用例失败；资金费补拉 `enabled` 固定为 `false`，2 个用例失败；导出回退改为 30 秒，1 个用例失败。每次都改回原文。
- 41 个相关测试文件 946 个用例通过（含手机数据展示契约、i18n 与日期/数字格式契约、目录完整性、受影响组件的既有用例）；`pnpm --filter @sairn/terminal typecheck` 退出 0；改动的 15 个 TS/TSX 文件 `biome check --write` 退出 0。
- 既有的 `mobile-history-cards.test.tsx`、`desktop-orders-history-direction.test.tsx` 改为同时模拟一份已就绪的补拉快照，登记表为两个手机页签加上中性「Retry」。

没有做的：浏览器或真机检查；对真实账户发出请求（测试只用模拟的 Info 客户端）；大账户 30 天资金费补拉的实际页数与权重测量；官方做法只来自压缩代码阅读，未在已连接页面上触发筛选。

## 后续与替代关系

- 其他导出在无 `Retry-After` 的 429 上仍等 10 秒；是否统一为 60 秒需另行决定。
- 导出的三点差异（筛选、币名、时间格式）交运营方知晓，未改。
- 本记录不替代任何既有记录；`commits` 待主会话提交后补。
