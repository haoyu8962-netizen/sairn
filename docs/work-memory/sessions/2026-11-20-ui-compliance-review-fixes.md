<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-20-ui-compliance-review-fixes",
  "date": "2026-11-20",
  "title": "核实并修复 UI 合规审查报告中成立的问题",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "i18n-runtime", "account-funding", "order-entry"],
  "summary": "运营方转来一份基于 ba78481a 的 UI 实践、双端一致性与文档合规审查报告（14 高、24 中、17 低）。逐条对照代码、规范与官方终端核实后，14 项高严重度里 12 项成立并修复：关闭中的划转、发送弹窗与手机账户类型页签仍可提交（新测试在修复前失败）；手机历史卡片显示 @107 等协议名；TIF 提示与下单校验文案切语言后不更新（新测试在修复前失败）；rounded-6、rounded-10、rounded-2 不生成样式（用 Tailwind 编译确认）；桌面账户面板在地区未解析时整块隐藏资金入口、持仓工具栏提款按钮由原因文案决定禁用、被动原因下 Deposit 被改名；五处单列网格缺 grid-cols-1；仪表盘卡片截断数值；交易历史手机卡片缺类型、手续费与浏览器链接。H-03（手机现货没有账户模式入口）与官方手机终端一致，H-04（手机余额页对 manual 状态静默）是规范明文要求，均不成立。另修了 15 处强描边加透明度、四项小功能缺陷与五处文档漂移，并新增三条会失败的契约。其余中低项未处理，列在后续。Codex gpt-6.2-sol 三轮只读对抗审查评分 8.2、8.3、9.1，前两轮的发现全部核实并修复，第三轮余下三项 P3 记入后续。没有做真机或浏览器验收。",
  "thread": null,
  "baseCommit": "ba78481a",
  "commits": ["484ae325", "2f563262", "500e9b1f", "60badc99"],
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
    { "url": "https://app.hyperliquid.xyz/trade/BTC" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/pull/15" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "docs/runtime-guardrails.md" }
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

- 报告 3.2.2：15 处 `border-stroke-*-strong/20|/30|/40` 统一改为对应语义的 `-weak` 描边令牌。这不是逐像素等效：原来的 /20、/30、/40 本来就各不相同，`-weak` 的透明度也因色调和主题而异（例如浅色 warning 为 `33`、error 为 `24`），改动的目的是按规范使用语义令牌。`dialog-notice-radius-contract` 的提示条识别补上带 `/N` 的软背景，并纳入 `bridge/confirmation-screen.tsx`；由此查出的三处 `rounded-xs` 提示条改为 `rounded-16`。手机数据展示登记表按类名计数更新。
- 6.1 手机成交页签不再显示数量单位菜单（成交数量恒为基础币，`docs/recent-trades.md`）；6.2 成交面板只在挂载后记录一次「首帧成交」，切市场后新市场的全部成交都被当成新成交闪烁：改为按订阅的 coin 重新记录首帧（`responsive-panel-layout` 契约有意让桌面面板常驻、不带 `key`，所以没有用重挂载），`trades-panel.test.tsx` 新用例在修复前失败；6.4 手机 TP/SL 区补 `capabilities.hasTpSl`；6.6 授权错误的定时清除只清自己那一次。
- 文档：`order-draft-lifecycle.md`（手机已用共享草稿，`onReset` 已无调用方）、`trading-toolbar-redesign.md`（v7 几何标为已被取代）、`orderbook-hover.md`（只用 `midPx`，计价总额统一用 `getOrderbookQuoteDecimals`）、`design-tokens.md`（`bg-sunken` 暗色默认值、两层响应式字号、数字圆角规则）、`order-entry-surface-parity.md`（Max 按钮只设 `title`）。报告的 5.6（Earn 文档）不成立：文档说的是页头四个按钮，与代码一致；行内 Withdraw 不给原因、行内 Repay 给原因的差异记为后续。

## 验证与限制

- 每个新增行为测试都撤掉修复（`git stash push -- <修复文件>`，或用 `git show <提交>:<路径>` 换回旧版）确认失败，再恢复。
- 第一个提交 `484ae325` 之前，本机全量终端 Vitest（`pnpm --filter @sairn/terminal test --maxWorkers=4`，767 个文件）有 3 个用例失败：`responsive-panel-layout` 契约禁止给桌面 `TradesPanel` 加 `key`（当时 6.2 用的就是 `key`，已改为面板内部按 coin 重置并撤回 `key`）；`root-route-transition` 的两个用例单独重跑通过，属于并发负载下的时序抖动。Biome、终端类型检查、`git diff --check`、`pnpm memory:check` 与 `pnpm memory:test` 通过。类型检查和工作记忆校验需要图表库：工作树里放了主检出图表库的副本（Git 忽略，没有提交）。
- 没有做真机、浏览器或计算样式测量；H-13 的换行效果没有在 375px 宽度实测。

### Codex 对抗审查

`codex exec -m gpt-6.2-sol -s read-only`，medium 强度，提示词要求逐条证伪作者的主张；有 P2 时评分不得高于 8.5，有 P0/P1 不得高于 7。

- 第一轮（审 `484ae325`，约 19 万 token）：8.2 分，两项 P2、四项 P3，逐条核对后全部成立并修复：
  - P2 手机历史卡片把 HIP-3 市场压成短名，`xyz:TSLA` 与原生 `TSLA` 无法区分：新增 `getMarketDexLabel`，名称旁加 DEX 标记，可访问名称为 `TSLA (xyz)`（沿用手机持仓页的写法；变量名保持 `marketName`，消息 ID 不变）；测试覆盖同名的两个市场各自跳转。
  - P2 切到尚无快照的市场再切回时，首帧基线仍是旧集合，切走前已看过的实时成交会再次闪烁：订阅 coin 一变就清空基线，用新身份的第一份可显示数据初始化；新用例按「A 首帧 → A 实时成交 → B 无快照 → A」在上一版提交上失败。
  - P3 关闭中的账户类型表单在未连接时仍可点 Connect、抽屉仍可切页签：`isUpdating` 同时挡住 Connect 与处理函数，`handleTabChange` 检查 `open`；新用例在上一版提交上失败。
  - P3 Portfolio 桌面隐藏被动原因后，按钮失去读屏描述：被动原因放进 `sr-only` 节点并由 `aria-describedby` 关联，可见列表仍只显示已确认限制；新用例在 `484ae325` 与 `ba78481a` 上都失败。
  - P3 三条契约可被绕过（`rounded-6.5`、`grid-cols-none`、`bg-*-soft/12.5` 与 `/[0.125]`）：正则改为接受小数与任意值，基础列只认数字或任意值轨道，已在 Node 里逐个核对。
  - P3 两处措辞：`order-draft-lifecycle.md` 写成桌面专属的数量单位偏好实为双端共享；本记录把描边替换写成等效，已改为按语义令牌统一。
  - 另按它的变异表补了现货校验的语言切换用例。
  - 第一轮修复后本机全量终端 Vitest：766 个文件、11,286 个用例通过，1 个文件跳过（`websocket-soak`）。
- 第二轮（审 `484ae325..2f563262`，约 14.5 万 token）：8.3 分，一项 P2、三项 P3，逐条核对后全部成立并修复：
  - P2 成交面板在渲染期间改写 ref，一次被放弃的并发渲染（例如切到 B 的过渡挂起）会清空已提交的 A 的基线，A 的下一笔实时成交会被收进基线而不闪烁：基线改为 state，用 React 文档的「渲染期间按条件调整 state」写法，被放弃的渲染里的 state 更新随之丢弃；计算抽成 `lib/trade/trades.ts` 的 `getInitialTrades` 并单测。去掉渲染期 ref 后 React Compiler 开始编译这个组件，一个原地改写快照数组的旧用例随之失效，已按真实订阅返回新数组的方式改写。尝试在 jsdom 里用挂起的过渡复现放弃的渲染：挂起的过渡会把后续的根部更新与订阅更新一起拖住、迟迟不提交，复现不了，这个场景没有集成测试。
  - P3 打开的桌面弹窗里，上一钱包未完成的更新会让 Connect 不可点：新增 `sessionOpen` 属性，只有关闭中才挡 Connect，`isUpdating` 继续只挡 Confirm；新用例在 `2f563262` 上失败。
  - P3 账户模式尚未解析时，读屏说明是「Select a supported account mode before moving funds.」，属于提前断言：`account-mode-unresolved` 改为中性的「Loading account mode. Funds actions are temporarily unavailable.」（六种语言已翻译），规范补了一条；Portfolio 里文字相同的读屏说明合并为一个节点。
  - P3 契约的等价写法：`grid-cols-[none]` / `grid-cols-[subgrid]` 不再算显式轨道，`grid-cols-1!` 与 `!grid-cols-2` 算；提示条背景识别带 `!` 与 `/(--var)` 的写法。
  - 第二轮修复后本机全量终端 Vitest：766 个文件、11,290 个用例通过，1 个文件跳过。
- 第三轮（审 `2f563262..500e9b1f`，约 9.3 万 token）：**9.1 分**，超过运营方要求的 9 分，没有 P0–P2。第二轮的 P2 与「Connect 被旧更新挡住」判为已解决；读屏文案与契约两项判为部分解决，余下三项 P3 未修，记入后续：
  - `account-mode-unresolved` 也可能来自两个数据源互相矛盾或无法识别的协议值，这时没有加载在进行，「Loading account mode…」并不准确；可改为适用于所有未解析状态的中性措辞，并分别覆盖等待、冲突与失败。
  - 网格契约仍可被 `grid-cols-[NONE]`、`grid-cols-[none_]` 和 `min-[1001px]:!grid-cols-2` 绕过；`grid-cols-1!` 会压过桌面列定义。
  - 提示条契约漏掉嵌套括号的 `/(--opacity,calc(12.5%))`，又把不生成 CSS 的 `/(12.5%)` 认作背景。

### PR #15 的 CI 与两项决定

推送后 PR #15 的 CI 有三类失败：

- `Build website`：仓库里的官网快照已 7.2 天，与本 PR 无关；运营方要求另开 PR 刷新，见 [PR #16 的记录](2026-11-20-website-market-snapshot-refresh.md)。
- 浏览器回归（两片，共 6 个用例）：`top-nav-connected.pw.ts` 的 `deposit-unavailable` 场景期望顶栏 Deposit 收成图标。夹具用的是「地区检查未完成」，H-11 的修复让这种被动状态保留 `Deposit` 名称。这暴露了规范冲突：`docs/runtime-guardrails.md` 写明无论受限还是仍在解析都收成图标，`docs/mobile-data-presentation.md` 禁止在未就绪时改名为「不可用」。运营方 2026-11-20 决定：保持 `Deposit` 名称并禁用，只有已确认限制收成图标。已改 `runtime-guardrails.md` 的规则，夹具的 `deposit=unavailable` 改为已确认的地区受限（被动状态的布局与可用时相同，可用场景已覆盖）；本机跑这个 Playwright 配置 13 项通过。
- 两个终端构建：包体预算超限。运营方决定按复现规则重定基线。固定构建身份、Node 22.15.0、无 `.env.local` 的成对构建（main `ba78481a` 对本分支）读数与新基线写在 `docs/terminal-performance-baseline.md`「UI compliance fixes re-baseline (2026-11-20)」：`trade-terminal-page` +493、静态交易启动 +524、总量 +1,501（各取两种配对开关中较大的增量）；用本分支配对开的产物重跑预算脚本通过。配对开的静态启动余量 191 字节，main 自身只有 117，仍低于发布预检要求的 200 字节。

### 合并 main 后重新测量包体（2026-11-23）

PR #15 与 main 冲突：合并期间 main 先后合入 PR #17（资金弹窗在钱包会话解析期间保留）与 PR #18（ADR 0058 签名会话守卫），都改了 `CHANGELOG.md`、`docs/terminal-performance-baseline.md` 和包体预算脚本的同几项基线。前两个文件保留两边内容，按时间排列。预算基线不能把本分支对旧 main `ba78481a` 量出的增量直接叠到新 main 上，所以把 main `ebdc7413` 合进分支后重新成对构建：基线侧为 `ebdc7413` 的干净分离工作树，头侧为已解决冲突、尚未提交的合并树；Node 22.15.0、无 `.env.local`、`NITRO_PRESET=node-server`、四次构建同一固定构建身份、逐个单独构建。增量为总量 +1,798（配对开）、静态交易启动 +631（配对开）、`trade-terminal-page` +511（配对关），三项基线改为 main 的值加较大增量，替换了原来的三次上调，三项在较紧的那种配置下余量与 main 自身相同（静态启动配对开 274 字节），另一种配置下静态启动、总量与 `trade-terminal-page` 分别比 main 多留 37、204、10 字节。手机与桌面运行时启动只增加 23 与 364 字节，在允许范围内，没有上调。读数表在 `docs/terminal-performance-baseline.md` 的同名小节，日志在 Git 忽略的 `.worklog/2026-11-23/pr15-merge-rebaseline/`。没有构建发布配置。

## 后续与替代关系

- 未处理的中低项（未逐条核实）：报告 2.1 第 2–6 项、2.2 表、2.3 其余项、3.1 按钮状态（`hover:opacity-*`、原语缺 `not-data-disabled`、WalletModal 静息与悬停同值）、3.2.1 四个仪表盘弹窗的退场过渡、3.2.3 静态内容用 `bg-fill-weak`、3.3 触控按压反馈、4.2 仪表盘与弹窗的 `isResolving`、4.3 发送弹窗对新账号的模式提示、4.4 API 钱包被动横幅、4.5 硬编码千分位与英文 `aria-label`、6.3 成交历史 Type 列、6.5 Scale 订单数清空回弹（需要把草稿字段改成可空）、6.7、6.8，以及第七节官网两项。
- 桌面历史表格与交易、资金费历史页的切换按钮 `aria-label` 仍用协议 coin（`Switch to @107 market`）；手机历史卡片已改用显示名。
- Earn 行内 Withdraw 在没有存入时不给原因。
- 第三轮 Codex 审查留下的三项 P3（见上节）。
- 配对开的静态交易启动余量在合并 main `ebdc7413` 后为 274 字节（与 main 相同），只比发布预检要求的 200 字节多 74；`trade-terminal-page` 配对关余 249 字节。下一次让它们增长的改动需要真实削减或运营方对上限的决定。
- 报告 4.4（API 钱包被动横幅）已由 PR #17 处理，不再属于本记录的后续。
