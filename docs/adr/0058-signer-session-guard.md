# ADR 0058：签名前严格核对会话，签名后只在换了身份时停下

- 状态：已在工作树实施，分支 `claude/signer-session-guard`（基于 PR 1 的 `fce35f78`），未合入、未发布。2026-11-22 起草，同日按第七轮审查修订，2026-11-23 按 7b、7c 两轮复查再修订；2026-11-23 拆分之后按运营方当日的决定重写决策 5（所有钱包请求经同一层受保护的 provider、签名后只等一次、外部钱包 30 秒、赞助路径选项 A、转发台账），并处理第八轮审查第 1–6 条（[交接记录](../work-memory/sessions/2026-11-23-signer-session-guard-handover.md)）。真实钱包、WalletConnect 与真机未验收。
- 关联：[钱包会话短暂重连：实践指南与取证](../wallet-session-reconnect-practice.md)（本决定的证据与负责人决定）；[ADR 0053](0053-exchange-action-start-deadline.md)（入队到签名的 15 秒上限，与本决定并列在同一个签名入口）；[ADR 0002](0002-exact-owner-trading-signers.md) 与[签名模型](../hyperliquid-signing.md)；[ADR 0040](0040-automatic-email-wallet-deposits.md)（自动存款不受本决定约束）；[移动端数据展示规范](../mobile-data-presentation.md)「钱包会话解析中」；[任务记录](../work-memory/sessions/2026-11-21-funds-session-and-api-wallet-quiet.md)。

## 背景

2026-11-22 在本机复现（实践指南 E1–E5，桌面 Chrome 加 MetaMask 扩展，事件由脚本注入）：

- 钱包报告断开再恢复同一账户时，前约 750ms 被判为确认断开（Privy 把钱包移出目录，`isResolving` 为假），资金弹窗重挂载、草稿丢失（E2）。
- 点击之后、SDK 读链 ID 时断开，应用已判为断开，SDK 仍向钱包请求 `eth_signTypedData_v4`（E5）。`clients.ts` 的 `guardSigning` 只检查 ADR 0053 的时限，不检查会话。
- 手动存款进入 `deposit()` 之后，切链、请求连接与签名前不再检查会话；外部钱包存款进行中，执行状态按实时地址读取，解析期间状态屏消失。
- 提款请求已经交给交易所后，路由刷新变化会让弹窗的上下文标识变化，这次尝试被清掉，结果不再通知。

官方终端（现场代码阅读）签名前后都不检查会话，签名出错一律当作用户拒签；Hyperliquid 对签了名但从未提交的动作不记录，旧签名在 nonce 窗口内仍有效。

2026-11-23 运营方把资金会话任务拆成两条线：展示层与结果归属（会话解析中保留草稿、API 钱包静默、结果归属）作为 PR 1 在分支 `claude/funds-session-and-api-wallet-quiet` 交付；本 ADR 只管签名与发送边界，在分支 `claude/signer-session-guard` 上，基于 PR 1。

## 决策

1. **会话世代按原因退役；`HyperliquidOwnerSignerProvider` 不再因会话身份变化退役。**
   - 会话身份（网络、`clientKey`、会话模式）的变化只由 `session-provider.tsx` 处理：变为未定（`clientKey` 为 `disconnected`）时，上一个世代记为 `unresolved`；变为另一个身份（含网络切换）时记为 `replaced`。之后定在与最后一次确认不同的身份上，`markExchangeIdentityReplaced` 把该 owner 未定的世代升级为 `replaced`；用户主动断开（`disconnectWallet`）也直接调用它。会话仍未定（`clientKey` 为 `disconnected`）时网络变了，最后一次确认的身份在这个 provider 上已不可能回来，`markExchangeIdentityReplaced` 立即把它升级为 `replaced`，并清掉最后确认的身份（第八轮第 6 条，2026-11-23）；终端切换网络会导航，生产中触发不到，共享包按同一规则处理。provider 卸载由 `invalidateExchangeProviderLifecycle` 处理，每个世代都带着自己的 `lifecycle`。槽位条目带着自己的世代（`ExchangeSigningSlotEntry.generation`）。
   - 其余的退役照旧由各自的模块以 `replaced` 做，本次没有改：
     - Agent-only owner 切换或清除（`agent-session.ts`）。它的跨标签页存储事件：owner 换了或被清除时退役原 owner 的 Agent-only 会话，存储被清空或条目无法解析时退役全部身份。
     - Agent 密钥替换或删除（`agent-storage.ts`，只退役 Agent 签名者）。它的跨标签页存储事件：Agent 密钥条目变化只退役该 owner 的 Agent 签名者，注册会话条目不可用时退役该 owner 的全部签名者，存储被清空（`event.key === null`）时退役全部身份。
     - 注册会话失效（`agent-registration-session.ts`）。
   - `HyperliquidOwnerSignerProvider` 挂载与卸载时不退役任何世代。它只在同一身份内（网络、`clientKey`、会话模式都没变）之前的绑定带 owner 钱包（`binding.wallet` 非空）、且绑定对象变了时，把这个身份的 `user` 签名者世代记为 `replaced`。没有钱包的绑定上不会有在途的主钱包签名：绑定非空时 `useClients` 的 `user` 客户端就是 owner 客户端，而 `createOwnerSignerClient` 要求 `wallet` 与 `ownerAddress` 都在。所以外部钱包会话（绑定为空）在绑定从空变为非空、或闪成一个不带钱包的绑定再变回空时都不退役，闪动之前已在钱包里等待确认的外部签名照常发送；邮箱 owner 的绑定失去钱包或换了钱包对象，仍然退役。
   - 未定世代的升级（`request-scheduler.ts`）：`invalidateExchangeRequestIdentity` 以 `replaced` 退役时，同一 owner 里按同样的会话模式与签名者过滤的未定世代一并升级为 `replaced`，所以 Agent 密钥替换或删除（`signer: "agent"`）只升级 Agent 签名的未定世代；`captureExchangeRequestGeneration` 每次新捕获时，同一身份、同一签名者、凭据（注册 epoch、Agent 公钥、激活 epoch、`lifecycle`）不同的未定世代升级为 `replaced`。凭据相同的未定世代保持 `unresolved`，照常发送。
2. **签名前严格。** 每个客户端包装的签名器在调用钱包之前（`guardSigning`，`defaultExpiresAfter` 之后再查一次）要求世代仍是当前世代，否则抛 `ExchangeRequestInvalidatedError`，`phase: "before-signature"`，钱包不弹窗。Agent 签名器不检查：它用本地密钥，不弹任何窗口，仍受时限和决策 3 的发送检查约束。邮箱主钱包签名器（`owner-signer-client.ts`）在读地址、读链 ID 与签名前同样按 `before-signature` 检查。显式 Agent 审批（`use-explicit-agent-approval.ts`）的客户端不经过调度器，槽位没有世代，`isGenerationCurrent` 对它恒为真；它改由签名器的 `beforeSign` 在交给钱包之前检查（外部钱包在 `walletClient.signTypedData` 之前，Privy 在 `signTypedData` 之前；签名器 `await` 它，它正常结束才调用钱包）：先同步核对审批会话与地区，再在注册会话锁内核对注册租约（`isAgentRegistrationExecutionLeaseCurrent`，与 `beforeSubmit` 同一来源：会话记录的 epoch，以及租约带 Agent 公钥时本地 Agent 密钥的公钥），等锁时带上审批的取消信号，取消后不再排队、按 `AbortError` 结束（第二轮复查第 4 条）；锁返回后再核对一次点击的签名时限（ADR 0053，`assertExchangeSigningDeadline`，锁等待可能跨过它；第一轮复查第 3 条）与会话、地区。所以另一个标签页结束了注册会话、或换了 Agent 密钥之后，钱包不再弹出签名（第八轮第 4 条，2026-11-23；之前只到 `beforeSubmit` 才拦住）。`beforeSign` 抛出的错误与 `beforeSubmit` 的同类：审批信号已中止时的 `AbortError`、审批会话或注册租约已变时的 `identity-changed`，以及地区不允许时的 `TradingRegionBlockedError`（只有命名 Agent 授权检查地区，`isNamedAgentGrant`）。`beforeSubmit` 与 `canSend` 不变。
3. **签名后只在换了身份时停下。** 传输层对 `/exchange` 的请求（`guardSending`）只在世代已记为 `replaced` 或生命周期已结束时抛 `phase: "after-signature"`，不发送。签名返回时会话只是仍未定（没回到原账户，也没定在别的账户上），照常发送：负责人 2026-11-22 决定，与官方一致，理由是签名者就是账户本人，作废只会让用户白签一次。资金锁内的执行守卫照旧在调用 SDK（签名之前）时运行；签名之后到发送之间，只检查世代是否已被替换。Hyperliquid 请求的外部钱包签名与 Agent 签名按这条处理，手动存款见决策 5。邮箱主钱包签名器是例外：签名之后它仍核对 owner（`verifyOwner("after-signature")`），绑定已变就丢弃签名、不发送；内层 Privy 签名器因绑定变化抛出的普通错误，在 `owner.assertCurrent()` 此时也失败时转成 `after-signature`，否则原样抛出。这种签名本来就不弹窗（`showWalletUIs: false`），归为「没有发出」，不会自动重签；资金弹窗是否安静按 PR 1 的展示规范判断（决策 6），否则按失败提示。
4. **阶段可区分，发出之后的检查不报「没有发出」。**
   - `ExchangeRequestInvalidatedError.phase` 取 `before-start`、`before-signature`、`after-signature`，三者都没有到达交易所。`before-start` 来自调度器在开始前作废，以及 `useExchange` 在 mutation 开始、调度器开始执行与 Agent 注册执行的 `canStart` 处对 owner 签名器的检查：应用自己的 `assertCurrent` 抛出的任何错误都转成 `before-start`（`assertOwnerSignerBeforeStart`）。
   - SDK 会把签名器抛出的错误包进 `AbstractWalletError.cause`，`unwrapExchangeSignerGuardError` 与 `isExchangeRequestInvalidatedError` 只拆这一层。应用用 `isExchangeRequestNotSentError`（作废或 ADR 0053 时限）把它们归为「没有发出」。
   - 审批可能已经到达交易所之后的检查不会抛这类错误：`useBuilderFeeApproval` 在审批返回后的两次核对和确认查询（`refetchBuilderFee`），`useTradingAuthorization` 在注册 Agent 或审批 builder fee 之后的核对与要求查询，把作废错误改写成已有的「Wallet changed during builder fee approval」或「The wallet or network changed during trading authorization」。本次授权已经批准了 Agent、builder fee 一步因时限（`ExchangeActionDeadlineError`）或作废（`ExchangeRequestInvalidatedError`）没有发出时，报 `TradingAuthorizationIncompleteError`（显示「Failed to enable trading」）；这一步在开始前抛出的普通错误保留自己的文案（见未覆盖的范围）。
   - HTTP 请求开始之后：交易所没有给出确定答复的失败（`HttpRequestError` 没有状态、状态低于 400、为 408 或不低于 500，以及 `ExchangeResponseUnverifiedError`）按结果不明处理（`isAmbiguousExchangeActionError`）；`ApiRequestError`、其余 4xx 与已确认的响应各走自己的分支。
5. **手动存款的执行链（2026-11-23 重写，负责人决定 2、3）。**
   - `DepositReview.session` 只对手动存款生效，自动存款（ADR 0040）没有点击可归属，不检查。
   - **一层受保护的 provider。** 一次尝试的所有钱包请求都经过同一层 EIP-1193 代理（`guardDepositProvider`）。不再调用 Privy 的 `wallet.switchChain`：Privy 3.46 在未知链时经自己的 provider 发 `wallet_addEthereumChain` 与第二次切链，绕过代理（第八轮第 1 条）。切链一律由 `requestDepositChainSwitch` 经代理发出：先 `wallet_switchEthereumChain`，钱包报未知链（代码 4902，或消息含 unrecognized chain、unknown chain、addEthereumChain、4902，覆盖 Privy 识别的 Rabby 与 Coinbase 写法）时加链再切一次；Rabby（`walletClientType === "rabby_wallet"`）在加链之前等 300ms，与 Privy 相同。会弹窗的方法（`eth_requestAccounts`、`wallet_switchEthereumChain`、`wallet_addEthereumChain`、`eth_signTypedData_v4`、`eth_signTypedData`、`personal_sign`、`eth_sign`）先过会话检查；发送与广播方法（`eth_sendTransaction`、`wallet_sendTransaction`、`wallet_sendCalls`、`eth_sendRawTransaction`）先过同步闸门，再记入这次尝试的转发台账。赞助路径的智能钱包发送不经过 provider：闸门在调用 Privy 的 `sendTransaction` 之前，Privy 之后在 SDK 内部准备 UserOperation、用内嵌钱包自己的 provider 签名、再发给 bundler，这一段不经过闸门（见未覆盖的范围）。
   - **每次点击一个尝试**（`createDepositSessionAttempt`，`lib/hyperliquid/deposit-session-attempt.ts`）。它记下点击时的 `getGlobalModalOpening()`、`isResolving`、`clientKey` 与存款钱包地址；弹窗每次 React 提交（无依赖的布局副作用）报告当时的快照，卸载时作废它，新的点击也作废上一次的尝试。作废是单向的，A → B → A 保持作废，原因有三：开窗标识不再是点击时那一次（关窗、再开、换成别的全局弹窗；检查时同步读 `getGlobalModalOpening()`，所以同一账户下关窗与重开合并成一次提交也算，第八轮第 3 条）；弹窗卸载；会话定在另一个非空钱包或另一个非 `disconnected` 的 `clientKey` 上。尝试还数中断：每次提交时会话不在点击时的身份上（解析中、没有钱包、`disconnected`、另一个身份、已作废）就加一，只增不减。
   - **签名之前**，会弹窗的请求要求 `isCurrent()`：没有作废、开窗仍是点击时那一次、实时会话令牌（`useLiveSessionToken`，身份含账户模式）仍是点击时那一个。
   - **签名之后只等一次，早于全部新鲜复查。** 许可签名返回后立即等会话（`waitUntilSettled(DEPOSIT_SESSION_SETTLE_TIMEOUT_MS)`，30 秒，`config/time.ts`），等待之前不跑任何复查。三种结局：`same`，会话定在点击时的钱包地址与 `clientKey` 上（不在解析中），继续；等待同时交回定案那一刻的中断次数，作为之后闸门比较的基线，所以定案之后、调用方恢复之前的提交也算中断，这时等待一结束就静默停下（第一轮复查第 2 条）；`replaced`，尝试已作废，静默回到空闲，不保存授权意图；`timeout`，30 秒内既没回来也没作废，两条路径都报「Wallet not connected」，什么都不发送、不保存。30 秒按墙钟与单调时钟中先到者计（与 ADR 0053 的签名时限相同：单调时钟不受系统时间回拨影响，墙钟能数到 `performance.now()` 可能不计的设备休眠）：会话在上限之后才回到点击时的账户，即使计时器回调还没跑（页面在后台时计时器会被延后），也按超时结束；作废照旧优先于超时（第二轮复查第 1 条、第三轮复查第 1 条）。上限是独立写明的 30 秒，不跟资金弹窗的展示保留（`useFundsSessionHold`）挂钩。外部钱包的等待与上限来自负责人决定 3；赞助路径按决定 2 的选项 A 同样等一次、超时或换了身份就停下，超时时与外部路径显示同一条提示（决定没有规定提示文案，这一条是实现的选择）。
   - **等待之后只剩复查、同步闸门与发送或广播。** `same` 之后全部新鲜复查按原顺序重做：路由；Circle 费率与快速额度；赞助路径的锁定余额，外部路径的 gas 估算、gas 价格、ETH 余额与区块号；法律（`verifyFreshLegalAction`，契约不变）；`eth_accounts`；外部路径的链；赞助路径重新取得的智能钱包客户端（`getClientForChain`，核对链与 paymaster，广播用这个新客户端）。然后是同步闸门 `assertSettledTail`：尝试没有作废、中断次数与等待结束时相同、会话仍定在点击时的身份上；之后保存授权意图，再发送或广播。复查期间会话再中断一次，哪怕在闸门之前又回到同一账户，闸门也静默停下。某个复查在这段时间里失败时，尝试已作废（换了身份、弹窗关闭或重开）而且什么都没有转发给钱包才静默，因为这次尝试已经没有自己的弹窗可以显示它；外部路径进了 `writeContract`、viem 读链 ID 失败而还没有转发任何发送时也一样（第二轮复查第 3 条）；没有作废就照常报告这个错误（法律拒绝、费率变化、断线期间法律复查报的 `status_unavailable` 都一样），什么都没有发出，第一轮复查第 5 条。不会再等第二次，也不带等待之前或中断期间的复查结果进入广播。正在跑的只读复查不会被中断打断，它们跑完才在闸门停下。
   - **外部存款的结果只看转发台账**（第八轮第 5 条）。台账的 `hasUncertainSend` 单调：任何一次转发得到回答，或以不是「明确什么都没广播」的错误失败，就为真；明确拒绝的代码集合（`DEFINITIVE_WALLET_SUBMISSION_ERROR_CODES`）与 cause 链读法（最多 6 层，跳过 viem 的 -1，任何一层出现其他代码就不算）不变。台账为真之后，代理不再转发任何发送：viem 在 `eth_sendTransaction` 得到不明确的回答（例如 -32000，viem 归为 InvalidInputRpcError）之后会退回 `wallet_sendTransaction`，这第二次发送被拒绝在代理里，钱包不会在可能已经上链的第一笔旁边再广播一笔（第一轮复查第 4 条）；只有明确拒绝之后（例如 -32601 方法不存在）才允许回退。`writeContract` 失败时，台账为真就保留授权意图并报结果不明（「Deposit status unknown」）；台账为假（一次也没转发，或每次转发都被明确拒绝）就删除意图，按普通失败或会话停止处理，不再因为「已经开始发送」而报结果不明（例如 viem 在发送之前读链 ID 失败）。`isDepositSubmissionOutcomeUnknown` 改由台账（`directSubmissionUncertain`）决定外部路径。删除意图失败时：会话停止仍报结果不明（既有路径）；普通失败显示原错误，意图留到过期。
   - **viem 发送之前读一次 `eth_chainId`，保留。** 给 `writeContract` 传 `chain: null` 可以去掉这次往返，但交易请求就不再带 `chainId`，钱包无法拒绝链不符的发送，所以没有采用。顺序是：应用的同步闸门、保存意图、`writeContract`、viem 读链 ID、代理里的同一个闸门、转发。读链 ID 那次往返里会话闪断，代理里的闸门静默停下，已签的许可没有用上；窗口只有这一次 RPC。
   - 会话错误在没有任何提交之前发生时，执行状态静默回到空闲，不显示错误；切链与连接的错误包装不会吞掉它。法律复查只在 `same` 之后跑，等待期间 `clientKey` 为 `disconnected` 不会让它报错。
6. **与 PR 1 的分工。** 本分支基于 PR 1：资金弹窗的保留（`useFundsSessionHold`）只在会话解析中成立，拆分前的 60 秒失去钱包保留已在 PR 1 收窄时去掉；存款弹窗在保留期内把沿用的钱包地址与存款模式交给 `useDeposit`，执行状态键与执行锁键不随重连变化；发送、划转与提款的结果身份含账户模式；这些展示与结果归属规则以 [移动端数据展示规范](../mobile-data-presentation.md)「钱包会话解析中」与 [PR 1 任务记录](../work-memory/sessions/2026-11-21-funds-session-and-api-wallet-quiet.md) 为准，本 ADR 不复述。手动存款签名后的等待不读这个保留（决策 5）。拆分前本 ADR 的决策 6–8 写的是 60 秒保留、按保留结束的三次等待与不含账户模式的结果身份，都已不是本分支的行为。

## 备选方案

- **签名后也按未定作废**：E5 那样的竞态里用户已经签了名，作废后要再签一次，签名者就是本人，且官方照常发送。负责人选择照常发送。
- **只在界面层检查**：E5 表明应用已判为断开后 SDK 仍会请求签名，界面层拦不住已经进入 SDK 的请求。
- **存款逐处检查、不包装 provider**：存款流程里所有会弹窗的 JSON-RPC 请求都经过同一个 provider，包装最难漏掉；不经过它的只有 Privy 的 `switchChain` 与智能钱包发送，这两处单独检查。
- **外部钱包存款在会话不是点击时那一个就立即放弃**（第七轮的第一版）：同账户恢复前就到了发送一步时会丢掉已签的许可，用户什么反馈都看不到。改为签名后等待会话定下。另一个退路是发送前只看 `isCurrent()`，任何一次闪断都会作废这次尝试。
- **存款的等待用固定的 10 秒上限、两条路径超时都不发送**（7b）：10 秒短于资金弹窗 60 秒的保留期，钱包离开目录（E2）后第 11 到 60 秒回到同一账户时，弹窗仍在保留，存款却已报错；赞助路径超时不广播与「签名返回时仅未定照常发送」不一致。7c 改为跟随弹窗的保留，并按路径分开处理超时。
- **签名后等待跟随资金弹窗的保留、三次等待、70 秒兜底**（7c，拆分前快照 `df2703fe`）：等待在法律复查与钱包检查之后才做，等待跨过中断后沿用了等待之前的复查结果（第八轮第 2 条）；三次串行等待最长约 210 秒；赞助路径兜底超时之后仍往下走。2026-11-23 负责人改为只等一次、独立上限，本 ADR 决策 5 取代它。
- **签名后的每段复查之间都再等一次**：会话在复查期间再中断时能继续，而不是白签一次；但等待次数没有上限，复查结果的新旧也难以说清。负责人选择只等一次，之后的中断静默停下。
- **继续用 Privy 的 `wallet.switchChain`，只在它前面检查一次**（第七轮的做法）：它自己的加链与第二次切链不经过存款代理，第一次切链等待期间会话失效后仍会弹窗（第八轮第 1 条）。
- **照官方，不检查**：官方的邮箱会话不受传输层断开影响，外部钱包会话会丢草稿并可能在断开中签名；本仓库「短暂数据缺失不下断开结论」「签名身份必须是确切 owner」的规则要求更严格。

## 未覆盖的范围

- 检查与钱包真正收到请求之间仍有一段消不掉的窗口：WalletConnect 经中继投递，扩展在 `request` 内部才弹窗；显式 Agent 审批的租约检查在锁返回之后、钱包调用之前还隔着几个微任务，由 `beforeSubmit` 兜底。
- 签名返回时会话仍未定，照常发送（决策 3），这是有意的。
- 资金弹窗（提款、发送、划转）在 SDK 签名前的等待里关闭：执行守卫只在调用 SDK 之前跑一次，SDK 内部的等待（读链 ID、nonce）期间弹窗关闭或尝试失效，世代没变，钱包仍会弹窗。修法是在槽位上加一个只检查「弹窗打开、尝试仍是当前」的签名前检查，不重跑余额守卫；未做。
- 回到同一身份、凭据相同的未定世代留在 `unresolvedGenerations` 里，直到该 owner 被替换，大约每次重连一条。
- Agent 已批准、builder fee 一步在开始前因会话未定或地址变化抛普通错误（「No wallet connected」「Wallet changed during builder fee approval」）时，不归为 `TradingAuthorizationIncompleteError`；文案不说「什么都没发出」，但也没有说明 Agent 已批准。按决定不改代码。
- `owner-signer-provider.tsx` 在渲染阶段写 `currentBinding`，被放弃的并发渲染可能让已提交绑定的检查误抛，偏向「没有发出」（既有）。
- 手动存款（决策 5）：
  - 已登录却失去钱包（E2，钱包离开 Privy 目录、`isResolving` 为假）时，`GlobalModals` 的 `useFundsSessionKey` 立即按新身份重挂载存款弹窗，尝试随卸载作废，等待以 `replaced` 静默结束，已签的许可没有用上，同账户 800ms 后回来也一样。这是 PR 1 的已知限制（E2 记为后续）；修 E2 时，这里会变成等到 30 秒上限。
  - 全应用的解析时钟 10 秒就把一直未定的会话按没有钱包处理，弹窗随之重挂载，所以经过 `GlobalModals` 时 30 秒的上限很少走到；它是独立的兜底，弹窗一直挂载（例如本地渲染的弹窗）时才会以「Wallet not connected」结束。
  - 30 秒计时器在页面隐藏时照样走：Android 上签名回调在后台到达、用户还停在钱包 App 里时，等待可能在后台到期。按决定不加可见性处理。
  - 已签的许可被丢弃时（没有广播，也没有保存授权意图），EIP-3009 授权本身并没有被撤销，在 `validBefore`（构造签名参数时起 1 小时，`CCTP_AUTHORIZATION_WINDOW_SECONDS`）之前理论上仍然有效。它没有由本页广播，但不能说从未离开本页：外部路径在等待之后估算 gas（`estimateContractGas`，参数含签名）时已把它发给 RPC 节点；被钱包明确拒绝的那次发送也交给了钱包。
  - 会话停止、删除授权意图又失败时，提示「Deposit status unknown」并关窗，虽然这次确定没有发出（「could not be confirmed」有误导）。按决定沿用已有路径。普通失败（例如钱包明确拒绝）之后删除意图失败，界面只报那个失败，下一次提交却被旧意图挡住，直到它过期（既有，第一轮复查第 5 条后半）；未改。
  - 已经交给钱包的旧存款，结果回来时会关闭同一账户之后新开的存款弹窗：执行状态按网络、模式与钱包共用，结果副作用只比较状态与哈希（既有，第一轮复查第 6 条；结果归属属于 PR 1 那条线）；未改。
  - 赞助路径的闸门在调用 Privy 智能钱包的 `sendTransaction` 之前（第一轮复查第 1 条，Codex 评为 P1）。Privy 3.46 的无界面发送随后在 SDK 内部准备 UserOperation（paymaster 与 gas 估算）、用创建客户端时取得的内嵌钱包 provider 签名、再调用 bundler 的 `eth_sendUserOperation`，这一段通常几秒，不经过存款代理；这期间换到另一个账户或关闭弹窗，广播仍会完成。发出的是点击时 owner 自己签了授权的 USDC，收款人也是这个 owner 的 Hyperliquid 账户，不是以另一个身份发出；`sponsoredSubmissionStarted` 在调用之前置真，这段里失败按结果不明报告。要在 SDK 内部拦住，只能不用 Privy 的 `sendTransaction`，改为自己调用 `prepareUserOperation`、`account.signUserOperation` 与 `sendUserOperation`，会丢掉 Privy 加的数据后缀与界面状态，本机也无法用真实 Privy 智能钱包验证；未做，待运营方决定。
  - 中断以 React 提交为观察单位：同一批更新里 A → 未定 → A 没有提交，尝试看不到它（第一轮复查第 2 条的一半）。应用里其他检查读的也都是 React 状态：hl-react 的会话世代与实时会话令牌在提交时更新，法律守卫的身份引用在渲染时更新，没有一个比 React 状态更早看到变化，这样的闪动对它们同样不存在，存款读到的始终是 A；未改。
  - 闸门之后到钱包收到请求之间还有 viem 的一次 `eth_chainId`（见决策 5）；那一刻由代理里的同一个闸门再查一次。
  - 显式 Agent 审批在签名返回之后、发送之前的锁排队（`beforeSubmit` 的租约检查与传输入口的注册锁）不接收取消信号：取消会清掉忙碌标志，`mutateAsync` 仍要等锁释放才结束；锁返回后的检查照旧拦住还没开始的发送（既有相邻路径，第三轮复查第 2 条，P3）；未改。
  - 等待发生在资金锁（`runWithFundsActionLock`）里：这期间同一 owner 的其他资金动作（提款、发送、划转、另一个标签页的存款）等锁，`FUNDS_ACTION_LOCK_WAIT_TIMEOUT_MS`（10 秒）后按锁超时报「没有发出」。拆分前的三次等待同样持锁，而且更长；把等待移到锁外要重新设计锁内的余额与意图检查，未做。
- 发送、划转在守卫读取到新的账户模式之后，`account-mode-changed` 是安静还是提示并关窗，取决于守卫写入的 `userAbstraction` 缓存先被提交、还是拒绝先到达弹窗的 `catch`；两种结果都是「没有发出」，测试的模式读取桩不写缓存，没有覆盖这个顺序（既有）。
- Bridge 页签自己的输入在解析期间仍会丢失；API 钱包页、账户类型与 Link mobile device 弹窗在解析中的展示（F5b–F5d）未处理。
- 真机、钱包 App 与 WalletConnect 的事件序列没有取得（实践指南「尚未取得的证据」）。

## 验证

均为本机 jsdom，事件由脚本触发；没有浏览器、真机或真实钱包验证。2026-11-23 重写决策 5 之后的证据如下，拆分前各轮的证据见任务记录。

**经过真实代码路径的：**

- `deposit-session-global-modals.test.tsx` 8 项（4 个场景各在不带法律门的页面与带法律门、交易开通门、HIP-3 的交易页上跑一遍）：真实 `GlobalModals`、`DepositModalHost`、`DepositModal`、`useDeposit`、`deposit-session-attempt`、`useWalletSession`（由 `harness/wallet-session-stage.ts` 驱动 Privy 与 wagmi 桩）、全局弹窗 store、`useFundsSessionKey`、`useFreshLegalActionGuard`，以及真实 viem `createWalletClient` 加 `custom()`，钱包是脚本化的 EIP-1193 provider。覆盖：签名在重连期间返回、回到同一 owner 后不早于回来就跑复查、发送恰好一次、待确认弹窗节点不变；定在另一个 owner 上时静默停下、什么都不发、不保存意图、弹窗重挂载、没有任何提示；已登录却失去钱包（E2）时静默停下、钱包回来后也不发送；会话一直不回来时 10 秒解析时钟先结束、弹窗重挂载、静默停下（30 秒上限经 `GlobalModals` 走不到）。存款表单、各数据钩子、`@sairn/hl-react` 的 `useHyperliquid`、`getInfoClient`、`verifyLegalActionAllowed` 与 `fetch` 是桩。变异：不传 `session` 8/8 失败（E2 场景里钱包被要求发送）；去掉签名后的等待 8/8 失败；去掉卸载时的作废，经过重挂载的 3 个场景失败（E2 场景里交易真的发出）。卸载时的作废是这条路径上唯一的防线：被卸载的旧弹窗不再报告快照，旧实例里法律守卫的身份也停在卸载前。
- `use-deposit-routing-guard.test.tsx`「session of a manual external deposit through the real viem wallet client」20 项：真实 viem 钱包客户端与记录请求的 provider，覆盖签名后的单次等待（等待期间不估 gas、不查余额、不做法律复查）、等待之后在 gas 检查或法律复查期间再中断（回到同一账户也停下）、viem 读链 ID 时断开、换账户、超时、钱包明确拒绝后回退被拦、回答不明确后回退被拦、cause 链 2 例、-32000 之后不再回退（回退会被拒绝或会广播第二笔，两种都不转发），保留意图并报结果不明、一次也没转发就删意图并按普通失败报告、尝试已作废时 viem 读链失败静默停下、删意图失败时报告。会话检查是桩（`readInterruptions` 与 `waitUntilSettled` 由测试控制），法律接口是桩。「external wallet submission without a transaction hash」一组的写入经 provider 转发，台账看得到。
- `use-explicit-agent-approval.test.tsx`：真实外部签名器、`createExchangeClient` 与注册会话；`getChainId` 挂起期间注册会话被关闭，或身份变化时，都不调用 `walletClient.signTypedData`；租约检查返回时点击的签名时限已过，也不调用，报 `ExchangeActionDeadlineError`（这一例让租约检查的桩挂起，锁桩立即执行回调）；注册锁被别处持有时取消审批，锁请求随取消信号放弃，以 `AbortError` 结束、不调用钱包（锁桩按 `signal` 拒绝，不是浏览器的 Web Locks）。两个 Agent 签名器各有一例 async `beforeSign` 拒绝时不调用钱包。
- `exchange-provider-tree-retirement.test.tsx` 与 `exchange-signer-session-guard.test.ts`：本次没有改，覆盖决策 1–4 的 hl-react 核心（见任务记录）。

**主要靠桩的：**

- `use-deposit-routing-guard.test.tsx`「session of a manual deposit」与「wallet network」：钱包客户端（含 `writeContract`）是桩。覆盖签名前的入口、切链、加链与签名检查（第一次切链之后会话失效时不再加链）、两条路径的单次等待与 30 秒上限、等待期间不跑复查、赞助路径用等待后重新取得的智能钱包客户端、赞助路径在路由或法律复查期间再中断（回到同一账户也停下）、中断后复查失败时没作废就报告错误而作废了才静默、定案之后调用方恢复之前再中断也停下（两条路径）、两条路径超时报「Wallet not connected」、换账户丢弃、自动存款忽略会话；切链一律经 provider（不调用 Privy `switchChain`）、Rabby 加链前等 300ms、Coinbase 与「4902」写法、拒绝切换不加链。
- `deposit-modal-withdrawal-routing-guard.test.tsx`「the session of a started deposit」12 项：真实弹窗与真实全局弹窗 store，`useDeposit` 是桩。覆盖尝试绑定点击时的会话、A → B → A 保持作废（含中间没有任何读取）、另一个 `clientKey`、卸载、分两次提交的关窗与重开、合并为一次提交的关窗与重开（第八轮第 3 条）、等待的各种结局与 30 秒上限。
- `provider-address.test.tsx`：会话 provider 在断线期间切换网络时退役最后确认的身份，调度器是桩。
- `deposit-submission-outcome.test.ts`：结果不明只看台账。
- `deposit-session-attempt.test.ts` 9 项：尝试模块本身，等待交回定案那一刻的中断次数、中断计数只在离开点击身份的提交上增加、开窗标识变了立即作废且不恢复、点击时没有弹窗就作废、上限之后（计时器还没触发）回到点击账户按超时、只有墙钟走过上限（设备休眠）时回来也按超时、上限之后作废仍是 `replaced`、上限前 1ms 回来仍是 `same`、超时带回已计的中断次数。

逐项去掉修复的变异：本次的结果记在 [交接记录](../work-memory/sessions/2026-11-23-signer-session-guard-handover.md)「执行」一节的表里，由实现会话自己改源码、跑对应测试、用备份恢复；端到端用例的三项变异由写它的子代理做，恢复后逐字节核对。拆分前各轮的变异记录见任务记录。
