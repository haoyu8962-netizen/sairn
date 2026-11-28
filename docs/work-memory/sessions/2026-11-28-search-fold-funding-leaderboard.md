<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-28-search-fold-funding-leaderboard",
  "date": "2026-11-28",
  "title": "资金费率对比与排行榜搜索改用 foldSearchText",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "七种语言任务留下的两处搜索大小写问题按运营方要求修复。资金费率对比的币名与输入都经 foldSearchText 折叠；排行榜在服务端按显示名折叠匹配，服务端与夹具共用 matchesLeaderboardSearch，发送和缓存用的查询形式与地址比较不变。土耳其语 İ/ı、重音、只含组合符号的输入各有测试，五处变异都会让测试失败。未构建包体，未推送。",
  "thread": null,
  "baseCommit": "0bb212a02",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-26-terminal-seven-new-languages.md" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "docs/funding-comparison.md" },
    { "path": "docs/leaderboard-vaults-staking-redesign-notes.md" }
  ],
  "supersedes": []
}
-->
# 资金费率对比与排行榜搜索改用 foldSearchText

## 背景与范围

同步记录，2026-11-28，没有任务标识。

- **来源**：[七种语言的任务记录](2026-11-26-terminal-seven-new-languages.md)「待决项处理之后」一节列出了两处同类问题，PR #24 没有处理：
  - 资金费率对比的搜索（`domain/market/funding-comparison.ts`）用 `toLowerCase()`。
  - 排行榜的搜索（`components/leaderboard/leaderboard-domain.ts` 与 `lib/leaderboard/leaderboard-server.ts`）用不带参数的 `toLocaleLowerCase()`。
- **运营方的决定**：「修搜索大小写」。
- **分支**：`claude/search-fold-funding-leaderboard`，从 `main` `0bb212a02` 切出。
- **范围**：只改这两处搜索的匹配，不改 `foldSearchText` 本身，也不改别处的协议比较。
- **复查**：在 `apps/terminal/src` 的非测试代码里查过搜索、查询、过滤相关的 `toLowerCase()` / `toLocaleLowerCase()`。除地址、缓存键和协议文本外，只剩这两处。

## 结论与依据

### 资金费率对比

- `normalizeFundingComparisonQuery` 改为 `foldSearchText(value.trim()).trim()`。`deriveFundingComparisonPage` 把每个币名也经 `foldSearchText` 折叠后做包含匹配。
- 有输入但折叠后为空（只有组合符号）时不匹配任何行，页面显示 `noResults`。这与市场搜索、金库搜索的规则一致。
- 改前，输入 `İNİT` 会变成 `i̇ni̇t`，找不到 INIT。改后 `İNİT`、`ınıt`、` İnit ` 都能找到。
- 现有的永续币名都是 ASCII，对它们只有查询一侧的折叠起作用。币名一侧的折叠用一个合成的 `İSTANBUL` 行测试。

### 排行榜

- **匹配函数**：`leaderboard-domain.ts` 新增两个函数，服务端的 `deriveLeaderboardPage` 和前端的 `deriveLeaderboard`（夹具与测试使用）都调用它们。服务端原来的 `matchesLeaderboardQuery` 已删除。
  - `getLeaderboardSearch(query)`：返回 `addressQuery` 和 `nameQuery`。`addressQuery` 是原来的规范化查询，`nameQuery` 是对它再做 `foldSearchText` 并去掉首尾空格的结果。
  - `matchesLeaderboardSearch(row, search)`：地址按原来的方式比较；显示名两边都经 `foldSearchText` 折叠后做包含匹配。
- **保持不变**：`normalizeLeaderboardQuery` 仍是 `trim().toLocaleLowerCase()`。页面把它当作请求参数和请求身份，服务端按 128 个码点校验它。
  - 改成 `toLowerCase()` 的话，土耳其语浏览器里的 `İ` 会从 1 个码点变成 2 个，接近上限的输入会被服务端拒绝。所以只在比较名称时折叠。
  - 地址比较也保持原样：`đ` 之类折叠成 ASCII 的输入不会去匹配十六进制地址。这与金库地址的规则相同。
- **结果**：
  - `İNİT`、`ınıt` 能找到 `INIT Whale`，`istanbul`、`İSTANBUL` 能找到 `İstanbul`。
  - 土耳其语系统上输入 `INIT` 会被小写成 `ınıt`，服务端折叠后也能匹配。所以结果不再取决于浏览器语言。
- **服务端开销**：每次搜索对每个可见资格行折叠一次显示名，与原来逐行做 `toLocaleLowerCase()` 同一量级。ASCII 名称只做小写转换。没有为折叠结果加缓存。

### 文档

以下文档与实现在同一提交里同步：

- `docs/i18n-presentation.md`：搜索折叠规则补上这两处和测试文件。
- `docs/funding-comparison.md`：搜索规则和测试清单。
- `docs/leaderboard-vaults-staking-redesign-notes.md`：Search 一行。
- `CHANGELOG.md`：Unreleased 里原来那条搜索条目扩展到这两个页面。
- `AGENTS.md`：运行时翻译回归组加入三份测试。
- 七种语言记录里原来那一条加了指向本记录的说明。

## 验证与限制

验证都在本分支未提交的改动上进行，基线是 `main` `0bb212a02`：

- **测试**：`funding-comparison-domain.test.ts`、`leaderboard-domain.test.ts`、`leaderboard-server.test.ts`、`search-fold.test.ts` 四个文件 71 项通过。新增的测试：
  - 资金费率：`İNİT`、`ınıt`、带空格的输入、`dóge`、合成币名 `İSTANBUL`、只含组合符号的输入。
  - 排行榜领域：`İNİT`、`ınıt`、`istanbul`、`İSTANBUL`、大写地址片段、`đ` 不匹配地址、只含组合符号的输入。
  - 排行榜服务端：经真实处理函数搜索 `istanbul`、`İNİT`、`ınıt` 和地址片段。
- **变异检查**：每次退回一处，相关测试都失败；全部恢复后测试通过。
  1. 币名改回 `toLowerCase()`。第一次没有被拦住，因为测试币名都是 ASCII；补上 `İSTANBUL` 行后能拦住。
  2. 资金费率在折叠后为空时匹配全部。
  3. 显示名改回 `toLocaleLowerCase()` 并用未折叠的查询，领域测试和服务端测试都失败。
  4. 地址改用折叠后的查询。
  5. 名称在折叠后为空时匹配全部。
- **其他检查**：见下面的「检查结果」。
- **限制**：
  - 没有做包体构建。两个页面都是懒加载的路由，`lib/search/utils.ts` 已经在静态启动块里（见七种语言记录 PR #24 一节），预计只多几行导入，CI 的 Production Builds 会核对预算。
  - 没有在土耳其语系统的浏览器里实测，也没有跑浏览器套件。
  - 没有推送，没有发布。

### 检查结果

- `pnpm --filter @sairn/terminal typecheck`：退出码 0。
- 改动的 6 个 ts 文件跑 `pnpm exec biome check`：第一次报 2 处格式问题，`biome format --write` 修复后通过。
- 运行时翻译回归组（`AGENTS.md` 所列 13 个文件，含新加入的 3 个）加上 `vaults-domain`、`leaderboard-trader-link`、资金费率对比的视图与控制器、`leaderboard-api`：20 个文件 705 项通过。
- 排行榜与资金费率对比的其余测试（`components/leaderboard/__tests__` 全部、`funding-comparison-catalogs`）和几项读这些文件的契约测试（`decimal-display-contract`、`desktop-nav-layout`、`dashboard-surface-radius-contract`、`dashboard-mobile-grid-track-contract`、`locale-format-contract`、`number-format-reactivity-contract`、`date-locale-reactivity-contract`）：16 个文件 591 项通过。
- `pnpm memory:check` 通过；`pnpm memory:test` 12 项通过；`git diff --check` 无输出。
- 没有跑终端全量 Vitest，交给 PR 的 CI。

## 后续与替代关系

- 本记录处理的是七种语言记录「待决项处理之后」里的搜索大小写一条。该节的其余各条（静态数字、`foldSearchText` 拆模块）仍以那份记录为准。
- 推送与开 PR 需要运营方授权。
