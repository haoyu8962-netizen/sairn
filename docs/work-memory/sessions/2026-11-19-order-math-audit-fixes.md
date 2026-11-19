<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-order-math-audit-fixes",
  "date": "2026-11-19",
  "title": "下单计算审计（r10）的核对与修复",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry"],
  "summary": "Codex 审计 r10 列出下单摘要、费用、清算价、最低名义、滑点、最大数量与 TP/SL 的差异；Claude 逐条对照官方文档与官方前端包核对。修了两项：只减仓与附带 TP/SL 互斥、全仓跨档清算价按 min(杠杆, 档位最高杠杆) 补足。Codex 未写完的草稿（Scale Max、TWAP 子单、滑点截断）全部撤回。",
  "thread": null,
  "baseCommit": "79b268eaf0d7",
  "commits": [],
  "sources": [
    { "path": "docs/order-entry-surface-parity.md" },
    { "path": "docs/fee-display.md" },
    { "path": "docs/reduce-only-repair-plan.md" },
    { "path": "docs/work-memory/sessions/2026-11-04-mobile-order-summary-official.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/aligned-quote-assets" }
  ],
  "supersedes": []
}
-->
# 下单计算审计（r10）的核对与修复

## 背景与范围

流程是 Codex 找问题、出候选补丁，Claude 对照官方依据核对并定修法，主会话验证与提交。Codex 的审计报告 `r10-order-math.md` 在本机任务输出目录（基线 `79b268eaf0d7`）。负责修复的 Codex 任务在额度用完时被中断，没有修复报告，工作树里留下 16 个文件的未完成草稿。没有取得任务 ID，`thread` 为 null。

## 结论与依据

官方依据有两类：Hyperliquid 文档（页面见 `sources`），以及 2026-09-21 保存在本机 Git 忽略目录 `.worklog/close-all-queue-review-2026-09-21/official-config.js` 的官方前端包。2026-11-04 的记录里引用的 `c6` 与该包中的 `q6` 是同一公式。

修了的两项：
- **只减仓与附带 TP/SL 可同时勾选（成立，已修）。** 官方包中勾选 Reduce Only 先置 `hyperliquid.tpsl_checked` 为假，勾选 TP/SL 先置 `hyperliquid.reduce_only_checked` 为假。共享草稿的两个 setter 改成同样互斥。
- **全仓草稿杠杆高于档位最高杠杆时不估算（成立，已修）。** 官方 `q6`：`c = max(实时价值, 名义 / min(杠杆, i8(档位, 名义).maxLeverage))`，`i8` 取入场名义所在的档位，不提前返回。全仓改为按这个有效杠杆补足；逐仓仍返回 `entry-leverage-exceeds-tier`，没有扩展。报告的例子（10 @ 100、20 倍、权益 70、档位 0→20x、800→10x）得 92.6316，与手算 `q6` 一致。

没有改的项：
- **TWAP 子单估算显示 `~0.4`（不改）。** 2026-10-31 的取证记录说本终端与官方摘要用同一公式。官方 Order types 页只说子单间隔至少 30 秒，示例约 $10 一笔，没有写子单数量要按整手向上取整。Codex 草稿改成向上取整（0.5），与官方摘要不一致，已撤回。
- **预估滑点不受最大滑点截断（不改）。** 官方包的 `Est:` 计算按整本盘口累加，以中间价为参照，不在保护价处截断；保护价截断只出现在官方的清算价成交价估算 `rse` 里。本终端的做法与官方一致。Codex 草稿（超过保护价时返回空）已撤回。
- **Scale Max 的二分搜索低估（成立，但未修）。** 在未打补丁的代码上用临时测试复现：三档 20/70/120、偏斜 0.04、整手、标记价 120、容量 19，结果 57；59 手按 38/20/1 拆档，保证金 2280，恰好不超预算。原因是最大余数分配会让相邻手数的保证金不单调。影响只限 Max 与 100% 比例偏保守：表单与执行守卫按实际拆档保证金判定，手输 59 能通过。要修，需要按档位价格推出上界再倒序检查（Codex 草稿的思路是对的），但会给 `trade-terminal-page` 加几百字节，而余量只剩约 200 字节。这一项交给运营方决定，需要单独量包体、重定基线。
- **部分减仓与反向单的清算价（成立，但未修）。** 官方包会估算：全仓 `a8` 用 `nse` 截断只减仓数量，逐仓用 `Zoe`。`docs/reduce-only-repair-plan.md` 已记下决定「不扩展清算模型」，2026-11-04 的文档也写了「只减仓与反向订单仍不估算」。要扩展，需要运营方决定。
- **统一账户的权益口径（待证实）。** 官方取 `tokenNameToAvailableAfterMaintenance` 中结算币那一项，本终端用现货总额减逐仓保证金与维持保证金自己重建。两者在真实快照上是否不同，没有对账，不改。
- **普通市价单在执行守卫处不复核最低名义（待证实）。** 官方文档只给出报错 `Order must have minimum value of $10.`，没有说明交易所按哪个参照价计算名义。客户端放行，交易所仍会拒绝，不改。
- **HIP-3 缺少 `deployerFeeScale` 时按 1 计、未实现 aligned quote asset 折扣（待证实）。** 官方 `feeRates()` 有折扣公式，但 SDK 类型里找不到标识 aligned 代币的字段；`deployerFeeScale` 在 SDK 类型中是必填字段，文档没有写缺省值。这两项已写入 `docs/fee-display.md`。
- **builder fee 逐单披露、费用金额单位（不改）。** 手机摘要去掉费用行是 2026-11-04 运营方的决定，Scale/TWAP 摘要的单位也已写明待运营方定（`docs/order-entry-surface-parity.md`「手机下单摘要与滑点编辑」）。条款里的披露要求交给运营方。

## 验证与限制

运行过并看到结果（Node 22.15.0，Vitest 在沙盒外运行）：
- 修复前：`prospective-liquidation.test.ts` 新增的跨档用例失败（得到 `unavailable`），`order-entry-store.test.tsx` 新增的互斥用例失败。
- 修复后：两个文件共 52 个用例全部通过。相关的 33 个测试文件（清算价、草稿、表单、只减仓、确认面、双端真实面板）共 687 个用例全部通过。`pnpm --filter @sairn/terminal typecheck` 没有输出错误；对改动的 4 个代码文件运行 `biome check --write`，没有需要修改的地方。
- 变异：把补足的除数改回所选杠杆，并删掉 `setReduceOnly` 中关闭 TP/SL 的一行，两条新用例都失败；恢复后都通过。
- Scale Max：在未打补丁的代码上用临时测试复现，`getPerpEntryMaxSize` 返回 57，59 手的拆档为 38/20/1；临时测试已删除。

没有做：浏览器与真机核对，真实下单，生产构建与包体测量（两处改动的运行时代码只增加几十字节，但没有实测）。`memory:index`、`memory:check` 交给主会话运行。

## 后续与替代关系

- Scale Max 的精确搜索：需要单独量包体，可能要重定基线，由运营方决定。
- 部分减仓与反向单的清算价、统一账户权益口径、aligned quote asset 折扣与 dfs 缺省值：先补协议依据或由运营方决定。
- 主会话提交后，在 `commits` 里补上提交号。
