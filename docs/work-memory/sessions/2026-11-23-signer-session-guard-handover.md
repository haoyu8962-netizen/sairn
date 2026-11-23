<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-23-signer-session-guard-handover",
  "date": "2026-11-23",
  "title": "签名与发送边界的会话检查（ADR 0058）：拆分后的交接、重构与三轮复查",
  "kind": "task",
  "status": "recorded",
  "topics": ["wallet-onboarding", "account-funding", "pr-review"],
  "summary": "资金会话任务（2026-11-21 记录）在第八轮审查后由运营方拆成两条线。展示层与结果归属收窄后作为 PR 1 在分支 claude/funds-session-and-api-wallet-quiet 提交（fce35f78）。本分支 claude/signer-session-guard 在 fce35f78 之上取回拆分前快照（df2703fe）的纯执行层文件（e170258c），之后由接手会话按运营方 2026-11-23 的决定重写手动存款执行链：所有钱包请求经同一层受保护的 provider（不再调用 Privy 的 switchChain）；许可签名后只等一次会话回到点击账户，30 秒上限按墙钟与单调时钟中先到者计，早于全部新鲜复查；赞助路径选项 A（超时或换身份就停下，广播用等待后重新取得的智能钱包客户端）；之后只剩复查、同步闸门与发送或广播，短尾里再中断就静默停下，中断期间复查失败时只有尝试作废才静默；存款尝试绑定点击时的全局开窗标识并单向作废；外部存款结果只看转发台账，不明确的一次转发之后不再转发第二次；弹窗把会话检查接到 deposit()。另修显式 Agent 审批 beforeSign 的注册租约检查（与 beforeSubmit 同源，带取消信号与锁后时限复核）与 session provider 断线期间换网络退役最后确认身份。新增经过 GlobalModals、真实 DepositModal 与真实 useDeposit 的端到端用例。三轮 Codex 复查评分 5/4、7/6、8/7（本次/总体），第三轮之后的双时钟小修未再送审。运营方把赞助路径交给 Privy SDK 之后的内部窗口记为已知限制，并要求三项加固：作废之后结束的发送不写任何可见结果、提交期间弹窗挡在前面（既有，以端到端用例钉住）、调用处注释与文档写明理由；这批加固未再送审。全量终端 Vitest 通过。",

  "thread": null,
  "baseCommit": "fce35f78",
  "commits": ["e170258c", "60adb067"],
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
    { "path": "apps/terminal/src/hooks/wallet/use-explicit-agent-approval.ts" },
    { "path": "apps/terminal/src/lib/hyperliquid/deposit-session-attempt.ts" },
    { "path": "apps/terminal/src/lib/tests/deposit-session-global-modals.test.tsx" },
    { "path": "docs/hyperliquid-signing.md" }
  ],
  "supersedes": []
}
-->
# 签名与发送边界的会话检查（ADR 0058）：拆分后的交接、重构与三轮复查

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

## 执行（2026-11-23，接手会话）

同步记录，由接手执行层的会话写，未取得任务标识。按上面的重构方案实现，在 `e170258c` 之上的未提交改动里；代码与测试的逐条证据见下表，验证结果见「验证与限制」。

| # | 处理 | 代码 | 修改前会失败的测试（变异检查） |
| --- | --- | --- | --- |
| 1 | 已修。不再调用 Privy `wallet.switchChain`，切链与加链都经存款代理（`requestDepositChainSwitch`），Rabby 加链前等 300ms；未知链的识别加上 Privy 认的 Coinbase（`addEthereumChain`）与「4902」写法 | `use-deposit.ts` | `use-deposit-routing-guard.test.tsx`「does not ask the wallet to add the chain once the session became unresolved during the first switch」「switches through the wallet's own provider exactly once…」「lets Rabby settle…」「adds Arbitrum when $wallet reports the chain unknown」；改回 `wallet.switchChain` 时 122 例失败，去掉 Rabby 等待 1 例，改回旧正则 1 例，去掉代理的弹窗检查 2 例 |
| 2 | 已修。签名后只等一次（`awaitSettledSession`，`DEPOSIT_SESSION_SETTLE_TIMEOUT_MS` 30 秒），早于全部新鲜复查；之后是复查、同步闸门 `assertSettledTail`（尝试未作废、中断计数不变、仍定在点击身份）与发送或广播；短尾里再中断静默停下，因中断失败的复查也静默；赞助路径改用等待后重新取得的智能钱包客户端；两条路径超时都报「Wallet not connected」 | `use-deposit.ts`、`config/time.ts` | 「waits once, with the independent 30-second limit…」「runs no fresh check while it waits…」「stops a sponsored deposit quietly when its session is interrupted during $step after the wait」「stops quietly when the session is interrupted again during $step after the wait」「stops a sponsored deposit quietly when an interrupted fresh check fails」「does not send a $mode deposit and says so…」；变异：加回第二次等待 6 例、等待挪到第一次路由复查之后 29 例、闸门不看中断计数 4 例、去掉中断后的静默转换 1 例、上限改 70 秒 14 例、赞助超时继续 3 例、沿用旧智能钱包客户端 1 例、去掉赞助广播前闸门 4 例、去掉代理发送闸门 7 例 |
| 3 | 已修。尝试记下点击时的 `getGlobalModalOpening()`，检查时同步读取；开窗变了就单向作废 | 新文件 `lib/hyperliquid/deposit-session-attempt.ts`；`deposit-modal.tsx` 接线 | `deposit-modal-withdrawal-routing-guard.test.tsx`「voids a started deposit's session when its dialog is closed and opened again within one commit」等 12 例（「the session of a started deposit」）；变异：只把关窗当作废 1 例、快照不读开窗 7 例、读时不锁定作废 3 例、提交时不锁定作废 1 例（补了「stays void when the session visits another account and comes back before anything reads it」之后才变红）、不计中断 1 例、卸载不作废 2 例、提交时不报告快照 7 例、不传 `session` 13 例 |
| 4 | 已修。`beforeSign` 改为 async：同步核对会话与地区 → 锁内 `isAgentRegistrationExecutionLeaseCurrent` → 再核对一次；两个 Agent 签名器 `await beforeSign()` | `use-explicit-agent-approval.ts`、`external-agent-signer.ts`、`privy-agent-signer.ts` | `use-explicit-agent-approval.test.tsx`「does not open the external wallet prompt when the registration session ends while the real SDK reads the chain」（真实签名器、SDK 与注册会话）；两个签名器各一例 async 拒绝；去掉 `beforeSign` 的租约检查 1 例失败，签名器不 await 4 例失败 |
| 5 | 已修。转发台账 `hasUncertainSend` 单调：任何一次转发得到回答或以非明确拒绝失败即为真；它唯一决定外部存款是否保留意图与是否报结果不明；`isDepositSubmissionOutcomeUnknown` 改由 `directSubmissionUncertain` 决定。可选的 `chain: null` 没有采用（请求会不带 `chainId`，钱包无法拒绝链不符的发送） | `use-deposit.ts`、`deposit-submission-outcome.ts` | 「keeps the authorization and the unknown outcome when an unclear send is followed by a refused fallback」「reports an ordinary failure and releases the authorization when nothing reached the wallet's send」；按最终错误删意图的变异 4 例、开始发送即结果不明 5 例。「external wallet submission without a transaction hash」一组原先直接在钱包客户端层模拟错误、绕过 provider，改为经 provider 转发（生产中 `writeContract` 一定经过它） |
| 6 | 已修。网络变化时即使仍断线也退役最后一次确认的身份 | `packages/hl-react/src/session-provider.tsx` | `provider-address.test.tsx`「retires the last confirmed identity when the network changes while the session is still disconnected」；去掉新条件时失败。调度器是桩，`markExchangeIdentityReplaced` 自身的升级由 `exchange-signer-session-guard.test.ts` 覆盖 |
| 7 | 本分支建立时已纳入 | — | — |

实现时的选择（不是负责人决定）：赞助路径等待超时时与外部路径显示同一条「Wallet not connected」（决定只说「超时就停下」）；中断计数按「每次提交时会话不在点击身份上就加一」计；新的点击作废上一次的尝试；只读复查在中断时不被打断，跑完才在闸门停下。

变异由本会话逐项改源码、跑对应测试、用备份恢复（脚本在会话 scratchpad，不在仓库）；数字是失败的用例数。

### 第一轮 Codex 复查（2026-11-23，`gpt-6.2-sol`，只读，medium）

审查对象是 `e170258c` 之上的未提交改动（含端到端用例）。评分：本次改动 5/10，含 HEAD 执行层、相对 `fce35f78` 的总体资金安全 4/10。Codex 只做静态阅读，没有跑 Vitest 或变异。第八轮第 1、3、6 条判为已修，第 2、4、5 条判为部分修（剩余缺口即下表第 1–5 条）。原文在会话 scratchpad 的 `review/r1.out`，不在仓库。

| # | 严重度 | 来源 | 发现 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | P1（Codex） | 修复不完整 | 赞助路径的闸门在调用 Privy 智能钱包 `sendTransaction` 之前；Privy 随后在 SDK 内部准备 UserOperation、用内嵌钱包自己的 provider 签名、发给 bundler，这一段换账户或关窗仍会广播 | 未改代码，写入 ADR「未覆盖的范围」并待运营方决定。发出的是点击 owner 自己签了授权的 USDC、进同一 owner 的账户，不是以另一身份发出；要在 SDK 内部拦住只能弃用 Privy 的 `sendTransaction` 改为自己分步调用，会丢 Privy 的数据后缀与界面状态，本机无法验证 |
| 2 | P2 | 本次引入 | 中断计数两处漏点：同一批更新里 A → 未定 → A 不产生提交；等待以 `"same"` 唤醒后、调用方恢复前的提交被吸收进新基线 | 后者已修：`waitUntilSettled` 交回定案那一刻的中断次数（`DepositSessionWaitResult`），闸门以它为基线，等待一结束就再查一次。前者不改：应用里所有检查都以提交为观察单位，这样的闪动对它们都不存在；写入 ADR |
| 3 | P2 | 本次引入 | 显式 Agent 审批的锁等待可能跨过 15 秒签名时限 | 已修：锁返回后先查 `assertExchangeSigningDeadline` 再核对会话与地区 |
| 4 | P2 | 修复不完整 | 第一次发送不明确、viem 回退拿到第二笔哈希时，第一笔可能已消费授权，第二笔回滚后报「Deposit failed」 | 已修：台账为真之后代理不再转发任何发送，回退不会发出第二笔，结果保持不明、意图保留 |
| 5 | P2 | 本次引入 | 等待之后的复查因会话中断以外的原因确定失败时（法律拒绝、费率变化），只要碰上一次中断就被静默吞掉；普通失败后删意图失败只报那个失败 | 前半已修：中断期间复查失败时，只有尝试已作废才静默，否则照常报告。后半是既有行为，记为后续 |
| 6 | P2 | 既有 | 已交给钱包的旧存款结果会关闭同一账户之后新开的存款弹窗 | 记为后续（结果归属属于 PR 1 那条线） |
| 7 | P3 | 本次文档 | CHANGELOG、ADR、签名规范、展示规范有几处宽于实现；ADR 把 viem 的 `eth_chainId` 写在「闸门之后」 | 已改：分开写应用闸门、viem 读链与代理闸门的先后，赞助路径写明闸门在 Privy SDK 入口，CHANGELOG 收窄到外部钱包与 Agent 的 Hyperliquid 请求、30 秒提示的条件与 Privy 之后不再停下 |

变异（本会话逐项改源码、跑测试、恢复）：闸门基线改为恢复后再读 2 例失败；尝试交回实时计数 1 例；去掉锁后的时限检查 1 例；台账之后继续转发 2 例；中断即静默 1 例；作废也不静默 1 例。新增用例：`use-deposit-routing-guard.test.tsx`「reports a fresh check that fails after an interruption unless the attempt was voided」2 例、「stops a $mode deposit quietly when the session is interrupted between the end of the wait and the deposit resuming」2 例、「does not send again after an unclear send…」2 例（取代原来的「-32000 之后回退被 4001 拒绝」一例）；`use-explicit-agent-approval.test.tsx`「does not open the external wallet prompt when its click deadline passes while the registration lock is held」；新文件 `deposit-session-attempt.test.ts` 5 例。

### 第二轮 Codex 复查（2026-11-23，`gpt-6.2-sol`，只读，medium）

审查对象是第一轮修复之后的同一批未提交改动。评分：本次改动 7/10，总体资金安全 6/10，没有 P1；上一轮的赞助 SDK 窗口改判 P2，Codex 认为写入 ADR 并交运营方决定成立。第八轮第 1、3、4、5、6 条判为已修，第 2 条判为部分修（剩余即下表第 1、2 条）。原文在会话 scratchpad 的 `review/r2.out`，不在仓库。

| # | 严重度 | 来源 | 发现 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | P2 | 修复不完整 | 30 秒等待只靠 `setTimeout`：计时器回调被延后时，上限之后的恢复仍被接受为 `"same"` | 已修：等待记下单调时钟的截止时间，定案前都查它，过了就是超时；作废仍优先 |
| 2 | P2 | 修复不完整 | 赞助路径交给 Privy 之后的 SDK 内部窗口（第一轮第 1 条） | 未改，待运营方决定（同第一轮） |
| 3 | P2 | 修复不完整 | 外部存款进了 `writeContract`、viem 读链 ID 失败而还没转发时，已作废尝试的普通失败仍写进共享状态、可能在新弹窗里提示 | 已修：静默条件改为「没有赞助提交、台账为假、尝试已作废」，不再要求还没开始外部发送 |
| 4 | P2 | 本次引入 | 显式 Agent 审批取消后仍排在租约锁的队列里，`mutateAsync` 要等锁释放才结束 | 已修：`isAgentRegistrationExecutionLeaseCurrent` 接收可选的 `signal` 并传给 Web Lock，`beforeSign` 等锁后先查取消（`AbortError`）再查租约 |
| 5 | P2 | 既有 | 存款结果与开窗标识未绑定；普通失败后删意图失败只报原失败 | 记为后续（同第一轮第 5 条后半与第 6 条） |
| 6 | P3 | 修复不完整 | 签名规范说「每个钱包请求都经过代理」；`sponsoredSubmissionStarted` 注释说已交给 bundler；ADR 说其他检查都以提交为单位，实际法律守卫在渲染时写引用；Agent 时限用例名说持有注册锁，实际挂起的是租约检查桩 | 已改文档与注释，用例改名为「…while its lease check is pending」；原生 Web Locks 的排队与释放顺序仍没有真实浏览器验证 |

变异：去掉等待的截止时间检查 1 例失败；截止之后不保留作废 1 例；静默条件改回「还没开始外部发送」1 例；不把取消信号传给锁（终端或 hl-react 任一处）目标用例超时失败（其后 20 例因锁桩未恢复而连带失败，只在变异时出现）；等锁后不先查取消 1 例。新增用例：`deposit-session-attempt.test.ts` 3 例、`use-deposit-routing-guard.test.tsx`「stops quietly when a voided attempt's chain read fails inside writeContract before anything was sent」、`use-explicit-agent-approval.test.tsx`「stops waiting for a registration lock held elsewhere once the approval is aborted, and opens no prompt」。

### 第三轮 Codex 复查（2026-11-23，`gpt-6.2-sol`，只读，medium，窄范围）

只核对第二轮之后的修复并重新评分。评分：本次改动 8/10，总体资金安全 7/10，没有 P1。第二轮第 3、4、6 条确认已修，第 1 条部分修（见下表第 1 条），第 2、5 条维持已记录。对第八轮 1–6 条的最终结论：第 1、3、4、5、6 条已修，第 2 条部分修（系统休眠时的上限，已在本轮之后修；赞助 SDK 内部窗口待运营方决定）。原文在会话 scratchpad 的 `review/r3.out`，不在仓库。

| # | 严重度 | 来源 | 发现 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | P2 | 修复不完整 | 设备休眠时 `performance.now()` 可能停走（WebKit），30 秒上限仍可被越过 | 已修：上限按墙钟与单调时钟中先到者计，与 ADR 0053 的签名时限相同；新增「does not accept a return after a device sleep that only the wall clock counted」；只看单调时钟、只看墙钟的变异各让 1 例失败。这次修复没有再送审 |
| 2 | P3 | 既有相邻路径 | 显式 Agent 审批签名返回之后、发送之前的锁排队不能立即取消 | 记为后续，写入 ADR |

按本会话对运营方的说明（存款这一块连续两轮没有完全过线，第三轮再出现新的 P2 就停下请运营方决定），第三轮之后只做了上面这一处小修，没有再开第四轮。

### 运营方决定与加固（2026-11-23，第三轮之后）

运营方对赞助存款交给 Privy 之后的 SDK 内部窗口选择「记为已知限制」，并给出三项低成本加固（原话在对话中，由本会话转述）：第 1 项必做，回调写状态前校验账户快照，账户已变时不把结果写进新账户的待处理状态、余额刷新或错误提示，要么静默丢弃，要么明确提示是原账户的存款；第 2 项推荐，提交期间禁用切账户入口或在切换时提示；第 3 项，在代码注释与已知限制文档里写明三点理由（只入原账户、无跨账户风险；保留 `sendTransaction` 是为了 Privy 的 `dataSuffix` 与官方路径；本地没有真实智能钱包验证环境）。

| 项 | 处理 | 证据 |
| --- | --- | --- |
| 1 | 选「静默丢弃」：发送或广播结束时尝试已作废，执行状态回到空闲并清掉哈希，不刷新余额、不提示；追踪记录与授权意图留给点击 owner，由页面级追踪在该 owner 重新成为当前账户时报告。执行状态键本来就含钱包地址，另一账户读不到；这一条另外避免同一 owner 之后再开存款弹窗时冒出过期提示或被立即关窗。没有选「明确提示」，因为它要在另一账户的界面里显示原账户的地址与结果，还要为 7 种语言新增文案 | `use-deposit-routing-guard.test.tsx` 新增 5 项、改写 3 项（钱包回答不明确或被拒而尝试已被替换时，原先报「Deposit status unknown」，现在不写可见结果、按台账保留或释放意图）；`deposit-session-global-modals.test.tsx` 新增「keeps a transaction the wallet sends after the session moved to another owner out of that owner's view」；变异 4 项均有用例失败 |
| 2 | 既有行为已满足：从点击到拿到哈希，存款弹窗是不可关闭的待确认屏，账户菜单、断开与网络切换都在遮罩后面，Cmd+K 只在没有可见弹窗时打开；同一标签页里切不了账户。剩下的只有另一个标签页、外部钱包扩展与 Privy 会话过期。没有加代码，只用端到端用例钉住 | `deposit-session-global-modals.test.tsx`「keeps the pending deposit in front while it is submitting…」；把待确认屏改为可关闭的变异让 2 例失败 |
| 3 | `use-deposit.ts` 赞助发送调用处的注释写明三点理由；ADR 0058「未覆盖的范围」、决策 5、签名规范、展示规范与 CHANGELOG 同步 | — |

这批改动没有再送 Codex 审查。

## 验证与限制

- 本分支建立时（编排，2026-11-23）：在 `fce35f78` 之上取回 `df2703fe` 的执行层文件后，`pnpm typecheck` 通过；全量终端 Vitest（本机，`--maxWorkers=4`）768 个文件、11,619 个用例通过，1 个文件跳过；Biome 检查 24 个改动文件通过。注意：这时存款弹窗没有把 `session` 传给 `deposit()`，`use-deposit-routing-guard.test.tsx` 里的会话用例直接给钩子传桩会话，只证明钩子内部，不证明弹窗接线。新工作树的图表库从 PR 1 工作树本机复制（`apps/terminal/public/charting_library`，被 Git 忽略）。
- 接手会话，重构之后第一次全量（2026-11-23，沙箱内）：770 个文件中 767 个通过、1 个跳过，2 个失败。`use-usdc-routing.test.ts` 是按源码文本找 `smartClient.sendTransaction` 的契约测试，赞助广播改用 `broadcastClient` 后同步改了测试；`vite-development-cache.test.ts` 在沙箱内报 `listen EPERM`（沙箱不允许监听本地端口），沙箱外单独重跑通过。
- 第一轮修复之后（沙箱外）：770 个文件通过、1 个跳过，11,661 个用例通过。第二轮修复之后（沙箱外）：770 个文件通过、1 个跳过，11,666 个用例通过。第三轮之后的双时钟小修之后的全量结果见本节最后一条。
- 每轮修复之后 `pnpm typecheck`（hl-react、ui、terminal）退出码 0，改动文件的 Biome 无问题，`git diff --check` 干净，`pnpm memory:check` 通过。
- 端到端用例 `deposit-session-global-modals.test.tsx` 由子代理按本会话的说明写成（8 例，3 项变异，恢复后逐字节核对），本会话复跑通过并读过场景断言；其余变异由本会话自己做。
- 最终版本（第三轮之后的双时钟小修之后，沙箱外，`--maxWorkers=4`）：全量终端 Vitest 770 个文件通过、1 个跳过，11,667 个用例通过；`pnpm typecheck` 退出码 0；20 个改动的 TypeScript 文件 Biome 无问题；`pnpm memory:check` 通过，`pnpm memory:test` 12 项通过；`git diff --check` 干净。
- 加固之后（运营方决定之后，沙箱外，`--maxWorkers=4`）：全量终端 Vitest 770 个文件通过、1 个跳过，11,676 个用例通过；`pnpm typecheck` 退出码 0；改动文件 Biome 无问题；`pnpm memory:check` 通过、`pnpm memory:test` 12 项通过；`git diff --check` 干净。
- 均为本机 jsdom，事件由脚本触发；没有浏览器、真机或真实钱包验证，原生 Web Locks 的排队与取消顺序也没有在浏览器里验证。

## 后续与替代关系

- 已决定（2026-11-23，记为已知限制）：赞助路径交给 Privy 智能钱包 `sendTransaction` 之后，SDK 内部的准备、签名与 bundler 发送不受会话检查。以后若要关闭，需先确认分步调用能保留 Privy 的 `dataSuffix`，并能用真实 Privy 智能钱包验证。
- 结果归属（属于 PR 1 那条线）：已交给钱包的旧存款结果会关闭同账户之后新开的存款弹窗；普通失败后删意图失败只报原失败，下一次提交才被旧意图挡住（第一轮第 5 条后半、第 6 条）。
- 显式 Agent 审批签名返回之后、发送之前的锁排队不接收取消信号（第三轮第 2 条，P3）。
- E2（已登录却失去钱包）时 `GlobalModals` 立即重挂载存款弹窗、已签的许可不用；修 E2（PR 1 的后续）时，存款的等待会变成等到 30 秒上限，届时需要重看「Wallet not connected」的展示。
- 第三轮之后的双时钟小修没有再送审。
- PR 1 收窄时移出的事项（E2 场景草稿丢失、请求发出后账户模式变化吞掉结果、解析中发出的通知在切到另一账户后不撤下、法律门沿用期间重开同类窗卸载提款宿主、首次解析期间挂载的发送不恢复重试草稿）记在 PR 1 的任务记录里，不在本分支范围，除非运营方另行决定。
