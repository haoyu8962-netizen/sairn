<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-20-ui-compliance-review-fixes",
  "date": "2026-11-20",
  "title": "核实并修复 UI 合规审查报告中成立的问题",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "i18n-runtime", "account-funding", "order-entry"],
  "summary": "运营方转来一份基于 ba78481a 的 UI 实践、双端一致性与文档合规审查报告（14 高、24 中、17 低）。逐条对照代码、规范与官方终端核实后，14 项高严重度里 12 项成立并修复：关闭中的划转、发送弹窗与手机账户类型页签仍可提交（新测试在修复前失败）；手机历史卡片显示 @107 等协议名；TIF 提示与下单校验文案切语言后不更新（新测试在修复前失败）；rounded-6、rounded-10、rounded-2 不生成样式（用 Tailwind 编译确认）；桌面账户面板在地区未解析时整块隐藏资金入口、持仓工具栏提款按钮由原因文案决定禁用、被动原因下 Deposit 被改名；五处单列网格缺 grid-cols-1；仪表盘卡片截断数值；交易历史手机卡片缺类型、手续费与浏览器链接。H-03（手机现货没有账户模式入口）与官方手机终端一致，H-04（手机余额页对 manual 状态静默）是规范明文要求，均不成立。另修了 15 处强描边加透明度、四项小功能缺陷与五处文档漂移，并新增三条会失败的契约。其余中低项未处理，列在后续。没有做真机或浏览器验收。",
  "thread": null,
  "baseCommit": "ba78481a",
  "commits": [],
  "sources": [
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "docs/spot-market-names.md" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": ".claude/rules/design-tokens.md" },
    { "path": "apps/terminal/src/lib/tests/design-token-ratchet.test.ts" },
    { "path": "apps/terminal/src/lib/tests/dialog-notice-radius-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/dashboard-mobile-grid-track-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/use-order-validation-locale.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/definition-tooltip-locale.test.tsx" },
    { "url": "https://app.hyperliquid.xyz/trade/BTC" }
  ],
  "supersedes": []
}
-->
# 核实并修复 UI 合规审查报告中成立的问题

## 背景与范围

- 输入：运营方提供的审查报告（本机文件，不入库），基线为新仓库 `main` 的 `ba78481a`。本会话最初开在旧克隆 `gatu` 的工作树里，那里指向已封停的旧仓库，所以改在 `sairn` 下新建工作树 `.claude/worktrees/ui-compliance-fixes`（分支 `claude/ui-compliance-fixes`，基线 `ba78481a`）。
- 要求：核实每条发现，对照开发文档与官方终端做法，修复成立的问题，再用 Codex `gpt-6.2-sol` 做对抗审查，评分大于 9 才算通过。
- 本次只处理 14 项高严重度、报告第五节的文档漂移，以及几项改动小且核实成立的中低项；其余见「后续」。

## 结论与依据

### 高严重度逐条核实

| 编号 | 结论 | 依据与处理 |
| --- | --- | --- |
| H-01 | 成立 | 关闭时 `key` 重挂载会清空金额，但退场 250ms 内仍可输入并提交。`funds-action-balances.test.tsx` 新用例在修复前失败（两种弹窗都会发出请求）。`canSend` / `isValidAmount` 与处理函数都加 `open` 判断。 |
| H-02 | 成立 | 手机账户类型页签在 `currentMode` 为 `default` 时重挂载后仍是已改动状态。补 `isUpdating={actionPending \|\| !open}`；`margin-mode-modal.test.tsx` 新用例在修复前失败。 |
| H-03 | 不成立 | 2026-11-20 在官方终端手机宽度（400px，已登录）查看：永续首行为「市价 \| 全仓 \| 20x」，现货 `HYPE/USDC` 首行只有「市价」，与本终端相同。账户类型在资产组合页可改。 |
| H-04 | 不成立 | `docs/mobile-data-presentation.md`「账户模式与资金限制」明文规定 `manual` 时手机余额页签保持静默的待定状态，桌面才显示「请选择支持的账户模式」。 |
| H-05 | 成立 | 三个手机历史页签用 `fill.coin` 等协议名。官方手机历史成交显示 `SOL/USDC`、`NVDA` 加 `xyz` 标记，数量单位是基础币。新增 `getMarketListLabel`（现货用 pairName，永续用 shortName，与 `AssetDisplay` 同一逻辑），跳转仍传协议 coin；CSV 导出不变。 |
| H-06 | 成立 | `config/tooltips.ts` 用全局 `t`，组件无响应式依赖。改为 `msg` 描述符加显式 `Translate`；`definition-tooltip-locale.test.tsx` 在修复前失败。 |
| H-07 | 成立 | React Compiler 按输入缓存 `useOrderValidation` 的结果，切语言时草稿不变，文案停在旧语言。校验器 `getMessage(ctx, translate)` 显式接收翻译器（14 个定义文件、56 处），hook 用 `@lingui/react` 的 `_`；`use-order-validation-locale.test.tsx` 在修复前失败。`stacks/deposit.ts`、`stacks/withdraw.ts` 没有调用方，只随签名一起转换。 |
| H-08 | 成立 | 用项目的 Tailwind 4.1.18 编译确认 `rounded-6`、`rounded-10`、`rounded-2` 不生成规则（报告漏了 `markdown.tsx` 的 `rounded-2`）。按作者写的像素换成 `rounded-12` / `rounded-4`；Swap 代币面板按提示条规则用 `rounded-16`。`design-token-ratchet.test.ts` 新增检查：数字圆角必须有 `--radius-N`，改前列出这 5 处。 |
| H-09 | 成立 | 规范第一张表禁止「因地区检查未解析而整块隐藏资金入口」，手机账户页 11-17 已改，桌面 `AccountPanel` 漏改。按手机做法只认 `geo-restricted`，可见提示用 `getFundsAvailabilityNotice`，Bridge 在未解析时禁用；屏幕阅读器描述保留完整原因（既有测试要求）。原测试固定了旧行为，已按规范改写。 |
| H-10 | 成立 | 提款按钮 `disabled={!!withdrawDisabledReason}`，改为可用性布尔值，悬浮提示用 notice。 |
| H-11 | 部分成立 | 已确认限制（地区受限、主网未开放、Agent-only）下的「Deposit unavailable」是测试固定的有意行为，规范允许已确认限制给出说明；违规的只是被动原因也改名。新增 `isFundsActionRestricted`，只有 notice 非空时才改名，四处入口统一。 |
| H-12 | 成立 | 5 处补 `grid-cols-1`；新增 `dashboard-mobile-grid-track-contract.test.ts`，撤掉修复时失败。 |
| H-13 | 成立（按规则字面） | 交易、资金费历史页手机卡片的数值，金库列表与详情、API 钱包、排行榜名称由 `truncate` 改为换行。没有在浏览器里测宽度。 |
| H-14 | 成立 | 交易历史页手机卡片补类型、手续费与浏览器链接，数值改两列；`trade-history-page.test.tsx` 新用例。 |

### 其他已处理项

- 报告 3.2.2：15 处 `border-stroke-*-strong/20|/30|/40` 改为对应的 `-weak`（强描边本身 80% 透明度，叠加 /20 约 16%，weak 为 20%）。`dialog-notice-radius-contract` 的提示条识别补上带 `/N` 的软背景，并纳入 `bridge/confirmation-screen.tsx`；由此查出的三处 `rounded-xs` 提示条改为 `rounded-16`。手机数据展示登记表按类名计数更新。
- 6.1 手机成交页签不再显示数量单位菜单（成交数量恒为基础币，`docs/recent-trades.md`）；6.2 成交面板只在挂载后记录一次「首帧成交」，切市场后新市场的全部成交都被当成新成交闪烁：改为按订阅的 coin 重新记录首帧（`responsive-panel-layout` 契约有意让桌面面板常驻、不带 `key`，所以没有用重挂载），`trades-panel.test.tsx` 新用例在修复前失败；6.4 手机 TP/SL 区补 `capabilities.hasTpSl`；6.6 授权错误的定时清除只清自己那一次。
- 文档：`order-draft-lifecycle.md`（手机已用共享草稿，`onReset` 已无调用方）、`trading-toolbar-redesign.md`（v7 几何标为已被取代）、`orderbook-hover.md`（只用 `midPx`，计价总额统一用 `getOrderbookQuoteDecimals`）、`design-tokens.md`（`bg-sunken` 暗色默认值、两层响应式字号、数字圆角规则）、`order-entry-surface-parity.md`（Max 按钮只设 `title`）。报告的 5.6（Earn 文档）不成立：文档说的是页头四个按钮，与代码一致；行内 Withdraw 不给原因、行内 Repay 给原因的差异记为后续。

## 验证与限制

- 每个新增行为测试都用 `git stash push -- <修复文件>` 撤掉修复后确认失败，再恢复。
- 本地全量结果、Biome、类型检查与 Codex 审查轮次见下节（完成后补记）。
- 没有做真机、浏览器或计算样式测量；H-13 的换行效果没有在 375px 宽度实测。

## 后续与替代关系

- 未处理的中低项（未逐条核实）：报告 2.1 第 2–6 项、2.2 表、2.3 其余项、3.1 按钮状态（`hover:opacity-*`、原语缺 `not-data-disabled`、WalletModal 静息与悬停同值）、3.2.1 四个仪表盘弹窗的退场过渡、3.2.3 静态内容用 `bg-fill-weak`、3.3 触控按压反馈、4.2 仪表盘与弹窗的 `isResolving`、4.3 发送弹窗对新账号的模式提示、4.4 API 钱包被动横幅、4.5 硬编码千分位与英文 `aria-label`、6.3 成交历史 Type 列、6.5 Scale 订单数清空回弹（需要把草稿字段改成可空）、6.7、6.8，以及第七节官网两项。
- 桌面历史表格与交易、资金费历史页的切换按钮 `aria-label` 仍用协议 coin（`Switch to @107 market`）；手机历史卡片已改用显示名。
- Earn 行内 Withdraw 在没有存入时不给原因。
