# 钱包会话短暂重连：实践指南与取证

本文记录钱包会话短暂断开或重连时，资金弹窗的草稿、还没发出的预检、已经交给 SDK 的请求应当怎样处理，以及这些做法的依据。它是 [移动端数据展示规范](mobile-data-presentation.md)「钱包会话解析中」一节的配套说明，不替代它。本分支（`claude/funds-session-and-api-wallet-quiet`）只实现展示与结果归属（结论一），2026-11-23 起又收窄为只在会话解析中保留草稿；签名与发送边界的会话检查（结论二）在单独的分支 `claude/signer-session-guard` 上，尚未合入，本分支的 [签名规范](hyperliquid-signing.md) 没有这部分内容。

## 证据等级

每条结论都标注来源，强弱依次为：

1. **本机复现**：本机开发服务器上的真实页面，真实的 Privy 3.46、`@privy-io/wagmi`、wagmi 与应用代码。除 E1 外，钱包事件由脚本向 MetaMask 扩展的 provider 注入；签名请求由包装层拦截并拒绝，没有产生任何签名。脚本注入的事件不能代表真实钱包或手机系统的行为。
2. **官方终端现场代码**：在已登录的浏览器里读取 `app.hyperliquid.xyz` 当前正在运行的前端包，没有操作、断开或签名。
3. **官方文档**：Hyperliquid、Privy、wagmi、WalletConnect（Reown）、MetaMask 的公开文档。
4. **源码推断**：读锁定版本的依赖源码得出的结论，没有运行验证。

## 本机复现（2026-11-22）

环境：`localhost:3005`，测试网，桌面 Chrome 加 MetaMask 扩展。用开发模式下的临时记录器读取 `useWalletSession()` 的状态序列，并用同一个输入框节点是否还在来判断弹窗有没有重挂载。

| 编号 | 场景 | 结果 |
| --- | --- | --- |
| E1 | 页面刷新后会话自动恢复（真实，未注入） | 解析中约 1.75 秒；其中 wagmi `isReconnecting` 约 300ms；地址先为空、`clientKey` 为 `disconnected`，再恢复为同一账户 |
| E2 | provider 发出 `accountsChanged([])` 或 `disconnect`，800ms 后恢复同一账户 | 前约 750ms 被判为确认断开：Privy 把钱包移出 `useWallets`，`isResolving` 为假。划转弹窗重挂载，草稿丢失；恢复时又短暂进入一次解析 |
| E3 | 页面切后台 5 秒再回来，钱包不动 | 没有任何状态变化，草稿保留 |
| E4 | 点「发送」后 30ms 触发 E2 那样的断开 | 没有请求签名，没有提示，弹窗与草稿保留。对照：不断开时 720ms 处请求 `eth_signTypedData_v4` |
| E5 | 请求已交给 SDK，SDK 读链 ID 时触发断开 | 应用已判为断开之后，SDK 仍请求了 `eth_signTypedData_v4` |

上表记录的是修复之前的结果。E2 与 E4 的触发相同（provider 发出断开、随后恢复同一账户），结果却不同：E2 的弹窗重挂载、草稿丢失，E4 的弹窗与草稿保留。可能的差别是弹窗（E2 记录的是划转弹窗，E4 是点「发送」）、断开持续的时间或当时的版本，但原始复现没有存档，记为未能解释；不要用 E4 证明修复之前的草稿会保留。拆分之前曾加入短暂失去钱包的保留（`useFundsSessionHold` 的 60 秒部分），任务记录称再次复现 E2 时划转草稿保留，但复现的时间、版本与步骤没有存档；2026-11-23 收窄时这部分已去掉，本分支在 E2 下与修复之前相同（弹窗重挂载、草稿丢失）。第七轮、7b、7c 与 7c 复查之后的改动没有再做浏览器复现，2026-11-23 拆分与收窄之后的本分支也没有。

E2 的原因（源码推断，与复现一致；第一句 2026-11-23 由编排按锁定版本核对，见下文「依赖源码核对」）：`@privy-io/wagmi` 的同步逻辑在选择函数返回空时直接把 wagmi 状态写成 `disconnected`，不经过 `reconnecting`；wagmi 的 injected 连接器收到 `accountsChanged([])` 也会立即断开，没有宽限期。

E5 的原因（源码推断）：wagmi 的 `getConnectorClient` 只在创建 client 时检查一次连接，client 的传输直接走 `provider.request`；本仓库 `clients.ts` 的 `guardSigning` 在签名前只检查 ADR 0053 的时限，不检查会话。

## 官方交易终端的做法（2026-11-22 现场代码）

读取的文件：`config-yGtOi1px.js`，文件名带哈希，复查时要重新定位。

- **身份**：函数 `$6()` 依次取 URL 覆盖地址 `hloa`、导入的 API 钱包；Privy `ready && authenticated` 时取 Privy 用户绑定的钱包地址，并且 `isConnected` 写死为 `true`；否则才看 wagmi 的 `useAccount`，重连期间按 `!!address` 算已连接。按这段代码，邮箱登录（Privy 认证）的会话不受钱包传输层断开影响；直接连接的外部钱包走 wagmi，地址变空再恢复时，条款状态会重置为 `acceptTermsLoading`，账户面板与其中的划转、提款弹窗随之卸载（静态阅读推断，未在界面上实测）。
- **签名**：资金动作共用的包装 `I6()` 直接调用 wagmi 的 `signTypedDataAsync`，签名前不检查会话；签名出错一律当作用户拒签静默返回；拿到签名后直接 POST `/exchange`，签名后不核对会话或地址。唯一的约束是签名器本身，也就是 wagmi 当前连接的账户。

## 官方交易终端实现补充（2026-11-23，运营方只读取证）

以下五条来自运营方 2026-11-23 对 `https://app.hyperliquid.xyz/trade/HYPE` 生产前端包的只读阅读（没有操作、断开或签名），由编排转述，编排与文档代理都没有重新核对。包的文件名带哈希，复查时要重新定位。

1. **Privy 与 wagmi**：包里没有 `@privy-io/wagmi`、`useSetActiveWallet` 或 `SmartWalletsProvider`。根组件（`index-BZUpdIHp.js`）是 `<WagmiProvider config reconnectOnMount={true}>` 包住 `<PrivyProvider config={{ loginMethods: ['email'] }}>`：Privy 只管邮箱，外部钱包用普通的 wagmi 连接器（injected、walletConnect、coinbaseWallet、okxWallet）。
2. **资金弹窗的 key**：存款、提款（含 `AcrossWithdrawModal`）、发送与划转挂载时都没有 React `key`；地址变化时提款表单保留金额与币种，只重置手续费确认；条款状态在地址变化时回到 `unknown`。
3. **外部钱包 CCTP 存款**（`config-yGtOi1px.js` 的函数 `pN`）：限额与手续费 → EIP-7702 检查（不支持时退回 approve 加 `depositForBurnWithHook`）→ 用开始时取得的钱包 client 签 EIP-3009 `ReceiveWithAuthorization` → 立即 `batchDepositForBurnWithAuth` → 等一次确认。签名之后不等会话。
4. **邮箱资金**：自动邮箱存款不用 Smart Wallets 或 Paymaster，而是经钱包的 EIP-1193 provider 切链，签 EIP-2612 Permit，发到 `/info` 的 `{ type: 'depositWithPermit' }`。外部钱包经 wagmi 的 `switchChainAsync` 切链，不用 Privy 的 `wallet.switchChain`。
5. **签名与 `/exchange`**：`I6` 在签名前后都没有会话世代；只有无名交易 Agent 在成功后把恢复出的签名者地址与 `useAccount().address` 比较；提款在签名前检查 `canSign`（地址相等），并区分 4001 与 5000 拒签；请求只按 `requestSent: false/true` 分类，带 15 秒的 `AbortController`。发送与划转都用 `type: 'sendAsset'`。API 钱包页不显示错误状态，读取失败时清空列表。

**依赖源码核对（2026-11-23）**：编排按锁定版本在本机读源码核对了三条（文档代理没有重读）。一，`@privy-io/wagmi` 的 `useSyncPrivyWallets.mjs` 在钱包离开目录时把 wagmi 写成 `status: "disconnected"`、`connections: new Map()`，不经过 `reconnecting`，它的 `WagmiProvider` 还强制 `reconnectOnMount: false`；这解释了本仓库的 E2。官方终端不用 `@privy-io/wagmi`（上文第 1 条），所以由这个适配器把离开目录的钱包直接写成 `disconnected` 的这条机制在官方终端上不会发生；这只排除了这一条机制，官方外部钱包路径（普通 wagmi 连接器）在钱包断开时有没有等效的表现，没有测量。二，Privy 3.46 的 `wallet.switchChain`（`index-SQDAZoUX.mjs`）直接调用 `this.proxyProvider.request({ method: "wallet_switchEthereumChain" })`，遇到 4902 时（Rabby 先等 300ms）发 `wallet_addEthereumChain` 再切一次，绕过应用层包装的 provider。三，viem 的 `actions/wallet/sendTransaction.js` 发送之前读 `eth_chainId`（`getChainId`），`eth_sendTransaction` 以 InvalidInputRpcError、InvalidParamsRpcError、MethodNotFoundRpcError 或 MethodNotSupportedRpcError 失败时退回 `wallet_sendTransaction`。后两条与执行分支有关（第八轮审查第 1、5 条）。

## 官方文档

- **Hyperliquid**（`for-developers/api/nonces-and-api-wallets`、`exchange-endpoint`）：nonce 按签名者保存最高的 100 个，新 nonce 只要比其中最小的大、且没用过就被接受。签了名但从未提交的动作，在交易所侧没有记录；重新签名会换新 nonce。但旧签名在 nonce 窗口内一直有效，所以只有确定从未离开本页的签名才能当作没发出。用户签名的资金动作没有 `expiresAfter`。
- **Privy**（`wallets/wallets/get-a-wallet/get-connected-wallet`、`basics/react/setup`、`recipes/hyperliquid/client-side-usage`）：`useWallets().ready` 是钱包就绪的唯一信号；官方的 Hyperliquid 示例在未就绪时不签名，并要求按确切地址找钱包。
- **wagmi**（`react/api/hooks/useConnection`、`core/api/actions/reconnect`）：只定义了 `status` 的四个取值，没有关于临时断线的建议，也不提供「断开前后是同一会话」的标识。
- **WalletConnect / Reown**（`advanced/providers/ethereum`，以及锁定的 `@walletconnect/*` 2.22.4 源码）：中继 WebSocket 掉线只在 SDK 内部重连；页面在后台时不补连，回到前台后由心跳补连。中继掉线不会转成 EIP-1193 的 `disconnect` 或 `accountsChanged`，`disconnect` 只在会话被删除或过期时发出。
- **MetaMask**（`wallet/reference/provider-api`）与 EIP-1193：`disconnect` 表示 provider 无法再提交请求；建议按确切账户判断，不要按事件判断。扩展锁定时具体发出什么事件，文档没写。

## 结论与做法

### 一：会话解析中回到同一账户，资金弹窗的草稿保留（本分支只做解析中）

- 本分支只在会话解析中保留（`useFundsSessionHold`，2026-11-23 收窄）：`useWalletSession().isResolving` 为真（wagmi 重连、钱包目录初始化、预期钱包尚未激活、Privy 初始化），受全应用 10 秒解析时钟约束。这期间弹窗不重挂载，草稿保留；只有定在**另一个**账户、会话模式、钱包或钱包类型上，或者切换了网络，弹窗才重挂载。「解析中」本身不算新身份。
- 会话之前已定过一个地址、而 wagmi 已经连接到另一个地址（不是会话最后一次定下的地址）时，按换了账户处理：即使仍在解析中，保留也立即结束，弹窗重挂载。还没定过地址时照常保留，第一次定下的身份直接采用；同一钱包重连期间 wagmi 仍报告的原地址不算另一个地址。
- 用户主动退出登录（Privy `authenticated` 变为假）时，立即丢弃草稿；解析超过 10 秒仍未定下，按未连接处理。
- **E2 不在本分支覆盖范围内**：已登录的会话里钱包报告断开、Privy 把它移出目录时，`isResolving` 为假，弹窗立即按新身份重挂载，草稿丢失，与 `fc4377e6` 相同。拆分前曾为此加过 60 秒的失去钱包保留，2026-11-23 运营方决定从本分支去掉（见「负责人决定」），因为拆分后第三轮 Codex 审查的两条 P2 与一条 P3 来自它。根因是 `@privy-io/wagmi` 在钱包离开目录时直接写成 `disconnected`、不经过 `reconnecting`。官方终端不用这个包，所以这条机制在那里不会发生，但官方外部钱包路径的等效断开表现没有测量；按运营方的只读取证，官方资金弹窗也不按钱包身份设 key（上文「官方交易终端实现补充」第 1、2 条与「依赖源码核对」）。是在同步层修，还是像官方那样不按钱包身份重挂载资金弹窗，记为后续。
- 弹窗在四种情形下的显示：本次提交的存款进度屏（`useDeposit` 的 `pending` / `confirming`）在解析中按沿用的钱包地址与存款模式读取，不消失；从恢复记录打开的 Circle 转发屏读实时的 `cctpTrackingOwner`，解析中地址为空时会退出该屏（既有）；解析中各页签显示静默的忙碌占位，不显示连接提示；确认失去钱包（含 E2）时弹窗按新身份重挂载，显示「Wallet not connected」与连接按钮。提交始终按可用性布尔值禁用；恢复后，由余额推出的值（Max、默认目的地址等）按实时数据重算。
- 结果归属：发送、划转与提款的结果身份含账户模式（收窄后与 `fc4377e6` 相同），请求发出之后账户模式变化时结果不通知、不关窗，是既有行为，记为后续。
- 与官方的关系：和官方的邮箱会话一致。对直接连接的外部钱包，官方的表现还没有定论：2026-11-22 的静态阅读推断地址变空再恢复时条款状态重置、账户面板与其中的弹窗卸载；2026-11-23 补充第 2 条说资金弹窗挂载时没有 key、地址变化时提款表单保留金额与币种；两者都没有在官方界面上实测。依据是本仓库「短暂数据缺失不下断开结论、切换不丢草稿」的规则。这个偏离只影响展示与结果归属，但要注意：发送、划转与提款弹窗自己的执行守卫在保留期内比较的是沿用的身份，不读实时会话；实时性来自 hl-react，解析中 `clientKey` 为 `disconnected`，`session-provider.tsx` 在这次变化里作废旧身份的请求世代，调度器开始请求时把它作废，新调用的 `useExchange` 也拿不到注册租约（[移动端数据展示规范](mobile-data-presentation.md)「资金弹窗的请求」一行）。本分支的钱包弹窗与发送只受现有执行守卫约束，没有任何一步等这个保留结束（手动存款签名后的等待属于结论二，在执行分支上）。

### 二：签名前严格检查会话，签名后只核对账户（不在本分支）

这一条在单独的分支 `claude/signer-session-guard`（提交 `df2703fe`，尚未合入）上设计并实现，设计记在那个分支的 ADR 0058 与签名规范里；2026-11-23 运营方决定把它与本分支拆开，见任务记录「拆分（2026-11-23）」。依据仍是上文的 E4、E5、官方终端与官方文档，以及下文「负责人决定」。

本分支的现状（钱包弹窗与发送仍只受现有执行守卫约束）：

- `clients.ts` 的 `guardSigning` 在签名前只检查 ADR 0053 的开始时限，不检查会话；E5 那样已交给 SDK 的外部钱包请求，会话变化后仍可能弹出签名并发送。调度器只作废还没开始的请求（`useExchange` 调用时拿不到注册租约的，在进入调度器之前就作废）；邮箱主钱包签名器在交给传输之前核对 owner，不是当前的就抛 `ExchangeRequestInvalidatedError`。
- 手动存款进入 `deposit()`（`lib/hyperliquid/use-deposit.ts`）之后，切链、请求连接、签名与广播之前都不再核对会话。
- 展示层能做到的：还没发出的预检（发送的收款地址检查、存款与提款的预检）跟随实时会话令牌，重连一开始就作废，不弹钱包；已在调度器排队、被重连作废的请求，以及发送、划转在发出前被弹窗自己的检查拦下（执行守卫，或发送前的地区、模式与收款地址复核）而点击后会话或账户模式已变的，按「没有发出」安静处理；提款在 SDK 调用之前停下（`isExchangeRequestStoppedBeforeSending` 的名单：调度器作废、开始时限、资金锁不可用或超时、执行前守卫超时、锁内法律复核拒绝或无法核实、应用守卫的拒绝）而这次尝试已过期（例如等待期间路由刷新）时同样安静。提款、发送与划转的结果属于当前提交或尝试时照常通知并关窗，请求在途时又新开的同类窗也会被旧结果关闭、其中输入的内容丢失（发送、划转与以 `open("withdraw")` 再开的提款与 `fc4377e6` 相同；以 `open("deposit")` 再开时 `fc4377e6` 不通知也不关窗，本分支改为通知并关窗，提款在途时存款不会启动；2026-11-23 曾改为只在发出时的那一次开窗里关窗，因为新开窗会带着上一笔的内容、可再提交一次，同日撤回）；提款的结果另要求发出它的存款弹窗宿主仍挂载，法律门沿用期间再新开存款窗会卸载它、结果不再通知（已知缺口）。发送的重试草稿按网络与 owner 分别保存，一个账户的迟到结果不替换另一个账户的草稿（[移动端数据展示规范](mobile-data-presentation.md)「钱包会话解析中」，[确认面](confirmation-surfaces.md)「发送、划转、充值、提现」一行）。

## 尚未取得的证据

- 手机真机：iOS Safari 或 Android Chrome 经 WalletConnect 切到钱包 App 签名再回来时的事件序列与时长；钱包内置浏览器的行为；钱包端会不会主动发出 `accountsChanged([])` 或结束会话。2026-11-22 在模拟器上用扫码连接 MetaMask Mobile 没有成功（模拟器里没有钱包 App，局域网 http 地址不是安全来源，也不在 Privy 允许的来源里）。
- MetaMask 扩展锁定时发出的事件。
- 官方终端在界面上的实际表现：以上都是代码阅读，没有在官方界面上断开或重连。

## 负责人决定

以下是已记录的决定与由此推出的做法。除 2026-11-23 决定 1 外，都适用于执行分支 `claude/signer-session-guard`；本分支没有签名与发送边界的会话检查，也没有手动存款签名后的等待，这些条目在本分支没有对应实现。

- 2026-11-22：签名返回时会话仍处于断开中（既没回到原账户，也没定在别的账户上），照常发送，与官方一致。前提是会话没有定在另一个账户、会话模式或网络上，请求的生命周期没有结束；手动存款另要求存款弹窗没有关闭。理由：签名者就是账户本人，作废只会让用户白签一次；资金锁内的执行守卫照旧在调用 SDK（签名之前）时运行。
- 任何钱包弹窗之前都要严格核对会话（本文「二」与执行分支 ADR 0058 的签名前检查；2026-11-23 编排在 7c 跟进里转述为负责人的规则，原话没有在仓库存档）。
- 由上面两条推出（2026-11-23 第 7c 轮，不再单独待确认；等待的方式已由下文 2026-11-23 决定 2、3 取代，资金弹窗的 60 秒保留也已从本分支去掉）：手动存款在许可签名之后等资金弹窗的会话保留结束。外部钱包路径的下一步是交易确认弹窗，适用第二条：会话不在点击时的账户上就不发送。赞助路径不弹窗，适用第一条：只在换了账户或弹窗关闭时停下，兜底时限到点而会话仍未回来时照常往下走。7b 的固定 10 秒上限已取消，它短于 60 秒的保留期，会让钱包离开目录后第 11 到 60 秒回来的存款白签一次。
- 7c 复查之后编排的修改（2026-11-23，不是负责人决定；与上一条一样已由 2026-11-23 决定 2、3 取代）：保留在点击身份之外结束（没有钱包、`clientKey` 为 `disconnected` 或另一个身份）时，两条路径都静默停下。原因是 `GlobalModals` 这时同样按新身份重挂载存款弹窗，原先外部路径的「Wallet not connected」可能写进旧执行状态、之后作为过期提示弹出（7c 复查 P2-1）。「Wallet not connected」只留给 70 秒兜底到点而保留仍在的情形。
- 2026-11-23 运营方在对话中回答的三条决定（编排转述，原话没有在仓库存档）：
  1. 本分支（PR 1）先收窄再交付：去掉 60 秒的失去钱包保留（已登录却没有钱包，E2），保留只在会话解析中成立（原 F5a 的范围），E2 的草稿丢失记为后续（PR 2 或单独处理）；发送、划转与提款的结果身份恢复为含账户模式。保留不动的：解析中的草稿、API 钱包静默的四态（含离线暂停的首读与保留的最近有效列表）、兑换与提款的结果归属修复（兑换点击时的实时令牌、提款开始时限跨重连按没有发出处理、提款结果所有者跨路由刷新保留：结果照常通知并关窗，同一次开窗内的路由刷新照常报告；决定时这一项还写着「只在同一次开窗里关窗」，它与发送、划转的同类规则已在 2026-11-23 撤回，见任务记录「撤回开窗绑定（2026-11-23）」）、解析中沿用的存款地址与模式，以及「观察到另一个已连接地址时保留立即结束」。
  2. 执行分支（PR 2，ADR 0058）：赞助的邮箱手动存款（smart 路径）用方案 A：签名之后等一次会话回到点击时的账户，再重做全部新鲜检查（路由、余额、法律、`smartClient`）后广播；超时或换了身份就停下；法律门契约不变。
  3. 执行分支（PR 2）：外部钱包存款在授权签名之后等一次，上限是独立写明的 30 秒（不跟 UI 的保留挂钩），等完再做全部新鲜检查；超时报「Wallet not connected」，什么都不发送。
