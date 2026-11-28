<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-28-search-fold-funding-leaderboard",
  "date": "2026-11-28",
  "title": "资金费率对比与排行榜搜索改用 foldSearchText",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "七种语言任务留下的两处搜索大小写问题按运营方要求修复。资金费率对比的币名与输入都经 foldSearchText 折叠；排行榜在服务端按显示名折叠匹配，服务端与夹具共用 matchesLeaderboardSearch，发送和缓存用的查询形式与地址比较不变。土耳其语 İ/ı、重音、只含组合符号的输入各有测试，五处变异都会让测试失败。Codex 只读审查 8/10，2 项 P2、2 项 P3 都已处理：收窄「不取决于浏览器语言」的说法并写明 128 码点的边界，说明按 NFC 比较，补回传与折叠后去空格的测试。未构建包体，未推送。",
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
- 有输入但折叠后为空（只有组合符号）时不匹配任何行。有可用快照且有数据行时，页面显示 `noResults`。这与市场搜索、金库搜索的规则一致。
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
  - 土耳其语系统上输入 `INIT` 会被小写成 `ınıt`，服务端折叠后也能匹配。所以查询能匹配到哪些名称，不再取决于浏览器语言。
  - 例外是长度上限：服务端按浏览器发来的形式数 128 个码点。一条 128 个码点、含 `İ` 的查询，在土耳其语浏览器里能通过，在其他浏览器里小写后变成 129 个码点，会被拒绝。改动前也是这样，本次没有改。
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

### Codex 只读审查与修订（2026-11-28）

- **审查方式**：Codex CLI `gpt-6.2-sol`，只读沙箱，推理强度 low。只审 `34435ed97` 的差异，约 4.5 万 token，没有跑测试或构建。
- **结果**：8/10，没有 P0、P1，有 2 项 P2、2 项 P3。逐条对照代码核对后都成立，P2 第 2 项部分成立。
  1. P2：「排行榜结果不再取决于浏览器语言」说得太满。128 个码点的上限按浏览器发来的形式计算，含 `İ` 的满长查询在英文浏览器里会被拒绝。这是改动前就有的边界情况。处理：收窄 `CHANGELOG.md`、`docs/i18n-presentation.md` 与本记录的措辞，并把这个边界写明；长度规则没有改。
  2. P2：以分解形式存储的名称（`か` 后跟 U+3099）经 NFC 重组成 `が` 后，用 `か` 搜不到。这是共享 `foldSearchText` 的既有行为，与「区块外的符号改变字义、保留」的规则一致；用户输入法打出的组合形式 `が` 以前也搜不到。但 `docs/i18n-presentation.md` 里「只会更宽松」的说法不准。处理：改写那句话，说明按组合形式（NFC）比较；`search-fold.test.ts` 补测试，确定分解形式与组合形式的折叠结果相同。
  3. P3：测试没有确认服务端原样回传查询，也没有区分折叠前后两次去空格。处理：服务端测试断言 `ınıt`、`İNİT`、` Atlas ` 原样回传；两个领域测试加入 `"̇ INIT"`，这类首部空格要折叠后才露出来。
  4. P3：资金费率文档没写 `noResults` 的前提。处理：`docs/funding-comparison.md` 与本记录补上「有可用快照且有数据行」。
- **新测试的变异检查**：以下四处变异，各自都会让对应测试失败；恢复后四个文件 72 项通过。
  - 资金费率去掉折叠后的去空格。
  - 排行榜去掉折叠后的去空格。
  - 服务端回传小写后的查询。
  - `foldSearchText` 去掉 NFC，`search-fold.test.ts` 有 3 项失败。
- **修订后的检查**：终端 typecheck 退出码 0；改动的 4 个测试文件跑 Biome 通过；运行时翻译、搜索、金库、排行榜与资金费率对比的 18 个测试文件 504 项通过；`pnpm memory:check` 通过，`memory:test` 12 项通过，`git diff --check` 无输出。
- 没有对修订再做一轮审查：修订只改测试与文档，没有改实现。

## 后续与替代关系

- 本记录处理的是七种语言记录「待决项处理之后」里的搜索大小写一条。该节的其余各条（静态数字、`foldSearchText` 拆模块）仍以那份记录为准。
- 推送与开 PR 需要运营方授权。（更新 2026-11-28：运营方授权后推送并开 [PR #28](https://github.com/haoyu8962-netizen/sairn/pull/28)，CI 7 项全部通过后合入 `main`，合并提交 `708b43aa2`，见 [静态数字占位符](2026-11-28-static-number-placeholders.md)「后续」。）
