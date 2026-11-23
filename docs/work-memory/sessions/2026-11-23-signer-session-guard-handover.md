<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-23-signer-session-guard-handover",
  "date": "2026-11-23",
  "title": "签名与发送边界的会话检查（ADR 0058）：拆分后的交接与重构方案",
  "kind": "task",
  "status": "recorded",
  "topics": ["wallet-onboarding", "account-funding", "pr-review"],
  "summary": "资金会话任务（2026-11-21 记录）在第八轮审查后由运营方拆成两条线。展示层与结果归属收窄后作为 PR 1 在分支 claude/funds-session-and-api-wallet-quiet 提交（fce35f78）。本分支 claude/signer-session-guard 在 fce35f78 之上取回拆分前快照 claude/signer-session-guard-presplit（df2703fe）的纯执行层文件：hl-react 会话世代与退役原因、guardSigning/guardSending、阶段、owner signer、构建费与交易授权的改写、主动断开退役、手动存款会话守卫（use-deposit.ts）、Agent 授权 beforeSign、质押与 TP/SL 的没有发出分类、ADR 0058 与签名规范。存款弹窗的会话接线没有取回，要按运营方 2026-11-23 的决定重写：签名后只等一次（外部钱包上限 30 秒，赞助路径选项 A），等待严格早于全部新鲜复查。第八轮审查剩 5 条 P2、2 条 P3，重构方案见正文。",
  "thread": null,
  "baseCommit": "fce35f78",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0058-signer-session-guard.md" },
    { "path": "docs/wallet-session-reconnect-practice.md" },
    { "path": "docs/work-memory/sessions/2026-11-21-funds-session-and-api-wallet-quiet.md" },
    { "path": "packages/hl-react/src/internal/exchange/request-scheduler.ts" },
    { "path": "packages/hl-react/src/session-provider.tsx" },
    { "path": "packages/hl-react/src/clients.ts" },
    { "path": "packages/hl-react/src/signing/owner-signer-provider.tsx" },
    { "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/hooks/wallet/use-explicit-agent-approval.ts" }
  ],
  "supersedes": []
}
-->
# 签名与发送边界的会话检查（ADR 0058）：拆分后的交接与重构方案

## 背景与范围

同步记录，2026-11-23，由编排会话写给接手执行层的会话，未取得任务标识。前情见 [资金会话任务记录](2026-11-21-funds-session-and-api-wallet-quiet.md)（第七轮、第八轮、拆分、收窄各节）与 [钱包会话重连实践指南](../../wallet-session-reconnect-practice.md)（取证、官方终端、负责人决定）。

- 拆分前的完整快照：分支 `claude/signer-session-guard-presplit`，提交 `df2703fe`（展示层与执行层混在一起，存款弹窗里有三次最长 70 秒的等待）。
- PR 1（展示层与结果归属，已收窄）：分支 `claude/funds-session-and-api-wallet-quiet`，提交 `fce35f78`，本地提交，未推送。
- 本分支：`claude/signer-session-guard`，基于 `fce35f78`，取回 `df2703fe` 的纯执行层文件（见上方 sources 与 `git diff fce35f78`）。`deposit-modal.tsx` 保持 PR 1 版本，没有把 `session` 传给 `deposit()`，所以 `use-deposit.ts` 的会话守卫目前不生效，需要按下面的方案接上。

## 结论与依据

### 负责人决定（2026-11-23，运营方在对话里回答）

1. PR 1 收窄后交付（已执行，不属于本分支）。
2. 赞助的邮箱手动存款（smart 路径）签名后会话未定：选项 A。只等一次，回到点击时的账户后重做全套新鲜复查（路由、余额、法律、smartClient）再广播；超时或换了身份就停下，不改法律门契约。
3. 外部钱包存款签完授权后、再弹发交易确认之前只等一次会话，独立上限 30 秒，不跟界面的保留期挂钩；超时报「Wallet not connected」，不发送。

更早的负责人决定（2026-11-22）：签名返回时会话只是仍未定，照常发送；任何钱包弹窗之前严格核对会话。

### 第八轮审查剩余问题（Codex `gpt-6.2-sol`，2026-11-23，本次改动 6/10，总体 5/10，未发现 P1）

| # | 严重度 | 来源 | 问题 |
| --- | --- | --- | --- |
| 1 | P2 | 既有 | Privy 3.46 的 `wallet.switchChain` 在未知链时自己发 `wallet_addEthereumChain` 与第二次切链，绕过存款代理 |
| 2 | P2 | 拆分前引入 | 两条存款路径在法律复查与钱包检查之后才做最后一次等待，等待跨过中断后沿用了等待前的结果 |
| 3 | P2 | 拆分前修复不完整 | 存款尝试没有绑定到单次开窗，同账户关窗与重开合并为一次 React 提交时旧尝试看不到关闭 |
| 4 | P2 | 既有 | 显式 Agent 审批的 `beforeSign` 不校验注册会话租约与世代 |
| 5 | P2 | 既有 | 外部存款 `-32000` 后回退 `wallet_sendTransaction` 再被 4001 拒绝时按最终错误删除意图；一次也没转发时仍报结果不明 |
| 6 | P3 | 拆分前引入 | 共享包断线期间切换环境，旧身份的未定世代不升级 |
| 7 | P3 | 交付 | 新测试文件曾未进补丁（本分支已纳入） |

### 重构方案（来自运营方 2026-11-23 提供的分析，编排核对过其中的依赖源码说法）

依赖源码（锁定版本，编排 2026-11-23 本地核对）：`@privy-io/wagmi` 的 `useSyncPrivyWallets` 在钱包移出目录时把 wagmi 写成 `disconnected` 且清空连接，`WagmiProvider` 强制 `reconnectOnMount: false`；Privy 3.46 `wallet.switchChain` 直接调用 `this.proxyProvider.request`，4902 时（Rabby 先等 300ms）先加链再切；viem `sendTransaction` 发送前读一次 `eth_chainId`，`eth_sendTransaction` 报 InvalidInput / InvalidParams / MethodNotFound / MethodNotSupported 时回退 `wallet_sendTransaction`。官方终端生产包的事实见实践指南「官方交易终端实现补充（2026-11-23，运营方只读取证）」，未经编排复核。

- 保留第八轮确认成立的 hl-react 核心：session-provider 按 `unresolved` / `replaced` 退役；owner signer provider 只在同一身份内、之前的绑定带 owner 钱包时退役；`guardSigning` 签名前严格；`guardSending` 签名后只拦 `replaced`；阶段分类；发出之后的检查不报没有发出。
- 存款执行链拉直：所有钱包请求都经过同一层受保护的 EIP-1193 provider（不再调用 `wallet.switchChain`，改用 `requestDepositChainSwitch`，保留 Rabby 300ms 兼容）；签名后只等一次（决定 2、3），等待严格早于全部新鲜复查（路由、费率与额度、余额与 gas、法律、账户与链），之后是同步闸门与发送或广播，不再有长等待；这段短尾里会话再变就静默停下、不保存意图，不带过期复查结果进入广播。
- 存款尝试绑定点击时的 `getGlobalModalOpening()`，同步读取。
- 显式 Agent 审批的 `beforeSign` 用与 `beforeSubmit` 同一来源校验注册租约。
- 转发台账作为外部存款结果的唯一依据：单调的 `hasUncertainSend`（任何一次转发得到非明确未广播的错误码）保留意图并报结果不明；只有一次也没转发、或每次转发都被明确拒绝时才删意图。可选：`assertDepositChainStillActive` 之后给 `writeContract` 传 `chain: null` 去掉 viem 多读的那次 `eth_chainId`（先核对 Arbitrum 的格式化行为）。
- session-provider：网络变化时即使仍断线，也退役最后一次确认的身份。
- 补一条经过 `GlobalModals`、真实 `DepositModal` 与真实 `useDeposit` 的端到端用例。
- 更新 ADR 0058（决策 5 改为单次等待与上限、赞助路径选项 A、转发台账），以及签名规范、展示规范、CHANGELOG。

## 验证与限制

- 本分支建立时（编排，2026-11-23）：在 `fce35f78` 之上取回 `df2703fe` 的执行层文件后，`pnpm typecheck` 通过；全量终端 Vitest（本机，`--maxWorkers=4`）768 个文件、11,619 个用例通过，1 个文件跳过；Biome 检查 24 个改动文件通过。注意：这时存款弹窗没有把 `session` 传给 `deposit()`，`use-deposit-routing-guard.test.tsx` 里的会话用例直接给钩子传桩会话，只证明钩子内部，不证明弹窗接线。新工作树的图表库从 PR 1 工作树本机复制（`apps/terminal/public/charting_library`，被 Git 忽略）。
- 没有浏览器、真机或真实钱包验证。

## 后续与替代关系

- 按上面的方案重构并修第八轮 1–6 条；重构前不要在拆分前的三次等待上继续叠补丁。
- PR 1 收窄时移出的事项（E2 场景草稿丢失、请求发出后账户模式变化吞掉结果、解析中发出的通知在切到另一账户后不撤下、法律门沿用期间重开同类窗卸载提款宿主、首次解析期间挂载的发送不恢复重试草稿）记在 PR 1 的任务记录里，不在本分支范围，除非运营方另行决定。
