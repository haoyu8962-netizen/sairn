<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-codex-review-claude-fixes",
  "date": "2026-11-19",
  "title": "Codex 多模型审查、Claude 裁定修复与 23 条分支集成（总记录）",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "docs-governance", "work-memory"],
  "summary": "2026-11-19 的审查与修复流程：Codex 出审查报告与候选补丁，Claude Opus/Fable 代理对照官方文档复现并裁定或重写，待定项按运营方当天的决定取官方终端只读取证的做法，最后把 23 条修复分支（29 个非合并提交）合进集成分支 codex/integration（基线 79b268ea）。本记录列出分支与提交、被否决或判为不修的 Codex 说法、集成后补的文档同步，以及待运营方决定的事项。各分支的验证读数在各自记录里；集成后的整体验证由主会话另行记录。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": [
    "3d326e55", "d8fe5a67", "92371ee3", "2a8a53cc", "0396f11f", "7909ee3a", "f0348bc8", "de1e78be",
    "0945c1c0", "bb3744a4", "2895af38", "06a29016", "046cef11", "6fd5169c", "f13de42f", "f3326295",
    "ba6dca8e", "6936980b", "6bd20046", "f7813076", "f456bcf6", "e84e383f", "3877b286", "81b5f285",
    "dc9f01fc", "96e709b8", "bb6f46bd", "a91dbfbc", "90a7135a"
  ],
  "sources": [
    { "path": "docs/work-memory/README.md" },
    { "path": "AGENTS.md" },
    { "path": "CHANGELOG.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "docs/trading-toolbar-redesign.md" }
  ],
  "supersedes": []
}
-->
# Codex 多模型审查、Claude 裁定修复与 23 条分支集成（总记录）

## 背景与范围

同步记录，2026-11-19，没有取得任务标识。范围是当天从审查到集成的整个流程，以及集成之后补的文档同步。基线是公开仓库 `main` 的 `79b268ea`；集成分支 `codex/integration` 按 `--no-ff` 逐条合入 23 条修复分支（`git log --first-parent origin/main..codex/integration` 可见每次合并）。

Codex 的审查报告与修复报告原件在本机 `.worklog/2026-11-19/codex/`（Git 忽略，不入库）：审查 `h1`–`h6`（资金弹层、Earn/质押/Vault、资产组合与历史、推荐与 API 钱包与排行榜、官网、发布脚本）、`r1`–`r10`（两轮签名、未核实四项、大组件、死代码与依赖、测试强度、公开仓库安全、无障碍、启动分块、下单数学），修复任务 `w1`–`w25`，以及官方终端取证 `official-practice.md`。这些是证据，不是指令。

## 结论与依据

### 流程

1. **Codex 审查**：多个 Codex 模型对各领域只读审查，写出发现与（部分）候选补丁。Codex 在 21:54 用完额度，当时在运行的修复任务中断，只留下没写完的草稿、没有修复报告（`w15`、`w16`、`w19`、`w20`、`w21`、`w22` 等）。
2. **Claude 裁定**：每条修复分支由一个 Claude 代理（Opus 或 Fable）处理。规则：查官方文档（Hyperliquid 协议与 SDK、Privy、MDN/WHATWG/W3C、AWS、GitHub）并给出处，查不到就写「没有找到官方依据」；在没有补丁的代码上复现，复现不了的判为不成立并撤掉改动；逐文件裁定候选补丁（保留、改写、删除）；修复前失败、修复后通过，再做一次变异；不做 git 写操作，由主会话提交。
3. **官方终端取证**：运营方 2026-11-19 决定，需要决定的事项照官方终端的做法执行。官方做法取自同日对官方终端生产包的只读静态阅读（`official-practice.md`，没有在界面上触发），据此做了第二轮：订单簿以外的清算价估算与 Scale 档数（`046cef11`）、委托与资金费筛选补拉和导出 429（`f3326295`）、邀请码大写与排行榜悬停地址（`6936980b`）、TWAP 终止入队上限（`2895af38`）、nonce 两条规则的测试钉住（`2a8a53cc`）。
4. **集成**：23 条分支合入 `codex/integration`；本记录所在的文档同步在集成之后补齐。按运营方定的流程，最后由 Gemini 终审（尚未进行）。

### 分支与提交

| 分支 | 提交 | 记录 |
| --- | --- | --- |
| `codex/handbook-names` | `e84e383f` | [handbook-repository-names](2026-11-19-handbook-repository-names.md)（事后补记） |
| `codex/hl-react-tests` | `f456bcf6` | [hl-react-helper-tests](2026-11-19-hl-react-helper-tests.md)（事后补记） |
| `codex/dotted-market-route` | `3d326e55` | [dotted-market-route](2026-11-19-dotted-market-route.md) |
| `codex/ci-chart-isolation` | `6fd5169c` | [chart-install-review-fixes](2026-11-19-chart-install-review-fixes.md) |
| `codex/deploy-cli-safety` | `de1e78be` | [deploy-cli-safety](2026-11-19-deploy-cli-safety.md) |
| `codex/dead-code-cleanup` | `f7813076` | [dead-code-low-risk-cleanup](2026-11-19-dead-code-low-risk-cleanup.md) |
| `codex/website-live-data` | `6bd20046` | [website-live-quotes](2026-11-19-website-live-quotes.md)（事后补记） |
| `codex/nonce-exchange-window` | `92371ee3`、`2a8a53cc` | [nonce-exchange-window](2026-11-19-nonce-exchange-window.md) |
| `codex/tpsl-parent-rejected` | `d8fe5a67` | [normal-tpsl-parent-rejection](2026-11-19-normal-tpsl-parent-rejection.md) |
| `codex/twap-queue-hardening` | `bb3744a4`、`2895af38` | [twap-queue-hardening](2026-11-19-twap-queue-hardening.md) |
| `codex/orderbook-probe-gating` | `7909ee3a` | [orderbook-probe-gating](2026-11-19-orderbook-probe-gating.md) |
| `codex/desktop-empty-states` | `0396f11f` | [desktop-empty-states](2026-11-19-desktop-empty-states.md)（事后补记） |
| `codex/favorites-concurrency` | `0945c1c0` | [favorites-concurrency](2026-11-19-favorites-concurrency.md) |
| `codex/settings-protection` | `81b5f285` | [trading-protection-storage](2026-11-19-trading-protection-storage.md)（ADR 0057） |
| `codex/staking-account-isolation` | `f0348bc8` | [staking-account-isolation](2026-11-19-staking-account-isolation.md)（事后补记） |
| `codex/vault-earn-guards` | `3877b286` | [vault-earn-funds-guards](2026-11-19-vault-earn-funds-guards.md) |
| `codex/order-math` | `06a29016`、`046cef11` | [order-math-audit-fixes](2026-11-19-order-math-audit-fixes.md) |
| `codex/referral-apiwallet` | `ba6dca8e`、`6936980b` | [referral-initiating-account](2026-11-19-referral-initiating-account.md)（事后补记）、[referral-join-uppercase-leaderboard-title](2026-11-19-referral-join-uppercase-leaderboard-title.md) |
| `codex/geo-gate-signing` | `bb6f46bd` | [geo-gate-signing](2026-11-19-geo-gate-signing.md) |
| `codex/pin-unpinned-rules` | `a91dbfbc` | [pin-unpinned-guard-rules](2026-11-19-pin-unpinned-guard-rules.md) |
| `codex/funds-prechecks` | `dc9f01fc`、`96e709b8` | [external-wallet-deposit-recovery](2026-11-19-external-wallet-deposit-recovery.md)、[funds-prechecks](2026-11-19-funds-prechecks.md) |
| `codex/portfolio-history` | `f13de42f`、`f3326295` | [portfolio-history-exact-values](2026-11-19-portfolio-history-exact-values.md)（事后补记）、[history-filter-backfill-official](2026-11-19-history-filter-backfill-official.md) |
| `codex/a11y-high` | `90a7135a` | [a11y-assistive-values](2026-11-19-a11y-assistive-values.md)（事后补记） |

修复任务 `w1-i18n-missing` 没有改动：Codex 核查发现五个语言目录的在用条目没有空译文，`lingui extract` 报的缺失数等于废弃 `#~` 条目，因此没有分支。

### 被否决或判为不修的 Codex 说法（详见各记录）

- 测试与契约：`dead-code` 草稿的 `dead-code-cleanup-contract.test.ts` 撤掉（只断言文件不存在、文档含某些词，钉实现不钉规则）；`pin-unpinned` 发现删掉 Agent 授权签名后的租约检查新用例仍通过，是 transport 边界的第二层防护，不是缺口；`nonce` 草稿把一条既有用例改成与另一条重复的写法，改回。
- 存储与并发：`favorites` 第 7 项（未知字段里超出 double 的数字回写失真）只在应用自己写不出的手写文本上复现，判为不修并在 `hyperliquid-signing.md` 写明边界；草稿的 IndexedDB 回退删除。`orderbook-probe` 的门闩 `waitUntilAvailable` 可中止未采用（排队者最多本地等 5 秒，不触及 transport）。
- 资金：`external-wallet-deposit-recovery` 未采用 Codex 草稿（无哈希记录没有自动解除条件，会永久锁死；替换检测依赖先取原交易 nonce）。`vault-earn` 草稿把 Earn 空结论接到 `ledger.status === "ready"`，与原缺陷等价，重写；第 7 项（锁定判断用设备墙钟）评估为不改。
- 交易：`twap` 第 4 项（重复终止不去重）现象成立但不构成缺陷，交易所对已终止 TWAP 再次 `twapCancel` 明确拒绝。`order-math` 的 TWAP 子单估算 `~0.4`、预估滑点不受最大滑点截断、手机 builder fee 不逐单披露判为不改；统一账户权益口径与市价单在执行守卫处的最低名义判为待证实。`geo` 草稿拦了所有非零地址授权（会挡住退出所需的无名交易连接 Agent）与所有改单（含只减仓），两处都改掉。
- 发布与安全：`deploy-cli` 删除草稿的函数源码 `vm.Script` 预检（CloudFront Functions 2.0 的 `import cf from 'cloudfront'` 在脚本模式下会被误判），撤回对 ADR 0051 探活指引与 `describe-function` 调用方式的改动，并行发布锁只留设计。`ci-chart` 撤掉根目录软链拒绝与随机暂存目录；CI 按 GitHub 文档做威胁分析后不改工作流（理由在 ADR 0054）。
- 导出：`history-filter-backfill` 判定导出跟随筛选、写协议名两点按既有决定不改。

### 集成后补的文档同步（本次）

- 工作记录：18 份已有记录填上 `commits`；新增 8 份事后补记（a11y、资产组合第一轮、推荐第一轮、质押、桌面空状态、官网、hl-react 补测、手册改名）与本总记录。
- `CHANGELOG.md` Unreleased：补 a11y、资产组合与导出、TP/SL 父单被拒、Vault/Earn 五项、质押、桌面空状态、推荐第一轮、官网、发布脚本各条；把合并时落在旧批次的地区与交易保护两条移回本批 Fixed，把带点的市场链接与 nonce 两条从 Changed 移到 Fixed；本批三节按 Added / Changed / Fixed 排列，去掉列表中的游离空行。更早批次重复的 `### Changed` / `### Fixed` 标题在 `origin/main` 上就存在（未分版本的历史批次），没有合并，内容未删。
- 规范与 ADR：`docs/runtime-guardrails.md` §8 与 `deploy/cloudfront/README.md`（带点的市场路径）；ADR 0051 决策 5 与 ADR 0052 验证节补记（发布脚本）；`docs/hyperliquid-signing.md`（未知数值字段）；`docs/trading-notifications.md` 结果语义表与 ADR 0019 补记（被拒父单）；ADR 0053 补记（TWAP 终止的点击时身份）；ADR 0021 D12 补记与 `docs/hyperliquid-sdk-reference.md`（锁内守卫白名单）；ADR 0042 更正（地区判定下的 Agent 授权与改单）；`docs/website-plan.md` 第 6、7 节；`docs/trading-toolbar-redesign.md` History values；`docs/mobile-data-presentation.md`（账本空结论、桌面空状态）；`docs/reduce-only-repair-plan.md` 更正（Max 名称）。
- `AGENTS.md` 回归清单加入本批新增的 16 个终端测试文件（另一个 `mobile-order-funding-filter-backfill.test.tsx` 由分支自己加过）（官网与部署的 `.mjs` 测试不在该清单的 Vitest 分组里，没有加）。

## 验证与限制

- 本记录是流程与文档的汇总，不含新的运行时验证。各分支的验证读数（复现、变异、测试与类型检查）在各自记录；事后补记的分支只写提交与 diff 能证明的内容。集成分支整体的测试、构建与包体读数由主会话的集成验证另行记录，本记录写成时生产构建仍在后台运行。
- 文档同步之后运行了 `pnpm memory:check`、`git diff --check` 与读取文档或清单的契约测试，结果见本次任务的回复；没有运行 `pnpm memory:test`（它的夹具会做 Git 写操作）。
- 真实钱包、真实交易所回包、真机、真实 CloudFront 与 S3、真实读屏软件都没有验证。

## 后续与替代关系

待运营方决定：

- Scale 每档向下取整（以及随之修好的 Max 单调性）是否放宽确认面「显示即提交」的契约；试改补丁在本机。
- 普通撤单（`cancel`、`cancelByCloid`）是否像 TWAP 终止一样设入队等待上限。
- 无障碍的视觉与交互项：手机强平价与超额输入的可见非颜色标记、通知停留时长、订单簿提示可悬停、TIF 释义键盘可达、手机紧凑订单簿的非颜色区分。
- 外部钱包存款结清时，「授权过期未用」是否另写文案（现复用 `source-receipt-mismatch`），以及是否为外部钱包授权记录单独写 ADR。
- 导出与官方的三点差异：跟随筛选、写协议名、列。
- 其他导出遇到没有 `Retry-After` 的 429 是否统一等 60 秒（现只有成交导出改了）。
- 官网是否新增 axe 依赖与体积门禁（ADR 0056 下不得在 CI 请求外部服务）。
- 依赖收敛：终端 Tailwind 版本对齐，viem / wagmi / WalletConnect 收敛。
- `apps/terminal/src/lib/chart/index.ts` 的删除规则（取决于工作记录如何引用已删除文件）。
- 刷新后是否凭未决授权记录恢复「Deposit status unknown」警告（与「不重新打开隐藏通知」冲突）。
- 提款表单与成功通知的净到账额、费用两位小数四舍五入是否改为精确显示。
- `ExchangeResponseUnverifiedError` 是否扩到 `vaultTransfer`、`cDeposit`、`tokenDelegate` 等 Vault 与质押方法。
- 运维：轮换 IPdata 密钥；确认 Lambda 超时为 30 秒；删除 `gatu-app-old-history`；官网市场快照的 7 天规则（发布官网前在本机刷新）。
- 其余已在各记录列出：无名交易连接 Agent 在地区无法核实时是否拒绝、`updateLeverage` 等是否受本终端地区判定约束、探活失败后是否改为先核对再重传、并行发布锁、`CHART_LIBRARY_TOKEN` 范围、测试网验证 `normalTpsl` 父单被拒的真实回包。

本记录不替代任何记录；各分支的结论以各自记录为准。

## Gemini 终审第 1 轮后的修复

- P3-10（部署与图表库脚本，成立，已修）：`buildSyncPlan` 按 500 键分块；`buildReuploadCommands` 调 `assertFilterSafeKeys`；`aliases --execute` 的临时配置 `wx`/`0600` 新建并在 `finally` 删除；`fetch-chart-library.mjs` 改为「旧目录改名到旁边 → 暂存改名为目标 → 删旧」，失败回滚，中断后下次运行恢复（只认真实目录，之后照常按清单核对）。补记在 ADR 0051、0054 与 `deploy/cloudfront/README.md`。测试修前红、修后绿，四类变异均被抓到；`pnpm test:cloudfront` 123/123，`node --test scripts/*.test.mjs` 92/92（`serve-spa-static` 一项在沙盒内因本地端口失败，沙盒外 10/10）。未运行任何真实 `aws` 命令。
- P3-11（官网，成立，已修）：同一区块（同 `time`）的 `l2Book` 不再恢复被单边 `bbo` 撤回的报价，须 `book.t > quoteT`；`readInputs` 的 `JSON.parse` 失败退回空列表（保留静态内容）；删去未使用的 `PRE_IPO_QUOTE_BASES`。`pnpm --filter @sairn/website test` 102/102；`test:dist`（Node 24.15.0，沙盒外先构建）64/64；把 `>` 改回 `>=` 的变异使新用例变红。没有真实浏览器检查。
- P2-2（交易保护冷启动，成立，已修）：基线写入、投影补写各自尽力而为，失败不改读出值；基线写入被拒时用内存里的旧记录值作回退基线，读取抛错时取最严格值。同时修了配额满时改任一设置会把 `QuotaExceededError` 抛给调用方的问题。ADR 0057 追加补记，运行时规则 §12 加两条。`global-settings-cross-window.test.ts` 新增 5 项（修前全红），三处关键行变异均被抓到。仅 jsdom 模拟，真实浏览器配额未验证。
- P3-3（`clear()` / `removeItem` 存储事件，成立，已修）：`localStorage` 上的删除事件也按「取更严格者」同步，只收紧；另一窗口删掉更严格的独立键不放宽已打开窗口（有用例固定）。新增 2 项修前红，恢复旧的早退即变红。
- P3-4（市场偏好更高版本，成立，已修）：`use-market-store.ts` 改为一次读取先判版本，版本高于 3 时不校验、不清除、不写回，冷启动显示其中能通过本版本校验的偏好，本窗口修改只留在内存。原有「较新版本被 v3 覆盖」的用例与新契约冲突，已改由新用例覆盖。新增 3 项修前红，三处变异均被抓到。
- P3-2（`useExchange` 法律复核信号，成立但影响极小，已修）：用户签名资金动作锁内的 `verifyLegalAccess` 改用 `guardSignal`。读代码确认：守卫超时后启动闸门立即拒绝，调度器 `rejectEntry` 随即中止外层信号，原实现只是晚几个微任务结束等待，不会多发请求或签名。`use-exchange-funds-action-lock.test.tsx` 新增 1 项（守卫在 10 秒超时的同一时刻法律等待已被中止），修前红，换回其他信号的变异变红。资金锁语义未改。
- P2-4（桌面 Funding 工具栏，成立，已修）：工具栏合计与正文共用 `unconfirmed` 条件，空快照过期/离线/出错时不再显示 `Funding shown $0.00`。`desktop-history-exports.test.tsx` 三例修前红、修后绿；去掉 `isStale` 的变异变红。
- P3-6（手机历史页签，两处都成立，已修）：成交页签读屏条数按「实时快照当前，且筛选关闭或已能下结论」门控，与委托、资金费页签相同；三个手机页签内部组件键加网络。`mobile-fill-filter-backfill`、`mobile-order-funding-filter-backfill` 新用例修前红、修后绿；去掉 `liveCurrent` 或放开筛选条件的变异各自变红。
- P3-8（手机逐仓按钮，成立，已修）：名称保持静态动词，`aria-describedby` 指向按钮内隐藏的「金额 + Isolated」。`position-accessible-values.test.tsx` 修前红、修后绿；描述去掉金额的变异变红。
- P3-5（清算价手续费，成立，已修前半）：全仓权益按「整笔手续费 × 截量后下单量 ÷ 草稿数量」扣除，同方向只减仓不再扣费。`prospective-liquidation.test.ts` 修前红、修后绿，两种变异（扣整笔、不扣）均变红。`buildOrders` 不加只减仓与 TP/SL 互斥的兜底：静默丢 TP/SL 会让提交与确认框不一致，拒绝则要新增文案，`order-entry-surface-parity.md` 已记录草稿层互斥的取舍，未改。
- P3-7（导出钩子与 CSV，成立，已修）：删去渲染期已赋值导致恒假的身份判断，身份变化时直接中止（`use-history-export-runner` 3/3，去掉中止的变异变红）。OWASP 页面（2026-11-20 读取）未列前导空格，但会裁剪单元格的导入器会暴露触发字符，且协议值从不以空白开头，故公式判断允许前导空白（含全角空格）；合法数字与 `@N` 不受影响。`csv.test.ts` 修前红、修后绿，只认 ASCII 空格的变异变红。各表格软件的实际导入行为未实测。
- P2-1（外部钱包加速/替换存款的恢复扫描，成立，已修）：恢复 RPC 的最新块低于 `sourceBlock` 时按 pending 等待、不再查日志；`eth_getLogs` 每段 2,000 块（Arbitrum 官方未给公共 RPC 的范围上限，取常见 10,000 上限以下的保守值），每段同时取段末块时间，到达 `validBefore` 即停；校验通过的消耗交易哈希存进与记录同键的旁路条目（不改记录本身，避免旧版本标签页删除带未知字段的记录），之后只复核该交易。最坏情况：授权已用但任何一段都找不到日志时保持可重试，直到 30 天上限清除。`use-cctp-deposit-tracking` 新增 4 项修前红；`cctp-deposit-tracking` 新增 2 项存储用例。五处关键行变异均被抓到。未连真实 Arbitrum RPC。
- P3-1（链上已确认授权过期，成立，已修）：链上确认过期未用时，连同该 nonce 的本地未决授权一起移除（`CctpDirectAuthorizationExpiredError`，沿用原文案）；回滚或回执不符时保留到过期，另一 nonce 的占位不动。新增 3 项，修前 1 项红；两处变异均被抓到。
- P2-3（自动存款授权重检定时器，成立，已修）：定时器绑定「网络 + 账户」范围，范围变化或存款成功时取消，到期回调与安排时都核对当前范围。`embedded-deposit-auto-bridge.test.tsx` 新增切账户、切网络（两网各跑）与成功后三项，修前红；两道范围检查单独去掉任一仍绿（互为兜底），同时去掉变红；去掉成功时清理变红。不新增签名路径，符合 ADR 0040。
- P2-1 收口（授权已用但完整扫描找不到日志，原残留「最长 30 天」，已修）：`authorizationState` 为真即不可重放，拦截新存款的理由已不成立。完整扫描（全部请求成功、覆盖到 `validBefore` 上界、链上时间超过 `validBefore` 600 秒）仍为空才算一次，查询不重试、每次相隔一个 5 秒轮询，3 次后按「结果未知」结清：删记录与该 nonce 的未决授权、停轮询，页面级通知器显示持久的 `Deposit status unknown`（复用现有文案，不画成失败）。请求失败、超时、窗口内为空均不计数。最坏约为签名后 70 分钟；RPC 一直不可用与 Circle 永不转发两行仍是 30 天上限（本次未改）。扫描进度不持久化（理由见 `docs/cctp-deposits.md`）。新增 4 项钩子用例、1 项通知器用例，修前红；6 处变异均被抓到。

## Gemini 终审第 2 轮后的修复
- P3-2（损坏记录清理，成立，已修）：`use-global-settings-store.ts` 与 `use-market-store.ts` 的损坏记录删除改为尽力而为（`discardStoredSettings` / `discardStoredRecord`），删除被拒时记录保留、本次读取按缺失处理。修前在只读删除的存储上冷启动跳过独立键读取，滑点停在 `2.5%`（应为独立键值或 `0.1%`），收藏编辑抛错；新增 5 个 jsdom 用例修前红、修后绿，去掉 `try/catch` 的变异分别变红 3 / 2 个。估计启动块 gzip +8 / +10 字节（单文件 esbuild 压缩后 gzip 对比，非整包实测）。
- P3-3（`aliases` 临时文件，成立，已修）：`writeFileSync(..., { flag: "wx" })` 移到 `try` 之前，同名文件已存在时报 `EEXIST`、不发 `update-distribution`、不删除该文件。`deploy-cli.test.mjs` 新增子用例修前红、修后绿（模拟 `execFileSync` 与 `writeFileSync`，PATH 隔离）。
- P2（存款弹窗打开期间跟踪结清，三步均成立，已修）：结清结果从各 hook 实例的 ref 移到按 QueryClient 共享的内存存储（按网络 + owner 分组，`unacknowledgedOutcomes` / `acknowledgeOutcome`），新记录不再替换未呈现的结果。弹窗在存款页且无在途存款时显示 `Deposit status unknown`（新增 `unknown` 图标，用现有 `BRAND_MOTION_UNKNOWN`）或 `Deposit failed` 状态屏，关闭即确认；否则弹窗关闭后由通知器呈现并确认，呈现过的不再重复。`deposit-modal-withdrawal-routing-guard` 新增 3 项真实 `DepositModal` + 真实跟踪 hook + 通知器 + 模拟 Arbitrum RPC 的联合用例（修前 3 项全红），通知器新增 2 项、hook 新增 1 项；RPC 替身移到 `harness/cctp-authorization-chain.ts` 共用。5 处变异（弹窗不显示、关闭不确认、通知器跳过、hook 不过滤已确认、见下 P3）均变红。不新增文案；仅 jsdom，未在真实浏览器或真实钱包验证。
- P3-1（存款点击时限的错误归类，成立，已修）：`handleDepositSubmit()` 的 `catch` 单独识别 `ExchangeActionDeadlineError`，表单显示现成的「checks took too long」文案、路由状态保持就绪；原 16 秒用例改断言新反馈（修前红、修后绿，改回 `unavailable` 的变异变红）。ADR 0053 补记一行。
- P2 补修（全量测试发现，`cctp-deposit-notification-lifecycle.test.tsx` 6 项红）：6 项共同报错是模拟缺 `unacknowledgedOutcomes`，补齐模拟（按网络 + owner 记录确认）后 5 项转绿，「快速离开再回到 owner 后失败通知仍在」仍红，是实现回归：通知器在创建通知时就确认结果，切换身份时系统移除通知后切回不再显示。改为只有用户关闭通知（`onDismiss` 且不是身份切换或弹窗打开时的系统移除，`retired` 标记）或关闭弹窗状态页才确认；通知还在屏上时打开弹窗也先显示状态页。3 处变异（身份清理不标 `retired`、关闭不确认、恢复创建即确认）均变红。引用该 hook / 通知器 / 模拟该模块的测试共 9 个文件，连同部署弹窗相关契约共 33 个文件 1199 项通过；typecheck、biome 通过。
