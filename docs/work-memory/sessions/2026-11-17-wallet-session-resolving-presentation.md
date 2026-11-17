<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-17-wallet-session-resolving-presentation",
  "date": "2026-11-17",
  "title": "界面区分「钱包会话解析中」与「确认未连接」（手机展示规范待处理项的资金与签名一组）",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "docs-governance"],
  "summary": "登记表任务确认六个入口在已登录会话只是重连或初始化时显示未连接或数据已变的结论，另有手机账户页在地区检查未解析时隐藏整块资金操作。本次在 useWalletSession 增加只用于展示的 isResolving（有登录痕迹的浏览器里 Privy 未就绪、钱包目录未就绪、wagmi 连接或重连中、期望钱包已在目录而 wagmi 还没有账户），由一个全应用共用的时钟限定最多 10 秒；发送、划转、逐仓保证金、TP/SL 弹窗，十个桌面账户页签，桌面与手机的下单按钮据此改为保留原状并禁用、保留草稿，确认未连接、换账户、从未登录、Agent-only 的展示不变。每个入口先用真实组件与真实 useWalletSession（只替换 Privy 与 wagmi）写出在旧代码上失败的测试再修。两轮对抗审查与一次独立审查没有发现任何动作因此可用，指出的问题已改。没有改任何执行守卫。真实钱包与真机行为没有验证。",
  "thread": null,
  "baseCommit": "6c45e83a",
  "commits": [],
  "sources": [
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "docs/order-entry-surface-parity.md" },
    { "path": "docs/trading-onboarding.md" },
    { "path": "apps/terminal/src/hooks/wallet/use-wallet-session.ts" },
    { "path": "apps/terminal/src/lib/wallet/session-resolving-clock.ts" },
    { "path": "apps/terminal/src/lib/tests/harness/wallet-session-stage.ts" },
    { "path": "apps/terminal/src/lib/tests/mobile-data-presentation-registry.ts" },
    { "path": "docs/work-memory/sessions/2026-11-17-mobile-presentation-contract-registry.md" }
  ],
  "supersedes": []
}
-->
# 界面区分「钱包会话解析中」与「确认未连接」

## 背景与范围

同步记录，2026-11-17，未取得任务标识。任务由编排会话下达：把[登记表任务](2026-11-17-mobile-presentation-contract-registry.md)「后续」里涉及资金与签名弹窗的一组修掉，只改展示，一个分支、一个进 `main` 的 PR。

范围是规范「待处理」里的七行：发送、划转、逐仓保证金、仓位 TP/SL 弹窗，桌面充值提现页签，手机下单按钮，以及手机账户页（地区检查未解析）。独立审查之后扩大到同一面板的其余九个桌面账户页签与桌面下单按钮，它们原先不在表里。其余十一行（改单抽屉、筛选无匹配、TWAP 空结论、订单簿空侧、三个历史页、两个平仓弹窗的死分支）没有动。

基线是本地分支 `test/mobile-presentation-contract-registry` 的 `6c45e83a`：登记表提交当时还不在 `origin/main` 上。本分支 `fix/wallet-session-resolving` 建在它上面，先合登记表、再合本分支，或两者一起合。

## 结论与依据

### 一个标志

`useWalletSession()` 增加 `isResolving`，定义写在 [运行时约束](../../runtime-guardrails.md) §1。会话「未定」的情形：

- Privy 还没就绪，且浏览器里存有 Privy 的登录痕迹（`hasPersistedPrivySession()`，与头部菜单同一条规则）；
- 已登录，钱包目录还没就绪；
- 已登录，wagmi 报告 `connecting` 或 `reconnecting`；
- 已登录，期望的钱包已在目录里，而 wagmi 还没有任何账户。

`isResolving` 是「未定，且等待没有到期，且不是 Agent-only 会话」。不算未定的：钱包会话已建立；未登录（没有登录痕迹的浏览器立刻如此，否则等 Privy 就绪）；已登录但目录里没有期望的钱包（缺失、身份含糊或不可用）；wagmi 连着的账户不是期望的钱包（在钱包里切了账户，是变化，不是等待）。

等待由一个模块级时钟计时（`lib/wallet/session-resolving-clock.ts`），所有调用方共用：会话变成未定时开始，10 秒（`WALLET_SESSION_RESOLVING_MAX_MS`）后到期，到期后不论卡在哪一步都按实际状态展示；会话连续已定 2 秒后才关闭这次等待。

取舍：

- **为什么算上第四条**：读 `@privy-io/wagmi` 4.0.17 的 `useSyncPrivyWallets`，页面加载时钱包目录就绪之后、适配层建好连接器并把 wagmi 置为已连接之前，至少有一次已提交的渲染处在「已登录、wagmi 未连接也不在连接中」。不算它，页签与下单按钮在每次加载时仍会闪一下连接提示。
- **为什么要总上限**：第一版只给第四条设了 10 秒，对抗审查指出另外三条同样可以一直持续（wagmi 3.0.0 的 `reconnect()` 没有超时，钱包不回应时状态停在 `reconnecting`；Privy 被拦截时一直不就绪），那样连接入口会被永远藏起来。现在四条共用一个上限。
- **为什么共用时钟**：第一版每个组件各自计时，晚打开的弹窗会比别处多等，重新打开又重新计时。
- **为什么已定 2 秒才关闭等待**：适配层每次重连之前会把钱包瞬间置为已连接。一个始终连不上的钱包若因此重新得到 10 秒，Privy 每刷新一次用户对象，连接提示就会消失 10 秒。代价见「后续」。
- **Privy 未就绪时看本地登录痕迹**：第一版把「Privy 未就绪」对所有人都算未定，独立审查指出这让从未登录的访客在慢网络上最多 10 秒看到一个没有说明的禁用下单按钮，而头部已经给出连接入口。现在与头部菜单用同一条规则：没有登录痕迹就不等。
- **不覆盖邮箱钱包静默创建**：创建期间目录里没有钱包。把它算进来要让 hook 读 `EmailEmbeddedWalletContext`，而几十个测试把那个模块整体替换掉了；协议门控已有自己的等待。

标志只用于展示。`isConnected`、`hasWalletAccess`、`address`、Hyperliquid 的 `clientKey`、签名器与执行守卫都没有改。

### 七个入口

每个入口的现行展示写在[规范](../../mobile-data-presentation.md)「钱包会话解析中」的表里。实现上的要点：

- **发送、划转弹窗**：连接警告的条件由 `!hasWalletAccess` 改为同时要求不在解析中、不是 Agent-only。发送弹窗的限制说明原先只在有钱包权限时显示，Agent-only 会话因此只看到连接警告；现在 Agent-only 会话显示桌面主钱包那一句（地区确认受限时显示地区说明）。
- **逐仓保证金弹窗**：身份不一致且在解析中时不显示「Trading data changed…」；`canSubmit` 仍包含身份一致，提交保持禁用。
- **仓位 TP/SL 弹窗**：草稿存在表单组件的状态里，表单一卸载就丢。主体现在记住最近一次提交上屏的表单所用的仓位、现有 TP/SL 与计价币（在 `useLayoutEffect` 里写入，不在渲染中写）；解析中，以及会话恢复后持仓或委托快照还在重新加载时，用记住的值继续渲染同一个表单并传 `liveDataReady={false}`，确认按钮因此禁用，执行仍读实时的 `executionStateRef`。确认未连接、身份不一致、仓位确认不存在时照旧换成状态页，并清掉记住的值。这也改变了原有的一个非解析情形：表单显示之后快照变成加载中或失败，以前换成空白状态页、恢复后用新数据重新初始化，现在保留表单并禁用，符合规范「刷新或重连时保持已打开的操作弹窗及输入草稿」；代价是期间仓位或已有 TP/SL 变了的话，恢复后表单显示「Trading data changed…」并保持禁用，需要关闭重开。
- **桌面账户页签**：第一版只改了充值提现页签（经 `useAccountLedger` 的一个新字段），独立审查指出同一面板里相邻的页签仍然显示连接提示，彼此矛盾。十个页签的「Connect your wallet to view …」都经同一个 `Placeholder` 渲染，所以改成一处共享实现：`placeholder.tsx` 增加 `ConnectPlaceholder`，解析中渲染忙碌占位，否则渲染原来的句子；十个页签把这一句换成它，`useAccountLedger` 恢复原样。选择这个做法而不是把充值提现页签退回去登记为待处理，是因为它是机械替换、每个页签只换一个组件名，包体读数见下文。
- **下单按钮（桌面与手机）**：第一版只改了手机一端，独立审查指出桌面仍是可点击的「Connect Wallet」，违反下单表单两端对齐。现在判断放在两端共用的 `getOrderActionStage`：`isSessionResolving` 为真时落到已有的「余额加载中」阶段，保留动作名称并禁用。
- **手机账户页**：`depositGeoBlocked` 只认 `geo-restricted`；`geo-unresolved` 时已连接的资金区保留，Deposit、Withdraw、Perps / Spot 由各自的可用性布尔值禁用。Bridge 入口原先在这块区域里且始终可点，保留这块区域后它在地区未解析时会变成可点，所以给它加了禁用。

### 复现

任务说明里标注「只读代码确认」的两项都先复现了（以下是第一版修复前在旧代码上的失败数）：

- TP/SL 弹窗：`position-tpsl-session-resolving.test.tsx` 在旧代码上 5 项失败，重连、目录初始化、激活中三种阶段下表单都被「Connect wallet to view positions」替换。
- 手机下单按钮：`tests/mobile-trade-session-resolving.test.tsx` 在旧代码上 6 项失败，五种解析阶段下按钮都是「Connect Wallet」。

其余入口同样先失败再修：发送与划转 10 项、逐仓保证金 4 项、充值提现页签 7 项、手机账户页 1 项。

### 测试的做法

`harness/wallet-session-stage.ts` 定义十一个会话阶段（认证初始化、目录初始化、激活中、连接中、重连中、已连接、换了用户、在钱包里切了账户、目录里没有钱包、已退出登录、Agent-only），只替换 `@privy-io/react-auth`、`wagmi`、`@privy-io/wagmi` 与 Hyperliquid 会话上下文，`useWalletSession` 与 `privy-wagmi` 的选择逻辑是真实的。桩 hook 用 `useSyncExternalStore` 订阅阶段，切换阶段会让经 React Compiler 编译的组件重新渲染。

Hyperliquid 会话上下文是按 `resolveSession` 手写的模型，不是真实的 `HyperliquidProvider`；余额、持仓、委托等数据 hook 沿用各组件原有测试的桩，并让它们在没有 owner 时返回空。

例外：手机账户页那一项（地区检查未解析）的测试在 `mobile-account-view.test.tsx` 里，该文件把 `useWalletSession` 与 `useDepositAvailability` 都替换成了桩。这一项只与地区检查有关、不读 `isResolving`，所以沿用了原有的桩；它不是「真实会话 hook」的测试。十个桌面页签里只有充值提现页签有渲染真实页签的测试，其余九个由 `ConnectPlaceholder` 的单测加一条源码扫描覆盖（每句连接提示都必须经它渲染）。

## 验证与限制

版本：分支 `fix/wallet-session-resolving`，基线 `6c45e83a`，Node 22.15.0，pnpm 10.21.0。下面的读数取自独立审查之后的最终代码；第一版（提交 `3e0eaf10`）的读数在 Git 历史里。

- 契约与回归：`apps/terminal` 下全部 54 个契约测试文件，加 `AGENTS.md` 的钱包与引导、手机数据展示、确认面、桌面布局与下单四组，以及规范「回归入口」的清单，去重后 247 个文件、5,194 项，一次运行全部通过（`--maxWorkers=4`）。
- 本次新增与修改的测试：`session-resolving-clock`、`wallet-session-resolving`、`funds-dialogs-session-resolving`、`position-isolated-margin-session-resolving`、`position-tpsl-session-resolving`、`account-transfers-session-resolving`、`desktop-account-tabs-session-resolving`、`tests/mobile-trade-session-resolving`、`tests/trade-panel-session-resolving`、`deposit-order-cta`、`mobile-account-view`，都在上面的 247 个文件里。
- 变异复核：去掉桌面面板传入的 `isSessionResolving`，桌面下单按钮的五个解析阶段失败；把「Privy 未就绪」改回对所有人都算未定，从未登录的三项失败；去掉「Agent-only 的实例不上报」，对应的一项失败。
- `pnpm --filter @sairn/terminal typecheck` 退出码 0（工作树里临时放了图表库，未入库）；改动的 TypeScript 文件 Biome 无问题。
- `mobile-data-presentation-contract` 119 项通过。登记表删掉七个文件的 `pending`，四句连接文案与下单按钮的「Connect Wallet」改登记为已确认的限制，计数没有变化。
- 没有验证的：真实钱包、真实 Privy 与 wagmi 的事件顺序、真机。「Privy 更新用户对象后 wagmi 重连」「加载时目录就绪到连接器建好之间有一帧」「wagmi 的重连没有超时」都是读库代码得出的，测试里的阶段是按这个读法构造的。
- 没有运行浏览器回归。全量终端单测第一版跑过一次（见「全量单测」），合并 `main` 之后在合并的树上又跑了一次，全部通过（见「合并 `main` 之后」）。
- 没有跑 Codex 推送前审查：CLI 额度到 2026-11-20 才恢复（来源：登记表任务记录）。

### 全量单测

第一版提交 `3e0eaf10` 的工作树，`vitest run --maxWorkers=6`：744 个文件里 739 个通过、1 个跳过、4 个失败；10,708 项里 10,669 项通过、7 项跳过、32 项失败。失败全部是超时（5 秒的用例超时与 30 秒的 hook 超时），没有断言失败：

- `mobile-agent-sync-modal.test.tsx` 29 项；
- `use-explicit-agent-approval.test.tsx` 2 项；
- `modal-close-label-i18n-contract.test.ts` 1 项（随后单独运行通过）；
- `positions-panel-preload.test.ts` 的 `beforeAll`。

运行时机器负载在 31 至 46 之间（本机另有 Android Studio 与其它 Node 进程占用）。随后在同样的负载下，把 `positions-panel-preload`、`mobile-agent-sync-modal`、`use-explicit-agent-approval` 逐个放到基线 `6c45e83a` 的工作树里用 `--maxWorkers=1` 运行，三个文件同样因超时失败；负载较低时（约 24），`mobile-agent-sync-modal` 与 `use-explicit-agent-approval` 在本分支与基线上单独运行都全部通过。判断为本机负载下的超时，与本次改动无关。最终代码的 247 个文件那一次运行里，`mobile-agent-sync-modal`、`use-explicit-agent-approval` 与 `modal-close-label-i18n-contract` 都通过了。结论的限制：没有在空闲机器上取得一次全量全绿，CI 上的结果要等推送之后才有。

### 包体

协议构建（固定构建身份、`NITRO_PRESET=node-server`、`VITE_MOBILE_PAIRING_ENABLED=false`、无 `.env.local`）在基线 `6c45e83a` 与本分支的最终代码各跑一次，都通过全部预算与环形依赖检查，452 个客户端块。完整的表与逐块说明写在 [性能基线](../../terminal-performance-baseline.md)「Wallet session resolving presentation」一节，这里只列要点：

| 指标 | 基线 `6c45e83a` | 本分支 | 变化 | 余量 |
| --- | ---: | ---: | ---: | ---: |
| 客户端 JS + CSS 合计 | 3,391,705 | 3,392,238 | +533 | 5,825 |
| 交易静态启动 | 1,662,902 | 1,663,423 | +521 | 1,448 |
| 手机运行时增量 | 119,743 | 119,749 | +6 | 831 |
| 桌面运行时增量 | 204,705 | 204,856 | +151 | 7,827 |
| `trade-terminal-page` | 128,565 | 128,647 | +82 | 268 |
| 最大的块 `index-BRVzclkp`（gzip；原始 1,414,783 不变） | 411,536 | 411,550 | +14 | 无单独预算 |

其余十个命名面的变化在 −7 到 +1 之间，余量最小的是 `vaults-page`（246，本次 −2）。

`trade-terminal-page` 协议构建余 268。发布配置的读数比协议构建高约 156（来源：性能基线 p42 一节），按此推算发布构建约余 112，低于发布预检的 200；基线自己按同样的推算也只余约 194。下一次发布预检需要先重定这一项的基线，这次没有重定。发布配置（配对开、生产环境变量）的构建没有跑，112 是推算。

### 合并 `main` 之后

PR #10 合并后（`origin/main` `00d369f3`），用合并提交 `e18663b1` 把它合进本分支，没有变基。

- 冲突两处。规范「待处理」表：PR #10 留下的正是本分支修掉的七行，解决成空表，表头保留，上面的说明改写为两次改动各处理了哪些文件。性能基线文档：两个分支在同一位置各加了一节，两节都保留。`AGENTS.md`、`CHANGELOG.md` 与登记表自动合并，读过结果无误；登记表里没有 `pending`。
- 合并后的树：`apps/terminal/src/lib/tests` 下全部 54 个契约文件，加钱包与引导、手机数据展示、确认面、桌面布局与下单四组及规范清单，去重后 253 个文件、5,337 项，一次运行全部通过（`--maxWorkers=4`）。类型检查退出码 0，本分支改动的 TypeScript 文件 Biome 无问题，`pnpm memory:check` 通过。
- 协议构建在 `main` `00d369f3` 与合并后的树各跑一次，都通过全部预算与环形依赖检查。合并后的树：合计 3,392,466（比 `main` +1,099，余 5,597）；交易静态启动 1,663,577（+559，余 1,294）；手机运行时增量 119,724（−13，余 856）；桌面运行时增量 204,803（+162，余 7,880）；`trade-terminal-page` 128,623（+81，余 292）；其余十个命名面的变化在 −6 到 +6 之间，余量最小的是 `vaults-page`（246）。完整的表在性能基线文档同一节。按发布配置约高 156 推算，`trade-terminal-page` 发布构建约余 136，仍低于预检的 200。
- 全量终端单测在合并后的树上跑了一次（`vitest run --maxWorkers=6`，机器负载约 13 至 20）：747 个文件里 746 个通过、1 个跳过；10,803 项里 10,802 项通过、1 项跳过，没有失败。第一版那次运行里超时的四个文件这次都通过，与「负载下的超时」的判断一致。
- 规范「待处理」现在没有行。
- 仍然没有验证的：真实钱包、真实 Privy 与 wagmi 的事件顺序、真机、浏览器回归、发布配置与配对开的构建。

## 对抗审查

两轮，各一个独立代理，读代码并写临时探针测试（跑完删除），任务是找出「某个动作因此变得可用」或「真实的断开没有被报告」的状态。

第一轮（针对第一版）：

- 没有找到动作变得可点、请求被发出或可能签名的状态。逐项核对了 TP/SL 保留表单的提交路径（`canSubmit` 与数量编辑都要求 `liveDataReady`，执行守卫只读实时的 `executionStateRef`）、手机下单按钮、手机 Bridge 按钮、逐仓保证金、发送与划转。
- P1：`isResolving` 只有「激活中」有 10 秒上限，Privy 未就绪、目录未就绪、wagmi 连接或重连中三种没有上限，探针推进一小时仍为真。已改为四种共用一个 10 秒上限。
- P1/P2：同一用户在钱包里切到另一个账户（wagmi 连着 B，期望的是 A）会被当作解析中藏 10 秒。已改：wagmi 有账户而不是期望的钱包时不算未定。测试夹具原先表达不了这个状态，已增加阶段。
- P2：宽限按组件各自计时，晚打开的弹窗比别处多等。已改为共用时钟。
- P2：适配层重连前的瞬间「已连接」会给连不上的钱包重开 10 秒。已改：连续已定 2 秒才关闭等待。
- P3：TP/SL 在非解析的数据待定情形也保留表单，期间仓位变化要关闭重开。保留这个行为，写进规范并补了测试。
- P3：保留值在渲染中写入 ref，并发渲染被丢弃时可能留下未上屏的快照。已改为在 `useLayoutEffect` 里写入。

第二轮（针对修正后）：没有 P0、P1、P2。

- P3：时钟默认所有 hook 实例对「未定」判断一致，而 Agent-only 时 Hyperliquid provider 之内的实例看不到 Privy 钱包，会上报「已定」，provider 之外的 `HyperliquidBridge` 实例上报「未定」。当时无害（Agent-only 一侧本来就不算解析中）。已改：Agent-only 的实例不上报，并补了一条去掉修复就失败的测试。
- 核对后没有问题的：StrictMode 下重复上报、卸载、到期后才挂载的组件、隐藏标签页里计时器延后、`useSyncExternalStore` 的服务端快照、测试之间的模块状态泄漏（vitest 按文件隔离，新测试每例重置时钟，渲染真实 hook 的六个旧测试文件不读这个标志）。

### 独立审查（编排会话转来）

提交 `3e0eaf10` 之后，编排会话转来一份独立审查的结论：没有安全缺陷（`isResolving` 只在 `address` 为空时为真、时钟不会让它超过 10 秒、Agent-only 从不算解析中、提交可用性与执行守卫未变、保留的 TP/SL 表单始终属于开窗时的 owner），但推送前要改五处，都已改：

- 从未登录的访客不该等：「Privy 未就绪」只在有本地登录痕迹时算未定。
- 桌面下单按钮与手机不一致：判断移到两端共用的 `getOrderActionStage`，并补两端对照的测试。
- 桌面账户页签彼此不一致：十个页签的连接提示改经共用的 `ConnectPlaceholder`。
- 文档：`AGENTS.md` 那句话限定到实际遵循它的入口；`docs/trading-onboarding.md` 说明标志与 30 秒「重新加载页面」互不影响；本记录更正测试做法的说法、补最大块读数；包体表写进性能基线文档。
- 时钟测试补一例：等待没有到期时，短暂的已定不重开也不延长 10 秒期限。

合并顺序：`fix/mobile-presentation-pending-notices`（PR #10）先合，合并的结果见「合并 `main` 之后」。

## 后续与替代关系

本记录不取代其他记录；它完成了[登记表任务](2026-11-17-mobile-presentation-contract-registry.md)「后续」三组中的第三组，并顺带处理了手机账户页的地区未解析。

- 规范「待处理」在合并 `main` 之后没有行：另外十一行由 PR #10 修掉。
- 「连续已定 2 秒才关闭等待」的代价：一次等待到期之后，用户重连成功，适配层随即再重连一次，这次短暂的重连期间入口会按旧行为显示未连接的结论，直到重连结束。这与改动前相同，不更差。
- 10 秒是否合适要在真实的慢网络与嵌入钱包上看：Privy 初始化超过 10 秒时，入口回到改动前的展示。
- 邮箱钱包静默创建期间，这些入口仍按未连接展示。
- `trade-terminal-page` 的预算见上。
- 真实钱包与真机验收没有做。
