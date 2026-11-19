# ADR 0045：L1 动作带 15 秒过期时间

- 状态：已接受并实施（2026-10-30；分支 `claude/p1-order-safety`，基于 `dev` `d99c2bc9`）；未合入 `dev`、未发布。同日运营方授权按官方实践处理待定事项后，补上与官方相同的关闭开关（决策第 6 条）。2026-10-31 按集成 PR #129 的审查修订决策第 3、4 条：样本不加往返时间的一半，经过时间只计单调时钟，两个时钟不一致时先重新取样，跨过休眠或改时的回答不用。 2026-11-17 补记：已经晋升 PR #133 进 `main`，2026-11-02 随 p36 发布（[p36 发布记录](../work-memory/sessions/2026-11-02-cloudfront-release-p36.md)）。 2026-11-19 补记：nonce 基准、没有样本时的签名与 `nonce too low`（见文末）。
- 关联：`packages/hl-react/src/internal/exchange/server-clock.ts`、`packages/hl-react/src/clients.ts`；[签名模型](../hyperliquid-signing.md)；[ADR 0022](0022-subscription-staleness-monotonic-clock.md)（陈旧判断取两个时钟较大者；过期估计只用单调时钟，见决策第 3 条）；[全功能审查记录](../work-memory/sessions/2026-10-30-full-feature-audit.md) M1。

## 背景

- Hyperliquid 的 L1 动作（下单、撤单、改单、杠杆、逐仓保证金、TWAP、金库划转等）可以带 `expiresAfter`：交易所到这个时间还没接受动作，就拒绝它并返回 `Action already expired`。用户签名动作（转账、提款、授权）不支持这个字段。[交易所接口文档](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)另写明：因过期被拒的动作按 5 倍消耗地址限额。
- 官方终端默认开启「交易延迟保护」：每个 L1 动作的 `expiresAfter` 为交易所时间加 15 秒，设置里有 `Disable Transaction Delay Protection` 关闭（[官方 FAQ](https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/trade-outcome-looks-incorrect/what-does-action-already-expired-mean)）。2026-10-30 读官方前端包：`expiresAfter()` 为 `serverTime + Date.now() - localTimeSet + 15000`，`serverTime` 取自账户快照 `userState.serverTime`，收到快照前用本机时间。
- 本终端此前没有设置任何 `expiresAfter`（2026-10-30 审查 M1，Codex 二审 P1）：网络中断或拥堵时，已经签好的下单、撤单可能在用户以为失败、甚至重新下单之后才上链。

## 约束

- 只给 L1 动作加；用户签名动作不变。签名身份、nonce、请求排队、法律与资金锁、执行守卫都不变。
- `expiresAfter` 写进签名的动作哈希，必须在签名前算好。签名方必须是不需要人工确认的 Agent 或邮箱内嵌钱包（`showWalletUIs: false`），否则人工确认的时间会被算进 15 秒；L1 动作按注册表只走交易客户端（`registries/exchange.ts`），满足这一点。
- 本机时钟可能比交易所慢或快几十秒。慢超过 15 秒时，只用本机时间会让所有动作一发出就过期。
- 系统时间可能被往回调，设备也可能休眠（ADR 0022）。

## 决策

1. `createExchangeClient` 与 `getTradingClient` 创建的每个 `ExchangeClient` 都设置 SDK 的 `defaultExpiresAfter`。SDK 只在 `executeL1Action` 里读它，用户签名动作照旧不带该字段。
2. 过期时间为「估计的交易所时间 + 15 秒」，与官方默认一致。
3. 交易所时间来自公开的 `info` 请求 `exchangeStatus`（返回服务器时间 `time`，2026-10-30 实测主网与测试网可用、与本机相差约 0.1 秒）：样本是收到响应时的服务器时间，不加往返时间的一半，估计值为「样本 + 取样后经过的单调时间」。服务器先盖时间戳再发回，所以样本不会比收到时的交易所时间晚；往前或往后调系统时间都不改变估计值。墙钟与单调时钟的经过时间相差超过 1 秒（系统时间被改过，或设备休眠时单调时钟停走）时，下一个动作先等重新取样（最多 2 秒，不受第 4 条 30 秒重试间隔限制）再签名；如果它等到的是时钟改动前就已发出的请求、没有得到可用样本，就再取一次；仍然失败时按单调时间估计，动作可能因估计偏早被拒为已过期，而不是晚到上链。判断样本是否该刷新、失败后能否重试仍取两个时钟较大者（ADR 0022 的 `getReceiptAgeMs`）。2026-10-31 修订：初版的估计值为「响应时间 + 往返时间的一半 + 取样后经过的时间」，经过时间取墙钟与单调时钟两者中较大者。取样后往前调系统时间（例如本机慢、取样后被自动校时）会被整段计入，PR #129 的 Codex 审查复现了往前调一小时让 `expiresAfter` 晚一小时；往返不对称时那一半最多多算 1 秒，官方也不加。因此改为上述做法。
4. 取样按网络各一份，惰性进行：第一次 L1 动作前等待取样（最多 2 秒），之后样本超过 60 秒就在后台刷新、不阻塞动作。一次取样不可用的情形：失败、2 秒超时，或往返时间按墙钟与单调时钟分别计算、任一超过 2 秒（请求跨过了休眠或系统时间的改动）。之后按状态处理：还没有样本时用本机时间，并在 30 秒内不再重试，与官方收到快照前的做法相同；已有样本时不换成本机时间，继续按单调时间估计；两个时钟不一致时，每个动作都先重新取样，不受 30 秒间隔限制（第 3 条）。2026-10-31 修订：初版只写「2 秒内没有拿到可用的服务器时间时用本机时间，并在 30 秒内不再重试」，往返只按单调时钟算。
5. 交易所返回的 `Action already expired` 已有翻译规则（`exchange-error-text.ts`）：「The request expired before the exchange processed it. Try again.」，本次不改。
6. 与官方相同，设置的「Trading」组有「Transaction delay protection」开关，默认开启。官方存为 `hyperliquid.disable_expires_after`（2026-10-30 前端包：设置项 `transaction.delay.protection`，签名前 `disable_expires_after ? null : expiresAfter()`）；本终端存为全局设置 `transactionDelayProtection`（`hyperliquid.global_settings`，校验后读取，读不出时按开启处理）。客户端运行时加载时用 `setTransactionDelayProtectionReader` 把读取函数交给 `hl-react`，每个 L1 动作签名前读一次：关闭时 `defaultExpiresAfter` 返回 `undefined`，SDK 不写该字段，也不请求服务器时间。

## 备选方案

| 方案 | 取舍 |
| --- | --- |
| 只用本机时间（`Date.now() + 15000`） | 最简单；本机时钟慢超过 15 秒的设备上每个动作都会过期。未采用 |
| 像官方一样从账户快照取 `serverTime` | 本终端订阅的是 `clearinghouseState` / `allDexsClearinghouseState`，没有 `webData2`/`webData3` 的 `userState.serverTime`；从 WebSocket 帧里取时间要穿过 SDK 传输层，改动面更大。未采用 |
| 每个动作前都请求一次服务器时间 | 每个动作多一次往返，拥堵时正好拖慢下单。未采用 |
| 不提供关闭开关 | 实现最少；但连接长期很慢的用户无法像在官方终端那样关闭保护。初版如此，2026-10-30 按官方实践改为提供开关（决策第 6 条） |

## 后果与边界

- 网络或交易所拥堵超过 15 秒时，下单、撤单会被拒绝并提示过期，用户需要重试；这正是保护的目的。被拒的动作按 5 倍消耗地址限额。
- 关闭开关后，L1 动作不再过期：网络恢复后，之前排队的下单、撤单仍可能晚到上链，这与官方关闭保护后的行为相同。开关是全局设置，不分账户与网络。
- 取样后系统时间被改动，或设备休眠时单调时钟停走：下一个动作先等重新取样（通常 0.1–0.3 秒，最多 2 秒；碰上休眠前发出的请求时最多等两次）。取样失败时按单调时间估计，可能偏早；动作因此被拒为过期时会提示重试并按 5 倍消耗地址限额，下一个动作会再次取样。有了样本之后，系统时间的改动与休眠不会拉长 15 秒窗口；剩下的误差是两个时钟一起漂移的部分，样本每 60 秒刷新一次。还没有样本时用本机时间：本机快多少，窗口就长多少，与官方收到快照前相同。（2026-10-31 修订；初版写的是：本机时钟往前调、或设备在取样后休眠，估计的交易所时间会偏大，保护窗口相应变长，动作不会因此误判过期；往回调由单调时钟兜住。）
- 第一次 L1 动作最多多等 2 秒（通常约 0.1–0.3 秒）。
- 金库存取（`vaultTransfer`）、杠杆与保证金调整、ADR 0041 的 `agentSetAbstraction` 等 L1 动作同样带过期时间。
- `expiresAfter` 只约束签名之后的等待。签名之前的等待（排队、法律复核、锁）由 [ADR 0053](0053-exchange-action-start-deadline.md)（2026-11-12）另设 15 秒上限；本 ADR 的决策不变。

## 验证

- `apps/terminal/src/lib/tests/exchange-action-expiry.test.ts`：本机慢 60 秒时按交易所时间加 15 秒；取样后系统时间往回调一小时仍按单调时间计；服务器时间不可用时回落本机时间且 30 秒内不重试；2 秒超时；超过 2 秒才到的样本不用；超过 60 秒在后台刷新且不阻塞；真实 SDK 交易客户端的 `order` 与 `cancel` 请求体带 `expiresAfter`、只发一次 `exchangeStatus`；用户签名的 `approveBuilderFee` 不带 `expiresAfter`、不请求服务器时间。
- 变异：删去两处 `defaultExpiresAfter` 后，交易客户端的测试失败；已还原。
- 开关（决策第 6 条）：`exchange-action-expiry.test.ts` 关闭时请求不带 `expiresAfter`、第一个请求之前不查服务器时间，重新打开后恢复；`global-settings-store.test.ts` 默认开启、读不出的存值按开启、通过设置操作关闭后写入存储并在重新加载后保持；`global-settings-modal.test.tsx` 开关默认打开、关闭时写入 `false`、七种语言都有标签；`client-root-theme-lifecycle.test.tsx` 客户端运行时注册的读取函数跟随设置。变异：客户端忽略开关、运行时不注册、设置开关取反、不持久化、读回时忽略存值，各自让对应测试失败，均已还原。
- 2026-10-31 修订（决策第 3、4 条）：`exchange-action-expiry.test.ts` 新增取样后系统时间往前跳一小时不拉长过期时间、时钟不一致时先等新样本再签名、刚失败过仍立即重新取样、跨过休眠的回答被丢弃并在签名前重新取样、唤醒后的动作等到休眠前发出的请求时再取一次且共用这一次、两个请求都超时时共等约 4 秒后按单调时间估计、等到改动后发出的请求失败时不再多取、往回调系统时间也不采用超过 2 秒的回答、1 秒以内的墙钟漂移只按单调时间计；往回调一小时的用例改为先重新取样、失败后按单调时间；不再加往返时间的一半。十五个变异（估计改回取大、不等重新取样、受重试间隔限制、改为后台取样、容差为 0、容差极大、只看单向偏差、估计改用墙钟、加回往返的一半、往返只按单调时钟、往返只按墙钟、不再取第二次、任何失败后都取第二次、任何等到的请求都算改动前发出、请求结束后不清除发出时刻）都让测试失败；修订前的实现跑这组测试（当时 21 项）有 10 项失败。
- 未做：真实网络下的过期拒绝、真实钱包与真机验收。

## 2026-11-19 补记：nonce 基准、没有样本时的签名与 `nonce too low`

依据：运营方 2026-11-19 决定，需要决定的事项照官方终端的做法执行；官方前端做法与官方文档或本仓库既有契约冲突时，以文档和契约为准。官方终端的做法来自 2026-11-19 前端包静态阅读（`config-CRZoYvFZ.js` 的 `_8`、`v8`、`X3`、`Nle`），没有在界面上触发：nonce 以本机 `Date.now()` 为基准、进程内单调递增；`expiresAfter` 为 `webData3` 推来的 `userState.serverTime` 加本机流逝时间再加 15 秒，收到快照前 `serverTime` 就是本机时间；交易所回 `Invalid nonce: nonce too low` 时取错误里 `<` 之后的值加 100，再签名重发一次；不做跨标签页的 nonce 协调。

1. **nonce 基准保留「可靠的交易所估时，否则本机时间」，不改回官方的 `Date.now()`**。[Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets) 要求 nonce 落在区块时间 `T` 的 `(T - 2 days, T + 1 day)` 内，并建议「原子计数器，必要时快进到当前 Unix 毫秒」；[Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint) 各动作的 `nonce` 写「Recommended to use the current timestamp in milliseconds」，没有说取哪个时钟。本机时钟准确时两种基准相差毫秒级；本机时钟偏差超出窗口时，官方的做法每个动作都会被拒，交易所估时仍在窗口内。窗口按区块时间判定，所以以文档为准保留 `exchangeNow ?? Date.now()`（2026-11-19 `92371ee3`）。跨标签页锁、持久化下限与读回校验不变。
2. **没有样本时，签名前不为 nonce 专门取样**，这一点与官方一致。只有开着延迟保护的 L1 动作会在第一次签名前等一次取样（决策第 4 条，最多 2 秒），因为它的 `expiresAfter` 需要交易所时间；官方的 `serverTime` 来自一直订阅着的账户快照，几乎总是现成的，本终端的样本来自按需的 `exchangeStatus`，这一次等待是同一目的的对应做法，不取消。用户签名动作、关闭保护时的 L1 动作在没有样本时直接用本机时间签名，不请求服务器时间，与官方收到快照前相同。上一轮任务记录留下的「没有样本且记录异常时签名前主动取样」不采用。可选的后续（未做）：用本终端已经订阅的 `webData3` 的 `userState.serverTime` 补充样本，减少第一次 L1 动作的等待。
3. **`nonce too low` 不自动重发**，与官方不同。理由：
   - 官方没有跨标签页协调，它的重发是同一浏览器里两个标签页撞 nonce 的唯一兜底；本终端的 nonce 在跨标签页 Web Lock 内按持久化下限加 1 分配，同一浏览器里不会出现这种碰撞。剩下的来源是同一签名者在别处签了至少 100 个更高的 nonce（例如同一邮箱钱包在另一台设备上大量操作），对界面用户极少见。
   - 本终端的执行链要求每个签名都经过执行守卫、签名身份与会话租约核对、ADR 0053 的入队时限与签名器处检查、资产锁与待确认记录（例如 TWAP 终止的两次守卫计数、跟踪下单的 `requestStarted`）。自动重发必须在调度器的同一个条目里重走这些步骤、带新的 `expiresAfter`，并把交易所的下限写进跨标签页记录；任一步漏掉，就会出现用户只确认一次、却由身份或时限已不成立的状态签出第二个动作。为一个极少见的错误改动签名核心，风险大于收益。
   - 现在的结果：这次动作只发一次请求，调用方收到 SDK 的 `ApiRequestError`，提示按 ADR 0024 的规则处理（这段文本没有登记译文，读代码应原样显示交易所原文；各入口的通知分类没有逐个测试）；交易所拒绝即未执行，用户可以再点一次。下一次分配仍以交易所估时与持久化下限为准。
   - 与契约的关系：Wallet signing contract 要求 L1 动作只由无需确认的签名者签名、带 15 秒 `expiresAfter`；Operation feedback contract 要求通知报告用户实际请求的那次操作。不重发不与二者冲突；若将来要重发，只能限于 Agent 与嵌入式 owner 签名的 L1 动作，并满足上面每一条。
4. 验证：`exchange-action-expiry.test.ts` 新增两项，用真实 SDK 交易客户端与拦截 `fetch` 的夹具：没有样本时用户签名动作只发一次 `exchange`、不请求 `exchangeStatus`，nonce 为本机时间；交易所回 `Invalid nonce: nonce too low: … < …`（文本格式按官方前端的解析推断，官方文档没有列出）时调用方收到 `ApiRequestError`，只发出一次 `exchange` 请求。两项在当前实现上直接通过，钉的是这次的决定。变异：在客户端传输层加「遇到 nonce too low 再发一次」，第二项失败；在 nonce 管理器前加「没有样本先取样」，第一项与既有的休眠后用户签名一项失败；nonce 基准改回 `Date.now()`，`exchange-action-expiry` 与 `cross-tab-nonce-manager` 共 11 项失败。均已还原。没有运行：真实交易所对 nonce 窗口与 `nonce too low` 的回答、多设备、真实钱包。
