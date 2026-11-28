<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-28-website-market-snapshot-refresh",
  "date": "2026-11-28",
  "title": "官网行情快照刷新：四个新上市，NEAR 再次移出图标集",
  "kind": "task",
  "status": "recorded",
  "topics": ["jurisdiction-marketing", "hyperliquid-api"],
  "summary": "快照 fetchedAt 2026-11-20T13:50:05Z 已超过 7 天，官网 astro build 失败。本机运行 markets:snapshot 一次成功，报告 xyz:SOXS、xyz:TQQQ、io:GOOGL、io:MU 新上市，io:SKHX 的 onlyIsolated 由 true 变 false，没有下架、换品类或 growthMode 变化，deployers.ts 与快照一致。xyz:OURA 仍是 preipo（XYZ 记录的宽限期 2026-12-01 尚未到期）。图标集里 NEAR、xyz:MU 移出，XMR、xyz:SKHY 回到页面；钉住的深色图标清单按 2026-11-13 的先例改回 ETH、io:ANTH。官网源码测试、构建、构建后测试、跨应用品牌测试与 markets:snapshot --check 在本机通过；图标没有人工看图。",
  "thread": null,
  "baseCommit": "af9131a7",
  "commits": [],
  "sources": [
    { "path": "apps/website/src/config/deployers.ts" },
    { "path": "apps/website/src/data/market-structure.json" },
    { "path": "apps/website/src/data/market-icons.json" },
    { "path": "apps/website/tests/market-icons.test.mjs" },
    { "path": "docs/work-memory/sessions/2026-11-20-website-market-snapshot-refresh.md" }
  ],
  "supersedes": []
}
-->
# 官网行情快照刷新（2026-11-28）

## 背景与范围

同步记录，2026-11-28，未取得任务标识。`apps/website/src/data/market-structure.json` 的 `fetchedAt` 是 2026-11-20T13:50:05Z，已超过 7 天上限，官网的 `astro build` 因此失败，后续官网工作都被卡住。工作树 `.claude/worktrees/website-market-snapshot-2026-11-28`，分支 `chore/website-market-snapshot-2026-11-28`，基线 `af9131a7`。做法照 [2026-11-20 的记录](2026-11-20-website-market-snapshot-refresh.md)。

## 结论与依据

- `markets:snapshot` 一次成功，`fetchedAt` 2026-11-28T09:58:01.885Z，报告「snapshot and configs are consistent」。上市市场数 main 179、xyz 125、para 33、mkts 1、io 19（上次 179、123、33、1、17）。
- 变化：新上市 xyz:SOXS（交易所未给品类，按未分类处理，不进品类卡）、xyz:TQQQ、io:GOOGL、io:MU（均为 stocks）；io:SKHX 的 `onlyIsolated` 由 true 变 false。没有市场下架，已有市场的品类与 `growthMode` 都没变，其余差异只是 24 小时成交额。
- Pre-IPO：页面上仍是 io:OAI、io:ANTH 与 xyz:OURA，三者在快照里都还是 `preipo`，所以 `deployers.ts` 不用改。上次记录的 xyz:OURA 宽限期 2026-12-01 尚未到期，本次没有重新阅读 XYZ 的 Pre-IPO 索引（`readOn` 2026-11-20，距 90 天上限还远）。
- 图标：写出 27 个。NEAR、xyz:MU 移出页面渲染的市场，XMR、xyz:SKHY 回到页面（两者都不需要底板）；xyz:COPPER、xyz:NATGAS、para:2Y、10Y、30Y 仍没有图标，显示字母圆标。`market-icons.test.mjs` 钉住的深色图标清单因 NEAR 移出而失败，按 2026-11-13 的先例改回 ETH、io:ANTH，断言说明补上 2026-11-28 再次移出。

## 验证与限制

本机读数（Node 24.15.0；工作树默认的 Node 22.13.0 低于 `engines` 要求的 22.15.0，没有用）：

- `markets:snapshot --check`：通过。
- 官网源码测试：102 项通过（改测试之前 101 通过、1 失败，即上面的深色图标清单）。
- 官网构建：退出码 0（只有 blog 集合为空的既有警告）。构建后测试：94 项通过。
- 跨应用品牌测试 `tests/brand-cross-app.test.mjs`：7 项通过。
- `pnpm memory:test`：12 项通过。`pnpm memory:check` 第一次因 `apps/terminal/public/charting_library/charting_library.js` 不存在而报 ENOENT 退出：既有记录（如 2026-11-27 的表格布局记录）把这个 Git 忽略、要 `pnpm chart:fetch` 从私有仓库取的文件列为来源，本工作树没有取图表库。临时放一个空文件后检查通过（Work-memory records verified），随即删掉。

没有验证的：回到页面的 XMR、xyz:SKHY 图标没有人工看图；没有重新阅读部署方文档；没有部署官网；CI 上的结果以 PR 为准。

## 后续与替代关系

本记录不取代其他记录。快照会在 2026-12-05 前后再次超过 7 天，让官网构建失败。xyz:OURA 的宽限期 2026-12-01 到期前后可能转股或结算，届时刷新快照会报出 `deployers.ts` 与快照不符，需要按 JIO、ANT 的先例处理。
