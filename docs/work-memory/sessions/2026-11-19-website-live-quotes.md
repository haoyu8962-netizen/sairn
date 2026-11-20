<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-website-live-quotes",
  "date": "2026-11-19",
  "title": "官网撤回过期报价、实时统计覆盖全部场所（事后补记）",
  "kind": "retrospective",
  "status": "recorded",
  "topics": ["jurisdiction-marketing", "hyperliquid-api"],
  "summary": "事后补记，依据提交 6bd20046 的 diff：Live market 视图按交易所时间取最新帧，单边 bbo 立即撤回数字回到海报，bbo 安静不算过期，更新的 l2Book 最优价与 bbo 相差至少一个五位有效数字档位时改显示订单簿最优价；统计带 Live activity 的场所等于页面渲染的全部市场所在 dex；行情条只在有当前价格时滚动；404 页的终端链接带 UTM 与风险句。审查的 axe 与性能门禁只给方案、未实现。验证读数见集成验证。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["6bd20046"],
  "sources": [
    { "path": "apps/website/src/scripts/open-book.ts" },
    { "path": "apps/website/src/lib/markets/structure.ts" },
    { "path": "apps/website/src/scripts/live-markets.ts" },
    { "path": "apps/website/src/pages/404.astro" },
    { "path": "apps/website/tests/open-book-frames.test.mjs" },
    { "path": "apps/website/tests/built/open-book-quote.test.mjs" },
    { "path": "docs/website-plan.md" }
  ],
  "supersedes": []
}
-->
# 官网撤回过期报价、实时统计覆盖全部场所（事后补记）

## 背景与范围

事后补记，由 2026-11-19 集成后的文档同步写成；没有取得任务标识。来源是 Codex 官网审查 `h5-website` 与修复任务 `w19-website-live-data`（本机 `.worklog/2026-11-19/codex/`，Git 忽略）。修复任务的范围是审查的全部 P2、P3 条目，最后一条「性能与 axe 验收没有接入构建门禁」只给方案、不实现，也不得新增在 CI 里请求外部服务的步骤（ADR 0056）。Codex 修复任务中断、没有报告；Claude Fable 代理完成修复，主会话提交为 `6bd20046`。

## 结论与依据

按 diff 读出的改动：

- `open-book.ts`：`readBbo` 区分双边报价与单边（一侧为 `null`）；单边时撤回报价、清空中间价序列、回到海报。新增 `quoteT` 记录设定当前报价的帧的交易所时间，两个频道里更旧的帧都不能替换它。`bbo` 生效后保持报价，直到更新的 `l2Book` 最优价与之相差至少一个五位有效数字的档位（`bookContradictsQuote`），此时改用订单簿最优价，直到下一帧 `bbo`。进入实时视图（`liveSince`）还要求有报价。
- `structure.ts` / `live.js` / `live-markets.ts`：Live activity 的场所改为页面渲染的全部市场所在的 dex（含只有链接没有价格位的市场），名称取自部署方列表；这些 dex 加入请求计划；行情条的 `data-ticker` 在暂停时为 `paused`，有当前价格的卡片时为 `moving`，否则 `static`。
- `404.astro`：终端链接改用 `terminalUrl("/", "not_found")`（带 UTM），加 `data-cta-group` 与风险句。
- `apps/website/README.md` 同步了报价规则与统计范围；`docs/website-plan.md` 第 6、7 节在集成后补了同日修订。

## 验证与限制

- 新增 `tests/open-book-frames.test.mjs`、`tests/built/open-book-quote.test.mjs`，扩充 `live-markets-dom`、`site`、`markets-live`、`markets-structure`、`motion-contract` 测试。都在 jsdom 或构建产物上运行，不是真实浏览器，也不连交易所。没有找到修复代理的运行输出；集成后的读数见集成验证与总记录 [2026-11-19-codex-review-claude-fixes](2026-11-19-codex-review-claude-fixes.md)。
- 没有真实 WebSocket 浸泡或真机检查（第 6 节原有的验收项仍未做）。

## 后续与替代关系

- 官网是否新增 axe 依赖与体积门禁待运营方决定（总记录待决定事项）。
- 官网快照 7 天规则仍在：发布官网前要在本机刷新 `market-structure.json`。
- 本记录不替代任何记录。
