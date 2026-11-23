<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-20-website-market-snapshot-refresh",
  "date": "2026-11-20",
  "title": "官网行情快照刷新：Anthropic 两个 Pre-IPO 市场转为股票",
  "kind": "task",
  "status": "recorded",
  "topics": ["jurisdiction-marketing", "hyperliquid-api"],
  "summary": "PR #15 的 Build website 因快照已 7.2 天（上限 7 天）失败，任何 PR 都会如此。运营方要求另开 PR 刷新。运行 markets:snapshot 时交易所已把 xyz:ANT 与 para:ANTH 从 preipo 改为 stocks；重新阅读两家部署方文档：Paragon 标 ANT 为 Listed，XYZ 的 Pre-IPO 索引当天仍标 Live（预期上市日正是 2026-11-20）。按 2026-11-04 JIO 的先例以交易所分类为准，从 PRE_IPO_DOCS 删去两项，改测试与规划文档。NEAR 回到页面，钉住的深色图标清单恢复为 ETH、NEAR、io:ANTH。官网源码测试、构建、构建后测试与 markets:snapshot --check 在本机通过；图标没有人工看图。",
  "thread": null,
  "baseCommit": "ba78481a",
  "commits": [],
  "sources": [
    { "path": "apps/website/src/config/deployers.ts" },
    { "path": "apps/website/src/data/market-structure.json" },
    { "path": "apps/website/src/data/market-icons.json" },
    { "path": "apps/website/tests/market-icons.test.mjs" },
    { "path": "apps/website/tests/markets-structure.test.mjs" },
    { "path": "docs/website-plan.md" },
    { "path": "docs/work-memory/sessions/2026-11-13-website-market-snapshot-refresh.md" },
    { "url": "https://docs.trade.xyz/perpetuals/specifications-and-schedules/pre-ipo-specification-index" },
    { "url": "https://docs.paragon.trade/resources/specifications" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/pull/15" }
  ],
  "supersedes": []
}
-->
# 官网行情快照刷新（2026-11-20）

## 背景与范围

同步记录，2026-11-20，未取得任务标识。[PR #15](https://github.com/haoyu8962-netizen/sairn/pull/15) 的 `Build website` 失败：「snapshot fetchedAt 2026-11-13T07:25:16.480Z is 7.2 days old (limit 7); run markets:snapshot」。这与 PR 内容无关，`main` 上任何 PR 都会失败。运营方要求另开 PR 刷新。工作树 `.claude/worktrees/website-market-snapshot`，分支 `chore/website-market-snapshot-2026-11-20`，基线 `ba78481a`。

## 结论与依据

- 第一次运行 `markets:snapshot` 写出快照后报两个问题：「deployers.ts xyz:ANT is no longer preipo」「deployers.ts para:ANTH is no longer preipo」。交易所把两个 Anthropic 市场的分类从 `preipo` 改为 `stocks`。同次运行还报告新上市 xyz:PANW、io:META、io:INTC，io:PRL 的 `growthMode` 由 true 变 false。
- 重新阅读两家部署方文档（2026-11-20，由取页子代理读取）：
  - Paragon 合约规格页把 ANT 标为 Listed，跟踪一股 Anthropic，页面没有其他 Pre-Listing 市场。
  - XYZ 的 Pre-IPO 规格索引仍把 ANT 与 OURA 标为 Live；ANT 的预期上市日是 2026-11-20（当天），宽限期到 2027-01-19；OURA 的预期上市日 2026-10-02 已过，宽限期到 2026-12-01；JIO 等八个市场标为 Converted。
- 处理按 2026-11-04 JIO 的先例：官网按快照里的交易所分类显示市场，`PRE_IPO_DOCS` 只能列 `preipo` 市场（`findPreIpoListingProblems`），所以删去 xyz:ANT 与 para:ANTH；`PARAGON_SPECIFICATIONS` 不再有引用，一并删去；XYZ 索引的读取日期改为 2026-11-20，注释写明 ANT 删除时 XYZ 索引仍标 Live。FAQ 的「On Paragon pre-IPO markets, the price is quoted per share of the company.」由数据生成，随之消失。`markets-structure.test.mjs` 里两条 per-share 断言删去。
- 第二次运行成功，`fetchedAt` 2026-11-20T13:50:05.998Z，上市市场数 main 179、xyz 123、para 33、mkts 1、io 17，并写出 27 个图标：NEAR、xyz:MU 回到页面渲染的市场，XMR、xyz:AMD、xyz:SPCX 移出；xyz:COPPER、xyz:NATGAS、para:10Y、2Y、30Y 没有图标，显示字母圆标。NEAR 按规则需要底板，`market-icons.test.mjs` 钉住的清单改回 ETH、NEAR、io:ANTH（与 2026-10-27 的测量相同）。
- 页面上的 Pre-IPO 区现在只有 io:OAI、io:ANTH 与 xyz:OURA；Anthropic 的两个转股市场按股票显示。日本营销链接里用到的 xyz:ANT 因此不再是 Pre-IPO 市场，相关文案是否要改由运营方决定，本次没有改营销内容。

## 验证与限制

本机读数（Node 24.15.0）：

- `markets:snapshot --check`：通过。
- 官网源码测试：102 项通过。
- 官网构建：退出码 0（只有 blog 集合为空的既有警告）。构建后测试：64 项通过。
- 跨应用品牌测试 `tests/brand-cross-app.test.mjs`：7 项通过。
- `pnpm memory:check` 与 `pnpm memory:test`：通过。

没有验证的：新增与回归的图标没有人工看图；没有部署官网；XYZ 索引是否会在 ANT 实际上市后改为 Converted 没有再核对；CI 上的结果以 PR 为准。

## 后续与替代关系

本记录不取代其他记录。快照仍会在 7 天后让官网构建失败（ADR 0056 之后没有定时检查）。xyz:OURA 的宽限期 2026-12-01 到期前后可能同样转股或结算，届时需要再刷新。营销文案中把 Anthropic 称为 Pre-IPO 的地方需要运营方复核。
