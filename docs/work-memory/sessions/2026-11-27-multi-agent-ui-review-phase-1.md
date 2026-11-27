<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-27-multi-agent-ui-review-phase-1",
  "date": "2026-11-27",
  "title": "多模型 UI/UX 全端审查与修复（阶段一）",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "order-entry", "i18n-runtime", "account-funding", "docs-governance"],
  "summary": "运营方要求多 Agent 并发审查全端 UI/UX 并统一修复，起因是 TWAP 子视图标签栏自写实现且能上下滚动。Codex 两轮全量只读审查（gpt-6.2-astra 7 路、gpt-6.2-sol 12 路）加无头全页面量测，编排方逐条对源码核实后交 Gemini 4 Neon 修复，再由 Codex 三轮只读对抗复审。P0、P1 清零：阿语桌面网格面板不可见、TWAP 触发方向在确认与提交之间翻转、非空无效 TWAP 价格退化为无条件单、Bridge 返回后沿用旧报价、路由错误页重载恢复不了懒加载失败等。三轮未收敛的 P2 按止损规则交运营方，运营方选择把错误页按缓存故障清理资产缓存的改动整体撤回（路由错误页只保留普通整页重载），其余 Bridge、市场选择器与测试缺口共 8 条 P2 记为后续。全量终端 Vitest、8 套浏览器回归、官网与品牌测试在本机通过；没有真机验收。",
  "thread": null,
  "baseCommit": "ce3259b68",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/twap/twap-subview-tabs.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-account-subrow.ts" },
    { "path": "apps/terminal/src/styles.css" },
    { "path": "apps/terminal/src/hooks/trade/use-order-submit.ts" },
    { "path": "apps/terminal/src/domain/trade/twap-details.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/bridge/confirmation-screen.tsx" },
    { "path": "apps/terminal/src/components/pages/router-error-page.tsx" },
    { "path": "docs/desktop-grid-layout.md" },
    { "path": "docs/agent-handbook.md" },
    { "path": ".claude/rules/style-ui-guide.md" }
  ],
  "supersedes": []
}
-->
# 多模型 UI/UX 全端审查与修复（阶段一）

## 背景与范围

同步记录，2026-11-26 至 2026-11-27，在 Claude Code 桌面会话中进行，未取得任务标识。基线是新仓库 `main` 的 `ce3259b68`。

起因：运营方指出 TWAP 子视图标签栏是自写的 tablist，其余标签用 `@sairn/ui` Tabs，而且这一行能上下滚动。量测确认：`overflow-x-auto` 不写 `overflow-y` 时，`overflow-y` 计算为 `auto`，44px 的触控伪元素把内容撑高一截。运营方随后要求「多 Agent 并发审查全端 UI、UX，回归所有端的页面，全部审查后一起修复」，并给出编排规则：

- 编排方（本会话）下发任务、亲自核实每条意见、管理提交。
- 同一时刻只有一个模型写工作树；审查一律只读，不提交、不推送。
- 每轮复审给审查模型干净上下文。
- 每条意见按 P0～P3 定级。通过门槛为 P0、P1、P2 清零，或核实为误报、范围外并记录依据。
- 同一问题往返超过 3 轮仍不收敛，或涉及产品决策时，暂停并交运营方拍板。
- 推送、开 PR、合并之前等待授权。

模型分工：审查用 Codex CLI。运营方 2026-11-26 定为只用 `gpt-6.2-sol`（例行、窄范围）或 `gpt-6.2-astra`（复杂、高风险），不再用 gpt-6 系列，已写入 [Agent 工作手册](../../agent-handbook.md) 第 7 节。修复用 Gemini 4 Neon（`agy`，`accept-edits`，禁止全部改写类 git 命令）。

## 结论与依据

### 审查与修复轮次

| 轮次 | 执行方 | P0 / P1 / P2 / P3 | 要点 |
|---|---|---|---|
| 全量审查 1 | Codex gpt-6.2-astra，7 路 | 合计约 120 项（两轮合并去重） | 覆盖交易页双端、账户表格、资金弹窗、仪表盘、导航与设置、官网、七种语言 |
| 全量审查 2 | Codex gpt-6.2-sol，12 路，模型默认强度 | 同上 | 加一次无头全页面量测（截图与几何读数），只读 |
| 修复 F1～F2 | Gemini，10 组并行加 1 个收口实例 | — | 派修 3 条 P1、约 80 条 P2；编排方核实时把误报、范围外与需决策项剔除 |
| 复审 R1 | Codex，10 路 | 1 / 16 / 47 / 3 | 唯一的 P0 核实后降为 P1。本批回归包括 Tabs 原语被改成全局 LTR 几何、修复方删了 4 条基线存款测试（已恢复，此后禁止删除或改写基线断言），以及手机配对页的改动（整体撤回） |
| 修复 F3～F4 | Gemini，10 组加收口 | — | 回归清零 |
| 复审 R2 | Codex，6 路，窄范围 | 0 / 5 / 18 / 1 | 5 条 P1 全部成立，其中 Bridge Max 与错误页清缓存是本批引入的 |
| 修复 F5 | Gemini，7 组 | — | 第 3 次处理这些线索 |
| 复审 R3 | Codex，6 路，只审 F5 差异 | 0 / 0 / 10 / 1，另有 3 条为上一轮的部分修复 | A-06、A-07 已修；剩余见「后续」 |
| 收尾 F6 | 编排方 git 还原 3 个文件，Gemini 改 1 个组件与 1 个测试 | — | 按运营方决定撤回错误页缓存清理；新测试把组件改为静态导入，避免冷加载计入 5 秒用例超时 |
| 复审 R4 | Codex gpt-6.2-sol，1 路，窄范围 | 0 / 0 / 0 / 2 | 回滚与整页重载未被证伪。两条 P3 指出新增 CHANGELOG 的表述过宽：无效 TWAP 价格看到的是字段校验提示，不是复核通知；旧的页内重试只在懒加载失败被缓存时恢复不了。两条都已改 |

R3 的报告原文与各轮修复报告都只在本机草稿目录，没有入库，见「验证与限制」。

### 本批修复的主要缺陷

- **TWAP 子视图标签栏**：改用 `@sairn/ui` Tabs。手机账户第二行统一用 `MOBILE_ACCOUNT_SUBROW_CLASS`（`overflow-y-hidden`），规则写进 `.claude/rules/style-ui-guide.md`「Account tab second row」。
- **阿语桌面网格面板不可见（P1）**：RTL 下 React Grid Layout 的项只设 `transform`、不设 `left` 和 `top`，静态位置从右边缘起算，整块被推出视口。`styles.css` 给 `.desktop-terminal-grid > .react-grid-item` 补 `top: 0; left: 0`，规则写进 `docs/desktop-grid-layout.md`，由 `responsive-panel-layout` 与 `desktop-grid-rtl-contract` 钉住。
- **TWAP 触发方向在确认与提交之间翻转（P1）**：`use-order-submit.ts` 在提交时按实时标记价重算方向，与确认时不一致或无法判定就拒绝，并报「order-conditions-changed」。手机提交契约同时要求传入确认时的方向。
- **非空无效 TWAP 价格退化为无条件单（P1）**：例如只输入 `.`。现在区分空、有效、无效三态，无效价格在表单校验和共享提交器里都拒绝，提交载荷价格必须与草稿原文一致（`twap-details.ts`、`errors/definitions/twap.ts`）。
- **Bridge（新建流程，生产默认关闭）**：返回后沿用旧报价（P1，确认尝试代际与确认键守卫）；余额一直忙碌；单个不可细分资产无法 Max。
- **路由错误页（P1，R2 E-01）**：「Reload terminal」在基线只调用 `router.invalidate()`。TanStack `lazyRouteComponent` 在模块闭包里缓存加载错误，失效重试会立刻再抛出，按钮恢复不了。现在与应用错误边界一样做普通整页重载，`router-error-page.test.tsx` 先复现缓存错误再钉住按钮行为。
- **其余 P2 举例**：排行榜、市场目录与官网订单簿快照的新鲜度判断；`formatDuration` 保留超过一天的分钟数，并按语言输出单位；共享原语的 RTL、焦点与读屏名称（Modal 关闭按钮改用 `end-4`，Toggle、Pagination、RadioButtons、SearchInput、SegmentedControls、Dropdown）；浅色主题成交填充色对比度；约 31 条新文案的六语翻译。中文撤单确认原把「可能失去保护」写成「必然失去保护」（R2 E-02，P1），已改用 `=1` 精确分支。
- 7 条基线测试因有意的行为变化被替换，每条都对应上面的一项改动，没有静默删除。`mobile-trade-height.pw.ts` 在基线就失败：它期望未分组的大数，而基线已按 ADR 0037 分组显示，本批改为分组断言。

### 运营方 2026-11-27 的决定：撤回错误页缓存清理

F2～F5 曾给两个错误页加上「识别分块或资产加载失败，删除对应 Service Worker 资产条目，识别不出 URL 时清空资产桶，再重载」（`lib/lazy.ts` 的 `reloadAfterError`）。三轮复审都还能找到误判：

- D-01：懒模块初始化异常也会清空资产桶。
- D-02：动态导入报出的入口 URL 可能指向健康条目。
- D-03：客户端运行时的脚本解析失败会漏判。

运营方选择撤回。`lib/lazy.ts`、`components/application-error-boundary.tsx` 及其测试用 `git restore --source=HEAD` 还原为基线。路由错误页只保留普通整页重载，不清任何缓存。「缓存里的坏分块靠整页重载也恢复不了」这个原问题另立专项，需要先在真实 Service Worker 环境中复现。

## 验证与限制

验证对象是本次提交的工作树，即基线 `ce3259b68` 加本批全部改动（含 F6），在本机运行：

- `pnpm typecheck`：通过。
- 本批改动的 TS/TSX/MJS 文件跑 `pnpm exec biome check`：通过。
- `pnpm --filter @sairn/terminal test`：最终一次 813 个文件中 812 个通过、1 个跳过（`websocket-soak`，按设计跳过），共 12004 例。比回滚前少 8 例，即删掉的缓存清理用例（路由错误页 5 例、错误边界 3 例）。之前两次全量运行时本机负载很高（load average 约 40～57），出现过用例超时：一次是新测试，体内冷加载组件超过 5 秒，已改为静态导入；两次都有基线未改的 `mobile-agent-sync-modal` 首个用例超时，另有一次 `chart-store` 的 beforeEach 超过 10 秒。超时的文件单独重跑都通过。这两个基线文件的首个用例在冷加载时就要 2～3 秒，负载高时可能偶发超时，本批没有处理。
- 浏览器回归（`apps/terminal/tests/browser/` 下 8 个配置，即 CI 跑的全部浏览器套件）：全部通过，共 324 例（主配置 154、手机全部委托 47、账户操作 46、全部平仓 36、通知 19、手机历史卡片 13、已连接顶部导航 7、品牌界面 2）。这次运行时，测试文件还是改为静态导入之前的版本；之后的改动只涉及这个单测文件，浏览器套件不加载它。
- `pnpm --filter @sairn/website test`、website build 加 `test:dist`、`pnpm test:brand`：均通过。
- `pnpm memory:check`、`pnpm memory:test`、`git diff --check`：通过。
- `CHANGELOG.md` 的 `Unreleased → Fixed` 新增 7 条，经 R4 核对与代码一致。

限制：

- 全页面量测与浏览器套件都是无头 Chromium 和 WebKit 脚本，读的是未连接钱包或夹具状态。没有真机、真实钱包或真实下单验收，滑块等手势不在本批范围。
- Codex 的结论来自静态源码与差异推演。它的「变异推演表」没有逐条实际运行；编排方抽查时实际运行过的变异，写在对应修复报告里。
- 审查报告、修复简报、修复报告与验证日志只在本机草稿目录（会话 `100c1933-80d9-4c14-b2e5-2bd9fa7fb9b7` 的 `scratchpad/ui-review/`），没有入库，重启或清理后可能丢失。本记录只保留核实过的结论。
- Bridge 新建流程在生产默认关闭，它的修复只在单元测试和夹具中验证过。

## 后续与替代关系

R3 剩余、按止损规则暂停的 P2（运营方 2026-11-27 定为后续）：

1. **Bridge**（重新开启前必修）：
   - B-14：第一次手动编辑被拒时，显式 Max 仍然保留，`Continue` 可以提交全额。
   - B-15：精确 Max 经五位有效数字格式化进位后，确认页显示的发送量（`10.000 DAI`）超过余额。
   - B-10 残留：不可细分资产的手输边界，与上两条同源。
   - 附带的 P3：`use-balances.ts` 的已刷新快照键在挂载期间持续增长。
2. **市场选择器**：
   - C-01（本批引入）：分类注解还在请求中时，选择器就显示目录的 `Retry`。
   - C-02：目录待复核时取消最后一个收藏，跨标签页同步加回后，旧活动 ID 又能用 Enter 提交。
3. **测试缺口**：
   - E-01：手机头部订单类型文字被 `clip-path` 裁切时，测试仍会通过。
   - E-02：ICU 复数分支删掉 `#` 插值时，翻译契约拦不住。
   - F-06：官网顶部 `Open terminal` CTA 没有真实命中测试。
4. **P3**：资金费率对比的当前表桌面端仍在父组件中构造（C-04）。
5. **测试稳定性（本批之前就有）**：`mobile-agent-sync-modal.test.tsx` 首个用例和 `chart-store.test.ts` 的 beforeEach 在用例计时内冷加载模块，本机高负载时会超时。可改为静态导入，或把冷加载移出计时。

需要运营方决定、本阶段不做的事项：

- 确认后、请求执行期间，若窗口跨过手机与桌面断点，已确认的委托会被拒绝（失败安全）。要修，需要把下单提交移到页面级宿主。
- 键盘调整桌面网格尺寸（新交互）。
- 互斥按钮组是否统一为单选组语义（P3）。
- 手机配对导入的并发问题（原 D2-01）。本批改动已撤回，需要专项。
- 手机头部放不下「Take Profit Market」等长英文订单类型名，需要短标签。
- 手机账户第二行 36px 高，裁掉了 44px 触控区，需要定行高（C-06）。
- 通知获得焦点时仍会自动消失，要修需要给 Sonner 打补丁（G-04）。
- 质押页验证人描述被截断。
- LI.FI SDK 缺余额字段时被掩盖（B-04）。
- 资金费率对比页的空结论（H-04）。
- 若干原有的按压反馈缺口（D-04、E-07、G-07）。
- 2^53 以上的价格精度（A-02，P3）。
- 错误页缓存故障的专项（见上一节）。

下一次接手先读本记录与当前 `git log`，再按上面的编号查对应源码。本记录不替代任何既有记录。
