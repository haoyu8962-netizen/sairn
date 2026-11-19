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
