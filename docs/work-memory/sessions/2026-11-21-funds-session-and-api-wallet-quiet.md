<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-21-funds-session-and-api-wallet-quiet",
  "date": "2026-11-21",
  "title": "资金弹窗在会话解析中保留草稿；API 钱包列表静默展示",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "wallet-onboarding", "pr-review"],
  "summary": "修复 2026-11-21 核实成立的两条中等严重度缺陷，并经多轮审查补修。F5a：GlobalModals 用含钱包地址的 key 挂载存款、划转、发送、兑换弹窗，钱包会话解析期间地址暂时为空就整窗重挂载、草稿丢失；新增 useFundsSessionKey、useFundsSessionHold 与通用的 useHeldWhileResolving，带法律门的页面解析期间沿用已定的可操作分支，并只保留解析开始时已打开的那次开窗。F6a：API 钱包列表去掉 role=alert 警告块与被动文字，按四态展示，新增 retained，非主钱包会话同样静默。2026-11-22 按运营方要求先取证（本机复现 E1–E5 与官方终端现场代码，见 wallet-session-reconnect-practice.md），再做展示与执行两层修改，经第七轮、7b、7c 复查。2026-11-23 第八轮审查之后运营方决定拆分：全部工作提交为 df2703fe，放在分支 claude/signer-session-guard（未合入，ADR 0058 在那里）；本分支只保留展示与结果归属。拆分后三轮 Codex 审查本次改动都是 7/10（总体 8、8.5、8/10），前两轮的九条已修。2026-11-23 第三轮之后运营方决定收窄本分支：去掉已登录却失去钱包（E2）的 60 秒保留，保留只在会话解析中、且没有观察到另一个已连接地址时成立；发送、划转与提款的结果身份恢复为含账户模式。E2 的草稿丢失与请求发出后模式变化吞掉结果都回到 fc4377e6 的行为，记为后续。留在本分支的：解析中的草稿与法律门沿用、API 钱包静默四态、兑换点击时的实时令牌、提款开始时限跨重连安静处理与跨路由刷新保留的结果所有者、解析中沿用的存款地址与模式、另一地址结束保留。代码代理报告收窄后 9 个文件 668 项通过、typecheck 通过、变异均被捕获。收窄后 Codex 审查本次改动 7/10、总体 8/10：提款过期尝试在 SDK 调用前停下按没有发出处理、发送草稿按网络与 owner 分存、发送与划转只在发出时的开窗里关窗（后撤回）、文档两处过宽已修，测试真实性一条记为后续。收窄后第二轮 Codex 审查（本次改动 7/10、总体 8/10）发现开窗绑定让同类新开窗带着上一笔的金额与目的地址、可再提交一次，运营方决定撤回：发送、划转与提款的结果属于当前提交或尝试时照常通知并关窗，同类新开窗里输入的内容随之丢失。最终版本全量终端 Vitest 766 个文件、11,557 个用例通过。执行分支（PR 2）按运营方 2026-11-23 决定 2、3 处理存款签名后的等待。",

  "thread": null,
  "baseCommit": "f0f789bc",
  "commits": ["fc4377e6"],
  "sources": [
    { "path": "apps/terminal/src/hooks/trade/use-funds-session-key.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-funds-session-hold.ts" },
    { "path": "apps/terminal/src/hooks/wallet/use-held-while-resolving.ts" },
    { "path": "apps/terminal/src/hooks/wallet/use-live-session-token.ts" },
    { "path": "apps/terminal/src/stores/use-send-draft-store.ts" },
    { "path": "apps/terminal/src/stores/use-global-modal-store.ts" },
    { "path": "apps/terminal/src/components/trade/components/spot-swap-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/send-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/transfer-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/lib/errors/action-error.ts" },
    { "path": "apps/terminal/src/lib/tests/global-modals-funds-session.test.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/api-wallet-list.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/api-wallet-state.ts" },
    { "path": "apps/terminal/src/components/api-wallet/use-api-wallet-controller.ts" },
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/wallet-session-reconnect-practice.md" },
    { "path": "CHANGELOG.md" },
    { "path": "apps/terminal/src/lib/tests/use-funds-session-key.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/wallet-session-resolving.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/funds-dialogs-session-resolving.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx" }
  ],
  "supersedes": []
}
-->
# 资金弹窗在会话解析中保留草稿；API 钱包列表静默展示

## 背景与范围

同步记录，2026-11-21，未取得任务标识。运营方在核实结果出来后要求先修两条中等严重度项（核实记录在分支 `claude/layout-integrity-pilot` 的 `2026-11-21-ui-report-functional-verification.md`，随那个分支合入后可读）。工作树 `.claude/worktrees/funds-session-quiet`，分支 `claude/funds-session-and-api-wallet-quiet`，基线 `main` `f0f789bc`，与 PR #15 互不依赖。2026-11-23 起本分支只做展示与结果归属，执行层拆到分支 `claude/signer-session-guard`，见下文「拆分（2026-11-23）」；同日又收窄为只在会话解析中保留，见「收窄（2026-11-23）」。

## 结论与依据

**F5a（资金弹窗在会话解析中丢草稿）**

- 原因在上层：`GlobalModals` 以 `${env}:${clientKey}:${sessionMode}:${walletAddress}:${walletIntent}` 作存款、划转、发送、兑换弹窗的 key。重连或钱包目录初始化时 `walletAddress`、`clientKey`、`sessionMode` 暂时变成未连接的值，弹窗整窗重挂载。11-17 为发送、划转弹窗做的「解析中输入保留」测试直接渲染弹窗，没有经过这个 key，所以没有发现。
- 新增 `hooks/trade/use-funds-session-key.ts`：解析期间（`useWalletSession().isResolving`）钱包相关部分沿用最近一个已定的值，用 React 的「渲染期间按条件调整 state」写法，被放弃的渲染不会改动已存的值；网络（`env`）从不沿用。解析结束后身份没变就不重挂载；定在另一个账户、确认未连接或 10 秒上限到期时按新身份重挂载（第一次提交时如此；之后保留条件改为 `useFundsSessionHold`，见「取证与执行层修复」）。这只影响展示：第一次提交时各弹窗在签名前仍按实时身份校验，执行守卫与提交身份检查都没有改（之后 R2 让发送、划转的提交身份与存款弹窗的上下文标识在保留期内沿用，弹窗自己的执行守卫从此比较沿用的身份，见下文「拆分后的审查（2026-11-23）」）。
- 存款弹窗的存款、提款、Bridge 三个页签在解析中渲染 `data-slot="funds-session-resolving"` 的忙碌占位（`PassiveDataPlaceholder busy`，最小高度 160px），不再显示「Wallet not connected」与连接按钮。提款金额等草稿是 `DepositModal` 自身的 state，表单卸载再挂上时原样回填。Bridge 页签卸载时执行照旧转到后台。

**F6a（API 钱包列表的被动横幅）**

- `ApiWalletPageState` 新增 `retained`：读取失败、但当前列表是本页开始读取后收到的（`useDataReceivedSinceMount`，键为网络与账户）。在此之前缓存的数据不保留，按首次失败处理。`retained` 不可操作（`isApiWalletPageOperable` 为假），生成、授权与删除都禁用；「Verify again」的重读不受影响。
- 列表：首次失败只给中性「Retry」，去掉 `role="alert"`、红色图标、错误标题和说明；`retained` 时列表保留，下方给「Retry」，保留的空列表只给「Retry」；表头只在显示列表时写「N authorized」，后台刷新只设 `aria-busy`。`action-progress-label-contract` 与 `status-motion-surface-contract` 的登记随之删去；`use-api-wallet-controller-query` 中「授权后重读失败」的预期由 `error` 改为 `retained`（空列表是本页收到的，按新规则保留，仍不可操作）。

**审查后补修**（第一次提交 `fc4377e6` 之后的对抗审查：三个视角各一个审查代理，每条发现再由独立代理尝试推翻；11 条中 8 条成立，3 条被推翻）

| 编号 | 严重度 | 问题 | 处理 |
| --- | --- | --- | --- |
| R2 | P2 | 发送、划转、提款的请求在途时会话解析，提交身份随实时身份变化，结果通知被吞，草稿保留且按钮重新可点，可能重复提交 | 新增 `hooks/wallet/use-held-while-resolving.ts`；发送、划转的 `submissionIdentityKey` 与存款弹窗 `fundsModalContextIdentity` 的会话部分在解析期间沿用已定值，结果照常通知、关窗，原草稿不能再提交 |
| R1 | P2 | 兑换提交跨越会话解析后，序号被布局副作用递增，`onClose` 不再调用，弹窗隐藏但 store 仍是 `swap`，兑换入口与 Cmd+K 卡住 | 提交结束后只要组件仍挂载就关闭（`mountedRef`）；结果本来就记在通知任务里。删去只被递增、不再读取的序号 |
| 规则 F1 | P2 | 带法律门的页面在解析期间法律门回到 `checking`，`LegalAwareGlobalModals` 切换分支，弹窗照样卸载；CHANGELOG 与规范新行不准确 | 解析期间沿用上一次已定的「可操作」分支（同一个 `LegalAcceptedGlobalModals` 元素位置）；规范与 CHANGELOG 改正 |
| 规则 F2 | P2 | 没有测试经过 `GlobalModals` 的 key 接线 | 新增 `global-modals-funds-session.test.tsx`：真实 `GlobalModals`、`useWalletSession` 与 `useLegalGate`，四个弹窗换成草稿探针，三种页面配置 |
| 规则 F3 | P2 | `nonMaster` 时列表读取中或失败仍显示「No API wallets authorized」 | 新增 `deriveApiWalletListState`，列表状态与页面可操作性分开；列表改收 `listState` 与 `canRemove` |
| React F1 | P3 | 挂载时就在解析中，临时身份被当成已定值，定下后整窗重挂载 | `useFundsSessionKey` 改为世代号：初值在解析中记为未定，第一次定下直接采用，不改 key |
| 规则 F5 | P3 | Bridge 分支与存款金额保留没有测试 | 存款弹窗测试加入 `bridge`，并断言存款金额 |
| 规则 F6 | P3 | 保留空列表的「0 authorized」、保留行的 Retry 接线、控制器的 `receivedSinceMount` 接线没有测试 | 分别补测试；`api-wallet` 目录加入 `mobile-data-presentation-contract` 的扫描范围，登记剩余的 `role="alert"` 与警告图标及原因 |

被推翻的三条：解析期间外部钱包存款进行中的状态屏（本提交让弹窗不再重挂载；第五轮审查补充：状态仍按实时地址读取，解析期间状态屏会暂时消失，属既有限制，见后续）；API 钱包页重连时「本页已收到」基线重置（重连期间页面本来显示未连接）；`nonMaster` 不写计数（规范是必要条件，现在随列表状态显示）。

**第二轮审查**（Codex `gpt-6.2-sol`，只读，medium，2026-11-22，评分 5/10；随后用工作流逐条核实，每条一个核实代理加一个推翻代理，10 个代理）

| 编号 | 核实结论 | 问题 | 处理 |
| --- | --- | --- | --- |
| C1 | 成立，P2，第一轮补修引入 | 沿用身份让还没发出的预检在重连期间继续：外部钱包存款可能弹出切链、连接与签名窗口（界面显示忙碌占位）；发送、提款被 hl-react 拦下不签名，但会多报一次失败，提款还会关窗、清空草稿 | 新增 `hooks/wallet/use-live-session-token.ts`：发送的收款地址检查在点击时取实时会话令牌，等待后令牌不是同一个对象就放弃；存款弹窗另加一个按实时会话身份（解析中为空）的布局副作用，作废存款预检和还没调用交易所请求的提款尝试（`requestStarted` 标记）。沿用身份只用于已发出请求的结果归属 |
| C2 | 不成立 | 认为同账户恢复后账户模式晚到会吞掉结果 | `isResolving` 结束的那次渲染里，账户模式已从按用户缓存的 `userAbstraction` 恢复，不存在这个窗口 |
| C3 | 成立，P3 | 钱包已在目录中但未连接（activating）时法律门给出 `wallet_required`，沿用最多推迟它 10 秒，期间还能打开新的资金弹窗 | 沿用期间只保留解析开始时已打开的弹窗（`limitModalToScope` 与 `retainedModal`），设置与命令菜单不受限；推迟 10 秒写入规范。不改成只在 `checking` 时沿用：activating 是重连的正常瞬态 |
| C4 | 成立，P3，补修之前就有 | 迟到的发送结果无条件 `clearSendDraft()`，会清掉另一个账户的重试草稿 | `clearSendDraft(ownerKey)` 只清该账户的草稿；测试改用 `resetSendDraft()` |
| C5 | 成立，P3 | 测试没有在预检等待期间切换会话，没有 activating 阶段 | 补下列测试 |

**第三轮审查**（Codex `gpt-6.2-sol`，只读，medium，2026-11-22，评分 6/10，未发现 P1，也未发现 A 的请求以 B 的身份被交易所接受）

| # | 严重度 | 来源 | 问题 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | P2 | 既有 | 进入 `deposit()` 后（`lib/hyperliquid/use-deposit.ts`），切链、连接与签名前不再检查会话，外部钱包存款仍可能在重连期间弹出签名 | 未在本任务修改：执行层边界变更，记入后续 |
| 2 | P2 | 签名窗口既有；排队作废的处理由本次补修改变 | 提款的 `requestStarted` 早于实际签名；请求在调度器排队时被重连作废会报失败、关窗、清草稿；SDK 交给钱包签名前也不检查会话 | 调度器只作废未开始的请求（`request-scheduler.ts`），所以新增 `isExchangeRequestInvalidatedError`：发送、划转、提款遇到它且提交后实时会话令牌已变时，按「没有发出」处理，不提示、不关窗、保留草稿；没有经过重连的作废照旧提示。签名入口检查会话记入后续 |
| 3 | P2 | 本次引入 | 存款数据重试期间重连，`isDepositDataRetrying` 卡住 | 实时会话失效时一并释放 |
| 4 | P3 | 本次引入 | `retainedModal` 按类型放行，关掉后再开同类弹窗仍会显示；被挡下的开窗占着 store，Cmd+K 打不开 | store 新增 `openSequence` 与 `useGlobalModalOpening`，按开窗实例保留；Cmd+K 按可见弹窗判断 |
| 5 | P3 | 既有 | 重连后要等旧的收款地址检查返回，发送表单才解锁 | 地址检查带 `AbortController`，会话失效时中止并释放；`useLiveSessionToken` 增加 `onInvalidate` |
| 6 | P3 | 既有，规范说法过宽 | Bridge 页签自己的草稿在解析期间丢失 | 规范更正，未改实现 |

**第四轮审查**（Codex `gpt-6.2-sol`，只读，medium，2026-11-22：本次改动自身 7/10，含既有缺口的总体资金安全 5.5/10，未发现 P1）

| # | 严重度 | 来源 | 问题 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | P2 | 本次引入 | `isExchangeRequestInvalidatedError` 只看错误名；邮箱主钱包签名器在签名之后、HTTP 请求之前也抛同名错误 | 核对 `owner-signer-client.ts`：该错误只在交给底层传输之前抛出，签名即使已生成也从未到达交易所，重试会重新签名并使用新的 nonce，不会重复执行；按「没有发出」处理保留。注释与规范从「没有签名」改为「没有到达交易所」。区分阶段的独立错误类型属于 hl-react 的边界改动，并入后续 |
| 2 | P3 | 本次引入 | 实时失效没有推进提款条件 Retry 的世代，旧读取会写回 | 失效回调推进 `withdrawalRetryEpochRef` |
| 3 | P3 | 本次引入 | 被挡下的另一类开窗跳过已保留弹窗的退出；Cmd+K 会替换等待中的开窗 | 只在等待的是同一类弹窗时隐藏；Cmd+K 替换等待中的开窗写入规范与 CHANGELOG。被隐藏的 Market Close 仍挡快捷键，是既有的排他规则 |
| 4 | P3 | 本次引入 | 旧 Swap 请求结算时按类型关闭，会关掉之后的新开窗 | `SpotSwapModal` 只在提交时的那次开窗仍是当前开窗时关闭（`getGlobalModalOpening`） |
| 5 | P3 | 法律门沿用后扩大 | 仅 wagmi 重连时邮箱存款仍显示可复制地址与二维码 | 存款页签在 `isResolving` 时一律显示忙碌占位；存款状态屏在更早的分支返回，不经过这个占位（外部钱包状态屏本身在解析期间读不到状态，见第五轮） |
| 文档 | P3 | 本次引入 | 「到交易所」的测试只到 SDK 桩；「旧请求的结果只更新它自己的任务记录」不适用于发送、划转、提款；引用了不存在的全量结果补记；CHANGELOG 漏了 Bridge 与切网络的例外；SDK 签名入口缺口应限定到外部钱包 | 均已改正 |

**第五轮审查**（Codex `gpt-6.2-sol`，只读，medium，2026-11-22：本次改动自身 6.5/10，总体资金安全 5/10，未发现 P1）

| # | 严重度 | 来源 | 问题 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | P2 | 本次引入 | 邮箱主钱包签名器在签名阶段抛出的 `ExchangeRequestInvalidatedError` 被 SDK 包进 `AbstractWalletError.cause`，按名判断漏掉，同账户重连时仍报失败、关窗 | `isExchangeRequestInvalidatedError` 只多读这一层 SDK 包装（`AbstractWalletError` 且 `cause` 是该错误）；单元测试用 SDK 自己的 `AbstractWalletError`，并确认不读其他包装或更深的 cause。Codex 用锁定 SDK 确认该路径底层传输调用次数为 0 |
| 2 | P2 | 第四轮引入 | 旧请求未结算时再开 Swap，新开窗沿用旧内容组件的 `isSubmitted`，一直不可见、占着 store | `SpotSwapModalContent` 以开窗作 key，每次开窗是新表单；旧实例卸载后不再关窗，结果仍记入原通知任务。测试重新渲染并断言新开窗可见、旧结果不关闭它 |
| 3 | P3 | 本次文档 | 提款 Retry 只阻止回写，查询仍更新缓存且可能保持忙碌；CHANGELOG 漏了 10 秒上限与会话模式、钱包类型变化；记录引用了不存在的第四轮全量结果 | 均已改正 |
| 既有 | P2 | 既有 | 外部钱包手动存款进行中，解析期间状态屏读不到状态而暂时消失；提款越过执行守卫后路由变化会清掉尝试、不报结果 | 记入后续，本任务不修改 |

**第六轮审查**（Codex `gpt-6.2-sol`，只读，medium，2026-11-22：本次改动自身 7/10，总体资金安全 5/10，未发现 P1；第五轮的 SDK 包装与 Swap 新开窗不可见确认已修好，Codex 用锁定 SDK 与桩钱包实测四条签名路径底层传输调用均为 0）

| # | 严重度 | 来源 | 问题 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | P2 | 第五轮引入 | `SpotSwapModalContent` 以开窗作 key，再开 Swap 会卸载旧实例，把仍在排队的上一笔兑换的执行守卫置为不活跃，旧兑换被拒绝 | 撤掉 key，改为记住提交时的开窗（`submittedOpening`）：提交在途时新开窗保持隐藏、组件与执行守卫不变、不重置表单；提交结束后只关闭自己那次开窗，新开窗以清空的表单显示。测试在新开窗后调用真实的执行守卫，断言不被拒绝；以开窗作 key、在途时重置表单、按类型关闭三种回退各自让它失败 |
| 2 | P3 | 本次文档 | 结果通知与延后开窗的说明过宽：提款路由变化的例外、延后开窗只发生在法律门沿用期间、确认面文档的 Swap 生命周期 | CHANGELOG、展示规范与 `docs/confirmation-surfaces.md` 收窄 |
| 3 | P3 | 本次漏记，行为既有 | API 钱包页在会话解析中仍显示「Connect to view authorized API wallets」 | 在展示规范的 API 钱包条目写明（F5d）；登记为 `pending` 需要把该文件纳入 `mobile-data-presentation-registry.ts` 的覆盖范围并逐项登记，随 F5d 一起做 |

**取证与执行层修复**（2026-11-22，运营方要求「取证完再继续修」）

第六轮之后，运营方指出前几轮的问题没有对照官方开发文档、也没有调试官方终端就判定成立。随后在本机复现并读取官方终端现场代码，证据、官方做法与结论写入 [`docs/wallet-session-reconnect-practice.md`](../../wallet-session-reconnect-practice.md)（E1–E5，脚本向 MetaMask 扩展注入事件，签名请求被包装层拦截并拒绝，没有产生签名）。模拟器扫码连接 MetaMask Mobile 没有成功，手机证据仍缺。负责人就「签名返回时会话仍未定」选择照常发送。据此做了下列修改，设计写入 ADR 0058（拆分后只在执行分支 `claude/signer-session-guard` 上，本分支没有这个文件；下表哪些行留在本分支见「拆分（2026-11-23）」）：

| 项 | 依据 | 处理 |
| --- | --- | --- |
| hl-react 签名入口检查会话（第三轮 #2 的既有部分） | E5：应用判为断开后 SDK 仍请求签名 | 世代按 `unresolved` / `replaced` 退役；`guardSigning` 签名前要求世代为当前（Agent 签名器除外）；传输层只在 `replaced` 或生命周期结束时不发送；`ExchangeRequestInvalidatedError.phase`；`isExchangeRequestNotSentError`（质押、TP/SL 改用它） |
| 短暂失去钱包的草稿 | E2：前约 750ms 判为确认断开，弹窗重挂载 | `useFundsSessionHold`，退出登录立即结束；取证当时的版本每次断开重新计 60 秒，第七轮「保留」起一次连续中断共用一个从中断开始计的 60 秒，加上解析最长约 70 秒；复现后划转草稿保留（复现过程未存档，见实践指南 E2 注） |
| 手动存款执行链（第三轮 #1） | 源码：`deposit()` 内切链、连接、签名前不查会话 | `DepositReview.session`、包装的 provider、`switchChain` 与签名前检查、两条广播前检查、静默回到空闲 |
| 存款进行中的状态屏（第五轮既有） | 源码：执行状态键含实时地址 | 传入保留期内沿用的地址（第七轮「模式」起也沿用存款模式）；外部钱包模式原先不传地址，所以保留期内整个 `useDeposit`（钱包选择、provider、余额查询、执行状态键与锁键、`deposit()` 的地址）都按沿用值读取，见展示规范「资金弹窗的请求」 |
| 提款结果归属与路由（第五轮既有） | 源码：上下文标识含路由 | 结果所有者只随关窗或会话身份失效；发出前被路由变化拦下的保持安静 |

规范：`docs/mobile-data-presentation.md`「钱包会话解析中」表新增三行（资金弹窗的挂载、在途请求、存款弹窗各页签），「受约束的入口」新增 API 钱包页（含 `nonMaster`）。CHANGELOG 已更新。

**第七轮审查**（Codex `gpt-6.2-sol`，只读，medium，2026-11-22；模型与强度见会话 scratchpad 里 `codex-followup-7.out` 的抬头，该文件不在仓库，审查对象为 `fc4377e6` 之上的全部未提交改动：本次改动自身 5/10，总体资金安全 4/10。Codex 把「存款弹窗卸载后旧授权仍可能发出」列为 P1，没有找到普通 `/exchange` 路径把 B 的签名当成 A 发送的证据。随后用工作流逐条核实，两路结论不一致或修法依赖细节处再读代码裁定，裁定者自己没有跑测试）

| # | 核实结论 | 问题 | 处理 |
| --- | --- | --- | --- |
| 1 | 部分成立，P2，新守卫不完整 | 存款的 `isReplaced` 不是单向：A → B → A、关窗后在退出动画期间重开都会恢复成可发送；弹窗卸载后会话快照冻结 | 第七轮：每次点击一个只能作废的尝试，弹窗关闭、卸载或会话定在别处时作废；`isCurrent` 也要求尝试未作废 |
| 2 | 成立，P2，分类为新增 | 外部钱包存款的 `eth_sendTransaction` 是第二次钱包确认，却只按「没有换人」检查；viem 回退的 `wallet_sendTransaction` 不在任何集合里 | 第七轮：三种会弹出交易确认的方法要求会话定在点击时的身份上，外部路径保存意图前也查。7b：改为签名后最多等 10 秒让会话定下，同账户继续、换账户静默停下、超时提示「Wallet not connected」，发送一刻的检查保留为最后一道。7c：等待改为跟随存款弹窗的会话保留，签名后、法律复查前、发送或广播前各等一次；保留结束而没有钱包或 `clientKey` 为 `disconnected` 时，外部路径报「Wallet not connected」，赞助路径照常往下走（由负责人两条规则推出，第一条由编排转述、原话未存档）。7c 复查之后：保留在点击身份之外结束改为两条路径都静默停下，「Wallet not connected」只留给 70 秒兜底到点而保留仍在的情形 |
| 3 | 成立，P3（2 修好后升为 P2） | 包装层在交给钱包之前拦下发送时，意图已保存，仍报「Deposit status unknown」，意图最多挡住下一笔存款 1 小时 | 第七轮：记录交给钱包的发送，没有转发就删除意图、静默回到空闲。7b：每次转发都被明确拒绝（读 cause 链，最多 6 层）也按没有转发；删除意图失败时不走静默分支 |
| 4 | 成立，P2，本次引入 | owner signer provider 的清理先于 session provider，把临时断线记成 `replaced`，生产中「仅未定照常发送」不成立；邮箱路径的普通错误被包装后丢掉「没有发出」分类 | 第七轮：会话身份变化的退役只由 session provider 做（Agent 与注册会话等模块照旧自己退役），owner signer provider 只在同一身份内绑定变化时退役；邮箱签名失败且 owner 已不是当前的归为 `after-signature`。7b：只在之前的绑定非空时退役。7c：收紧为之前的绑定带 owner 钱包（`binding.wallet`）时才退役 |
| 5 | 部分成立，P3 | `replaced` 作废只扫描当前世代表，漏掉未定世代 | 第七轮：明确的 `replaced` 作废同时升级匹配的未定世代；每次新捕获时升级凭据不同的未定世代（比计划的「没有当前世代时才查」更宽，覆盖「同凭据回来后再换 Agent 密钥」） |
| 额外 | 成立，P3，本次引入 | provider 的 `assertCurrent` 包装让 `owner-trading-status` 的用例失败；审批已到交易所之后的检查报「没有发出」 | 第七轮：`useExchange` 的开始检查把应用错误转成 `before-start`；builder fee 审批与交易授权发出之后的核对改写成普通错误。7b：确认查询也包进去；Agent 已批准而 builder fee 一步被作废时报 `TradingAuthorizationIncompleteError` |
| 模式 | 部分成立，P3 | 存款模式按实时值读取，解析期间可能从 `smart` 变成 `wallet`，读不到进行中的状态 | 第七轮：模式也在保留期内沿用 |
| 法律 | 成立，P3，文档夸大 | 实时法律检查在 `clientKey` 为 `disconnected` 时报 `status_unavailable`，早于会话检查 | 7b：等待放在法律复查之前；等待之后再次断开仍会报错，写入 ADR。7c：法律复查之前再等一次；赞助路径保留结束在断开状态时仍会在这里报 `status_unavailable`，记为限制 |
| 6 | 部分成立，P3 | 结果身份含账户模式，请求在途时模式变化会吞掉结果 | 第七轮：提款、发送、划转的结果身份去掉账户模式。7b：发送、划转被执行守卫在发出前拦下、而点击后会话令牌或含模式的提交身份已变时保持安静 |
| 保留 | 部分成立，P3，本次引入 | 断开与解析来回切换会重启 60 秒计时，可以无限保留 | 第七轮：一次连续中断一个预算，连续 2 秒不中断后才重新计时 |
| 7 | 成立，P3，既有 | 显式 Agent 审批的槽位没有世代；资金弹窗的执行守卫只在 SDK 等待之前跑一次 | 第七轮：Agent 审批签名器加 `beforeSign`。资金弹窗在 SDK 签名前等待里关闭的窗口记入后续 |
| 文档 | 成立，P3，本次引入 | ADR 决策 3/4、实践指南、签名规范、CHANGELOG 承诺宽于实现；「HTTP 一旦开始一律不明」比 `action-error.ts` 宽 | 本次文档修订 |
| 记录 | 成立，P3，本次引入 | 「全量结果在下方补记」之后没有结果；两个「…reached the exchange…」测试名是本轮新加的，`fc4377e6` 没有，回退了第四轮的测试名修正；ADR 验证段没写桩 | 测试改名为「…whose SDK call had started before…」；ADR 验证段分开列出真实路径与桩；全量结果待补 |

第七轮修复后，每部分各由一个对抗审查代理复查（hl-react、存款、资金弹窗）。会话 scratchpad 里存下的这批复查是 `r7-v2:*.md`（2026-11-22 23:09），审的是第七轮的修复，结论就是 7b 要修的内容。之后的跟进称为 7b，7b 的代码又各由一个代理复查，再跟进的称为 7c。7b、7c 的复查结论与文档审查都是审查代理的回复，不在仓库里：7b 的三份复查与文档审查由编排存为会话 scratchpad 里的 `r7b-review-*.md` 与 `r7b-docs-review.md`（2026-11-23），7c 的实现者报告、两份复查（存款、hl-react）与文档审查存为同一目录的 `r7c-implement-*.md`、`r7c-review-deposit.md`、`r7c-review-hlreact.md` 与 `r7c-docs-review.md`（文件时间 2026-11-23 00:46）。下表是摘要。

**7b 复查**（审查对象为 7b 的代码，只读，没有重跑变异）

| 部分 | 结论 | 发现 | 7c 的处理 |
| --- | --- | --- | --- |
| hl-react | 没有 P1、P2；测试 6 个文件 69 项通过 | P3：外部钱包会话的绑定从空闪成不带钱包的绑定再变回空时退役，闪动前已在钱包里等待的签名被丢弃；小问题：builder fee 一步开始前的普通错误不归为未完成、ADR 没写三条规则、渲染阶段写 ref（既有） | 退役条件收紧到之前的绑定带 owner 钱包，补一例；普通错误按决定不改，写入 ADR；其余写入文档 |
| 存款 | 没有 P1；测试 2 个文件 319 项通过 | P2-1：等待上限 10 秒短于弹窗 60 秒的保留期，钱包离开目录后第 11 到 60 秒回来时白签一次并报错，保留结束在断开状态时也要白等 10 秒；P2-2：赞助路径超时不广播，与负责人决定冲突；P3-1：等待之后还有十几个异步点，会话再闪断时外部路径静默作废或法律复查报错；P3-2：计时器在页面隐藏时照样走；P3-3：删除意图失败时提示「Deposit status unknown」 | 等待改为跟随弹窗的会话保留（兜底 70 秒）、外部与赞助路径分开处理超时、法律复查前与发送或广播前再等；P3-2、P3-3 按决定只写入文档 |
| 资金弹窗 | 没有 P1、P2；测试 5 个文件 219 项通过 | P3-1：守卫读到新账户模式后 `account-mode-changed` 安静还是提示取决于缓存更新与拒绝的先后，没有测试；P3-2：提交身份与序号那一条判断只是防御，`docs/confirmation-surfaces.md` 没写安静处理及其代价 | 不改代码；写入 ADR 0058 与 `docs/confirmation-surfaces.md` |
| 文档 | 16 条：2 处宽于代码、6 处较宽或过时、4 条验证说法查不到证据或出处不对、4 处措辞 | 例如「身份变化的退役只由 session provider 做」漏了 Agent 等模块、「执行守卫在发送前重做」、`TradingAuthorizationIncompleteError` 的范围、10 秒与 60 秒保留的冲突、草稿总能保留、「许可作废」、E2 复现没有存档、7b 复查没有存档、部分运行的数字出处 | 本次文档修订逐条改正 |

**7c**（编排裁定见会话 scratchpad 的 `round7c-followups.md`，不在仓库）

| 部分 | 修改 | 实现者的验证（部分运行，不是全量） | 7c 复查 |
| --- | --- | --- | --- |
| 存款 | `waitUntilSettled` 跟随 `fundsSessionHeld`：作废时 `replaced`，保留结束在点击时的身份上 `same`，保留结束而没有钱包或 `clientKey` 为 `disconnected` 时立即 `timeout`，兜底 `FUNDS_SESSION_AWAY_LIMIT_MS + WALLET_SESSION_RESOLVING_MAX_MS`；`awaitSettledSession("send-prompt" \| "broadcast")`：外部路径 `timeout` 报「Wallet not connected」，赞助路径继续；法律复查前与发送、广播前再等 | 两个测试文件 139 + 189 项、57 个相关文件 2,078 项通过；终端 typecheck 通过。变异 10 种（赞助超时停下、外部超时继续、去掉三处重新等待中的任一处、保留结束在断开状态时继续等、兜底退回 10 秒或少 1 毫秒、保留未结束也算超时），每种都有用例失败，恢复后用 `cmp` 确认 | 没有 P1；328 项通过，没有变异残留。P2-1（复查之后已改，见下文「7c 小结」）：保留在断开状态结束时，弹窗自己的保留、等待的 `timeout` 与 `GlobalModals` 的重挂载同时发生，外部路径的「Wallet not connected」可能当场看不到，写进旧执行状态键，之后作为过期提示弹出；测试绕过了 `GlobalModals` 的 key。P3-1：赞助路径 `timeout` 时 `clientKey` 多半为 `disconnected`，法律复查报 `status_unavailable`，实际不会广播，「超时照常广播」那一例的 owner 状态生产中不会出现。P3-2：外部路径最后一道检查（`writeContract` 读链 ID 的那次往返）是静默的 |
| hl-react | `owner-signer-provider.tsx` 的退役条件从 `prior?.binding` 改为 `prior?.binding?.wallet`；补「不带钱包的绑定闪入闪出时外部签名照常发送」「绑定失去钱包时仍退役」两例 | 该测试文件 16 项、14 个相关文件 195 项通过；hl-react 与终端 typecheck 通过。变异 3 种（退回旧条件、额外要求新绑定带钱包、关掉退役），各有用例失败 | 没有 P1、P2；5 个文件 64 项通过，没有变异残留。P3：文档仍写旧条件与 14 项（本次修订已改）；小问题：「失去钱包」一例混用外部客户端与邮箱绑定，只证明分支；邮箱会话 `signerReady` 闪断时静默签名被丢弃（ADR 决策 3 的例外，既有） |
| 资金弹窗 | 不改代码 | — | — |

实现者在每部分逐项把修复换回旧代码或做变异，对应用例失败后用备份恢复，并用 `cmp` 确认与修复版一致；复查代理只按测试代码推理，没有重跑变异。

**7c 小结**（2026-11-23）

- 7c 修好的：存款等待跟随存款弹窗的会话保留（兜底 70 秒），取代 7b 的固定 10 秒；外部与赞助路径分开处理超时；法律复查之前与发送或广播之前各再等一次。hl-react 的退役条件收紧为之前的绑定带 owner 钱包（`prior.binding.wallet`），外部钱包会话里不带钱包的绑定闪入闪出不再丢弃在途签名。
- 7c 复查之后的修改（编排，存款 P2-1）：`deposit-modal.tsx` 的 `readDepositSessionSettlement` 在保留结束而不在点击时的身份上（另一个身份、没有钱包、`clientKey` 为 `disconnected`）时返回 `replaced`，两条路径都静默停下，因为 `GlobalModals` 这时同样按新身份重挂载存款弹窗；`timeout` 只来自兜底计时器（`FUNDS_SESSION_AWAY_LIMIT_MS + WALLET_SESSION_RESOLVING_MAX_MS`，70 秒），到点时保留仍在。外部路径的「Wallet not connected」只在这时出现，显示在仍挂载的弹窗里；赞助路径的兜底超时照常进入法律复查，保留期内 `clientKey` 是 `disconnected`，法律复查以地区可用性的 `status_unavailable` 停下，所以实际上几乎不会在超时之后广播，负责人「仅未定照常发送」通过 `same` 实现。测试：「ends a started deposit's wait quietly as soon as the hold ends on a disconnected session」与「…quietly at once while its session is settled without a wallet」都期望 `replaced`；据编排的报告，改回 `timeout` 的变异让这 2 例失败。本次文档修订时，会话 scratchpad 里没有这次修改的复查、Codex 或浏览器复现记录。
- 仍然存在的限制（写入执行分支 ADR 0058「未覆盖的范围」）：P3-2，第三次等待返回 `same` 之后，viem 在 `eth_sendTransaction` 之前的 `eth_chainId` 往返里会话闪断时代理静默停下，已签的许可没有用上（一次 RPC 的窗口）；保留的计时器在页面隐藏时照样走；删除授权意图失败时提示「Deposit status unknown」；钩子测试里 `waitUntilSettled` 是桩，没有经过 `GlobalModals`、真实弹窗与真实 `useDeposit` 的端到端用例。
- 复查与审查原文在会话 scratchpad 的 `r7c-*.md`，不在仓库。

**第八轮审查**（Codex `gpt-6.2-sol`，只读，medium，2026-11-23：本次改动自身 6/10，总体资金安全 5/10，未发现 P1；第七轮的 Provider 树退役分工、未定世代升级、邮箱签名阶段分类与发出后不误报「没有发出」被确认成立。原文在会话 scratchpad 的 `codex-followup-8.out`，不在仓库。以下发现未经核实工作流复核，也尚未处理）

| # | 严重度 | 来源 | 问题 |
| --- | --- | --- | --- |
| 1 | P2 | 既有 | Privy 3.46 的 `wallet.switchChain` 在未知链时自己发 `wallet_addEthereumChain` 与第二次切链，不经过存款代理；会话在第一次切链等待中失效，后续请求仍可能弹窗 |
| 2 | P2 | 本次引入 | 两条存款路径在法律复查与钱包检查之后才做最后一次等待；等待跨过中断后回到同一账户，沿用了等待前的法律与余额结果；法律查询途中断线时真实守卫先抛 `status_unavailable` |
| 3 | P2 | 本次修复不完整 | 存款尝试没有绑定到单次开窗：同一账户下关窗与重开若合并为一次 React 提交，旧尝试看不到关闭 |
| 4 | P2 | 既有 | 显式 Agent 审批的 `beforeSign` 不校验注册会话租约与注册世代，另一标签页结束注册后仍可能弹签名，到 `beforeSubmit` 才拦住 |
| 5 | P2 | 既有 | 外部存款 `eth_sendTransaction` 返回 -32000 后回退 `wallet_sendTransaction` 再被拒绝（4001）时，按最终错误删除意图并报普通失败，第一次可能已广播；`writeContract` 内读链 ID 失败、一次也没转发时仍可能报「Deposit status unknown」 |
| 6 | P3 | 本次引入 | 共享包同一 `HyperliquidProvider` 在断线期间切换环境（A → disconnected → 另一网络 disconnected），A 的未定世代不升级；终端切网会导航，生产触发不到 |
| 7 | P3 | 交付 | `exchange-provider-tree-retirement.test.tsx` 未进入 diff：已用 `git add -N` 纳入 |

**拆分（2026-11-23）**

第八轮之后（Codex 本次 6/10、总体 5/10），运营方决定把执行层拆出去（原话「拆出执行层」）。拆分时的全部工作（第一次提交之后到 7c 复查之后的修改）提交为 `df2703fe`，放在分支 `claude/signer-session-guard`，尚未合入；本分支 `claude/funds-session-and-api-wallet-quiet` 在 `fc4377e6` 之上只保留展示与结果归属，执行层文件回到 `fc4377e6` 的版本。本分支的钱包弹窗与发送仍只受现有执行守卫约束；签名与发送边界的会话检查在执行分支上规划。

移到执行分支的（按领域）：

| 领域 | 内容 | 出自 |
| --- | --- | --- |
| hl-react 签名与发送 | 世代按 `unresolved` / `replaced` 退役与退役原因、`guardSigning` 与发送前的会话检查、`ExchangeRequestInvalidatedError.phase`、未定世代升级、session provider 与 owner signer provider 的退役分工（含 `binding.wallet` 条件）、邮箱签名的 `after-signature` 分类、`useExchange` 开始检查的 `before-start`、builder fee 审批与交易授权发出后的核对改写与 `TradingAuthorizationIncompleteError`；`use-wallet-session.ts` 的 `markExchangeIdentityReplaced` | 取证表第 1 行；第七轮 #4、#5、额外；7b、7c 的 hl-react 部分 |
| 手动存款执行链 | `use-deposit.ts` 的 `DepositReview.session`、`DepositSessionCheck`、包装的 provider、切链与签名前检查、签名后的三次等待与 70 秒兜底、转发记录与明确拒绝的识别；`deposit-modal.tsx` 里每次点击的尝试、会话快照与 `readDepositSessionSettlement` | 取证表第 3 行；第七轮 #1、#2、#3、法律；7b、7c 的存款部分；7c 小结的 P2-1 修改 |
| 显式 Agent 审批 | `use-explicit-agent-approval.ts` 与 Agent 签名器的 `beforeSign` | 第七轮 #7 |
| 其他调用方 | 质押与 TP/SL 改用 `isExchangeRequestNotSentError` 的分类 | 取证表第 1 行 |
| 文档与测试 | ADR 0058、`docs/hyperliquid-signing.md` 的相应段落；`exchange-signer-session-guard.test.ts`、`exchange-provider-tree-retirement.test.tsx`、`use-deposit-routing-guard.test.tsx` 等执行层测试的新增用例 | 取证与第七轮以后 |

留在本分支的：

| 领域 | 内容 | 出自 |
| --- | --- | --- |
| 草稿保留 | `useFundsSessionKey`、`useHeldWhileResolving`、`useFundsSessionHold`（拆分时：一次连续中断一个 60 秒预算，连续 2 秒不中断后才重新计时，退出登录立即结束；收窄后只在解析中，见「收窄（2026-11-23）」） | 第一次提交、React F1；取证表第 2 行；第七轮「保留」 |
| 法律门与开窗 | `LegalAwareGlobalModals` 沿用可操作分支，按开窗序号只保留解析开始时的开窗，Cmd+K 按可见弹窗判断 | 规则 F1、F2；第二轮 C3；第三轮 #4；第四轮 #3 |
| 结果归属 | 发送、划转的提交与结果身份在保留期内沿用、结果身份不含账户模式（收窄时恢复为含模式）、没有发出的停止安静处理（含 7b 的点击后会话或模式已变的情形）；提款结果所有者只随会话身份变化或关窗失效；兑换按提交时的开窗关窗；迟到的发送结果只清该账户的草稿；`isExchangeRequestInvalidatedError`、`isExchangeRequestNotSentError` 与 SDK 包装 | R1、R2；第二轮 C4；第三轮 #2 的展示部分；第四至六轮；取证表第 1 行里的 `isExchangeRequestNotSentError`；取证表第 5 行；第七轮 #6 |
| 还没发出的工作 | `useLiveSessionToken`：收款地址检查、存款与提款预检在重连一开始就作废并释放忙碌状态 | 第二轮 C1；第三轮 #3、#5；第四轮 #2 |
| 存款弹窗展示 | 各页签解析中的忙碌占位、邮箱存款页签不显示地址与二维码、进行中的状态屏按保留的钱包地址与存款模式读取 | 第一次提交；第四轮 #5；取证表第 4 行；第七轮「模式」 |
| API 钱包 | 四态列表、`retained`、`deriveApiWalletListState` | F6a；规则 F3、F6 |

拆分后的本分支先由审查代理做了一轮审查，之后跑了三轮 Codex 审查，见下面四节（第三轮之后收窄，见「收窄（2026-11-23）」）；都没有做浏览器复现。

**拆分后的审查（2026-11-23）**

审查对象是拆分后本分支 `fc4377e6` 之上的未提交改动。三个视角（资金安全、拆分完整性、文档）各一个审查代理，每条发现再由独立代理尝试推翻；都只读代码，没有跑测试。没有 P1、P2。审查与推翻的原文在会话 scratchpad 的 `base-*.md`，不在仓库。

| 视角 | 成立的 P3 | 被推翻 |
| --- | --- | --- |
| 资金安全 | 发送、划转与提款弹窗自己的执行守卫在保留期内比较沿用的身份，注释却写「读实时会话」；底层仍 fail-closed，但依赖「保留 ⇒ `clientKey` 为 `disconnected` ⇒ hl-react 已作废旧请求世代」这个前提，没有测试钉住 | 外部钱包模式传入沿用的存款地址、法律门分支沿用、兑换：都没有绕过执行边界的路径 |
| 拆分完整性 | 1. `action-error.ts` 的注释引用本分支没有的 ADR 0058，也没写签名前后的检查只覆盖邮箱主钱包签名器；2. 存款弹窗在失去钱包阶段的保留没有用例（测试从没在已登录时把 `clientKey` 设成 `disconnected`），发送、划转离开后以同一账户回来的结果归属也没有；3. `isExchangeRequestNotSentError` 的开始时限分支没有测试 | 第 4 条（任务记录的全量结果写成待补）：已按版本与范围标明 |
| 文档 | 1. 同上 ADR 0058 注释；2. `use-funds-session-key.ts` 注释称每个弹窗签名前都核对实时身份；3. `useHeldWhileResolving` 的参数名与注释只写解析中，调用点都传保留；4. `limitModalToScope` 的文档讲的是它不处理的逻辑；5. 展示规范列出的法律门沿用状态比代码窄，也没写 `wallet_required` 推迟只在已有开窗时成立；6. 60 秒写成从失去钱包算起，实际从中断开始；7. 展示规范第二栏说兑换只要挂载就关窗，与代码和第三栏矛盾；8. 展示规范对「没有发出」的范围写得比代码窄；9. 外部钱包模式下沿用的地址影响整个 `useDeposit`，文档写小了，外部钱包进度屏没有测试；10. CHANGELOG 把延后开窗写成普遍行为；11. 实践指南 E2 与 E4 触发相同、结果不同而没有解释；13. 本记录取证表写「最长 60 秒」，与后文「最长约 70 秒」矛盾 | 第 12 条（`docs/README.md` 对实践指南的描述）：说的是取证依据，不构成缺陷 |

这些 P3 在本轮处理：文档部分改了 CHANGELOG、展示规范、确认面、实践指南与本记录；代码注释与测试由同时进行的代码代理处理。文档代理收尾时在工作树上核对到：终端源码里已没有 ADR 0058 的引用；`action-error.ts`、`use-funds-session-key.ts`、`use-funds-session-hold.ts` 与 `use-held-while-resolving.ts`（参数改名为 `held`）的注释改为「应用层身份检查比较沿用的身份，实时性来自 hl-react 在 `clientKey` 变为 `disconnected` 时作废请求世代」；`global-modals.tsx` 的沿用说明移到 `isHeldBackOpening`。新增或扩充的用例：`wallet-session-resolving.test.tsx`「the address it gives the Hyperliquid provider」（解析中的每个阶段都不给 Hyperliquid provider 钱包地址，`clientKey` 因此为 `disconnected`；只钉住前提的前一半，hl-react 作废世代的那一半本分支没有新用例）；`deposit-modal-withdrawal-routing-guard.test.tsx`「a pending external-wallet deposit while the signed-in session is without its wallet」两例与失去钱包期间提款的结果归属两例（`useDeposit` 是桩）；`funds-dialogs-session-resolving.test.tsx`「a request in flight while the signed-in session is without its wallet」与开始时限到期一组；`action-error.test.ts` 的开始时限两例。这四个文件在文档代理收尾时一起跑过一次，328 项通过；变异检查由代码代理做，结论见它的报告，文档代理没有重跑。

**拆分后 Codex 审查（2026-11-23）**

审查对象是上一节处理之后、本分支 `fc4377e6` 之上的未提交改动，只读，没有跑 Vitest、typecheck 或 Biome，`git diff --check fc4377e6` 通过。评分：本次改动的正确性与完整性 7/10，相对 `fc4377e6` 的总体资金安全 8/10；3 项 P2、2 项 P3，没有 P1。审查原文在会话的 tasks 输出 `bphg9gm8i.output`，不在仓库；输出里没有写模型与强度。

| # | 级别 | 发现 | 处理 |
| --- | --- | --- | --- |
| 1 | P2，本次引入 | 兑换点击后在等资产锁时钱包离开、以同一账户回来，弹窗现在保留，旧尝试拿到锁后仍会进入交易所调度器（`fc4377e6` 时弹窗卸载，守卫随之失效） | 已修：点击时记下 `useLiveSessionToken` 的令牌（键含网络、`clientKey`、会话模式与钱包地址），执行守卫只在令牌仍是当前令牌时放行，否则以 `ExchangeRequestInvalidatedError` 拦下（提示 `identity-changed`，复查后由编排从 `swap-data-unavailable` 改过来）、任务记为失败；没有令牌时点击不提交 |
| 2 | P2，本次引入 | 提款在签名前跨过重连、最后以开始时限到期的 `ExchangeActionDeadlineError` 停下时，只对作废错误检查令牌，仍报失败、关窗 | 已修：`cancelledByReconnect` 改为 `isExchangeRequestNotSentError` 且实时令牌不是尝试记下的那一个，覆盖作废与开始时限到期 |
| 3 | P2，本次引入 | 钱包从 A 切到 B、Privy 仍要求 A 时（`isResolving` 为假、`clientKey` 为 `disconnected`），保留钩子把它当作短暂掉线，A 的草稿与迟到结果出现在 B 前面 | 已修：wagmi 已连接到不是会话最后一次定下的钱包地址时不算失去钱包，保留立即结束；同一钱包重连期间仍报告的原地址不算 |
| 4 | P3，本次引入 | API 钱包首读离线暂停（`pending` / `paused`，既不加载也不失败）时显示 Retry，主钱包同样 | 已修：`deriveApiWalletListState` 改用 `getPassiveQueryState`，没有数据也没有失败时为 `loading`，`ApiWalletPageStateInput` 去掉 `isLoading` |
| 5 | P3，文档偏差 | 刷新返回格式不符的响应时，查询的新数据替换旧快照，列表只剩 Retry，与 CHANGELOG 和展示规范「刷新失败保留列表」不符 | 已修：控制器记下本页收到过的最近一次有效快照，按网络与账户绑定，格式不符时展示为 `retained`；挂载前缓存的列表不保留 |

两个修复代理的报告（不在仓库）记录：新增用例在回退对应修复时失败；兑换守卫忽略令牌时 2 项重连用例失败、对照用例通过，提款判断改回只认作废时 2 项失败，保留条件改回只看 `clientKey` 时 3 个文件共 18 项失败；API 钱包四个变异各有用例失败。部分运行（不是全量）：资金弹窗部分 29 个文件 1,449 项、34 个文件 1,419 项通过，API 钱包部分 19 个文件 416 项通过，终端 typecheck 与改动文件的 Biome 检查通过。兑换用例计数的是桩 `useExchange` 的发送函数，不是真实 hl-react 调度器。文档按修复后的代码改了 CHANGELOG、展示规范与确认面；实践指南不在本次文档修改范围内，没有核对。修复之后没有再跑 Codex 审查（这句写于第二轮之前，第二轮见下一节）。

**拆分后第二轮 Codex 审查（2026-11-23）**

审查对象是上一节修复之后、本分支 `fc4377e6` 之上的未提交改动，只读静态审查，没有跑 Vitest、typecheck 或浏览器复现，`git diff --check fc4377e6` 通过。评分：本次改动 7/10，相对 `fc4377e6` 的总体资金安全 8.5/10；3 项 P2、1 项 P3，没有 P1。上一轮五项中四项判为已修，第 3 项（另一地址）漏了解析中的组合。审查原文在会话的 tasks 输出 `bt4clty29.output`，不在仓库；输出里没有写模型与强度。

| # | 级别 | 发现 | 处理 |
| --- | --- | --- | --- |
| 1 | P2，本次引入（上一轮第 3 项未修完整） | 会话已定在 A，wagmi 已报告连接到 B，而钱包目录仍在初始化或 wagmi 仍在 `reconnecting`：`isResolving` 为真，保留钩子仍返回真，A 的表单与迟到结果出现在 B 前面 | 已修：`useFundsSessionHold` 在已定过地址且观察到另一地址时直接返回假，优先于解析中；还没定过地址时照常保留并采用第一次定下的身份；测试工具新增两个「已报告另一账户」的解析阶段 |
| 2 | P2，本次引入 | 提款已调用交易所请求，同一账户又以 `open("deposit")` 新开存款窗；结果所有者只绑会话与 `open`，旧结果仍提示并 `handleClose()`，关掉新窗、清掉草稿 | 已修：`withdrawalOutcomeOwnerRef` 在调用交易所请求那一刻记下 `{ attempt, opening: getGlobalModalOpening() }`，结算时开窗标识不同就不关窗、不重置（复查发现最初的修复连通知也不发，违反操作反馈契约，已由编排改为照常通知、只是不关窗）；同一次开窗内路由刷新照常通知并关窗；测试改用真实 store 的开窗序号，覆盖新开存款窗与新开提款窗。其中「开窗标识不同就不关窗」2026-11-23 撤回，见「撤回开窗绑定（2026-11-23）」 |
| 3 | P2，本次引入 | 模式复核通过之后、收款地址复核等待期间账户模式变化，复核报激活费变化、受限或不可用（`PreTransferCheckExecutionError`）不在安静分支里，旧尝试提示错误、保存旧提交值并关窗 | 已修：发送与划转的 `executionGuard` / `preExecutionGuard` 把自己抛出的任何错误记进 `WeakSet`，安静分支改认这个集合或 `isExchangeRequestNotSentError`；划转的未分类地区、模式错误一并覆盖；没有变化时照旧提示并关窗 |
| 4 | P3，文档偏差 | CHANGELOG 说刷新失败保留「已经显示过的列表」，而挂载前的缓存列表不保留 | 已修：改为「本页开始读取后收到过的有效列表」 |

三个修复代理的报告（不在仓库）记录：新增用例在修复之前或回退修复时失败（保留：19 项；去掉 `settledWalletAddress !== undefined` 条件时「采用第一次定下的身份」4 项失败；提款：判断改回只看尝试时 4 项「新开窗」用例失败、对照通过，记录 `opening: null` 时 4 项对照失败；发送：条件改回旧类判断时 3 项新用例失败，去掉记入集合时 7 项失败，其中划转的 1 项不受这处改动影响，报告判为负载下的慢用例，之后两次重跑 59 项通过）。部分运行（不是全量）：保留部分 3 个文件 115 项通过，另 14 个文件 600 项通过、5 项在 `global-modals-hip3-disclaimer.test.tsx` 超时（该文件单独跑 31 项通过）；提款部分 13 个文件 987 项通过；发送部分 9 个文件 611 项通过；三处的 typecheck 与改动文件的 Biome 检查通过。提款的「新开窗」用例只证明弹窗内的结算判断，保留的迟到结果只在 key 层面验证，没有在真实弹窗里跑一次 A 的迟到结果。文档按修复后的代码改了 CHANGELOG、展示规范、确认面、实践指南与本记录。第二轮修复后没有再跑 Codex 审查，也没有做浏览器复现。

**拆分后第三轮 Codex 审查（2026-11-23）**（Codex `gpt-6.2-sol`，只读，medium：本次改动 7/10，相对 `fc4377e6` 的总体资金安全 8/10，未发现 P1；第二轮四项确认已修，提款「新开窗不关窗、照常通知」在弹窗仍挂载时成立。原文在会话的后台任务输出 `birf2sebl.output` 里，不在仓库；输出里没有写模型与强度，括号里的模型与强度是本记录沿用前几轮的写法，未从输出核实。以下发现的处理见「收窄（2026-11-23）」）

| # | 严重度 | 问题 |
| --- | --- | --- |
| 1 | P2 | 法律门沿用期间同一账户再 `open("withdraw")` / `open("deposit")`，`SharedGlobalModals` 卸载旧 `DepositModalHost`，结果所有者随之清掉，在途提款的成功或结果不明不再通知 |
| 2 | P2 | 结果在保留期内、wagmi 报告另一地址之前回来时，用沿用的 A 身份发出普通全局通知；之后切到 B，已发出的通知（含常驻的 status unknown）仍留在 B 的界面 |
| 3 | P2 | 发送、划转（以及同一次开窗内的提款）在 `useExchange` 锁内的强制法律复核等待时账户模式变化，复核失败或超时（`LegalActionNotAllowedError`）不在安静分类里，结果身份去掉模式后仍有效，于是报错关窗、发送另存旧模式草稿 |
| 4 | P3 | 页面级 `useFundsSessionKey` 的保留时钟不按账户重置，A 用完 60 秒预算后切到 B，B 在 2 秒内再掉线会立即丢草稿 |
| 5 | P3 | CHANGELOG 与实践指南对存款进度屏与断线提示的承诺过宽（从恢复记录打开的 Circle 转发屏仍读实时 owner；解析中显示静默占位而不是连接提示） |

第 1、2、4 条来自 60 秒保留期（拆分前取证后加入），第 3 条来自结果身份去掉账户模式（第七轮加入），两者都在第六轮之后加入。

**收窄（2026-11-23）**

拆分后三轮 Codex 审查的本次改动评分都是 7/10（总体资金安全 8、8.5、8/10）。第三轮的五条里，第 1、2 条的主要触发窗口与第 4 条来自已登录却失去钱包的 60 秒保留（E2），第 3 条来自不含账户模式的结果身份。运营方随后决定收窄本分支再交付（决定 1，原话没有在仓库存档，由编排转述；三条决定的全文见[实践指南](../../wallet-session-reconnect-practice.md)「负责人决定」）。代码由代码代理改，本记录与文档由文档代理改；以下数字出自代码代理的报告，不在仓库，文档代理没有重跑测试。

去掉的：

| 部分 | 内容 |
| --- | --- |
| 保留钩子 | `useFundsSessionHold` 的失去钱包部分、60 秒预算、`FUNDS_SESSION_AWAY_LIMIT_MS` 与 `FUNDS_SESSION_SETTLED_AFTER_MS`、中断时钟及其计时器与副作用，以及对 `authenticated`、`clientKey`、`sessionMode` 的读取；`apps/` 里已没有这两个常量的引用。钩子现在返回 `isResolving && !anotherAccountObserved`，「观察到另一个账户」指已有定下的钱包、wagmi 已连接且报告的地址不同，记下已定地址的逻辑保留 |
| 发送、划转 | 不含模式的结果身份（键、沿用副本、ref、序号计数与布局副作用）；实时身份键重新包含 `accountAbstraction`；`isCurrentSubmission` 回到比较沿用的提交身份与序号，与 `fc4377e6` 相同 |
| `cancelledBeforeSending` | 简化为「没有发出类错误，且实时会话令牌已变」；其中的身份与序号比较在 `isCurrentSubmission` 覆盖之后是多余的 |
| 提款 | 不含模式的 `withdrawalOutcomeIdentity`；`withdrawalOutcomeScope` 改为 ``open ? `${env}:${fundsModalSessionIdentity}` : null``，即含模式的沿用身份 |

保留的：未发出的守卫失败所用的 `WeakSet`（`rejectUnsent` / `isUnsentFailure`）。把成员判断强制为假时 2 项失败（「Transfer/Send stays quiet and keeps its draft when the wallet reconnects during its guards」），因为那种情形下沿用身份不变，只有这个集合让解析中的守卫失败保持安静。决定 1 列出的其余保留项没有改动。

测试改动（代码代理的报告）：`use-funds-session-key.test.tsx` 恢复 `fc4377e6` 的「remounts when the resolving window ends without a session」，删去五项预算用例与两项「离开后回来」用例，把同一 owner 的目录用例改成「remounts at once when a signed-in wallet leaves the directory and nothing resolves, as it did before the hold (E2)」；`wallet-session-resolving.test.tsx` 把失去钱包的保留用例改成「does not hold a signed-in session whose wallet left the directory and is not resolving (E2)」，新增「holds only while the session resolves, and no longer once the resolving window ends」，删去一项；`global-modals-funds-session.test.tsx` 改为 E2 时立即释放与丢草稿，法律决定超时检查改在 10 秒 ± 1 毫秒；`funds-dialogs-session-resolving.test.tsx` 与 `deposit-modal-withdrawal-routing-guard.test.tsx` 的 E2 用例改为「什么都不报告、弹窗保持」，模式变化的用例改名为「(pre-existing behaviour)」。另一地址、兑换令牌、提款开始时限与开窗、API 钱包与解析中保留的用例没有改，照常通过。

变异（每次先备份、变异、跑测试、恢复，再逐字节比较，全部已恢复）：

| 变异 | 结果 |
| --- | --- |
| 已登录却没有钱包时也保留（`isResolving \|\| (authenticated && walletAddress === undefined)`） | 13 项失败（全部 E2 用例与解析结束的用例） |
| 观察到另一地址不再结束保留 | 31 项失败 |
| 发送身份去掉模式 | 9 项失败 |
| 划转身份去掉模式 | 7 项失败 |
| 提款结果范围去掉模式 | 6 项失败 |
| `WeakSet` 判断强制为假 | 2 项失败，因此保留 |

第三轮五条在收窄后的状态（代码代理的评估，没有改代码，第 3–5 条为文档代理按代码与本轮改动核对）：

| # | 收窄后 | 与 `fc4377e6` 相比 | 未修的原因 |
| --- | --- | --- | --- |
| 1 | 仍可达，但只在解析中、没有观察到另一地址时，最多 10 秒（`WALLET_SESSION_RESOLVING_MAX_MS`）：`isHeldBackOpening` 把新的 `deposit:N+1` 开窗当作挡下，`displayedModal` 变为 `null`，旧宿主卸载、丢掉 `withdrawalOutcomeOwnerRef`；需要在这个窗口里再调用一次 `open("deposit"/"withdraw")`，存款窗遮住页面时 Cmd+K 被挡，基本只能由程序触发。原先 E2 的 60 秒窗口已没有 | 不更差：`fc4377e6` 时带法律门的页面任何重连都会离开可操作分支、立即卸载宿主，结果总会丢；现在只在这个窄情形丢，或保留 10 秒后没有定下时丢，与 `fc4377e6` 相同 | 在旧宿主里显示新开窗等于在未定的会话上显示它，这正是法律门沿用要避免的；真正的修法是独立的在途结果宿主，不是几行的改动 |
| 2 | 仍可达，只在解析中：结果在解析中结算、wagmi 仍报告 A 或什么都没报告时，按沿用的 A 身份通知，之后切到 B 不撤下，「status unknown」留到手动关闭。原先 E2 那条路径已没有（钱包离开、没有解析时结果不再报告）；结算时 wagmi 已报告 B 的，保留已结束、结果安静（「reconnecting-other-account」与「directory-initialising-other-account」用例钉住） | 略差：`fc4377e6` 时解析中结算的结果都不报告，这条最多 10 秒的路径是新的；它就是「同一账户重连后报告结果」的预期行为，效果与「结果恰在切换账户前报告」的既有情形相同，通知文字只描述 A 自己的请求、不写 B 的账户 | 需要按 owner、环境与尝试标识、可由通知宿主在身份变化时撤下的通知（ADR 0019 的任务身份），不是几行的改动 |
| 3 | 结果身份重新含模式：模式变化后这次提交不再是当前提交，旧尝试不提示、不关窗，发送不另存草稿，回到 `fc4377e6` 的行为；没有专门在 `useExchange` 法律复核处阻塞的新用例 | 相同 | — |
| 4 | 随 60 秒预算一起去掉 | 相同 | — |
| 5 | 本次文档修订已改：CHANGELOG 区分本次提交的进度屏与从记录恢复的转发屏，实践指南结论一分开解析中、确认失去钱包等情形 | — | — |

执行分支（PR 2）的两条决定（决定 2、3）：赞助的邮箱手动存款用方案 A，签名之后等一次会话回到点击时的账户，再重做路由、余额、法律与 `smartClient` 的全部新鲜检查后广播，超时或换了身份就停下，法律门契约不变；外部钱包存款在授权签名之后等一次，上限独立写明为 30 秒（不跟 UI 的保留挂钩），等完再做全部新鲜检查，超时报「Wallet not connected」、什么都不发送。这两条取代 7c 的「跟随资金弹窗保留、兜底 70 秒」。PR 2 的重构计划（单一受守卫的 EIP-1193 provider、存款尝试绑定点击时的开窗、显式 Agent 审批 `beforeSign` 与 `beforeSubmit` 同源检查租约、转发记录作为外部存款结果的唯一来源等）由编排整理，交给执行分支 `claude/signer-session-guard` 另开会话实现，本分支不处理。

**收窄后 Codex 审查（2026-11-23）**（Codex，只读，审查对象为收窄后的本分支未提交改动：本次改动 7/10，相对 `fc4377e6` 的总体资金安全 8/10，未发现 P1，也未发现已提交到交易所的请求被改签为另一账户。原文是会话的后台任务输出 `b061s6vsc.output`，不在仓库；输出里没有写模型与强度。Codex 只做静态阅读，没有跑 Vitest、浏览器或真机，也没有复核官方前端包）

| # | 严重度 | 问题 | 处理 |
| --- | --- | --- | --- |
| 1 | P2，本次引入 | 提款在资金锁内等法律复核时路由刷新，预检失效而结果所有者保留；法律复核随后拒绝或超时（`LegalActionNotAllowedError`），或资金锁超时，不在 `stoppedBeforeSending` 里，于是报错、关窗并清空金额与目的地址；`fc4377e6` 要求 `attemptIsCurrent`，路由变化后表单保留 | 已修：`action-error.ts` 新增 `isExchangeRequestStoppedBeforeSending`，按名识别七种在 SDK 调用之前抛出的错误（`AgentRegistrationPreExecutionGuardTimeoutError`、`ExchangeActionDeadlineError`、`ExchangeRequestInvalidatedError`、`FundsActionFeedbackCause`、`FundsActionLockTimeoutError`、`FundsActionLockUnavailableError`、`LegalActionNotAllowedError`），直接抛出或作为一层 `AbstractWalletError` 的 `cause`；`deposit-modal.tsx` 的 `stoppedBeforeSending` 改用它，`cancelledByReconnect` 与 `reportsOutcome` 的其余条件不变 |
| 2 | P2，本次引入 | B 的发送失败留下重试草稿后切到 A，A 的请求在解析中收到明确拒绝，沿用身份让 `isCurrentSubmission()` 通过，`saveSendDraft(A)` 替换唯一的草稿槽，B 的草稿丢失 | 已修：`use-send-draft-store.ts` 改为按 `network:owner` 键保存（`drafts: Record<string, SendDraft>`），保存与清除只动自己的键；store 不持久化，没有旧格式数据要读 |
| 3 | P3，本次引入 | 发送、划转在途时程序以相同参数再开同类窗，store 的开窗序号变了，但旧结果仍通过提交身份检查并关闭新开窗；Codex 没有找到常规点击入口 | 已修：`submitSend` 与 `handleTransfer` 在请求交给交易所之前记下 `getGlobalModalOpening()`，结算时相等才关窗；通知仍按 `isCurrentSubmission()`。2026-11-23 撤回，见「撤回开窗绑定（2026-11-23）」 |
| 4 | P3，测试真实性 | 提款的重连与开始时限用例直接向挂起的 Promise 注入作废或 `ExchangeActionDeadlineError`，没有推进真实调度器的时钟；钱包会话用例没有经过 provider 布局副作用作废队列；兑换用例的 `useExchange` 仍是桩 | 未修，记为后续 |
| 5 | P3，文档 | CHANGELOG 与确认面说重开后结果仍通知，实际只在原宿主仍挂载时成立；实践指南把官方不用 `@privy-io/wagmi` 写成官方「没有 E2」的解释 | 已修（本次文档修订）：CHANGELOG、确认面与展示规范写明提款结果只在发出它的 `DepositModalHost` 仍挂载时通知；实践指南把结论限定为「这个适配器移除目录钱包的机制在官方终端上不会发生」，官方外部钱包路径的等效断开表现写明没有测量 |

两个修复代理的报告（不在仓库，文档代理没有重跑）记录：

- 提款（第 1 条）：`action-error.test.ts` 新增 `isExchangeRequestStoppedBeforeSending` 一组（七个名字共九种错误，法律复核分拒绝、超时与需接受条款，各按直接、作为签名失败的 `cause`、只按名三种方式识别；可能已发出的结果与其他包装不算停下）；`deposit-modal-withdrawal-routing-guard.test.tsx` 对两条路由（`sendToEvmWithData` 与 `withdraw3`）新增「a withdrawal the real exchange path stops before sending」，经 `installScheduledExchange` 用真实 `useExchange`，跑锁内法律复核拒绝（`userAllowed: false`）与资金锁超时（不授予的锁加假计时器推进 `FUNDS_ACTION_LOCK_WAIT_TIMEOUT_MS`）：路由在等待期间刷新时零签名、零请求、零提示、不关窗、金额保留；不刷新的对照提示一次并关窗。变异：恢复旧表达式时 4 项安静用例失败、4 项对照通过；逐个去掉名单里的名字时各 3 项单元测试失败（`LegalActionNotAllowedError` 为 9 项）；不读 `AbstractWalletError` 的 `cause` 时 9 项失败；均已恢复并逐字节比较。运行：两个测试文件加 `deposit-modal-warm` 3 个文件 316 项通过；更宽的 16 个文件 1,063 项里 1,061 项通过，2 项失败在 `deposit-modal-warm.test.ts`，该文件单独跑与 3 个文件一起跑都是 4/4 通过，报告判为负载下的计时问题，没有进一步核实；typecheck 通过，5 个文件的 Biome 检查干净。
- 发送与划转（第 2、3 条）：`funds-dialogs-session-resolving.test.tsx` 新增跨账户草稿两例（A 的拒绝：A 的草稿保存、B 的草稿仍在并回填 B 的表单；A 的成功作对照），以及发送、划转各在「再开一次」与「同一次开窗」下的结算用例（再开时旧成功照常通知、新开窗保持打开且改过的金额 25 与目的地址保留；同一次开窗时通知并关窗）。这组用例用真实全局弹窗 store 与模仿 `GlobalModals` 挂载方式的测试宿主组件，不是 Codex 建议的真实 `GlobalModals`。变异：草稿改回单槽时只有拒绝一例失败；发送或划转忽略开窗判断时只有各自「再开一次」一例失败；均已恢复并逐字节比较。运行：两个测试文件 186 项通过，更宽的 13 个文件 861 项通过；typecheck 第一次因另一个代理正在改的 `deposit-modal-withdrawal-routing-guard.test.tsx` 报两处错误，之后通过；Biome 干净。
- 两个代理都没有改 `packages/hl-react`、`use-deposit.ts`、`use-wallet-session.ts`，没有新增 Lingui 文案。修复之后没有再跑 Codex 审查，也没有做浏览器复现；最终版本的全量结果见「验证与限制」。

**收窄后复查补记（2026-11-23）**：复查代理发现第 3 条的修复带来新问题：余额表里本地渲染的发送、划转弹窗读到的是全局 store 当时开着的别的弹窗的开窗标识，请求在途时打开命令菜单后，成功也不关窗，表单保留原地址与金额，再点一次会重复发送。编排已改为只有 `GlobalModals` 传入 `readOpening={getGlobalModalOpening}` 时才比较，本地渲染照旧关窗，并补了两例（发送、划转各一，变异让两例失败）。开窗比较连同 `readOpening` 随后整体撤回，这两例保留为本地渲染照常关窗的回归，见「撤回开窗绑定（2026-11-23）」。另记一条后续：提现尝试已过期后，钱包拒签等签名阶段的钱包错误会提示并关窗（`fc4377e6` 不提示），不涉及资金风险。

**收窄后第二轮 Codex 审查（2026-11-23）**（Codex `gpt-6.2-sol`，只读，medium：本次改动 7/10，相对 `fc4377e6` 的总体资金安全 8/10，未发现 P1；上一轮两条 P2 与「旧结果关闭同类新开窗」确认已修。原文在会话的后台任务输出里，不在仓库。以下发现的处理见「撤回开窗绑定（2026-11-23）」）

| # | 严重度 | 问题 |
| --- | --- | --- |
| 1 | P2，本次引入 | 「只在发出那次开窗里关窗」带来的回归：同一账户的发送、划转或提款在途时以同参数再开同类窗，表单 key 与提款草稿不随开窗更新，旧结果回来后新窗不关，表单仍是上一笔的金额、地址或方向，忙碌解除后可再次提交（`fc4377e6` 在同一提交身份下会关窗）；需要再次调用同类 `open()`，没有找到发送、划转的常规点击入口 |
| 2 | P3，本次引入 | 首次解析期间挂载的 Send，会话定在 A 后不重挂载，`restoredDraft` 用 `Mainnet:disconnected` 读过一次，不再恢复 A 已保存的重试草稿 |
| 3 | P3，文档 | 确认面规范对 Swap 跨模式重开时「旧兑换的执行守卫不受影响」说得过宽（执行影响基线也有） |

另：全量 Vitest（本轮修复后）766 个文件中 `global-modals-hip3-disclaimer.test.tsx` 2 例失败，原因是测试替代的全局弹窗 store 缺 `getGlobalModalOpening`；补上后该文件 31 例通过，全量待复跑。撤回开窗绑定时这个 mock 里的 `getGlobalModalOpening` 又删去（`GlobalModals` 不再导入它，这个测试里的弹窗都是懒加载桩，Swap 不被导入）。

**撤回开窗绑定（2026-11-23）**

收窄后第二轮 Codex 审查（本次改动 7/10，总体资金安全 8/10）的第 1 条指出，「只在发出那次开窗里关窗」会带来重复提交的风险：同类窗再开时发送、划转的表单与提款的草稿不换实例，旧结果回来后新窗不关，仍是上一笔的金额、目的地址或方向，忙碌解除后可以再提交一次。运营方随后决定撤回这条规则（原话没有在仓库存档，由编排转述），关窗回到 `fc4377e6` 的行为：结果属于当前提交（发送、划转按 `isCurrentSubmission`）或当前结果所有者（提款）时照常通知并关窗，请求在途时同类窗又新开了一次也一样，新开窗里输入的内容随之丢失。

撤回的（代码代理的报告，不在仓库；文档代理按工作树代码逐处核对）：

| 文件 | 内容 |
| --- | --- |
| `send-modal.tsx`、`transfer-modal.tsx` | 删去 `Props` 与 `BodyProps` 的 `readOpening`、`submissionOpening` 与开窗比较；`finally` 回到 `if (isCurrentSubmission() && !cancelledBeforeSending) onOpenChange(false);` |
| `global-modals.tsx` | 不再传 `readOpening`，不再导入 `getGlobalModalOpening`（`useGlobalModalOpening` 仍用于法律门沿用期间的开窗区分） |
| `deposit-modal.tsx` | 删去 `WithdrawalOutcomeOwner` 接口与 `ownsOpening`；`withdrawalOutcomeOwnerRef` 改为 `useRef<WithdrawalPreflightAttempt \| null>`，两条路由调用交易所请求时记下 `attempt`；报告结果时直接 `handleClose()`（含 `resetDeposit`） |

保留的：发送草稿按网络与 owner 分存、没有发出时的安静处理（`WeakSet` 与 `isExchangeRequestNotSentError`）、提款的 `isExchangeRequestStoppedBeforeSending`、重连后开始时限到期按没有发出处理、提款结果所有者跨路由刷新保留并照常报告；兑换仍只在提交时的那次开窗仍是当前开窗时关窗，`getGlobalModalOpening` 仍从 store 导出给 Swap 用。`packages/hl-react`、`use-deposit.ts`、`use-wallet-session.ts`、`spot-swap-modal.tsx` 与 store 都没有改。

测试改动：`funds-dialogs-session-resolving.test.tsx` 的测试宿主删去 `readOpening`，原用例改为「%s notifies the old result and closes the dialog, also when it was opened again (opened again: %s)」（发送、划转各分再开与不再开，共 4 例），断言成功通知只有一条、开窗已关（`getGlobalModalOpening()` 为 `null`）、交易所只调用一次；本地渲染与命令菜单的两例不变。`deposit-modal-withdrawal-routing-guard.test.tsx` 的原用例改为「reports a $outcome withdrawal of the previous opening and closes the dialog opened again on $reopen」，两条路由各 3 种（再开存款窗时的成功与超时、再开提款窗时的成功），断言 `closeDepositModal` 与 `resetDeposit` 各调用一次，删去「新窗金额仍是 `0.4`」。同文件「reports a withdrawal to its own opening after a route refresh answers the %s route」的标题仍带旧说法，断言（通知并关窗一次）与现行行为一致，没有改名。`global-modals-hip3-disclaimer.test.tsx` 删去 store mock 里的 `getGlobalModalOpening`。

变异（代码代理的报告）：在 `send-modal.tsx` 与 `deposit-modal.tsx` 里临时加回「开窗标识没变才关窗」，8 项失败：发送再开一例、余额表本地渲染的发送一例（临时版本无条件比较 store 开窗，比原规则更宽），以及两条路由各 3 个再开用例；之后从备份恢复，`cmp` 确认与修改后版本逐字节一致。没有对划转单独做变异。

其余两条：第 3 条（Swap 跨模式重开）只改文档，`docs/confirmation-surfaces.md` 与展示规范把「旧兑换的执行守卫不受影响」限定为同一模式再开，另写明以另一模式再开时新的 `mode` 立即传给隐藏的旧组件、目标币种、市场与预期订单随之重算，旧兑换可能被执行守卫以 `quote-changed` 或 `swap-data-unavailable` 拦下，与 `fc4377e6` 相同，没有测试覆盖。第 2 条（首次解析期间挂载的 Send 不恢复已保存的重试草稿）未修，记为后续。

**撤回后复查补记（2026-11-23）**：复查代理确认撤回完整、不再有可再提交上一笔内容的窗口，并指出三处：文档把「以 `open("deposit")` 再开」写成与 `fc4377e6` 相同，实际 `fc4377e6` 的上下文标识含页签、旧提现既不通知也不关窗（已改正）；提现结果关窗时的 `resetDeposit` 可能清掉新开窗里刚开始的存款（编排已在 `handleDepositSubmit` 加 `isWithdrawPending` 检查，新用例「does not start a deposit in a dialog opened again while a withdrawal is pending」两条路由各一例，去掉检查时两例失败——测试替身的 `useExchange` 不跟踪 pending，用例里显式把提现标为 pending）；一个用例标题沿用旧说法（已改名）。

## 验证与限制

- 第一次提交的测试：`use-funds-session-key.test.tsx`（真实 `useWalletSession` 加会话阶段工具，8 项）、`deposit-modal-withdrawal-routing-guard.test.tsx` 新增 2 项、`api-wallet-list-passive.test.tsx`、`api-wallet-state.test.ts` 新增用例。变异：钩子不沿用身份时 8 项中 5 项失败；存款弹窗换回修改前时新增 2 项失败；列表换回修改前时 10 项全部失败。第一次提交时本机全量终端 Vitest（`--maxWorkers=4`）765 个文件、11,295 个用例通过，1 个文件跳过。
- 补修的测试与变异（均为本机 jsdom，脚本注入事件）：`global-modals-funds-session.test.tsx` 29 项，去掉法律门的沿用时 9 项失败，key 改回实时身份时 21 项失败（连同 `use-funds-session-key.test.tsx`），首次挂载改回旧写法时 4 项失败；`funds-dialogs-session-resolving.test.tsx` 新增发送、划转在途 2 项，去掉沿用时 2 项失败；存款弹窗新增「SDK 桩已被调用、尚未返回时重连」2 项（cctp 与 bridge；桩不能证明已签名或已发送），去掉沿用时 2 项失败，Bridge 分支改回未连接时 1 项失败；`spot-swap-modal.test.tsx` 新增 1 项；API 钱包列表、视图、状态与控制器测试补齐上表 F3、F6。第二轮补的测试：存款「路由预检期间开始解析」2 项（定回同一账户、仍在解析），提款「三种预检等待中重连」3 项，去掉存款弹窗的实时作废副作用时这 5 项失败；发送「收款地址检查期间会话变化」2 项，去掉令牌检查时「定回同一账户」那一项失败（「仍在解析」由 `submitSend` 的令牌检查拦住）；跨账户草稿 1 项，清除改回无条件时失败；`global-modals-funds-session.test.tsx` 新增 activating 阶段 2 项，去掉 `retainedModal` 限制时 1 项失败。均为 jsdom，脚本注入事件，桩替换了 `useExchange` 与 SDK。第三轮补的测试：提款与发送、划转「调度器在开始前作废」各分经过重连与不经过重连两种（6 项），去掉安静处理时经过重连的 4 项失败；存款数据重试遇重连 1 项、发送表单在重连恢复后立即解锁（并入原用例）、沿用期间关掉再开同类弹窗 1 项、Cmd+K 1 项，各自去掉对应修复时失败。第四轮补的测试：提款条件 Retry 遇重连 1 项、邮箱存款解析期间占位 1 项、另一类开窗等待时已保留弹窗仍显示 1 项、Swap 之后的新开窗不被旧结果关闭 1 项，各自去掉对应修复时失败。
- 全量终端 Vitest（本机，`--maxWorkers=4`）：第三轮修改后的版本 766 个文件、11,365 个用例通过；第四轮修改后的版本 766 个文件、11,369 个用例通过；均 1 个文件跳过。第五轮修改后的版本 766 个文件、11,371 个用例通过；第六轮修改后的版本 11,371 个用例通过，1 个跳过。第六轮修改后没有再跑 Codex 审查。
- 取证与执行层修复的测试（本机 jsdom，桩替换钱包与网络；拆分前的状态，其中执行层的用例随拆分留在执行分支）：`exchange-signer-session-guard.test.ts` 5 项用真实 `ExchangeClient` 与 viem 本地账户；`use-deposit-routing-guard.test.tsx` 新增 8 项；存款弹窗新增会话判断 2 项、提款路由变化 3 项 × 两条路由。变异结果（取证与执行层修复那一版）：入口检查与 provider 检查互为兜底，单独去掉任一项不失败，同时去掉才失败；其余每处单独去掉都有用例失败。7c 复查之后的版本（含静默结束的修改，之后只改了一处代码注释与两个测试名）全量终端 Vitest（本机，`--maxWorkers=4`）768 个文件、11,482 个用例通过，1 个文件跳过；`pnpm typecheck` 通过；Biome 检查 55 个改动文件通过。这些数字属于拆分前的状态（之后提交为执行分支的 `df2703fe`），不是本分支的结果。
- 第七轮、7b 与 7c 的测试（本机 jsdom；拆分前的状态，其中执行层的用例随拆分留在执行分支）：新增 `exchange-provider-tree-retirement.test.tsx`，7b 时 14 项、7c 后 16 项（真实 provider 树与 SDK 客户端，HTTP 传输被监视）；`exchange-signer-session-guard.test.ts` 增至 10 项；`use-deposit-routing-guard.test.tsx` 真实 viem 钱包客户端的一组与桩钱包的会话一组，7b 时各 12 项、7c 后各 15 项（2026-11-23 用 `vitest list` 数出）；存款弹窗的尝试作废、等待的各种结束与模式沿用，提款结果身份各两条路由；发送、划转的结果身份与守卫期间的安静处理；保留计时；显式 Agent 审批的 `beforeSign`。哪些是真实路径、哪些靠桩，见 ADR 0058「验证」。
- 部分运行的数字（都不是全量）：7b 实现者的报告（会话 scratchpad 的 `r7b-implement-*.md`，不在仓库）记录 hl-react 部分 19 个文件 226 项与另 9 个文件 301 项通过，存款部分 38 个文件 1,589 项通过，资金弹窗部分 12 个文件 675 项通过；终端 typecheck 在 hl-react 部分的重跑与存款部分通过，资金弹窗部分运行时因存款部分尚未改完的测试文件失败。更早的第七轮实现者报告（`r7-v2:*.md` 引用的那一批）数字不同，并记录过 `exchange-provider-tree-retirement.test.tsx` 的 TS2344 与一个遗留的 `zz-debug-tree.test.tsx`；这个调试文件现已不在。7c 实现者的报告（会话 scratchpad 的 `r7c-implement-*.md`，不在仓库）数字见上文 7c 表。2026-11-23 文档修订时，在 7c 代码改完的工作树上跑了一次 `pnpm --filter @sairn/terminal typecheck`，退出码 0。第七轮、7b、7c 修改后都没有再跑 Codex 审查，也没有再做浏览器复现。
- 拆分后、第三轮审查之前的版本：全量终端 Vitest（本机，`--maxWorkers=4`）766 个文件、11,518 个用例通过，1 个文件跳过；`pnpm typecheck` 通过；Biome 检查 33 个改动文件通过；`memory:check` 通过。均为 jsdom 与桩，没有浏览器或真机复现。
- 收窄之后（2026-11-23，代码代理的报告，不在仓库，文档代理没有重跑）：改动的 11 个文件跑 `biome check --write`，修了 1 个文件的格式，再跑一次没有修改；`pnpm --filter @sairn/terminal typecheck` 退出码 0；要求的 9 个测试文件 668 项通过（此前另加 API 钱包测试与 `action-error.test.ts` 的一次运行为 14 个文件 822 项通过）；`git diff --check` 干净；`packages/hl-react`、`use-deposit.ts` 与 `use-wallet-session.ts` 与 `fc4377e6` 逐字节相同。收窄后又经两轮 Codex 审查与一次撤回，最终版本的全量结果见下一条。文档代理改完文档后跑了 `pnpm memory:check` 与 `git diff --check`，结果见本次交付的回复。
- 撤回开窗绑定之后（2026-11-23，代码代理的报告，不在仓库，文档代理没有重跑）：7 个改动文件 `biome check --write` 与 `biome check` 都没有修改、没有报错；Vitest 跑 `funds-dialogs-session-resolving`、`deposit-modal-withdrawal-routing-guard`、`global-modals-hip3-disclaimer`、`global-modals-funds-session`、`funds-action-balances`、`spot-swap-modal` 6 个文件 517 项通过；`pnpm --filter @sairn/terminal typecheck` 无报错；没有提交。撤回之后没有跑全量 Vitest，也没有再跑 Codex 审查或浏览器复现。
- 最终版本（撤回开窗绑定与撤回后复查补记之后，本地提交前）：全量终端 Vitest（本机，`--maxWorkers=4`）766 个文件、11,557 个用例通过，1 个文件跳过；`pnpm typecheck` 通过；Biome 检查 33 个改动文件通过；`memory:check` 与 `memory:test`（12 项）通过；`git diff --check` 通过。最终版本没有再跑 Codex 审查；均为 jsdom 与桩，没有浏览器或真机复现。
- 浏览器复现只有桌面 Chrome 加 MetaMask 扩展、脚本注入事件（实践指南 E1–E5）；没有真机、钱包 App 或 WalletConnect 证据；没有用真实钱包完成签名或存款。

## 后续与替代关系

- 收窄后第二轮审查第 2 条（首次解析期间挂载的 Send 在会话定下后不恢复该账户已保存的重试草稿）未修，记为后续：在开窗第一次绑定到有效 owner 时恢复一次草稿，只填尚未编辑的字段，并用真实 Send 覆盖。第 1 条已按运营方决定撤回开窗绑定，第 3 条已在文档里收窄，见「撤回开窗绑定（2026-11-23）」。
- 同类窗在请求在途时再开，旧结果关闭新开窗、新开窗里输入的内容丢失（与 `fc4377e6` 相同）；要保住它需要给每次开窗独立的表单与结算宿主，不是几行的改动。

- 运营方已选择收窄（见「收窄（2026-11-23）」）。第三轮仍未修的：第 1 条（法律门沿用期间同类新开窗卸载旧 `DepositModalHost`，在途提款结果丢失，修法是独立的在途结果宿主，并用真实 `GlobalModals` 与 store 测「提交 → 重连 → 新开同类窗 → 结算」）与第 2 条（解析中按沿用身份发出的通知在切到另一账户后不撤下，修法是按 owner、环境与尝试标识、可撤下的任务通知，并用真实 Toaster 测「先结算、再切换」）。
- E2（已登录却失去钱包，Privy 把钱包移出目录）：本分支不覆盖，草稿丢失，与 `fc4377e6` 相同。根因与官方做法见实践指南「依赖源码核对」与「官方交易终端实现补充」第 1、2 条（`@privy-io/wagmi` 直接写 `disconnected`；官方资金弹窗不按钱包身份设 key）；在 PR 2 或单独的任务里处理。
- 请求发出之后账户模式变化（含变为未知）时，发送、划转与提款的结果不通知、不关窗（既有，收窄后恢复）；要改需另行设计，不能简单去掉身份里的模式（第三轮第 3 条就是这样引入的）。

本分支：

- 钱包弹窗与发送在签名与发送边界还没有会话检查：已交给 SDK 的外部钱包请求在会话变化后仍可能弹出签名并发送（E5，第三轮 #2 的既有部分），手动存款进入 `deposit()` 之后的切链、连接、签名与广播不核对会话（第三轮 #1）；资金弹窗的执行守卫只在 SDK 等待之前跑一次（第七轮 #7 的既有部分）。这些在执行分支 `claude/signer-session-guard` 上规划，尚未合入。
- F5b–F5d（账户类型弹窗、Link mobile device 弹窗与仪表盘页面在解析中的展示）仍待处理；F5d 的 API 钱包页一并纳入 `mobile-data-presentation-registry.ts` 的覆盖范围。
- 存款进行中的状态屏、提款结果归属与路由：已在 2026-11-22 处理并留在本分支，原后续项关闭。
- Bridge 页签的输入在解析期间保留（上移到持有资金会话 key 的层级）。
- 手机真机、钱包 App 与 WalletConnect 下的重连事件序列（实践指南「尚未取得的证据」），以及真实钱包下的签名与存款验收。
- 发送、划转在守卫读到新账户模式后是否提示取决于缓存更新与拒绝的先后，没有测试覆盖；可改成按点击时的模式在 `catch` 里判断，并补一个模式读取桩写缓存的用例。提交身份与序号的那一条判断只是防御（去掉它没有用例失败，出自 7b 实现者的变异记录 `r7b-implement-dialogs.md`，不在仓库，拆分前记录）。安静处理及其代价已写入 `docs/confirmation-surfaces.md`。
- `owner-signer-provider.tsx` 在渲染阶段写 `currentBinding`，被放弃的并发渲染可能让已提交绑定的检查误抛（偏向「没有发出」，既有，本分支同样存在）。
- 收窄后的全量终端 Vitest、typecheck 与 Biome 结果待补。
- 收窄后 Codex 审查第 4 条（测试真实性）：用真实 provider、调度器与 `StrictMode` 验证重连提交、开始时限时钟与结算的先后顺序，保留现有注入错误的用例。
- 提款过期尝试的安静名单只含 `isExchangeRequestStoppedBeforeSending` 的七个名字：`WalletAccountMismatchError`、`MissingWalletError` 与带 `PRE_EXECUTION_GUARD_*` 消息的普通错误同样在 SDK 调用之前抛出，过期尝试遇到它们仍提示并关窗；按实时会话令牌判断的 `cancelledByReconnect` 仍只认 `isExchangeRequestNotSentError`，重连后上下文未变时的法律拒绝或资金锁超时照旧提示。
- 发送、划转与提款「再开同类窗时旧结果关窗」的用例用的是真实全局弹窗 store 与测试宿主（提款直接渲染存款弹窗），没有经过真实 `GlobalModals`；发送草稿表按账户与网络累积、没有上限，页面重新加载即清空。

执行分支 `claude/signer-session-guard`（记在这里供那个分支接手，本分支不处理；PR 2 按运营方 2026-11-23 决定 2、3 与编排整理的重构计划实现，见「收窄（2026-11-23）」末段，下列 7c 存款等待相关的条目以这两条决定为准）：

- 第八轮审查的第 1–7 条（见上表）都属于执行分支：存款代理之外的 Privy `switchChain`、存款最后一次等待与法律和余额结果、存款尝试与单次开窗的绑定、显式 Agent 审批的注册租约、外部存款回退发送的错误分类、断线期间切换环境的未定世代，以及 `exchange-provider-tree-retirement.test.tsx` 的纳入。
- 7c 存款复查 P2-1 的另一种修法（让结果归属于尝试，执行状态键已不是尝试那一个时不报）没有做；经过真实 `useFundsSessionKey` 或 `GlobalModals` 的用例仍没有补。
- 7c 存款复查 P3-1：赞助路径的兜底 `timeout` 以 `status_unavailable` 的地区可用性文案停下，几乎不会广播；可在实时 `clientKey` 为 `disconnected` 时直接报「Wallet not connected」，并补一例 `selectedOwner = "disconnected"`。钩子测试已改名为「lets a sponsored deposit go on to its checks when the session wait times out」与「does not send after the signature when the session wait times out」，`use-deposit.ts` 里 `awaitSettledSession` 的注释已按现行行为改写（7c 之后，编排）。
- 7c 存款复查 P3-2：外部路径最后一道检查在 `writeContract` 读链 ID 的那次往返里会话闪断时静默停下，已签的许可白费；可改报「Wallet not connected」，或维持为已记录的限制。
- 存款等待的其余限制（按决定只写入文档）：保留的计时器在页面隐藏时照样走；在转发之前停下、删除授权意图又失败时提示「Deposit status unknown」并关窗。
- 资金弹窗（提款、发送、划转）在 SDK 签名前的等待里关闭时钱包仍会弹窗：需要槽位上一个只检查「弹窗打开、尝试仍是当前」的签名前检查。
- `unresolvedGenerations` 里凭据相同的未定世代不会清理，每次重连一条。
- Agent 已批准、builder fee 一步在开始前抛普通错误时不归为 `TradingAuthorizationIncompleteError`（按决定不改）。
- 经过 `GlobalModals`、真实弹窗与真实 `useDeposit` 的端到端用例（保留在断开状态结束时弹窗重挂载、等待以 `replaced` 静默结束、不出现过期提示）。
