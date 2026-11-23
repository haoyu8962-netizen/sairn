# 移动端数据加载与提示规范

## 目的与范围

移动端的行情、交易、账户、资产组合，以及这些入口使用的共享资金和仓位弹窗，在首次加载、后台刷新和重连期间保持安静、稳定。数据尚未返回不代表账户为空、连接故障、账户模式不受支持或平台不支持充值提现。质押、推荐、金库列表与金库详情页在桌面与手机上同样遵循本规范（2026-11-01 起，见下文「受约束的入口」）。

本规范先于实现更新。修改上述界面时必须同时检查本规范与 `AGENTS.md`，不得重新引入被动数据状态警告。

## 展示规则

| 情况 | 展示 | 禁止 |
| --- | --- | --- |
| 账户数值未就绪 | 仅在展示层使用格式化的零；恢复后显示实际值 | 把占位零写回业务模型、缓存或资金分类 |
| 手机下单摘要（普通订单）中的空值：数量为 0、价格或账户数据未就绪、清算价无法估算 | 与数值同色的 `N/A`，与官方手机下单摘要相同。它是稳定占位：空草稿、加载中和读取失败显示同一个值（[下单表单对齐](order-entry-surface-parity.md) 2026-11-04） | 按加载或失败切换不同文字；给空值单独换颜色；把 `N/A` 当作账户为空或不能下单的结论 |
| 列表首次加载、订阅已建立但首份快照未到达 | 稳定空容器或骨架；可设置 `aria-busy` | “暂无持仓/订单/余额”、充值引导 |
| 数据过期、重连、后台刷新失败 | 空容器、骨架，或允许保留的只读历史记录 | “余额已过期”“更新已暂停”“加载失败”等被动文字、警告图标和原始错误 |
| 完整、当前、成功的空快照 | 正常的空列表说明 | 用数组长度单独判断账户/列表为空 |
| 数据依赖尚未就绪的操作按钮 | 保留操作名称并禁用；执行中的明确用户操作可以显示进度 | 把按钮改名为“加载余额失败”“不可用”等数据状态 |
| 钱包或地区规则尚未解析 | 等待解析，保留动作禁用状态。钱包一侧以 `useWalletSession().isResolving` 为准，各入口的做法见下文「钱包会话解析中」；地区检查未解析时，已连接账户的资金入口保留并禁用 | 提前断言“不支持充值提现”“请选择账户模式”“等待连接恢复”；在会话解析中显示“请连接钱包”或“交易数据已变化”；因地区检查未解析而整块隐藏资金入口 |
| 已确认的地区、网络或账户限制 | 必要、准确的限制说明 | 用未知状态代替已确认限制 |
| 已确认的市场未平仓量上限（当前、成功、未过期、同一账户的 `webData3` 快照在 `perpsAtOpenInterestCap` 中列出该永续市场的精确名称） | 选中限价、止损限价、止盈限价时，在各端既有的校验提示行显示一条准确的限制说明（「未平仓量已达上限，限价单挂出后会被撤销。请使用市价单平仓。」），提交按钮保留静态名称并由 `canSubmit` 禁用；市价、止损市价、止盈市价、TWAP、分段订单和现货不受影响（[OI 上限说明](open-interest-cap.md)） | 快照缺失、订阅中、过期、错误、重连或账户不匹配时显示或执行上限限制；用提示是否存在决定能否提交；在行情区、按钮名称或未连接状态下展示被动上限徽标 |
| 已确认的 Agent-only 会话（手机使用桌面授权的交易密钥） | Deposit / Withdraw / Transfer 及其他需要主钱包的入口保留并禁用，给出「需要在桌面连接主钱包」的一句原因（`agent-only-session`）；缺少 Agent 或 builder fee 授权时，下单与确认按钮保留静态名称并禁用，给出「请先在电脑端下第一笔订单完成交易授权」的一句原因（[ADR 0039](adr/0039-link-mobile-device-builder-fee-and-session-priority.md)） | 整体隐藏资金入口；把该原因归入被动数据原因集合；在手机上提供无法签名的 Enable / Connect / Reconnect 入口 |
| 已确认的命名 API 钱包基础名额用完（关联移动设备弹窗：本次打开后成功返回的 `extraAgents` 里，有效的命名 Agent 已达文档基础上限 3 个且没有 `Mobile QR`） | 签名前在弹窗里显示一条 warning 提示，用条件句说明授权可能被拒绝（子账户与成交量会提高上限），列出占用的名字与到期日，附 API 钱包页入口；授权按钮不因此禁用（[ADR 0039](adr/0039-link-mobile-device-builder-fee-and-session-priority.md)） | 加载中、失败、过期或格式不符时显示任何名额文字；用提示是否存在决定能否授权 |
| 已确认的手机访问结束（状态检查确认导入的密钥已过期或被电脑端替换，并已删除） | 一条常驻通知「手机访问已结束」，说明需要在电脑端重新生成二维码扫码（[ADR 0039](adr/0039-link-mobile-device-builder-fee-and-session-priority.md)） | 在答案不确定（请求失败、刷新中、快照早于导入）时提示或删除；把它当作被动加载失败文案 |
| 用户实际提交的操作失败或结果待确认 | 保留与该操作有关的错误、重试与追踪反馈 | 静默吞掉提交失败，或把待确认交易当作失败后允许重复提交 |
| 质押、推荐与金库页（桌面与手机）：某一来源刷新失败，但本页开始读取后已收到过它的数据（同一 owner、网络与金库，按 `useDataReceivedSinceMount` 判断，界定与[资产组合 E13](portfolio-statistics.md) 相同） | 静默保留这份数据；依赖它的操作按可用性布尔值禁用，直到刷新成功，并在操作旁提供中性「Retry」；空列表不下结论，改为中性「Retry」。进入本页之前缓存、本页没有收到过的数据在请求失败后不保留，按首次失败处理 | 用错误页、红色提示框或警告图标替换已显示的数据；把余额置 0；用保留的数据启用操作或得出「没有记录」 |
| 质押、推荐与金库页的数值未知（未连接、加载中、首次读取失败） | 稳定占位符 `--` | `0 HYPE`、`$0` 等看似确定的零 |
| 由市场静态元数据推导的说明值（目前仅杠杆编辑器的「最大仓位」行，桌面弹窗与移动抽屉共用） | 是否出现只取决于该市场的保证金分档表：有效且多于一档才显示，数值随编辑器显示的杠杆变化；「无档位上限」只能由有效分档表得出；杠杆超出分档范围、缺少计价币符号或截断后的下界超出 JavaScript 安全整数范围（合成情形）时用稳定占位符（[杠杆仓位上限](leverage-position-limit.md)） | 分档表缺失、无效或单档时显示「加载中」「不可用」等文字；让该行随预览杠杆出现或消失；用该行是否存在或其数值决定确认按钮能否点击 |
| 确认弹窗打开期间，待确认对象与开窗时不同（目前仅市价平仓的仓位数量） | 在需要重新核对的内容旁明示一条 `aria-live="polite"` 提示，说明哪一项与开窗时不同；只在可见、可编辑的确认阶段显示；执行仍以点击时展示的数量为上限（[确认面契约](confirmation-surfaces.md)） | 静默改写待确认数值；把变化写进确认按钮名称；用提示是否存在决定能否提交；弹窗关闭后的后台执行期继续播报 |
| 手机成交历史开启任一筛选（类型、方向、角色）：列表平时只显示最近 30 条实时成交，页签同时补拉 `userFills` 快照（最多 2,000 条），与订阅保留的全部实时成交（`useUserFills().bufferedFills`，hl-react 最多保留 200 条）按 `(time, coin, tid)` 去重合并（[筛选映射](trading-toolbar-redesign.md#mobile-filter-mappings)） | 有匹配就显示匹配的成交（最多 30 张卡片），补拉之后到达、又被更新的成交挤出最近 30 条的匹配成交仍然显示。只有补拉属于当前 owner 与网络、最近一次请求成功、没有请求在进行、未离线，实时成交快照当前（就绪、未过期、未离线、无错误），且订阅保留的最早一条实时成交不晚于快照里最新的一条（两者之间不会漏掉成交，`fillSnapshotReachesLiveFills`；两个时间都算上 TWAP 成交，因为订阅的保留上限也算它们，而列表不显示它们；快照为空时，只有订阅里也没有实时成交才算衔接，因为实时成交都晚于这份快照，订阅可能已经挤掉其中一些）时，无匹配才显示「No fills match these filters.」；订阅里一时没有普通成交（例如只剩 TWAP 成交）时，已开启的筛选照常显示筛选行与快照里的匹配，不退回「No fills found.」；补拉恰好返回 2,000 条上限时改为「No fills match these filters among the latest 2,000.」，不声称检查过更早的成交。补拉加载、重新请求、离线或实时快照不当前时为空白列表加 `aria-busy` 与读屏说明；补拉失败（包括已有快照后的刷新失败），或实时成交已不能与快照衔接时，只给中性「Retry」，重试会重新补拉 | 补拉未完成、失败、刷新中、实时快照不当前或两者之间可能漏掉成交时得出「无匹配」结论；在不到上限或达到上限的检查范围外声称没有匹配；显示补拉的错误文字或警告图标 |
| 仓位 TP/SL 弹窗：`maxMarketOrderNtls` 成功返回、整表格式有效，且仓位价值严格大于按仓位当前杠杆选出的分档上限 | 在说明段落之后显示一条语义 warning 提示，说明市价 TP/SL 可能因仓位规模产生较大滑点，建议改用限价执行或配置更小的数量；不含数值、不设 `aria-live`、不参与提交判断（[TP/SL 大额滑点提示](position-tpsl-slippage-warning.md)） | 分档表加载中、失败、格式异常、没有适用分档时显示任何文字（如「无法判断滑点」）、图标或占位；把提示写进确认按钮名称；用提示是否存在决定能否提交，或因提示改变提交负载 |

屏幕阅读器专用的简短加载说明与 `aria-busy` 可以保留。禁用按钮可关联准确的无障碍说明，但不得把首次加载描述成连接故障。全局真实离线/恢复提示、已确认地区限制、签名确认、法律条款、交易提交结果、确认对象与开窗时不同的提示，以及仓位 TP/SL 大额滑点提示，均不属于普通数据加载文案。

## 双端下单与账户概览

启动阶段遵循 [ADR 0010](adr/0010-blank-until-ready-startup.md) 和 [启动渲染规则](../.claude/rules/startup-rendering.md)：预渲染及 runtime/i18n 未就绪时只保留空播报，没有可见骨架。runtime 和持久语言目录就绪后，移动端在同一个 MobileTerminalFrameView 中显示真实 MobileHeader 与 MobileBottomNav；市场目录/路由市场未就绪时 main 为空且 aria-busy，数据就绪后挂载内容。头部与底栏不重挂载，底栏使用现有 useMobileTerminalTab 对导航持久状态的校验与 trade 默认值，不改写用户偏好。真实组件继续使用纯 view；已挂载数据组件的被动数据展示和守卫仍按上表执行。

桌面与移动下单面板共同遵循静默恢复规则。校验结果继续完整保留用于禁止提交；展示层只呈现依赖数据已经就绪的输入错误。行情、账户或钱包未就绪不得进入表单错误汇总；行情不可靠时不展示依赖其计算的金额、数量、止盈止损和 TWAP 价格方向判断。仓位未知不得展示“先开仓”。字段错误与汇总同步清除，不能在恢复、切换市场或语言后保留过时文案。

字段红框、文字与 `aria-invalid` 使用同一份可展示校验结果，不能只隐藏文案而残留红框。限价与分段订单的 Mid 控件复用当前市场上下文，mid 优先、空值时 mark 回退，检查对应来源的成功状态和接收时间。无新鲜价格时保持按钮原位禁用，不消耗自动预填机会，不覆盖已有输入或手动清空。TWAP 的默认 30 分钟属于真实初始值，实际零分钟必须显示为零。参考与边界见 [下单字段核对](order-entry-field-review.md)。

操作按钮使用显式阻断状态，不得依赖提示文案是否存在。保留已确认限制和用户主动操作反馈。账户概览不再显示“可用资金在现货账户”警告或重复划转入口；余额仍由正常资产列表展示，划转继续使用原有操作区入口和能力校验。该调整不改变用户主动提款时的资金来源说明。

独立数据源的展示状态不得相互覆盖。下单面板余额快照健康、只减仓持仓快照尚未就绪时，保留实际可用余额，数量和提交动作仍按组合门槛禁用。仅余额自身不可判定时才使用余额占位；桌面同源余额行与 Swap 遵循相同边界。

## 认证初始化的恢复入口

认证界面只以 `usePrivy().ready` 判断就绪；签名仍须等待 `useWallets().ready` 与精确的当前 owner 钱包。认证已就绪时，已登录用户的身份菜单在钱包目录初始化期间仍可打开；未登录用户的登录入口不等待钱包目录。

认证持续未就绪，或已登录用户的钱包目录持续初始化超过 30 秒，可提供用户主动点击的“重新加载页面”入口；已登录用户的菜单使用中性的钱包状态指示。钱包目录尚未就绪时，重连与安全退出保持禁用。就绪状态或身份变化须重置计时。这是应用的恢复交互，不是 SDK 的超时或重试规则，也不代表已复现 Hyperliquid 相同故障的处理方式。点击后沿用 Privy 正常会话恢复；不得自动刷新、退出登录、重挂载认证 Provider 或将未知状态标记为就绪，不改变签名、授权、资金判断及动作保护。不得显示原始错误、故障结论或警告横条。

该入口仅适用于认证与钱包目录初始化，不扩展为行情、余额或订单被动加载提示。与 [交易引导规范](trading-onboarding.md) 和 [邮箱签名规范](email-trading-signing.md) 同步验证：认证与钱包目录独立恢复、30 秒入口出现、身份或就绪变化重置计时，以及未点击时没有刷新或交易副作用。

## 钱包会话解析中

「还没解析出钱包会话」与「确认未连接」是两种状态。`useWalletSession()` 在下面这些时候都给出 `isConnected` 为假、`address` 为空：Privy 还没就绪（只在浏览器里存有 Privy 登录痕迹时才算解析中，从未登录的访客立刻按未连接展示，与头部菜单相同）；已登录但钱包目录还在初始化；wagmi 正在连接或重连（Privy 更新用户对象后适配层会重连一次，例如智能钱包关联完成时，见 [ADR 0033](adr/0033-silent-email-wallet-creation.md)）；期望的钱包已在目录里但还没成为当前账户。这些都不是用户断开了钱包。

`useWalletSession().isResolving` 把它们归成一个标志，定义与不覆盖的情形见 [运行时约束](runtime-guardrails.md) §1。等待有上限：全应用共用一个时钟，从会话变成未定起最多 10 秒，之后不论卡在哪一步都按当前的实际状态展示，所有入口同时切换。它只用于展示：`isConnected`、`hasWalletAccess`、地址、签名器与全部执行守卫照旧，解析期间没有任何动作因此可用。确认未连接（Privy 就绪且未登录，或已登录但目录里没有期望的钱包，或等待已满 10 秒）与真实的账户变化（含在钱包里切到另一个账户），展示与以前相同。

| 入口 | 解析中 | 确认未连接或账户已变 |
| --- | --- | --- |
| 资金弹窗的挂载（存款、划转、发送、兑换） | 弹窗不重挂载，输入草稿保留：`GlobalModals` 以 `useFundsSessionKey` 作这些弹窗的 key，保留期内 key 不变；挂载时就在保留期内的，第一次定下的身份直接采用、不重挂载；网络切换照常生效。保留（`useFundsSessionHold`）只在会话解析中（`useWalletSession().isResolving`，受全应用 10 秒解析时钟 `WALLET_SESSION_RESOLVING_MAX_MS` 约束）、并且没有观察到另一个已连接的钱包地址时成立（2026-11-23 收窄）。另一个地址：会话已定过一个钱包地址之后，wagmi 已连接、`connectedWalletAddress` 不是会话最后一次定下的钱包地址（钩子自己记下这个地址，不区分大小写比较），说明钱包切到了不是预期的账户；这时即使 wagmi 仍在重连或钱包目录仍在初始化，保留也立即结束，弹窗按新身份重挂载，不再把为上一个账户保留的草稿与结果放在新地址前面。会话还没定下任何钱包地址时（开窗时就在解析中）照常保留，第一次定下的身份直接采用；同一钱包重连期间 wagmi 仍报告的原地址不算另一个地址。已登录的会话短暂失去钱包（钱包报告断开、Privy 把它移出目录，`isResolving` 为假，见[实践指南](wallet-session-reconnect-practice.md) E2）不在保留范围内：弹窗立即按新身份重挂载，草稿丢失，与 `fc4377e6` 相同，记为后续。带法律门的页面（交易页、Portfolio、Vaults、历史页）的法律门分支同样按这个保留沿用（`useHeldWhileResolving(…, useFundsSessionHold())`）：保留期内法律门离开 `inactive` / `accepted`、而中断之前最后一次已定的状态可操作时，如果保留开始时有一次开窗，不论法律门此刻是哪个状态（`checking`、`wallet_required`、`wallet_setup_failed`，也包括 `required`、`submitting`、`blocked`、`error`），`LegalAwareGlobalModals` 都沿用「可操作」分支，弹窗不随分支切换卸载；没有开窗时只在 `checking` 时沿用，其余状态立即按实时状态显示（例如 `wallet_required` 立即显示 `LegalAcceptanceModal`）。沿用期间只保留保留开始时已打开的那一次开窗（按 store 的开窗序号 `useGlobalModalOpening` 区分，切换存款页签不算新开窗），之后的开窗，包括关掉后再开同一类弹窗，等保留结束（解析结束或观察到另一地址）、由实时法律门决定后才显示；设置与命令菜单不受限，Cmd+K 按可见的弹窗判断，打开命令菜单会替换等待中的开窗。另一类弹窗在等待时，已保留的弹窗照常走完退出动画。所以只有在保留开始时已有弹窗打开的情况下，钱包已在目录中但尚未连接的 `wallet_required` 提示，以及解析期间同一账户变成的 `blocked` 等状态，才最多推迟到解析结束（最多 10 秒）。这只是展示上的推迟：`useExchange` 在请求开始前仍按实时法律状态核对（资金动作在资金锁内强制重新读取），保留期内 `clientKey` 为 `disconnected`，请求本来也拿不到注册租约。已知缺口（拆分后第三轮 Codex 审查第 1 条，未修）：沿用期间同一账户再以 `open("deposit")` 或 `open("withdraw")` 新开一次，新开窗被挡下，`displayedModal` 变为 `null`，旧的 `DepositModalHost` 卸载，在途提款的结果所有者随之清掉，结果不再通知；只在解析中、没有观察到另一地址时（最多 10 秒）可达，存款窗遮住页面时 Cmd+K 也打不开，普通操作难以触发；`fc4377e6` 时任何重连都会让这个宿主卸载（2026-11-21，2026-11-23 收窄为只在解析中） | 会话定在另一个账户、会话模式或钱包类型上，定下时没有钱包（含 E2），已退出登录，已观察到另一个已连接的钱包地址（解析中也是如此），或解析超过 10 秒，弹窗按新身份重挂载，草稿清空；法律门按实时状态显示 |
| 资金弹窗的请求（发送、划转、提款、存款、兑换） | 已发出的请求：发送、划转弹窗的结果身份与存款弹窗的会话身份在保留期内（`useFundsSessionHold`：只在解析中，且没有观察到另一个已连接的地址）沿用中断之前最后一个已定的值（`useHeldWhileResolving`），会话恢复为同一账户且这次尝试仍属于当前弹窗时，结果照常通知并关闭弹窗，原草稿不能再提交一次（请求在途时同类窗又新开了一次的，结果同样关闭它，新开窗里输入的内容随之丢失；以 `open("deposit")` 切到存款页签再开时 `fc4377e6` 不通知也不关窗，本分支改为通知并关窗；提款在途时存款不会启动，见下文）；已知缺口（拆分后第三轮 Codex 审查第 2 条，未修）：结果在解析中、wagmi 报告另一个地址之前结算时，按沿用的身份发出普通全局通知，之后会话定在另一个账户，已发出的通知（含常驻的「status unknown」）不会撤下；`fc4377e6` 时解析中结算的结果不通知，所以这条最多 10 秒的路径是新的，通知文字只描述原账户自己的请求，不写新账户；修法需要按 owner、环境与尝试标识、可由通知宿主撤下的任务通知（ADR 0019），记为后续；发送、划转与提款的结果身份含账户模式（2026-11-23 收窄后与 `fc4377e6` 相同）：请求发出后模式变化（含变为未知）时结果不通知、弹窗不关，这是既有行为，记为后续；提款一旦调用交易所请求，结果归属只随含账户模式的会话身份变化或关窗失效，路由或页签刷新不再清掉它：调用交易所请求的那一刻（两条路由都是）把这次尝试记为结果所有者（`withdrawalOutcomeOwnerRef`），结算时照常通知结果（成功、失败或结果不明）并关窗、调用 `resetDeposit`，同一次开窗内的路由刷新之后也是如此；提款在途时同一账户又以 `open("deposit")` 或 `open("withdraw")` 新开一次，旧结果同样关闭这次新开窗，新开窗里的草稿随之丢失，与 `fc4377e6` 相同（2026-11-23 曾改为开窗标识已变就不关窗，同日撤回：新开窗会带着上一笔的金额与目的地址，忙碌解除后可再提交一次）；这些通知只在发出它的 `DepositModalHost` 仍挂载时发生，法律门沿用期间再新开一次存款窗会让旧宿主卸载、结果不再通知（上文「资金弹窗的挂载」一行的已知缺口）；之后在 SDK 调用之前停下（`isExchangeRequestStoppedBeforeSending`，按名识别，直接抛出或作为一层 `AbstractWalletError` 的 `cause`：`ExchangeRequestInvalidatedError`、`ExchangeActionDeadlineError`、`FundsActionLockUnavailableError`、`FundsActionLockTimeoutError`、`AgentRegistrationPreExecutionGuardTimeoutError`、`LegalActionNotAllowedError` 与应用守卫的 `FundsActionFeedbackCause`）、而这次尝试已不是当前尝试（预检尝试或上下文标识已变，例如等待锁内法律复核或资金锁期间路由刷新）的不提示、不关窗、草稿保留（2026-11-23 起不再只认作废、开始时限与 `FundsActionFeedbackCause`）；尝试仍是当前尝试时这些错误照旧提示并关窗，可能已经发出的结果照常通知；`WalletAccountMismatchError`、`MissingWalletError` 与带 `PRE_EXECUTION_GUARD_*` 消息的普通错误不在名单里，记为后续（[确认面](confirmation-surfaces.md)「发送、划转、充值、提现」一行）；发送与划转的结果按 `isCurrentSubmission` 通知并关窗，请求在途时同类窗又新开了一次也一样，新开窗里改过的金额随之丢失，与 `fc4377e6` 相同（2026-11-23 的开窗绑定已同日撤回；`funds-dialogs-session-resolving.test.tsx` 用真实全局弹窗 store 与测试宿主组件，不是真实 `GlobalModals`）；兑换在提交结束后只在提交时的那一次开窗仍是当前开窗时才关闭弹窗（`getGlobalModalOpening`）。兑换在点击时记下实时会话令牌（`useLiveSessionToken`，键含网络、`clientKey`、会话模式与钱包地址，不含账户模式；解析中没有令牌，这时点击不提交），执行守卫（`useExchange` 在请求开始前运行，即资产锁拿到之后）只在这个令牌仍是当前令牌时把会话当作有效；重连回到同一账户之后才拿到资产锁的旧兑换因此以 `ExchangeRequestInvalidatedError` 拦下，提示「钱包或网络已变化」（`identity-changed`），不调用交易所请求，任务记为失败，隐藏的弹窗照常关闭（2026-11-23）。还没发出的工作（发送的收款地址检查、存款与提款的预检）跟随实时会话，解析一开始就作废（`useLiveSessionToken`，存款弹窗另有按实时会话作废的副作用；提款一旦调用交易所请求就不再作废），不签名、不弹钱包、不提示，草稿保留，会话恢复后可重新提交；被中止的读取同时释放弹窗自己的忙碌状态（收款地址检查、存款数据重试），旧读取返回后不再写回弹窗状态（另含提款条件的 Retry）；已经发出的查询仍会完成并更新查询缓存，提款按钮读查询的 `isFetching` 时可能保持忙碌直到它返回。邮箱钱包的存款页签在解析期间同样显示忙碌占位，不显示可复制的地址或二维码。手动存款：存款弹窗把保留期内沿用的钱包地址与存款模式交给 `useDeposit`（外部钱包模式原先不传地址，由 `useDeposit` 读实时会话地址），所以保留期内整个 `useDeposit` 都按沿用值读取：选哪个钱包、钱包 provider、USDC 余额查询、执行状态键与执行锁键，以及 `deposit()` 用的地址；保留期外沿用值就是实时值，行为不变。已在进行的存款因此在保留期内仍读得到自己的执行状态，进行中的状态屏不消失。这没有放宽提交：解析中存款入口显示占位、提交要求实时会话令牌；邮箱模式的地址来自 Privy 用户，沿用值与实时值相同。测试：`deposit-modal-withdrawal-routing-guard.test.tsx` 的「holds the wallet of a pending external-wallet deposit while the session resolves」（解析中实时地址为空，交给 `useDeposit` 的仍是沿用的地址与 `wallet` 模式、状态屏仍在；去掉沿用时这一例失败）、「holds the mode of a pending email deposit while the session resolves」（邮箱测试桩里内嵌钱包地址在解析中不变，这一例只证明模式），以及「a pending external-wallet deposit while the signed-in session is without its wallet (E2)」一例（会话不在解析中时立即交出实时值，不再沿用地址）；这些用例里 `useDeposit` 是桩，只证明弹窗交给它的值，不证明真实 `useDeposit` 内部的读取。已经调用交易所请求、但没有到达交易所就停下的发送、划转按「没有发出」处理：不提示、不关窗、草稿保留。停下的原因是弹窗自己的发送前检查抛出的任何错误（`executionGuard` 与 `preExecutionGuard` 把抛出的错误记进弹窗的 `WeakSet` 再抛出，2026-11-23 起不再只认 `FundsActionFeedbackCause`：也包括发送最后一次收款地址复核报激活费变化、受限或不可用的 `PreTransferCheckExecutionError`，以及划转未分类的地区或模式检查错误），或 `isExchangeRequestNotSentError` 识别的错误：`ExchangeRequestInvalidatedError`（调度器在请求开始前作废、`useExchange` 拿不到注册租约，或邮箱主钱包签名器在交给传输之前发现 owner 已不是当前的）与开始时限到期的 `ExchangeActionDeadlineError`；条件是点击之后实时会话令牌（键同样含账户模式）、含账户模式的提交身份或提交序号已变，与 [确认面](confirmation-surfaces.md) 的「发送、划转、充值、提现」一行相同（守卫自己读到新账户模式时，安静还是提示取决于缓存更新与拒绝谁先到，两种结果都是没有发出；这期间真实的地区、余额或收款地址拦截要到重新提交时才看到）。提款遇到 `isExchangeRequestNotSentError` 识别的错误（作废，或开始时限到期的 `ExchangeActionDeadlineError`）、而实时会话令牌已不是这次尝试开始时记下的那一个时同样安静，不关窗、草稿保留（2026-11-21，开始时限到期 2026-11-23 加入）；没有经过重连、这次尝试也仍是当前尝试时，这两种停止照旧提示错误并关窗；可能已经发出的结果照常通知（`deposit-modal-withdrawal-routing-guard.test.tsx` 对两条路由各跑调度器作废与开始时限到期，各经过解析中、经过钱包离开再以同一账户回来、不经过重连三种情形，共六种组合；这些用例直接渲染存款弹窗，不经过 `GlobalModals` 的 key，应用里钱包离开目录（E2）本来就让弹窗重挂载）。保留期间新的提交按可用性布尔值禁用。发送、划转与提款弹窗自己的执行守卫（`executionGuard`）在保留期内比较的是沿用的身份，不是实时会话；实时性来自 hl-react：保留期内 `clientKey` 为 `disconnected`（由 `useWalletSession()` 的会话语义得出），`session-provider.tsx` 在 `clientKey` 变为 `disconnected` 的那次提交的布局副作用里作废旧身份的请求世代（`invalidateExchangeRequestIdentity`），调度器开始请求时世代已不是当前的就作废它，保留期内新调用的 `useExchange` 也拿不到注册租约。以上只是展示与结果归属。签名与发送边界的会话检查见 [ADR 0058](adr/0058-signer-session-guard.md)（分支 `claude/signer-session-guard`，未合入）：已经交给 SDK 的外部钱包请求在签名前核对会话世代，签名后只在换了身份时丢弃；手动存款的每个钱包请求都经过同一层受保护的 provider，许可签名后只等一次会话回到点击时的账户（30 秒上限，与这里的展示保留无关），之后会话再中断就在发送或交给 Privy 智能钱包之前静默停下；交给 Privy 之后它内部的准备、签名与 bundler 发送不再受检查（运营方 2026-11-23 记为已知限制）。作废之后才结束的发送或广播不写任何可见结果：存款执行状态回到空闲、不显示哈希、不刷新余额、不提示，结果由原 owner 的追踪在它重新成为当前账户时报告；从点击到拿到哈希，待确认屏不可关闭，同一标签页里切不了账户。展示上这意味着：等待期间存款状态屏照常显示（按沿用的地址与模式读取），会话回到同一账户后存款照常继续；换了身份或弹窗关闭时存款静默回到空闲，不显示错误；30 秒内没有回来而弹窗仍挂载时显示「Wallet not connected」，什么都没发出；等待之后的复查在会话再中断时失败的，尝试没有作废就照常显示那个错误；经过 `GlobalModals` 时会话以没有钱包的状态定下（E2）或解析超过 10 秒，弹窗按新身份重挂载，存款同样静默停下 | 定在另一个账户时弹窗已重挂载：兑换的旧结果仍记入它自己的通知任务，只在它那一次开窗仍是当前开窗时才关窗（同一账户下，旧兑换在途时以同一模式再打开 Swap，新开窗等旧兑换结束后才以清空的表单显示，旧兑换的执行守卫不受影响；以另一模式再打开时，新的 `mode` 立即传给隐藏的旧组件，目标币种、市场与预期订单随之重算，还在等资产锁的旧兑换可能被执行守卫拦下，与 `fc4377e6` 相同）；发送、划转、提款的旧结果不再通知，也不关闭新弹窗；迟到的发送结果只保存或清除该账户自己的重试草稿（草稿按网络与 owner `${env}:${clientKey}` 分别保存，不持久化，2026-11-23） |
| 存款弹窗的存款、提款与 Bridge 页签 | 忙碌占位（`data-slot="funds-session-resolving"` 内的 `aria-busy` 空白区域），不显示「Wallet not connected」与连接按钮；存款与提款金额等草稿在 `DepositModal` 自身，恢复后原样回填；Bridge 页签自己的输入（币种、金额、当前步骤）在被占位替换的 `BridgeTab` 里，解析期间会丢失，已开始的 Bridge 执行照旧转到后台（2026-11-21） | 「Wallet not connected」与连接按钮 |
| 发送、划转弹窗 | 不显示连接警告；输入保留；按钮按可用性布尔值禁用 | 显示「Connect your wallet to send funds.」/「Connect your wallet to transfer funds.」。Agent-only 会话只看到需在桌面连接主钱包的一句原因（地区确认受限时只看到地区说明），不再同时看到连接警告 |
| 逐仓保证金弹窗 | 不显示「Trading data changed…」；输入保留；提交禁用 | 账户或网络与开窗时不同（含换了账户、退出登录、切到 Agent-only）时照常显示 |
| 仓位 TP/SL 弹窗 | 已显示的表单保持挂载并禁用，草稿保留；会话恢复后账户数据重新加载期间同样保持，数据回来后恢复可提交。期间仓位或已有 TP/SL 变了，数据回来后表单显示「Trading data changed…」并保持禁用，需要关闭重开。打开时还没有表单则显示忙碌占位 | 「Connect wallet to view positions」「Trading data changed…」「No active positions.」照常替换表单 |
| 桌面账户页签（持仓、当前委托、余额、成交历史、资金费、委托历史、TWAP 及其历史与成交、充值提现） | 忙碌占位（`aria-busy`）代替连接那一句；页签不卸载，筛选与工具栏保留；不发请求 | 各页签的「Connect your wallet to view …」。十个页签的这句话都经共用的 `ConnectPlaceholder` 渲染，不各自判断。余额页签对邮箱会话显示的「Open Deposit to prepare your email wallet.」不受影响 |
| 下单按钮（桌面与手机） | 保留动作名称（桌面「Place Buy Order」、手机「Buy」）并禁用，点击不提交、不打开连接窗口。两端共用 `getOrderActionStage` 的同一个分支（[下单表单对齐](order-entry-surface-parity.md)） | 「Connect Wallet」，可点击 |
| 手机账户页（地区检查未解析） | 已连接账户的 Deposit、Withdraw、Perps / Spot 与 Bridge 保留并禁用，不显示地区文字 | 地区确认受限时整块隐藏并显示限制说明，与以前相同 |

不算解析中的一种情形：邮箱会话的钱包还在静默创建时目录里没有钱包，这些入口仍按未连接展示（协议门控另有自己的等待，见下一节）。10 秒上限与头部菜单 30 秒后出现的「重新加载页面」互不影响：10 秒到 30 秒之间，这些入口按未连接展示，头部仍是连接中的指示（[交易引导规范](trading-onboarding.md)）。

## 邮箱钱包的静默创建

邮箱会话登录后，钱包由根部 `EmailEmbeddedWalletProvider` 在后台创建（[ADR 0033](adr/0033-silent-email-wallet-creation.md)）。创建和激活期间不显示任何文字、图标或占位：协议门控保持 `checking`，页面可以浏览，交易和资金弹窗照常挂起。

创建失败或 20 秒内没有完成，属于用户注册这个动作的结果，不是被动数据提示：

- 带协议门控的页面由协议弹窗的「钱包尚未就绪」状态呈现，提供 Retry 和「断开连接」。文案不显示原始错误，也不断言创建一定失败。
- 没有协议门控的页面不弹提示。恢复入口是账户菜单的「重新连接钱包」（重试创建）和「断开连接」。
- 刷新后恢复的缺钱包会话沿用同一规则：自动补建一次，失败后不再自动重试。

钱包目录就绪后，没有钱包的邮箱会话必须能登出。目录还没就绪时，重连和安全退出按上一节保持禁用，只有 30 秒后的「重新加载页面」。这些入口不扩展为行情、余额或订单的被动加载提示。

## 品牌状态动效

品牌状态动效（[ADR 0029](adr/0029-brand-status-motion.md)）只用于用户发起的动作的状态与结果（通知、资金与签名状态页、握手按钮、复制反馈），不是新的被动提示类别：被动数据加载、懒加载占位、刷新按钮和图表重建继续使用原有的中性转圈或空白占位，`status-motion-surface-contract.test.ts` 登记这些保留位置及理由。

## 账户模式与资金限制

账户标题和模式选项遵循 [账户概要规范](account-overview.md)，桌面与移动复用同一套标签。未知模式使用中性“账户概要”；被动加载期间，账户类型表单保持“确认”名称并禁用提交，不展示连接故障结论。实际用户提交失败仍保留反馈。

资金能力必须区分 `supported`、`unresolved` 与 `unsupported`，不能仅凭 `accountModeReady` 布尔决定限制文案。

- `disabled`、`unifiedAccount`、`portfolioMargin` 属于当前终端支持的模式；可操作性仍由钱包、地区、余额新鲜度和具体动作规则共同决定。
- 明确解析出的 `default`、`dexAbstraction` 使用 `account-mode-unsupported`，保留“移动资金前请选择支持的账户模式”的限制说明。`default` 不能当成 Standard / `disabled`，也不能当成尚未收到数据。
- `default` 是新账号的协议初始状态，页面级宿主会在入金后把它自动设为统一账户（[ADR 0041](adr/0041-automatic-unified-account-for-new-accounts.md)）。数值与可用性不变（权益与余额仍为 0，资金动作的 `available` 仍为假，下单可用性永远不是 success），只有呈现跟随宿主发布的状态：
  - `awaiting-funds`（资金快照完整、当前且确认为空）：看起来与普通空账号相同。下单按钮为「Deposit」，但下单可用性仍为 error，表单与提交照旧阻断；余额页签为“No balances found. Deposit funds to start trading.”及存款入口；提款/划转仍禁用，原因改为“New accounts are set to Unified account automatically after the first deposit.”；交易面板的账户模式显示统一账户，账户类型弹窗预选统一账户、选项与确认禁用并显示同一句说明。这里的空账号结论来自完整快照，不是来自模式本身。
  - `pending`（已入金，自动设置仍可能发生，含宿主尚未发布状态的首帧）：被动加载。下单可用性为 loading，桌面余额页签为忙碌占位，移动余额页签为忙碌的待定状态，不显示“请选择账户模式”。
  - `manual`（Agent-only 会话、builder 地址、已有订单历史或读取失败、法律状态不允许、外部钱包尚未建立 Agent、尝试用尽或被交易所终局拒绝）：保留改动前的呈现与手动选择。桌面余额页签显示“请选择支持的账户模式”，手机余额页签保持静默的待定状态；弹窗预选统一账户，钱包会话可直接确认，Agent-only 会话仍禁用并显示需到桌面的原因。缓存摘要显示有余额而当前快照显示为空时也归入这一类，不会停在加载。
  - `dexAbstraction` 不受影响：始终是手动选择，不预选。
- 缺少模式、未识别值以及 HTTP / WebSocket 模式冲突使用 `account-mode-unresolved`，保持静默并禁用动作。当前归一化的 `unknown` 也包括来源冲突，不能把它全部当成已确认的不支持模式。
- 两类禁用原因不改变 `available`、资金分类或提交前账户模式与身份复核。恢复和切换模式不得卸载已打开的弹窗或丢失输入草稿。
- 桌面与移动持仓均安静展示读取状态。读取错误/过期优先于加载占位，且不标记为正在加载；订阅已 active 但首份快照未到达的保护必须保留，错误、过期和未知快照不得显示确认空持仓。

依据：2026-09-09 核对 [Hyperliquid 账户模式文档](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes)，Standard / Manual、统一账户与组合保证金为当前模式，DEX abstraction 已停用；[官方 Python SDK 示例](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/examples/user_abstraction.py) 将 `default` 明确作为 Agent 设置模式前的状态。项目锁定的 [SDK 0.33.3 userAbstraction](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/userAbstraction.ts) 返回类型包含 `default`；该方法只校验请求并直接返回传输结果，因此终端仍须防御未识别响应。以上区分仅修正展示与原因分类，不新增模式支持。2026-10-12 的 [ADR 0041](adr/0041-automatic-unified-account-for-new-accounts.md) 同样不新增对 `default` 的支持：它让新账号离开 `default`，并规定离开之前各处显示什么。

## 数据与操作边界

- 移动持仓工具栏保留独立的「全部平仓」入口与单一展开/收起切换。未连接、首快照未到达、错误、过期、市场映射不全或同账户存在平仓会话时禁用入口，按钮仍显示静态动作名称；原因仅作辅助技术描述，不显示被动错误。确认空仓位保持原有空态。筛选为空不等于账户空仓位：入口按全账户可用性判断，确认面说明包含筛选隐藏的仓位并列出实际目标，见[全部平仓说明](mobile-close-all-plan.md)。
- 数据模型继续保留 loading、error、stale、unavailable 等状态，供重试、恢复与安全检查使用。删除的是不合理的展示代码，不是数据校验。
- 订阅状态 `active` 与首份快照存在必须分别检查。重新连接期间还必须检查新鲜度；账户、网络或市场身份不匹配的数据不能作为当前数据。
- 操作是否可执行由 `available`、`canSubmit` 等显式布尔值决定，不得使用 `!!unavailableReason` 作为权限判断。
- 不得为了隐藏提示而跳过 Agent、主钱包匹配、账户模式、合法性、地区、资金快照、订单簿新鲜度或金额校验。
- 资金列表只有在当前快照完整成功时才允许显示空余额及充值引导；历史缓存为空时不得声称“没有记录”。
- 静态历史记录可以保留已加载内容；其刷新失败不应新增横条或暴露 `error.message`。
- 刷新或重连时保持已打开的操作弹窗及输入草稿；禁用提交，不得因为列表占位切换而卸载弹窗。
- 充值弹窗的余额、费用与地址准备状态遵循同样规则：缺少数据时使用占位或地址骨架；读取失败可保留中性的“重试”，不得显示原始错误。重试只读且必须隔离旧弹窗上下文；用户主动重试失败可以显示该次请求反馈。
- 数据提示与用户操作反馈分离。撤单、改单、平仓、划转、兑换、充值提现提交后的错误反馈必须保留。

## 受约束的入口

- 桌面最近成交、账户概要、余额、持仓、当前委托、TWAP 与交易/委托/资金费用历史使用相同的静默数据恢复规则。最近成交与当前委托只显示当前有效快照；历史列表可保留已加载记录，但失效空快照不得得出“没有记录”的结论。TWAP 历史保留中性的主动重试和分页控件，不再插入被动警告条。充值提现历史保留主动重试和已确认显示上限说明。详见 [加载体验审查](terminal-loading-audit.md)。
- 移动端账户概览、余额、持仓、当前委托、TWAP 当前/历史/成交列表。
- 成交历史、委托历史、资金费用、充值提现记录。
- 下单面板的可用余额、主操作按钮与地区检查状态。
- 移动订单簿、最近成交、资产组合图表。
- 资金费率历史图（桌面图表区与手机行情区的 Funding 页签，桌面同样适用）：首次加载、重试和惰性块加载为空白绘图区加 `aria-busy` 与读屏专用加载说明；首次失败只给中性「重试」，不显示原因；已加载的非空快照刷新失败时静默保留；离线保持空白；只有分页未截断、当前键、最近一次请求成功、未超过 5 分钟新鲜期（取本地单调时钟与墙钟中较大的年龄，墙钟退到接收时间之前即视为过期，系统时间回拨不会延长）、没有刷新在进行或暂停且在线时的空快照显示「暂无资金费率历史」；视图可见期间空快照一过期就自动刷新（非空快照不轮询），刷新失败只给中性「重试」，刷新中、页面在后台尚未刷新、暂停或离线时保持空白。它使用上表已有的类别，不新增被动提示类别；详见[资金费率历史](market-funding-history.md)。
- 移动端使用的兑换、发送、划转、充值提现、仓位设置和平仓弹窗。
- API 钱包页（`/api-wallet`，桌面与手机，2026-11-21）：授权列表来自 `extraAgents`，按 `lib/passive-query-state.ts` 的四态展示（`deriveApiWalletListState` 直接调用 `getPassiveQueryState`）。首次读取中为空白加 `aria-busy` 与读屏说明，没有数据也没有失败的读取都算在内，包括离线时暂停的首读（`pending` / `paused`），不给「Retry」；已连接但还没有解析出账户地址（查询未启用）时同样如此（2026-11-23）。没有可用数据且读取失败或响应格式不符时只给中性「Retry」，不显示错误标题、说明、警告图标或 `role="alert"`；本页收到过列表后刷新失败（`useDataReceivedSinceMount`）为 `retained`，列表静默保留。刷新返回格式不符的响应时，查询的新数据会替换旧快照，所以控制器另外记下本页收到过的最近一次有效快照，按 `${env}:${accountAddress}` 绑定，网络或账户变化时清掉，并展示它为 `retained`；挂载之前缓存的列表不会被这样保留；网络拒绝时查询自己保留旧数据，照旧按 `useDataReceivedSinceMount` 判断是否为 `retained`（2026-11-23）。`retained` 期间生成、授权与删除仍由可用性布尔值禁用（`isApiWalletPageOperable`），列表下方给中性「Retry」，保留的空列表不下「没有 API 钱包」的结论，只给「Retry」。当前钱包不是该账户主钱包（`nonMaster`，含 Agent-only 会话）时，列表按同样的四态展示（`deriveApiWalletListState`，与页面可操作性分开），读取中或失败时不显示「No API wallets authorized」，删除照旧禁用。钱包会话解析中这一页还没有接入 `isResolving`：控制器把它当作未连接，列表显示「Connect to view authorized API wallets」，与质押、推荐、金库页相同（2026-11-21 核实的 F5d，尚未处理，见任务记录后续）。表头只在显示列表时写「N authorized」，后台刷新只设 `aria-busy`，不显示「Refreshing…」「Loading…」「Unavailable」或转圈。授权与删除的执行守卫、身份校验和失败关闭不变。
- 资金费率对比页（`/fundingComparison`，桌面与手机）：首份快照、市场目录或离线等待期间只显示数据骨架与 `aria-busy`；首份快照失败、格式不符或市场目录失败时，数据区只保留中性的「重试」按钮，不显示错误文字或警告图标；已有非空快照的刷新失败只在快照自本地接收起不到 120 秒（两个刷新周期，以本地单调时钟计龄，本地墙钟年龄只会让它更早失效，系统时间回拨不会延长）时保留原数据且不提示，满 120 秒或查询因离线暂停时数据区换成骨架或中性「重试」，不显示旧数值；只有解析成功、在该时限内、目录就绪且最近一次请求成功的空快照才显示「暂无资金费率对比数据」；搜索无匹配单独显示为搜索结果。缺少换算间隔或资产上下文的数值使用 `--` 占位；Hyperliquid OI 另外只在持仓量所在的资产上下文来自当前实时订阅（`useMarketsInfo().perpContextsLive`，未送达、过期、失败或恢复中都不算；本地不保存行情快照，见 [ADR 0047](adr/0047-no-local-market-stats-snapshot.md)）且该市场标记价格实时（与行情头同一规则）时显示，否则为 `--` 并在两个排序方向都排在最后，资金费率照常显示。详见 [资金费率对比页](funding-comparison.md)。
- 质押（`/staking`）、推荐（`/referrals`）、金库列表（`/vaults`）与金库详情（`/vaults/<地址>`），桌面与手机相同（2026-11-01，审查项 E5）。每个数据来源（质押的验证人与六个账户查询、推荐快照、金库公开列表、账户金库份额与领先金库、金库详情）按 `lib/passive-query-state.ts` 分为四态：`loading`（还没有可用数据、没有失败）为空白或既有骨架加 `aria-busy` 与读屏说明；`failed`（没有可用数据且最近一次请求失败或响应格式不符）时数据区只有中性「Retry」，没有错误文字、警告图标或 `role="alert"`，金库详情另保留「Back to Vaults」导航；`ready`（最近一次请求成功，可以正在后台刷新）照常显示数据、空列表结论与操作，金库存款、提款按钮不再因后台刷新禁用；`retained` 按上表静默保留本页收到过的数据，质押页在操作按钮旁、推荐页在内容顶部、金库详情在存款与提款按钮下方提供中性「Retry」，金库列表保留已显示的行，刷新入口仍是原有的「Refresh」；筛选或搜索结果为空时，只有公开列表为 `ready`，且账户筛选（Deposited、Leading）的账户份额与领先金库也为 `ready`，才显示「No Vaults in this filter」或搜索的「No matching Vaults」，否则只给中性「Retry」。推荐的领取记录是历史列表：加载时为空白加 `aria-busy` 与读屏说明，读取失败只给中性「Retry」，已加载的记录在刷新失败后保留，「No recent reward claims.」只在最近一次快照成功且没有刷新在进行（`useAccountLedger().canConfirmEmpty`）时出现。（2026-11-19 收紧，`f13de42f`：`canConfirmEmpty` 现在要求设备在线、最近一次 REST 快照成功且查询空闲（`fetchStatus` 为 `idle`，没有请求在进行或因离线暂停）、账本订阅为 `active` 且未过期、订阅的首帧已经到达；任一不满足都不下空结论。Earn 的操作历史「No earn actions yet」自 `3877b286` 起也读这个值，不再只看 `status === "ready"`。）不显示被动刷新文字或转圈（原「Refreshing staking data…」「Refreshing referral data…」「Refreshing Vault data. Actions are temporarily unavailable.」与领取记录的「Loading recent reward claims…」可见文字）。操作只由可用性布尔值禁用：质押的四个操作要求账户快照为 `ready`，委托与解除委托另要求验证人列表为 `ready`；推荐的领取、创建与使用邀请码要求推荐快照为 `ready`；金库存款要求详情为 `ready`，提款另要求账户份额为 `ready`（`deriveVaultActionsAvailability`）；详情或份额保留期间，已打开的存款或提款弹窗停在输入步骤（`canReview` 为假），已在复核步骤的确认按钮与确认处理都暂停（`canConfirm` 为假，`confirm()` 直接返回），刷新成功后恢复，弹窗本身与输入不卸载；弹窗在输入与复核步骤另给一个中性「Retry」（与页面的 Retry 是同一个重新读取，只在 `needsRetry` 时出现：详情或份额读取失败、响应格式不符，或刷新失败后保留），因为阻断式弹窗盖住了页面上的 Retry，确认前的预检读取失败后也要能在弹窗里恢复，而不必关掉弹窗丢掉金额。只有已确认的限制显示说明（地区受限、Agent-only 会话、金库已关闭、不接受存款、未连接 owner、提款锁定、没有可提金额、「No unclaimed rewards are currently available.」只在推荐快照为 `ready` 时）；地区检查中或无法确认、详情或份额加载中或读取失败、刷新中这类被动原因不显示文字。用户发起的提交、失败与待确认结果仍按原有弹窗与通知反馈，执行路径各自的新鲜数据预检（质押 `loadStakingPreflightSnapshot`、推荐提交前 `refetchReferral`、金库 `verifyVaultActionPreflight`）不变。与官方终端的差异（2026-10-31 生产包）：官方质押页读取失败时弹出错误通知（`provideDelegations-CJcxKbEv.js`：`An error occurred while fetching validators`），推荐页读取失败时整页显示 `Unexpected error loading referral data`（`Referrals-DzsUY3Ry.js`），未知余额显示 0；本终端按本规范保持静默、只给中性重试并显示 `--`。官方金库详情刷新失败时保留上一份详情、首次失败时整页空白（`VaultDetailsPage-NS0z_PHx.js` 只在响应含 `response` 时更新），金库列表失败时列表为空（`VaultMainPage-Biimvm9f.js`）；本终端同样保留已收到的数据，首次失败时给中性重试。

- 手机改单抽屉（`mobile-orders-tab.tsx`，2026-11-17）：红色提示、输入框红框与 `aria-invalid` 取自同一份可展示结果（`getDisplayableOpenOrderModifyBlock`），与下单面板的做法相同。这份结果不含四种情形：草稿没有改动；当前委托快照不是当前的（`snapshot-not-ready`）；标记价不是实时的（`mark-price-unavailable`）；市场目录加载中或失败时的 `market-binding-changed`。这些情形下抽屉里没有提示、红框与 `aria-invalid`，输入保留，确认按钮仍按原始结果禁用，回车也不提交。目录已加载而市场绑定与开窗时不同（或目录里已没有这个市场）时照常显示「Market metadata changed. Refresh and try again.」。卡片上的「Modify Order」按同一条件处理：市场目录加载中或失败时保留名称并禁用，点按不打开抽屉，也不给这句答复；目录已加载而绑定不了这个市场时，点按才给这句答复。用户确认之后被执行守卫拒绝的，原因的原文仍作为这次操作的反馈显示，包括上面这几种。
- 手机委托历史与资金费页签（2026-11-17）：筛选无匹配的句子（「No orders match these filters.」「No funding payments match this direction.」）只在快照当前时显示，即 `status` 为 `ready`、没有错误、未离线、未过期。不满足时筛选行保留并可用，列表区是空白忙碌区域（`aria-busy`），不下结论；保留的记录在筛选能匹配时照常显示。读屏专用的表头数值（委托条数、资金费合计）按同一条件给数值，否则是稳定占位符 `-`，不由保留的旧记录播报「0 orders」或 `$0.00`。2026-11-19 起筛选开启时补拉历史（委托为 `historicalOrders` 快照，资金费为资金费历史页的 30 天 `userFunding` 窗口，见 [交易工具栏](trading-toolbar-redesign.md) 筛选一节），桌面委托历史页签同样处理。无匹配的判定与手机成交页签共用 `getFilteredHistoryEmptyPresentation()`：补拉加载中或重新请求中是空白忙碌区域；补拉失败、或实时记录已衔接不上补拉快照时只给中性「Retry」，不显示原因；离线是空白区域；只有补拉成功且当前、实时记录当前、两者衔接时才显示无匹配句子，委托快照达到 2,000 条上限时句子下方加既有说明「Up to 2,000 most recent ordinary orders」（数字按数字格式设置显示）。筛选开启时读屏表头数值（委托条数、资金费合计）也要等到可以下结论时才给数值，否则是 `-`（桌面为空）。没有新增可翻译文案。
- 手机 TWAP 历史与成交列表（2026-11-17）：`useTwapHistory` 与 `useTwapSliceFills` 提供只用于展示的 `canConfirmEmpty`。它要求设备在线（`useOnlineStatus`）、REST 快照是最近一次请求的成功结果、没有请求在进行或因离线暂停、订阅为 `active` 且未过期。在线这一条不能省：这两个订阅是事件驱动的，不在 hl-react 的 `FRESH_SNAPSHOT_METHODS` 里，断线不会把它们标为过期，而已经结束的请求在离线后仍是 `idle`。它没有读订阅存储的传输状态（`transportStatus`），因为 hl-react 没有把它单独公开；系统仍报告在线、只是套接字断开的那几秒里，空结论还可能显示。「No TWAP history found.」与「No TWAP fills found.」只在它成立时显示，否则是空白占位；已加载的记录不受影响，成交列表的导出入口照常保留。桌面的两张 TWAP 表没有随这次改动。2026-11-19 起（`0396f11f`）桌面的 TWAP 历史与成交两张表同样只在 `canConfirmEmpty` 成立时显示空结论，否则是空白占位（原先只在实时源降级时才不下结论）。同一改动里，桌面委托历史页签的「No orders match these filters.」与表头条数只在快照就绪，且有匹配行或没有错误、离线、过期时显示，否则是空白占位、表头不给条数；桌面订单簿某一侧的「No orders」只在当前有效快照的这一侧本身为空时显示，否则是占位行。
- 手机订单簿分栏视图（2026-11-17）：某一侧为空时，只有实时帧才显示「No orders」。过渡期间（展示的是缓存快照，实时帧还没到）该侧改为占位行，读屏只读出「Waiting for order book...」。紧凑视图一直用占位行，没有空侧文字。
- 2026-11-20（Gemini 终审第 1 轮 P2-4、P3-6）：桌面 Funding 页签工具栏的「Funding shown」合计与正文同一条件：快照就绪，且有记录或没有错误、离线、过期；空快照不当前时正文是空白占位，工具栏也不显示合计（原先仍显示 `$0.00`）。手机成交历史的读屏条数与委托、资金费页签同一规则：实时快照当前，且筛选关闭或筛选已能下结论时才给条数，否则是占位符 `-`，补拉加载、失败或实时快照过期时不再播报「0 trades」。三个手机历史页签的筛选状态随网络切换重置（内部组件以网络加 owner 为键，与桌面委托历史页签相同）。回归：`desktop-history-exports.test.tsx`、`mobile-fill-filter-backfill.test.tsx`、`mobile-order-funding-filter-backfill.test.tsx`。
- 成交、委托、资金费三个历史页（`/tradeHistory/<地址>`、`/historicalOrders/<地址>`、`/fundingHistory/<地址>`，2026-11-17）：筛选无匹配的标题与读屏句子只在快照就绪、最近一次请求没有失败、在线且没有刷新在进行时显示。不满足时筛选行保留，其下换成 `HistoryPageUnavailable`：离线或刷新中是空白忙碌区域，刷新失败是中性「Retry」。这与页面没有任何记录时的处理相同，读屏说明也用同一组句子。
- 市价与限价平仓弹窗的提示框（2026-11-17）只有一种形态：`role="alert"`，用于已确认的仓位变化与输入校验。仓位快照加载中、读取失败或过期时没有提示框，也没有转圈；滑杆暂停，确认按钮禁用。原先的加载变体（`role="status"` 加转圈）不可达，已删除。

## 验证与防回归

1. 首次进入：包括 `active` 但 `data === undefined`，不得出现错误文字、空账户结论或错误的充值引导。
2. 切换账户/市场、重连及数据过期：不得闪现旧账户空状态，不得使过期数据可操作。
3. 错误与恢复：被动读取失败保持安静，恢复后显示真实数值和记录。
4. 当前成功的空快照：仍可显示准确的空状态。
5. 操作安全：缺数据时点击禁用动作不能提交请求；真实用户操作失败仍有反馈。
6. 布局：检查普通手机、窄屏以及共享弹窗的桌面布局，不得残留空警告条或移动操作区域。
7. 自动检查：运行相关行为测试和移动数据提示契约检查，再运行 Biome 与 TypeScript 检查。
8. 模式限制：覆盖未解析、来源冲突、明确不支持、支持模式、地区限制和恢复；在手机账户页及共享划转/提款入口验证提示、禁用状态与请求未发送，不能只检查源码或构造好的 reason。

新增被动数据提示必须先明确修改本规范并取得产品需求依据；不得仅为了调试或展示内部状态而添加用户可见提示。市价平仓的「仓位数量与开窗时不同」提示的产品依据与取舍见 [ADR 0017](adr/0017-market-close-confirmed-size-ceiling.md)；它由开窗快照与当前有效仓位纯推导，数量回到开窗值时提示消失，不记录「期间曾变化」。仓位 TP/SL 大额滑点提示的产品依据是与官方终端对齐：官方持仓 TP/SL 弹窗读取同一接口，在仓位价值超过分档上限时显示滑点警告，读取失败时不显示任何内容；条件、与协议规格的差异和取舍见 [TP/SL 大额滑点提示](position-tpsl-slippage-warning.md)。它由成功的分档表与弹窗正在使用的实时仓位（价值与当前杠杆）纯推导，加载、失败和格式异常都保持静默；例外只在展示层面，共两处：数量滑杆手势期间保持手势开始时的有无，手势结束后再按推导结果显示，以免滑杆行在指针下移动（[滑杆手势](slider-interactions.md)）；弹窗外壳关闭（会话结束后的退出动画，或点击确认后外壳关闭、提交仍在后台进行）时保持关闭那一刻的有无，退出期间才到达的成功结果或刷新失败都不再改变它。

手机成交历史筛选的补拉对齐官方终端：官方 2026-10-31 生产包（`config-BhZylSmU.js`）的筛选行在任一筛选开启时调用 `ensureCompleteHistory`，请求完整的 `userFills`，与 WebSocket 数据按 `` `${time}-${coin}-${tid}` `` 去重合并（实时数据优先），列表同样只截取 30 条。官方在补拉加载中和失败时也直接显示「No results match your filters.」；本终端按上表更严：无匹配结论要求补拉成功且当前，失败只给中性「Retry」，达到 2,000 条上限时写明检查范围。手机委托历史与资金费的筛选仍只在各自最近 30 条里查找（官方同样分别补拉 `historicalOrders` 与 `userFunding`），这一差距尚未处理。补拉快照为空（当时账户没有成交）时不与已有实时成交的订阅衔接，代价是：账户在快照之后才有成交、筛选又没有匹配时，先给「Retry」，重试取到包含这些成交的快照后再下结论。另有一点尚未处理：最近的实时成交里没有普通成交时，页签显示「No fills found.」且不显示筛选行，无法开启筛选去找更早的成交（官方始终显示筛选）。

未平仓量上限说明属于「已确认的市场限制」，不是被动数据提示。产品依据是官方终端对等（2026-09-27 对 `app.hyperliquid.xyz` 生产包的静态阅读：提交限价类订单时若当前市场在 `perpsAtOpenInterestCap` 集合中则拦截并提示同一句话）。它只在当前、成功、同一账户的快照明确列出该市场时出现；未知状态放行且不显示任何文字，交易所仍是最终裁决，取舍见 [ADR 0023](adr/0023-open-interest-cap-advisory-check.md)。HIP-3 资产信息弹窗里的「未平仓量上限」一行是用户打开弹窗后的只读元数据，加载、失败、空值或畸形响应时整行不出现，也不显示加载或错误文字。

## 回归入口

`apps/terminal/src/lib/tests/mobile-data-presentation-contract.test.ts` 有两层检查。

第一层是登记表（2026-11-17，全局审查 P2-17）。旧的检查只有一份已移除文案的清单，新写的被动警告不在清单里就能通过：往手机持仓页签加一条 `role="alert"`、警告色的「Positions data is delayed. Reconnecting...」，19 项测试全部通过。现在 `harness/presentation-markers.ts` 用 TypeScript 语法树读出每个受检文件里可能把某种状态呈现成警告、失败或状态的全部内容，与 `mobile-data-presentation-registry.ts` 逐文件精确比对，多一处、少一处都失败：

- **受检文件**：`components/trade/mobile` 下全部 `.ts` 与 `.tsx`（该目录出现子目录时测试失败，要求先扩大覆盖），加上登记表里点名的 12 个共享入口（发送、划转、逐仓保证金、市价与限价平仓、仓位 TP/SL、现货兑换弹窗，桌面充值提现页签，三个历史页及其共用的不可用占位）。
- **读出的内容**：
  - 播报：`role` 为 alert、status、log、marquee、timer、alertdialog；`aria-live`、`aria-invalid`、`aria-errormessage`；`<output>`；`toast()` 与 `toast.<方法>()` 调用（`dismiss` 除外）。条件表达式的分支与对象字面量展开里的属性也算，比较表达式里的字面量不算。
  - 图标：警告类图标（名称含 Warning、XCircle、Prohibit、Info、Question、Hourglass、Clock、WifiSlash 等）、`Alert` 组件、`STATUS_GLYPH_*`（`SUCCESS` 除外）与 `BRAND_MOTION_*` 的引用。作为元素或作为值都算，导入时改了名也算；导入语句与闭合标签不算。
  - 颜色：error、warning、danger、info 四族的类名，去掉变体前缀与 `!`，保留透明度后缀；黄、琥珀、橙、红的调色板类名；这几族的 CSS 变量（写在任意值类名或 `style` 里）；在组件上选择这类色调的属性，如 `intent="error"`、`tone="attention"`。
  - 带状态措辞的用户可见文字：
    - JSX 文本按元素合并，中间的表达式记作 `{…}`；Lingui 的 `t`、`msg` 与 `message` 属性；其它含空白的字符串字面量。
    - 单个词只在这些位置算：JSX 表达式直接渲染的字面量及其条件分支、`aria-label`、`title`、`placeholder`、`label`、`description`、`one`、`other` 等文字属性、`t("…")` 与 `i18n._("…")` 的首个参数。
    - 从 `@/…` 模块导入的文案对象：`t(ORDERBOOK_LABELS.waiting)` 这样的读取会去那个模块里取出原文。
    - 措辞表包括 load、refresh、retry、stale、cached、updating、fetch、delay、lag、pause、interrupt、unavailable、fail、error、went wrong、could not、unable、cannot、connect、offline、wait、check、verify、pending、sync、unknown、expire、timed out、no …、not found、empty、N/A 等及其变形，以及 ⚠ 这类警告符号。
  - 原始错误文字：`.message`、`.shortMessage`、`.details` 的读取，解构出的 `message`，以及对名称像错误的变量调用 `String()`、`toString()` 或放进模板字符串。
  - 被动原因字段：`unavailableReason` 与 `unavailableLabel` 的读取。
- **登记内容**：每个文件按形式登记次数，状态措辞按原文逐条登记并标注类别，每个类别有一句理由，说明它由什么驱动。类别是封闭的：用户操作反馈、输入校验、已确认的限制、已确认的对象变化、已确认的空结论、数值含义的颜色或措辞、破坏性操作的固定样式、风险说明、全局离线横幅、读屏专用的忙碌说明、读屏专用的数值播报、读屏专用的禁用原因、中性重试、稳定占位、与读取状态无关的固定文案，以及 `pending`。没有内容需要登记的文件不得出现在登记表里。
- **`pending`**：已核实但尚未修复或尚待决定的被动提示，必须写明是什么，并列在下文「待处理」；「待处理」里点名的受检文件也必须有对应的 `pending` 登记。修复时连同登记一起删除。契约按表头找到「待处理」的表格，再要求表格的行与 `pending` 登记逐文件相等；两边可以同时为空，所以最后一项修完后要保留这一节和表头，只删行。
- **新增一处时**：先对照本规范判断它属于哪一类。被动数据状态（加载、过期、不可用、失败、重连）驱动的文字、颜色、图标或播报不得登记，要改成本规范允许的形式。

这层检查读的是源码，不是渲染结果。下面这些它看不到，仍要靠行为测试与审查：

- 文字或颜色在受检文件之外生成：
  - 共享子组件，如 `TradingActionButton`、`TpSlSection`；
  - hook 与 domain 函数返回的文案，如 `useFundsActionAvailability` 的 `unavailableReason`，受检文件必须经 `getFundsAvailabilityNotice` 过滤后再显示；
  - 调用方经 props 传入的内容，如改单抽屉的错误文字由 `mobile-orders-tab.tsx` 决定。
- 由函数返回的颜色（`getValueColorClass`、`getMarketCloseValueColorClass`）、拼接或查表得到的类名、从别的模块导入的类名常量。
- 措辞表之外、又不带任何播报、警告色或图标的新说法。
- 拼接出来的句子、对象表里按状态取用的单个词、Lingui 的 `select()` 与 `plural()` 选项里的单个词。
- 经变量或非字面量对象展开传入的 `role`、`aria-live` 与色调属性。
- 登记的是次数与原文，不是条件：把一处已登记的操作反馈改成由读取状态驱动而文字不变，次数不变，检查不会失败。
- 只有理由、没有对应计数的 `pending` 登记：修复不会改变任何次数，登记与「待处理」里的那一行要随修复手工删除。
- 颜色与措辞的类别是否属实由审查保证，测试只要求有理由。

2026-11-17 的对抗审查按文字、样式、间接三个角度找到 34 种绕过写法，其中约三分之二已经补进扫描器，其余就是上面这份清单。源码扫描不追求穷尽，穷尽也做不到；它的作用是让常见写法的新提示必须经过一次登记与审查。

第二层是原有的检查：已移除的移动文案、共享弹窗被动警告和规范入口，并扫描质押、推荐与金库目录：不得出现已移除的被动刷新、读取失败与未知数值文案（含 `0 HYPE` 占位）；`role="alert"` 与警告图标只留在逐个登记理由与次数的已确认状态和操作反馈里（金库未找到、金库操作弹窗的失败与未知结果、操作弹窗与金库详情的风险说明、分类不可用的警告），新增一处即失败；金库操作按钮不得由说明文字是否存在决定禁用；`user-positions-readiness.test.tsx` 验证订阅确认与首份数据的区别。余额、委托、TWAP、历史和仓位弹窗的组件测试同时验证静默展示、恢复和操作保护。

质押、推荐与金库页：`passive-query-state.test.ts` 覆盖四态与合并规则；`staking-passive-data.test.tsx`、`referral-passive-data.test.tsx` 与 `vault-passive-data.test.tsx` 用真实的控制器、视图与 QueryClient（只替换传输层）验证首次失败只有中性重试、刷新失败保留本页收到的数据并禁用依赖它的操作、进入页面前缓存的数据在失败后不保留、后台刷新时没有文字且操作可用、`--` 占位，以及失败或保留的快照不得出「没有记录」结论；`use-referrals.test.tsx`、`vaults-domain.test.ts` 与 `use-vault-action-controller.test.tsx` 分别钉住推荐快照的当前性、`deriveVaultActionsAvailability` 的 `detailCurrent` 与被动原因分类、保留详情时暂停复核步骤、保留详情或份额未验证时暂停已在复核步骤的确认；`vault-passive-data.test.tsx` 另钉住公开列表或账户份额保留时不下筛选与搜索的空结论，以及详情、份额与公开列表在进入页面前缓存、页面自己的请求失败时不被保留；`vault-action-modal.test.tsx` 与 `vault-detail-page-outcomes.test.tsx` 钉住弹窗的确认按钮跟随 `canConfirm`、数据 Retry 只在页面需要重试时出现；`referral-ui-contract.test.ts` 与 `status-motion-surface-contract.test.ts` 登记已移除的刷新文字与转圈。

`mobile-fill-filter-backfill.test.tsx` 用真实的手机成交页签、`useUserFills`、`useTradeHistory` 与 QueryClient 验证：只在筛选开启时补拉（三种筛选各自都会触发，只开「Type」时也补拉）、按 `(time, coin, tid)` 合并且保留实时副本、补拉之后到达的匹配成交被挤出最近 30 条后仍显示、实时成交与快照衔接不上时（包括被 TWAP 成交挤占时，以及快照为空而订阅已挤掉其后的成交时）只给中性重试且重试后恢复结论、订阅里没有普通成交时已开启的筛选仍显示快照里的匹配、加载与重新请求时安静、失败只给中性重试、实时快照过期时不下结论、2,000 条上限的说明，以及清除筛选后回到实时列表；`fill-filter-presentation.test.ts` 覆盖其判定函数与衔接判断。`mobile-order-funding-filter-backfill.test.tsx` 用真实的手机委托、资金费页签与桌面委托页签，以及真实的 `useHistoricalOrders`、`useOrderHistory`、`useUserFunding`、`useFundingHistory` 与 QueryClient 验证：筛选关闭时不请求；开启后找到最近 30 条之外的委托与资金费；只有较旧委托才有的状态或类型可以选择；加载时安静、失败只给中性重试且重试后恢复结论；2,000 条上限的说明；实时委托衔接不上快照时不下结论。

2026-11-17 修复的展示各有行为测试，都渲染真实组件：

- `mobile-order-modification.test.tsx`：改单抽屉在标记价不是实时、当前委托快照过期、市场目录加载中或失败时没有提示、红框与 `aria-invalid`，确认按钮禁用，回车不提交；标记价实时时触发价方向错误仍标红；目录已加载时的市场绑定变化仍提示；确认后被执行守卫拒绝的原因仍显示；市场目录加载中或失败时卡片上的「Modify Order」禁用且点按没有答复，目录已加载而没有这个市场时点按才答复。`open-order-modification-form.test.ts` 覆盖 `getDisplayableOpenOrderModifyBlock`。
- `mobile-history-cards.test.tsx`：手机委托历史与资金费页签在快照过期、离线或出错时，筛选无匹配的句子换成空白忙碌区域，读屏表头数值换成占位符；恢复后句子与数值回来。
- `mobile-twap-history-empty.test.tsx`：真实的两个手机 TWAP 列表接真实的 `useTwapHistory` 与 `useTwapSliceFills`，只替换传输层；最近一次请求失败、请求进行中或暂停、订阅中、过期或失败时没有空结论，已加载的记录保留；请求已结束且保持 `idle`、订阅仍为 `active` 时派发离线事件，空结论撤下，恢复在线后回来。`twap-activity-hooks.test.tsx` 钉住 `canConfirmEmpty` 的各个条件，包括离线。
- `mobile-orderbook-subscription.test.tsx`：分栏视图的空侧在实时帧上显示「No orders」，过渡期间是占位行。
- `trade-history-page.test.tsx`、`historical-orders-page.test.tsx`、`funding-history-page.test.tsx`：筛选无匹配只在当前、成功、没有刷新的快照上显示；刷新失败给中性「Retry」，离线与刷新中是忙碌区域，筛选行与所选值保留。
- `position-market-close-modal.test.tsx`、`position-limit-close-modal.test.tsx`：仓位加载或过期时没有 `role="status"`、`role="alert"` 与转圈。这个分支原本就不可达，这两处断言在修复前也通过；修复前会失败的是登记表与 `status-motion-surface-contract.test.ts` 的转圈登记。

`open-interest-cap.test.ts` 验证上限集合只在活跃、有数据、未过期、同一账户的快照上得出，其余状态为未知；`mobile-trade-size-validation-a11y.test.tsx` 与 `trade-panel-open-interest-cap.test.tsx` 在真实移动与桌面下单面板上验证已确认上限时的限制说明、禁用与未提交，以及未知或未上限时保持安静；`market-asset-info.test.tsx` 验证 HIP-3 上限行在加载、失败、空值和畸形响应时不出现。

`market-selector-quote.test.ts`、`token-selector-row.test.tsx` 与 `token-selector-wiring.test.tsx` 验证市场选择器的价格只来自实时价格上下文、涨跌只对实时资产上下文的 `prevDayPx` 计算，失效时为占位，排序用同样的值；`use-markets-info-subscriptions.test.tsx` 验证首帧前不读本地快照、每行的 `assetContextLive`，并把真实 `useMarketsInfoInternal` 的行交给真实选择器行渲染。

`session-resolving-clock.test.ts` 钉住共用时钟：10 秒到期、重复上报不重新计时、短于 2 秒的已定瞬间不重开等待。`wallet-session-resolving.test.tsx` 用真实的 `useWalletSession`（只替换 Privy 与 wagmi）钉住 `isResolving` 在各阶段的取值、每一种未定状态都在 10 秒后结束、晚挂载的调用方共用同一期限，以及 Agent-only、已退出登录、在钱包里切了账户时为假。`funds-dialogs-session-resolving.test.tsx`、`position-isolated-margin-session-resolving.test.tsx`、`position-tpsl-session-resolving.test.tsx`、`account-transfers-session-resolving.test.tsx`、`tests/mobile-trade-session-resolving.test.tsx` 与 `tests/trade-panel-session-resolving.test.tsx` 在同一套会话阶段（`harness/wallet-session-stage.ts`）下渲染真实组件，验证解析中不下连接或变化结论、动作禁用且不发请求、草稿保留，以及确认未连接、换了账户、从未登录、Agent-only 时的展示不变。`desktop-account-tabs-session-resolving.test.tsx` 验证共用的 `ConnectPlaceholder`，并扫描 `components/trade/positions`：十句「Connect your wallet to view …」都必须经它渲染，新页签自己写一句就失败。`deposit-order-cta.test.tsx` 用同一组输入比对桌面 `useButtonContent` 与手机 `getMobileOrderButtonContent` 在解析中的结果。`mobile-account-view.test.tsx` 验证地区未解析时资金入口保留并禁用、确认受限时隐藏；这一项与钱包会话无关，沿用该文件对会话 hook 的桩。

`account-mode-query.test.ts` 验证模式来源解析与三态分类；`mobile-account-view.test.tsx`、`funds-action-balances.test.tsx` 和 `deposit-modal-withdrawal-routing-guard.test.tsx` 使用真实资金能力计算验证未解析静默、确认限制、按钮禁用和未发起请求。`desktop-positions-readiness.test.tsx` 连接真实持仓 hook 与桌面页，验证首快照等待、错误优先和恢复，不依赖源码匹配。

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/mobile-data-presentation-contract.test.ts \
  src/lib/tests/account-mode-query.test.ts \
  src/lib/tests/funds-action-availability.test.ts \
  src/lib/tests/funds-action-balances.test.tsx \
  src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx \
  src/lib/tests/desktop-positions-readiness.test.tsx \
  src/lib/tests/user-positions-readiness.test.tsx \
  src/lib/tests/mobile-account-view.test.tsx \
  src/lib/tests/wallet-session-resolving.test.tsx \
  src/lib/tests/session-resolving-clock.test.ts \
  src/lib/tests/funds-dialogs-session-resolving.test.tsx \
  src/lib/tests/position-isolated-margin-session-resolving.test.tsx \
  src/lib/tests/position-tpsl-session-resolving.test.tsx \
  src/lib/tests/account-transfers-session-resolving.test.tsx \
  src/lib/tests/desktop-account-tabs-session-resolving.test.tsx \
  src/lib/tests/deposit-order-cta.test.tsx \
  tests/mobile-trade-session-resolving.test.tsx \
  tests/trade-panel-session-resolving.test.tsx \
  src/lib/tests/deposit-empty-balances-entry.test.tsx \
  src/lib/tests/mobile-orders-card.test.tsx \
  src/lib/tests/mobile-twap-card.test.tsx \
  src/lib/tests/mobile-history-cards.test.tsx \
  src/lib/tests/mobile-fill-filter-backfill.test.tsx \
  src/lib/tests/mobile-order-funding-filter-backfill.test.tsx \
  src/lib/tests/fill-filter-presentation.test.ts \
  src/lib/tests/mobile-order-modification.test.tsx \
  src/lib/tests/open-order-modification-form.test.ts \
  src/lib/tests/mobile-twap-history-empty.test.tsx \
  src/lib/tests/twap-activity-hooks.test.tsx \
  src/lib/tests/mobile-orderbook-subscription.test.tsx \
  src/lib/tests/trade-history-page.test.tsx \
  src/lib/tests/historical-orders-page.test.tsx \
  src/lib/tests/funding-history-page.test.tsx \
  src/lib/tests/position-market-close-modal.test.tsx \
  src/lib/tests/position-limit-close-modal.test.tsx \
  src/lib/tests/open-interest-cap.test.ts \
  src/lib/tests/market-asset-info.test.tsx \
  tests/mobile-trade-size-validation-a11y.test.tsx \
  tests/trade-panel-open-interest-cap.test.tsx \
  src/lib/tests/funding-history-panel.test.tsx \
  src/lib/tests/funding-history-panel-snapshot.test.tsx \
  src/lib/tests/market-selector-quote.test.ts \
  src/lib/tests/token-selector-row.test.tsx \
  src/lib/tests/token-selector-wiring.test.tsx \
  src/lib/tests/use-markets-info-subscriptions.test.tsx \
  src/lib/tests/passive-query-state.test.ts \
  src/components/staking/__tests__/staking-passive-data.test.tsx \
  src/lib/tests/referral-passive-data.test.tsx \
  src/lib/tests/vault-passive-data.test.tsx \
  src/lib/tests/use-referrals.test.tsx \
  src/lib/tests/vaults-domain.test.ts \
  src/lib/tests/referral-ui-contract.test.ts \
  src/lib/tests/status-motion-surface-contract.test.ts
```

契约测试的文案清单不能替代行为审查；新增入口仍须覆盖未知、失败、恢复和确认空快照，检查禁用逻辑是否独立于文案。

## 待处理

2026-11-17 建登记表时逐项清点了受检文件里的 201 处展示，对其中存疑的 15 项由代理尝试推翻，并尽量用真实组件写探针测试复现；登记表写完后对照代码核对登记理由，又确认了 4 个文件。探针没有入库，结论见[任务记录](work-memory/sessions/2026-11-17-mobile-presentation-contract-registry.md)。当时确认存在、尚未修复的共 18 个文件，登记表里都标为 `pending`。它们是登记之前就有的行为，不是登记放行的做法。建议的修法都只改展示，不动执行守卫。

同日的后两次改动把这 18 个文件都处理了，下表现在是空的：

- 只涉及展示的 11 个文件：改单抽屉、手机委托历史与资金费页签、两个手机 TWAP 列表、订单簿分栏视图的空侧、三个历史页的筛选无匹配，以及两个平仓弹窗不可达的加载分支。现行做法写在上文「受约束的入口」，过程见[任务记录](work-memory/sessions/2026-11-17-mobile-presentation-pending-fixes.md)。
- 界面分不清「会话解析中」与「未连接」的 6 个文件（发送、划转、逐仓保证金、仓位 TP/SL 弹窗，桌面充值提现页签，手机下单按钮），加上手机账户页的地区未解析。同一改动里桌面下单按钮与其余九个桌面账户页签也一并改了，它们原先不在表里。现行做法写在上文「钱包会话解析中」，过程见[任务记录](work-memory/sessions/2026-11-17-wallet-session-resolving-presentation.md)。

表头保留：契约测试按表头读这张表，登记表里没有 `pending` 时表必须为空；再发现一项时在这里加一行，并在登记表里标 `pending`。

| 文件 | 现状 | 依据 | 建议的修法 |
| --- | --- | --- | --- |

核实后不算问题的有一项：新账号自动设置为统一账户期间（`pending` 状态），提款与划转的禁用原因与 `awaiting-funds` 相同。这是 [ADR 0041](adr/0041-automatic-unified-account-for-new-accounts.md) 的明确要求。

没有判定出来的有一项：发送弹窗里的「Select a supported account mode before moving funds.」对新账号是否可达。

## 与官方终端的对照（2026-11-17）

建登记表时，有些展示的理由取决于官方的做法。官方开发文档只描述协议，不描述界面：清算规则、订单状态的含义、账本条目的字段、TWAP 只有 `twapOrder` 与 `twapCancel` 两个动作。所以这些项读的是官方终端的生产包（`app.hyperliquid.xyz`，`index-_r9icOH2.js`、`config-BkGHbgaN.js`、`en-US-BcHHE9Lu.js`）。读取方式是在浏览器里取源码文本检索，没有连接钱包，也没有看到带数据的界面。

| 项目 | 官方终端 | 本终端 |
| --- | --- | --- |
| 被动加载文字 | 文案 `Loading...` 只用了一处，在区块浏览器的交易详情；没有「过期」「不可用」「重连」类文案；有离线横幅 `You are offline. Check your connection.` | 本规范禁止被动文字，保留全局离线横幅 |
| 全仓保证金率 | 两档：维持保证金与账户价值之比超过 0.8 时红色，否则绿色 | 三档：危险、警告、正常 |
| 委托历史状态 | 纯文字，不着色；协议撤单显示 `Canceled` 加下划线与悬停说明，各类拒绝显示 `Rejected` 加悬停说明 | 已成交绿色、已撤销与被拒红色的徽标 |
| 持仓强平价 | 不着色，没有接近标记价的高亮 | 实时标记价在 10% 以内时红色 |
| 下单摘要的预估强平价 | 不着色；缺值显示 `N/A` | 距下单价 5% 以内时红色；缺值显示 `N/A` |
| 仓位 TP/SL 弹窗的标记价 | 不着色 | 有实时标记价时警告色 |
| 充值提现记录 | 有状态列，值为 `pending` 或 `completed`，纯文字；手续费非零时着色，为零显示 `--` | 状态恒为 `Completed`；手续费有值时红色 |
| 筛选无匹配 | 只要开启筛选且没有行就显示 `No results match your filters.`，不看加载或失败 | 手机成交历史要求补拉成功且当前；手机委托历史、资金费与三个历史页要求快照当前，否则不下结论（见「受约束的入口」） |
| 发送确认 | 目标地址没有发过交易时显示警告，并要求勾选确认；有手续费时说明金额 | 复核步骤有对应的两条提示 |
| 订单簿空的一侧 | 文案目录里没有对应文字 | 手机分栏视图只在实时帧上显示「No orders」，过渡期间是占位行；紧凑视图没有空侧文字 |
| 余额不足时的下单按钮 | 改名为 `Not Enough Margin` 或 `Insufficient Balance` 并禁用 | 按钮保留动作名称，由可用性布尔值禁用 |

颜色上的差异都属于「数值含义的颜色」，不是被动数据提示，本规范不禁止。是否向官方对齐是设计决定，这次没有处理。

没有查到的有两项：官方 TWAP 历史的状态颜色与错误描述的显示方式；官方当前委托是否显示与标记价的距离。

## 行情标题的数据来源

移动端顶部价格与桌面现货价格统一取当前有效资产上下文的 `midPx`，仅在其缺失或为 null 时回退到同一上下文的 `markPx`。价格和 24 小时变化使用同一上下文的 `prevDayPx`，不混入 BBO、allMids 或其他市场的值。失效、错市场及缺少接收时间的上下文保持安静占位；非法或非正 mid 不作为正常空值回退。数据源、市场、网络切换或重连时建立新的颜色反馈基准。桌面合约“标记”仍使用标记价，盘口中间价仍只使用服务端 mid。

市场选择器（桌面弹层与手机全屏列表是同一组件 `TokenSelectorRow`，共用 `useTokenSelector` 与列定义）按同一规则取价（`domain/market/selector-quote.ts`）：

- 价格取该行实时价格上下文（`fastAssetCtxs`，合并进 `useMarketsInfo` 的行）的 `midPx`，仅在它缺失或为 null 时回退到同一上下文的 `markPx`；上下文须为 `success`、标记价为正、本地接收不超过 `LIVE_MARK_MAX_STALE_MS`（`isLiveMarkPriceReady`，与行情头相同），否则价格与涨跌都显示既有占位 `-`。共享的快价解析（`resolveFastMarketPrice`）只把正数或 null 的 mid 放进行里，非法或非正的 mid 到不了选择器，在那里按缺失处理；2026-11-01 的公开流样本（1,976 个币）里没有这样的 mid，697 个为 null。
- 24 小时涨跌是该价格对同一行 `prevDayPx` 的变化，并要求这份资产上下文来自当前实时帧（行字段 `assetContextLive`：`pac`/`sac` 或回退后的原频道有帧、`active`、未过期，且该行自己的条目已到达）；上下文过期、失败、恢复中或未到达时只显示价格，涨跌为占位。实时价格不与过期的 `prevDayPx` 拼在一起（[ADR 0047](adr/0047-no-local-market-stats-snapshot.md)）。
- 按价格、按 24 小时涨跌排序用同样的值（Big.js 比较），没有值的行在两个方向都排在最后。市值与未平仓量仍按 `markPx` 计算。
- 位数与官方选择器相同：至多五位有效数字，小数位不超过永续 `6 - szDecimals`、现货 `8 - szDecimals`，保留尾零（与行情头共用 `getTradePriceDecimals`）；桌面的涨跌额取当前价与前日价两者中较多的位数。涨跌为零时与官方一样显示 `+`（`+0.00%`），颜色为默认文字色。
- 与官方的差异：官方选择器在 mid 缺失时价格显示 `--`、涨跌按 0 计算显示 `-100.00%`（2026-10-31 生产包：`CoinSelector.provider-hKfAGsw-.js` 的 ``midPx:u?.midPx||0``；`series-BBY5PmtX.js` 的 ``lastPrice:{value:w??0,element:w?`${ne(w,v,P)}`:`--`}``；涨跌格式化 `config-BhZylSmU.js` 的 `Fce` 只在 `G3(prev)||G3(cur)||prev===0` 时显示 `--`，`G3` 只判断 null 与 NaN）；本终端按行情头规则回退到同一上下文的标记价并据此计算涨跌。价格恰为 1,000 时官方用浮点 `Math.log(x)/Math.log(10)`（得 2.9999999999999996）算出 2 位小数，本终端按精确的五位有效数字得到 1 位。官方不检查行情新鲜度，本终端按上文显示占位。

来源审查与验证范围见 [价格来源审查](price-source-audit.md)。
