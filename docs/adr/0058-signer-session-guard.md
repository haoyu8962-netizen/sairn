# ADR 0058：签名前严格核对会话，签名后只在换了身份时停下

- 状态：已在工作树实施（2026-11-22，同日按第七轮审查修订；2026-11-23 按 7b、7c 两轮复查再修订，7c 复查之后又把「保留在点击身份之外结束」改为静默停下），分支 `claude/funds-session-and-api-wallet-quiet`，未合入、未发布。真实钱包、WalletConnect 与真机未验收。决策 5 里签名后的等待由负责人的两条规则推出（任何钱包弹窗之前严格核对会话，这一条由编排转述，原话未存档；签名返回时会话只是未定照常发送；见实践指南「负责人决定」），外部钱包与赞助两条路径的兜底超时因此处理不同，不再单独待负责人确认。
- 关联：[钱包会话短暂重连：实践指南与取证](../wallet-session-reconnect-practice.md)（本决定的证据与负责人决定）；[ADR 0053](0053-exchange-action-start-deadline.md)（入队到签名的 15 秒上限，与本决定并列在同一个签名入口）；[ADR 0002](0002-exact-owner-trading-signers.md) 与[签名模型](../hyperliquid-signing.md)；[ADR 0040](0040-automatic-email-wallet-deposits.md)（自动存款不受本决定约束）；[移动端数据展示规范](../mobile-data-presentation.md)「钱包会话解析中」；[任务记录](../work-memory/sessions/2026-11-21-funds-session-and-api-wallet-quiet.md)。

## 背景

2026-11-22 在本机复现（实践指南 E1–E5，桌面 Chrome 加 MetaMask 扩展，事件由脚本注入）：

- 钱包报告断开再恢复同一账户时，前约 750ms 被判为确认断开（Privy 把钱包移出目录，`isResolving` 为假），资金弹窗重挂载、草稿丢失（E2）。
- 点击之后、SDK 读链 ID 时断开，应用已判为断开，SDK 仍向钱包请求 `eth_signTypedData_v4`（E5）。`clients.ts` 的 `guardSigning` 只检查 ADR 0053 的时限，不检查会话。
- 手动存款进入 `deposit()` 之后，切链、请求连接与签名前不再检查会话；外部钱包存款进行中，执行状态按实时地址读取，解析期间状态屏消失。
- 提款请求已经交给交易所后，路由刷新变化会让弹窗的上下文标识变化，这次尝试被清掉，结果不再通知。

官方终端（现场代码阅读）签名前后都不检查会话，签名出错一律当作用户拒签；Hyperliquid 对签了名但从未提交的动作不记录，旧签名在 nonce 窗口内仍有效。

## 决策

1. **会话世代按原因退役；`HyperliquidOwnerSignerProvider` 不再因会话身份变化退役。**
   - 会话身份（网络、`clientKey`、会话模式）的变化只由 `session-provider.tsx` 处理：变为未定（`clientKey` 为 `disconnected`）时，上一个世代记为 `unresolved`；变为另一个身份（含网络切换）时记为 `replaced`。之后定在与最后一次确认不同的身份上，`markExchangeIdentityReplaced` 把该 owner 未定的世代升级为 `replaced`；用户主动断开（`disconnectWallet`）也直接调用它。provider 卸载由 `invalidateExchangeProviderLifecycle` 处理，每个世代都带着自己的 `lifecycle`。槽位条目带着自己的世代（`ExchangeSigningSlotEntry.generation`）。
   - 其余的退役照旧由各自的模块以 `replaced` 做，本次没有改：
     - Agent-only owner 切换或清除（`agent-session.ts`）。它的跨标签页存储事件：owner 换了或被清除时退役原 owner 的 Agent-only 会话，存储被清空或条目无法解析时退役全部身份。
     - Agent 密钥替换或删除（`agent-storage.ts`，只退役 Agent 签名者）。它的跨标签页存储事件：Agent 密钥条目变化只退役该 owner 的 Agent 签名者，注册会话条目不可用时退役该 owner 的全部签名者，存储被清空（`event.key === null`）时退役全部身份。
     - 注册会话失效（`agent-registration-session.ts`）。
   - `HyperliquidOwnerSignerProvider` 挂载与卸载时不退役任何世代。它只在同一身份内（网络、`clientKey`、会话模式都没变）之前的绑定带 owner 钱包（`binding.wallet` 非空）、且绑定对象变了时，把这个身份的 `user` 签名者世代记为 `replaced`。没有钱包的绑定上不会有在途的主钱包签名：绑定非空时 `useClients` 的 `user` 客户端就是 owner 客户端，而 `createOwnerSignerClient` 要求 `wallet` 与 `ownerAddress` 都在。所以外部钱包会话（绑定为空）在绑定从空变为非空、或闪成一个不带钱包的绑定再变回空时都不退役，闪动之前已在钱包里等待确认的外部签名照常发送；邮箱 owner 的绑定失去钱包或换了钱包对象，仍然退役。
   - 未定世代的升级（`request-scheduler.ts`）：`invalidateExchangeRequestIdentity` 以 `replaced` 退役时，同一 owner 里按同样的会话模式与签名者过滤的未定世代一并升级为 `replaced`，所以 Agent 密钥替换或删除（`signer: "agent"`）只升级 Agent 签名的未定世代；`captureExchangeRequestGeneration` 每次新捕获时，同一身份、同一签名者、凭据（注册 epoch、Agent 公钥、激活 epoch、`lifecycle`）不同的未定世代升级为 `replaced`。凭据相同的未定世代保持 `unresolved`，照常发送。
2. **签名前严格。** 每个客户端包装的签名器在调用钱包之前（`guardSigning`，`defaultExpiresAfter` 之后再查一次）要求世代仍是当前世代，否则抛 `ExchangeRequestInvalidatedError`，`phase: "before-signature"`，钱包不弹窗。Agent 签名器不检查：它用本地密钥，不弹任何窗口，仍受时限和决策 3 的发送检查约束。邮箱主钱包签名器（`owner-signer-client.ts`）在读地址、读链 ID 与签名前同样按 `before-signature` 检查。显式 Agent 审批（`use-explicit-agent-approval.ts`）的客户端不经过调度器，槽位没有世代，`isGenerationCurrent` 对它恒为真；它改由签名器的同步 `beforeSign` 在交给钱包之前检查审批会话与地区（外部钱包在 `walletClient.signTypedData` 之前，Privy 在 `signTypedData` 之前）。`beforeSign` 抛出的错误与 `beforeSubmit` 的同类：审批信号已中止时的 `AbortError`、审批会话已变时的 `identity-changed`，以及地区不允许时的 `TradingRegionBlockedError`（只有命名 Agent 授权检查地区，`isNamedAgentGrant`）。`beforeSubmit` 与 `canSend` 不变。
3. **签名后只在换了身份时停下。** 传输层对 `/exchange` 的请求（`guardSending`）只在世代已记为 `replaced` 或生命周期已结束时抛 `phase: "after-signature"`，不发送。签名返回时会话只是仍未定（没回到原账户，也没定在别的账户上），照常发送：负责人 2026-11-22 决定，与官方一致，理由是签名者就是账户本人，作废只会让用户白签一次。资金锁内的执行守卫照旧在调用 SDK（签名之前）时运行；签名之后到发送之间，只检查世代是否已被替换。Hyperliquid 请求的外部钱包签名与 Agent 签名按这条处理，手动存款见决策 5。邮箱主钱包签名器是例外：签名之后它仍核对 owner（`verifyOwner("after-signature")`），绑定已变就丢弃签名、不发送；内层 Privy 签名器因绑定变化抛出的普通错误，在 `owner.assertCurrent()` 此时也失败时转成 `after-signature`，否则原样抛出。这种签名本来就不弹窗（`showWalletUIs: false`），归为「没有发出」，不会自动重签；资金弹窗是否安静按决策 8 判断，否则按失败提示。
4. **阶段可区分，发出之后的检查不报「没有发出」。**
   - `ExchangeRequestInvalidatedError.phase` 取 `before-start`、`before-signature`、`after-signature`，三者都没有到达交易所。`before-start` 来自调度器在开始前作废，以及 `useExchange` 在 mutation 开始、调度器开始执行与 Agent 注册执行的 `canStart` 处对 owner 签名器的检查：应用自己的 `assertCurrent` 抛出的任何错误都转成 `before-start`（`assertOwnerSignerBeforeStart`）。
   - SDK 会把签名器抛出的错误包进 `AbstractWalletError.cause`，`unwrapExchangeSignerGuardError` 与 `isExchangeRequestInvalidatedError` 只拆这一层。应用用 `isExchangeRequestNotSentError`（作废或 ADR 0053 时限）把它们归为「没有发出」。
   - 审批可能已经到达交易所之后的检查不会抛这类错误：`useBuilderFeeApproval` 在审批返回后的两次核对和确认查询（`refetchBuilderFee`），`useTradingAuthorization` 在注册 Agent 或审批 builder fee 之后的核对与要求查询，把作废错误改写成已有的「Wallet changed during builder fee approval」或「The wallet or network changed during trading authorization」。本次授权已经批准了 Agent、builder fee 一步因时限（`ExchangeActionDeadlineError`）或作废（`ExchangeRequestInvalidatedError`）没有发出时，报 `TradingAuthorizationIncompleteError`（显示「Failed to enable trading」）；这一步在开始前抛出的普通错误保留自己的文案（见未覆盖的范围）。
   - HTTP 请求开始之后：交易所没有给出确定答复的失败（`HttpRequestError` 没有状态、状态低于 400、为 408 或不低于 500，以及 `ExchangeResponseUnverifiedError`）按结果不明处理（`isAmbiguousExchangeActionError`）；`ApiRequestError`、其余 4xx 与已确认的响应各走自己的分支。
5. **手动存款的执行链。**
   - `DepositReview.session` 只对手动存款生效，自动存款（ADR 0040）没有点击可归属，不检查。它有四个方法：`isCurrent()`、`isReplaced()`、`isSettledOnSubmitted()`、`waitUntilSettled()`。存款看的是这次点击的尝试与实时会话令牌，不看会话世代。
   - **每次点击一个只能作废的尝试。** 存款弹窗在点击时建一个尝试对象，记下点击时的钱包地址与 `clientKey`。每次 React 提交（commit，无依赖的布局副作用）时，弹窗已关闭；或会话已定（不在保留期内），且钱包地址是另一个非空值或 `clientKey` 是另一个非 `disconnected` 值，就作废它；弹窗卸载时（空依赖布局副作用的清理）也作废。作废后不会恢复：A → B → A、关窗后在退出动画期间重开，都保持作废。Suspense 隐藏同样会跑这个清理并作废尝试，偏向失败关闭。
   - `isCurrent()`：尝试没有作废、弹窗仍打开、实时会话令牌（`useLiveSessionToken`）仍是点击时那一个。令牌的身份含账户模式（`accountAbstraction ?? "unavailable"`），模式变化或暂时读不到也算变化，之后切链、连接与签名前都会静默停下。`isReplaced()`：尝试已作废。`isSettledOnSubmitted()`：尝试没有作废、会话已定，且钱包地址与 `clientKey` 正是点击时的那一个。`isReplaced()`、`isSettledOnSubmitted()` 与下面的等待只看钱包地址与 `clientKey`，账户模式等字段的短暂缺失不算换人。
   - **会弹窗的请求要求 `isCurrent()`**：进入流程时、Privy 的 `wallet.switchChain` 之前、签名之前，以及经过包装的 EIP-1193 provider 上的 `eth_requestAccounts`、`wallet_switchEthereumChain`、`wallet_addEthereumChain` 与签名方法（`eth_signTypedData_v4`、`eth_signTypedData`、`personal_sign`、`eth_sign`）。
   - **签名之后等资金弹窗的会话保留结束（`waitUntilSettled`）。** 两条路径各等三次：许可签名返回之后（重新取费率之前）、法律复查（`verifyFreshLegalAction`）之前，以及外部路径的 `beforeSendPrompt`、赞助路径的 `beforeBroadcast` 之前。会话已定时等待立即返回，所以正常路径不变慢；第一次等待之后会话再中断一次，也按同样的规则处理。等待的三种结果：
     - `replaced`：尝试已作废（会话定在另一个账户上，或弹窗已关闭、卸载）；或弹窗的保留（`useFundsSessionHold`，决策 6）已结束，会话却不在点击时的身份上（另一个身份、没有钱包，或 `clientKey` 为 `disconnected`）。立即返回。两条路径都静默回到空闲，不保存授权意图。保留在断开状态或另一个身份上结束时，`GlobalModals` 的 `useFundsSessionKey` 同时按新身份重挂载存款弹窗、草稿清空，所以这里不报错。7c 的版本在保留结束而没有钱包或 `clientKey` 为 `disconnected` 时返回 `timeout`，外部路径的「Wallet not connected」可能写进旧执行状态键、之后作为过期提示弹出（7c 复查 P2-1）；复查之后由编排改为 `replaced`。
     - `same`：保留已结束，钱包地址与 `clientKey` 正是点击时的那一个。继续。
     - `timeout`：只来自兜底计时器。它从这次等待开始，取保留最长能持续的时间 `FUNDS_SESSION_AWAY_LIMIT_MS + WALLET_SESSION_RESOLVING_MAX_MS`（70 秒，`DEPOSIT_SESSION_SETTLE_TIMEOUT_MS`），到点时保留仍在才返回 `timeout`。外部钱包路径抛已有的「Wallet not connected」，不发送、不保存授权意图；这时弹窗仍挂载（弹窗卸载过的话等待早已以 `replaced` 结束），提示按普通错误显示在弹窗里。赞助路径照常往下走，交给法律复查与广播前检查；保留仍在时 `clientKey` 是 `disconnected`，所以实际上停在法律复查，见本决策最后一条。
     - 两条路径的超时处理不同，来自负责人的两条规则：外部路径的下一步是交易确认弹窗，任何钱包弹窗都不能在会话未定时弹出；赞助广播不弹任何窗口，签名返回时会话只是未定就照常发送。
     - 等待由弹窗每次 React 提交与卸载时通知，加一个兜底计时器，结束时移除监听并清掉计时器；卸载时先作废尝试再通知，所以等待以 `replaced` 结束。
   - **发送与广播。** 会弹出交易确认的 `eth_sendTransaction`、`wallet_sendTransaction`、`wallet_sendCalls`，在交给钱包的那一刻要求尝试没有作废且 `isSettledOnSubmitted()`；外部钱包路径在保存授权意图之前也查一次（`beforeSendPrompt`）。代理里的这道同步检查是最后一道。不弹窗的 `eth_sendRawTransaction` 只要求没有作废。赞助路径的智能钱包发送不经过 provider，在保存授权意图之前只要求没有作废（`beforeBroadcast`，负责人决定）。
   - **转发记录与明确拒绝。** provider 记录这次尝试交给钱包的每一次发送或广播及其结果。会话错误发生、且每一次已转发的请求都被钱包以表示什么都没广播的代码明确拒绝（`DEFINITIVE_WALLET_SUBMISSION_ERROR_CODES`；读 cause 链，最多 6 层，跳过 viem 的 -1；任何一层出现其他代码就不算）时，包括一次都没有转发，删除这次授权意图并静默回到空闲。-32000、-32603、只有消息没有代码等不明确的失败，仍按结果不明处理并保留授权意图。删除授权意图失败时不走静默分支，交给已有的出错或结果不明路径（目前提示「Deposit status unknown」并关窗）。
   - 会话错误在没有任何提交之前发生时，执行状态静默回到空闲，不显示错误；切链与连接的错误包装不会吞掉它。
   - **法律复查需要 owner 在场。** 实时法律检查在 `clientKey` 为 `disconnected` 时报 `status_unavailable`（显示为「Unable to verify regional availability. Trading is temporarily unavailable.」）。外部路径只有等到 `same` 才会进入法律复查。赞助路径在兜底 `timeout` 之后也往下走，但保留仍在时 `clientKey` 一定是 `disconnected`：解析中或失去钱包时 `useWalletSession` 没有会话地址，`client-root.tsx` 交给 provider 的地址为空，而 Agent-only 会话不算保留。所以法律复查之前的那次等待以 `timeout` 结束时，法律复查以这个地区可用性错误停下，不广播。赞助路径实际上几乎不会在超时之后广播，负责人「签名返回时会话只是未定照常发送」这一条实际通过 `same` 实现（按代码推断，例外见未覆盖的范围）。
6. **短暂失去钱包的保留：一次连续中断一个 60 秒预算。** `useFundsSessionHold`：解析中，或已登录 Privy、不是 Agent-only、`clientKey` 为 `disconnected`，算作中断；两者来回切换仍是同一次中断。失去钱包的部分从中断开始共用 `FUNDS_SESSION_AWAY_LIMIT_MS`（60 秒）；解析中的部分不受这个预算约束，只受全应用 10 秒的解析时钟（`WALLET_SESSION_RESOLVING_MAX_MS`）约束，所以中断末尾再进入一次解析时，保留最长约 70 秒。只有连续 2 秒不处于中断（已连接，或已退出登录、切到 Agent-only），这次中断才结束，下一次重新计时，所以钱包在断开、重连与一瞬间的「已连接」之间反复切换，不会无限保留。退出登录立即结束。每个调用处各自计时，计时器在页面隐藏时照样走。除手动存款签名后的等待（决策 5，保留何时结束决定它继续、静默停下还是到兜底）外，只影响展示与结果归属；执行守卫读实时会话。
7. **进行中的存款按发起时的地址与模式读取。** 存款弹窗把保留期内沿用的钱包地址与存款模式（`smart` 或 `wallet`，`useHeldWhileResolving`）传给 `useDeposit`，执行状态键与执行锁键不随重连变化，进行中的状态屏不消失。
8. **结果归属不含账户模式；发出前被拦下的保持安静。**
   - 提款：一旦调用交易所请求，这次尝试记为结果所有者（`withdrawalOutcomeOwnerRef`），只在弹窗关闭或（保留后的）会话身份变化时失效；这个身份不含账户模式，路由或页签变化也不清掉它。已成功或可能已发出的结果照常通知并关窗。上下文标识（含账户模式与路由）变化之后，被执行守卫在发出前拦下的（`FundsActionFeedbackCause` 或「没有发出」类错误），不提示、不关窗、草稿保留；会话令牌已变的作废同样安静。
   - 发送与划转：结果身份（`outcomeIdentityKey`，不含账户模式，保留期内沿用）有自己的引用与序号，提示与关窗（`isCurrentSubmission()`）只看它。含账户模式的提交身份、序号与实时会话令牌（令牌的键同样含账户模式，`liveSubmissionIdentityKey`）仍用于执行守卫、发送的复核步骤与安静处理：错误属于「没有发出」类（`FundsActionFeedbackCause` 或 `isExchangeRequestNotSentError`），且点击之后实时会话令牌、提交身份或序号有任何一个变了，就不提示、不关窗、草稿保留，发送也不另存重试草稿。其中提交身份与序号这一条是防御性的：含账户模式的提交身份或序号变化时，实时会话令牌或结果身份通常也已变化，去掉它没有用例失败（7b 实现者的变异记录，在会话 scratchpad 的 `r7b-implement-dialogs.md`，不在仓库；7c 没有改这部分，没有重跑）。可能已发出的结果（`isAmbiguousExchangeActionError`）与其余失败照常按结果身份报告。没有经过重连、模式也没变的作废，照旧提示「钱包或网络已变化」并关窗。

## 备选方案

- **签名后也按未定作废**：E5 那样的竞态里用户已经签了名，作废后要再签一次，签名者就是本人，且官方照常发送。负责人选择照常发送。
- **只在界面层检查**：E5 表明应用已判为断开后 SDK 仍会请求签名，界面层拦不住已经进入 SDK 的请求。
- **存款逐处检查、不包装 provider**：存款流程里所有会弹窗的 JSON-RPC 请求都经过同一个 provider，包装最难漏掉；不经过它的只有 Privy 的 `switchChain` 与智能钱包发送，这两处单独检查。
- **外部钱包存款在会话不是点击时那一个就立即放弃**（第七轮的第一版）：同账户恢复前就到了发送一步时会丢掉已签的许可，用户什么反馈都看不到。改为签名后等待会话定下。另一个退路是发送前只看 `isCurrent()`，任何一次闪断都会作废这次尝试。
- **存款的等待用固定的 10 秒上限、两条路径超时都不发送**（7b）：10 秒短于资金弹窗 60 秒的保留期，钱包离开目录（E2）后第 11 到 60 秒回到同一账户时，弹窗仍在保留，存款却已报错；赞助路径超时不广播与「签名返回时仅未定照常发送」不一致。7c 改为跟随弹窗的保留，并按路径分开处理超时。
- **照官方，不检查**：官方的邮箱会话不受传输层断开影响，外部钱包会话会丢草稿并可能在断开中签名；本仓库「短暂数据缺失不下断开结论」「签名身份必须是确切 owner」的规则要求更严格。

## 未覆盖的范围

- 检查与钱包真正收到请求之间仍有一段消不掉的窗口：WalletConnect 经中继投递，扩展在 `request` 内部才弹窗。
- 签名返回时会话仍未定，照常发送（决策 3），这是有意的。
- 资金弹窗（提款、发送、划转）在 SDK 签名前的等待里关闭：执行守卫只在调用 SDK 之前跑一次，SDK 内部的等待（读链 ID、nonce）期间弹窗关闭或尝试失效，世代没变，钱包仍会弹窗。修法是在槽位上加一个只检查「弹窗打开、尝试仍是当前」的签名前检查，不重跑余额守卫；未做。
- 回到同一身份、凭据相同的未定世代留在 `unresolvedGenerations` 里，直到该 owner 被替换，大约每次重连一条。
- Agent 已批准、builder fee 一步在开始前因会话未定或地址变化抛普通错误（「No wallet connected」「Wallet changed during builder fee approval」）时，不归为 `TradingAuthorizationIncompleteError`；文案不说「什么都没发出」，但也没有说明 Agent 已批准。按决定不改代码。
- `owner-signer-provider.tsx` 在渲染阶段写 `currentBinding`，被放弃的并发渲染可能让已提交绑定的检查误抛，偏向「没有发出」（既有）。
- 手动存款签名后的等待：
  - 保留的计时器在页面隐藏时照样走：Android 上签名回调在后台到达、用户还停在钱包 App 里时，保留可能在后台结束。按决定不加可见性处理。
  - 赞助路径在兜底 `timeout` 之后照常往下走（决策 5），但按代码推断几乎不会广播：法律复查之前的那次等待以 `timeout` 结束时，法律复查报 `status_unavailable`，显示的是地区可用性错误，不是更准确的「Wallet not connected」。唯一例外是广播之前的最后一次等待以 `timeout` 结束：法律复查通过之后会话又中断、且保留从这次等待开始一直持续满 70 秒，这时只剩 `beforeBroadcast`（只看是否作废），会广播。按保留最长约 70 秒的上限，这只在边界上可能；没有用例。钩子测试里「三次 `timeout` 照常广播」那一例让选中的 owner 保持为点击时的地址，生产中保留期内不会出现，只证明分支。
  - 外部路径最后一道检查是静默的（7c 复查 P3-2，确认仍在）：第三次等待返回 `same` 之后，viem 的 `writeContract` 在请求 `eth_sendTransaction` 之前先读一次链 ID（`eth_chainId`，经 WalletConnect 时要走中继）。会话在这一次往返里闪断，代理的同步检查（`beforeSendPrompt`）抛出，删除授权意图并静默回到空闲，已签的许可没有用上，没有提示。窗口只有这一次 RPC。
  - 已签的许可被丢弃时（没有广播，也没有保存授权意图），EIP-3009 授权本身并没有被撤销，在 `validBefore`（构造签名参数时起 1 小时，`CCTP_AUTHORIZATION_WINDOW_SECONDS`）之前理论上仍然有效。它没有由本页广播，但不能说从未离开本页：外部路径在第一次等待之后估算 gas（`estimateContractGas`，参数含签名）时已把它发给 RPC 节点；被钱包明确拒绝的那次发送（`hasOnlyRefusedSends`）也交给了钱包。
  - 在转发之前停下、删除授权意图又失败时，提示「Deposit status unknown」并关窗，虽然这次确定没有发出（「could not be confirmed」有误导）。按决定沿用已有路径。
  - 每次等待的兜底是 70 秒，三次等待串行最长约 210 秒，短于许可 1 小时的有效期。
  - 等待的各种结束只在弹窗测试里用真实弹窗验证（`useDeposit` 与 SDK 是桩）；钩子测试里 `waitUntilSettled` 是桩。没有经过 `GlobalModals`、真实弹窗与真实 `useDeposit` 的端到端用例，所以「保留在断开状态结束时弹窗重挂载、等待以 `replaced` 静默结束、不出现过期提示」只由各层分别证明。
- 发送、划转在守卫读取到新的账户模式之后，`account-mode-changed` 是安静还是提示并关窗，取决于守卫写入的 `userAbstraction` 缓存先被提交、还是拒绝先到达弹窗的 `catch`；两种结果都是「没有发出」，测试的模式读取桩不写缓存，没有覆盖这个顺序（既有）。代价：模式或会话变化期间真实的地区、余额或收款地址拦截，要到用户重新提交时才看到。
- Bridge 页签自己的输入在解析期间仍会丢失；API 钱包页、账户类型与 Link mobile device 弹窗在解析中的展示（F5b–F5d）未处理。
- 真机、钱包 App 与 WalletConnect 的事件序列没有取得（实践指南「尚未取得的证据」）。

## 验证

均为本机 jsdom，事件由脚本触发。

**经过真实代码路径的：**

- `exchange-provider-tree-retirement.test.tsx` 16 项：真实 `HyperliquidProvider` 内套 `HyperliquidOwnerSignerProvider`，请求经过真实的 `createExchangeClient` 或 `createOwnerSignerClient`，HTTP 传输被监视，邮箱 owner 用真实的 `createPrivyOwnerSigner`。覆盖：外部钱包签名在仅未定、回到同一 owner 时发送，定在另一个 owner 时作为「没有发出」丢弃；邮箱签名在绑定变化后丢弃并归为「没有发出」；同一身份内绑定变化退役、绑定失去钱包退役，随身份一起变化时交给 session provider；绑定从空变为非空、不带钱包的绑定闪入闪出（`wallet` 为空、`ownerAddress` 不等于 `clientKey`）时外部签名照常发送；builder fee 审批与交易授权在发出之后不报「没有发出」。WebSocket、store、服务器时钟、`useHyperliquidClients`、`useAgentRegistration` 与 `useAgentStatus` 是桩；`useTradingStatus` 只在「real confirmation query」「real final check」两例里是真实的，其余是桩。「同一身份内绑定变化」与「绑定失去钱包」两例把外部钱包客户端与邮箱绑定混用，生产中不会出现，只证明 provider 的分支；真实的邮箱丢弃路径由经过 owner 客户端的那一例覆盖。
- `exchange-signer-session-guard.test.ts` 10 项：真实 `ExchangeClient`、viem 本地账户钱包与 Web Locks 桩，直接调用退役函数（不经过 provider 树），覆盖签名前未定不签、签名后仅未定照常发送、定在别处或直接换身份不发、Agent 签名器不受未定约束，以及未定世代在 Agent 密钥替换、以不同凭据回来、回来后再换密钥时升级、凭据相同时照常发送。
- `use-deposit-routing-guard.test.tsx`「through the real viem wallet client」15 项（含两组 `it.each` 各 2 例）：真实 viem `createWalletClient` 与 `custom`，记录请求的 EIP-1193 provider。覆盖：发送一步时仍未定不弹发送窗口、同账户恢复后发送、保存意图后被替换静默停下并释放意图、钱包明确拒绝而回退被拦时静默停下、回答不明确时保持未知、cause 链 2 例、意图删除失败时报告、签名后等待并在同账户回来后发送、换账户静默停下、一直不回来就不发送（桩让等待以 `timeout` 结束并断言「Wallet not connected」；生产中保留在断开状态结束时是 `replaced`，静默停下）、法律复查之前再次中断时再等、发送弹窗之前再次中断时再等（结局 `same` 发送一次，`timeout` 报「Wallet not connected」且不发送）、签名进行中 owner 断开（`clientKey` 变为 `disconnected`）后法律复查只在会话回来后才跑。会话检查（含 `waitUntilSettled`）是桩，法律接口是桩。
- `use-explicit-agent-approval.test.tsx`：真实外部签名器、`createExchangeClient` 与注册会话，`getChainId` 挂起期间身份变化时不调用 `walletClient.signTypedData`。Privy 签名器由 `privy-agent-signer.test.ts` 的单元测试覆盖。

**主要靠桩的：**

- `use-deposit-routing-guard.test.tsx`「session of a manual deposit」15 项：钱包客户端（含 `writeContract`）、会话检查与法律接口是桩。覆盖入口、切链、签名前的检查；外部路径签名后不定就不发送；赞助路径三次等待都是 `timeout` 时仍广播（用例「lets a sponsored deposit go on to its checks when the session wait times out」证明的是兜底 `timeout` 的分支，且让选中的 owner 保持为点击时的地址，生产中兜底超时时 owner 多半已断开）、法律复查之前与广播之前再次中断时再等（广播前那一例两种结局：`replaced` 不广播，`timeout` 广播）、同账户回来后广播、换账户丢弃、法律复查只在被打断的会话回来后才跑；以及自动存款忽略会话。
- `deposit-modal-withdrawal-routing-guard.test.tsx`：存款会话判断（定在另一个 `clientKey`、卸载、关窗再开、A → B → A 都保持作废）；等待的结束：立即 `same`、恢复后 `same`、钱包离开 30 秒后回到同一账户 `same`、换账户 `replaced`、卸载 `replaced`、兜底上限前 1ms 未到与到点 `timeout`（这一例让解析一直保持 70 秒，生产中解析时钟 10 秒就到期，只证明兜底分支）、保留在断开状态结束时 `replaced`（第 59.999 秒仍在等，第 60 秒返回；「ends a started deposit's wait quietly as soon as the hold ends on a disconnected session」）、会话已定在没有钱包的状态时立即 `replaced`（「…quietly at once while its session is settled without a wallet」）。据编排的报告，把这两处改回 `timeout` 的变异让这 2 例失败；存款模式在解析中保持；以及提款结果归属（路由变化后仍报结果、模式变为 `null` 或未知后仍报结果、超时报结果不明、发出前被模式变化拦下保持安静，各两条路由）。等待用的是真实弹窗，但 `useDeposit` 与 SDK 是桩；提款测试只到 SDK 桩。真实弹窗与真实 `useDeposit` 之间没有端到端用例，「钱包离开 30 秒后回到同一账户、发送弹窗出现一次」由这里的 `same` 与钩子测试里 `same` 之后发送一次两层拼起来；`GlobalModals` 的 key 不在这些用例里。
- `funds-dialogs-session-resolving.test.tsx`：发送、划转在请求发出后模式变化仍报结果、超时报结果不明，守卫读取到新模式或模式变为未知、守卫期间钱包重连时保持安静，以及界面模式未变时仍提示。`useExchange` 是桩（没有调度器），模式读取桩不写查询缓存。
- `use-funds-session-key.test.tsx`：真实 `useWalletSession`，覆盖一次连续中断一个预算、反复断开重连不会无限保留、一瞬间的连接不给新预算。

逐项去掉修复的变异：7c 实现者的结果记在任务记录的 7c 表里；7b 的在会话 scratchpad 的 `r7b-implement-*.md`（不在仓库）；第七轮的没有存档；7c 复查之后的存款修改只有编排报告的那一组（见上文 `deposit-modal-withdrawal-routing-guard.test.tsx` 一条）。复查代理只读过测试代码，没有重跑变异。任务记录称保留期改动后本机复现 E2 时划转草稿保留，复现过程与证据没有存档；实践指南 E2 行记录的是修复前的结果。第七轮、7b、7c 与 7c 复查之后的改动都没有再做浏览器复现。
