<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-17-mobile-presentation-pending-fixes",
  "date": "2026-11-17",
  "title": "修复手机数据展示规范「待处理」里只涉及展示的一组",
  "kind": "task",
  "status": "recorded",
  "topics": ["market-recovery", "pr-review"],
  "summary": "登记式契约建好后留下 18 个 pending 文件。这次修掉其中只涉及展示的 11 个：改单抽屉的提示、红框与 aria-invalid 共用一份不含被动原因的可展示结果；手机委托历史、资金费页签与三个历史页的筛选无匹配只在快照当前时下结论；两个手机 TWAP 列表的空结论要求 hook 新增的 canConfirmEmpty；订单簿分栏视图的空侧在过渡期间用占位行；两个平仓弹窗删掉不可达的加载变体。执行守卫没有改动。每项有渲染真实组件的行为测试，34 个新用例在修复前失败。同机同条件的协议构建全部预算通过，trade-terminal-page 比基线少 20 字节，没有改基线。剩下 7 个文件属于会话解析与地区未解析一组，另行处理。PR #10 的 CI 随后发现两个平仓弹窗的圆角例外登记没有跟着 class 字符串更新，补了一个只改契约的提交。随后的独立评审没有发现被削弱的守卫，提出四点：契约在「待处理」清空后会失败、TWAP 空结论没有离线条件、登记表对点按 Modify Order 的答复说得不对、空的 TWAP 列表出错后没有重试入口；前三点已改，第四点记为后续。没有做真机或浏览器验收。",
  "thread": null,
  "baseCommit": "75b18fc0",
  "commits": ["8057f6fc", "f0755f76"],
  "sources": [
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "docs/work-memory/sessions/2026-11-17-mobile-presentation-contract-registry.md" },
    { "path": "apps/terminal/src/lib/tests/mobile-data-presentation-registry.ts" },
    { "path": "apps/terminal/src/lib/tests/mobile-data-presentation-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/dialog-notice-radius-contract.test.ts" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/pull/10" },
    { "path": "apps/terminal/src/domain/trade/open-order-modification-form.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-twap-history.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-twap-slice-fills.ts" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "docs/twap-regression-tests.md" }
  ],
  "supersedes": []
}
-->
# 修复手机数据展示规范「待处理」里只涉及展示的一组

## 背景与范围

同步记录，2026-11-17，未取得任务标识。任务来自编排会话：[登记式契约](2026-11-17-mobile-presentation-contract-registry.md)留下 18 个 `pending` 文件，要求把其中只涉及展示的一组在一个分支里修掉，每项写一个渲染真实组件、修复前会失败的行为测试，更新登记表、规范的「待处理」与 `CHANGELOG.md`，按复现规则构建并报告全部预算，本地提交，不推送。

范围是 11 个组件文件，加上两个 TWAP hook 与改单计划的一个纯函数。界面分不清「会话解析中」与「未连接」的一组（发送、划转、逐仓保证金、仓位 TP/SL 弹窗，桌面充值提现页签，手机下单按钮）和账户页的地区未解析不在范围内，由另一个会话处理。

分支 `fix/mobile-presentation-pending-notices`，基线 `main` `75b18fc0`（登记式契约的合并提交）。工作开始时它还没有合并，分支先建在 `6c45e83a` 上；两者的树相同，提交前快进到了 `75b18fc0`。

## 结论与依据

规则都是[移动端数据提示规范](../../mobile-data-presentation.md)里已有的：空结论与筛选无匹配要求完整、当前、成功的快照；被动数据状态不进表单错误；红框、文字与 `aria-invalid` 用同一份可展示结果。这次没有新增提示类别。现行做法写在规范的「受约束的入口」。

### 逐项

- **改单抽屉**（`mobile-orders-tab.tsx`）：新增纯函数 `getDisplayableOpenOrderModifyBlock`（`domain/trade/open-order-modification-form.ts`）。提示文字与出错字段都取自它的结果。它不返回 `no-change`、`snapshot-not-ready`、`mark-price-unavailable`，也不返回市场目录加载中或失败时的 `market-binding-changed`。确认按钮的禁用条件 `isModifyConfirmDisabled` 与 `handleConfirmModify`、`assertModifyExecution` 仍读原始计划，没有改动。提交后被守卫拒绝时显示的原因来自另一条路径（`modifyValidationError`），原文保留。
- **手机委托历史与资金费页签**：新增 `isSnapshotCurrent`（`status` 为 `ready`、无错误、未离线、未过期）。筛选无匹配的句子只在它成立时显示，否则是 `DataPendingState`。读屏专用的表头数值按同一条件给数值，否则是占位符。资金费合计是任务点名的；委托条数没有点名，但它在同一种状态下会播报「0 orders」，与空白忙碌区域矛盾，所以一并处理。
  - 取舍：表头数值在快照不当前时一律是占位符，即使列表里还显示着保留的记录。更窄的做法是只在筛选结果为空时换成占位符。选前者是因为任务写的是「合计遵循同一规则」，而且条件只有一个。代价是重连期间读屏会听到一次占位符。
  - 这两个订阅是事件驱动的（`userHistoricalOrders`、`userFundings` 在 `NON_PERIODIC_METHODS` 里），没有按时间判定的过期，`isStale` 只在重连等待新帧时为真，所以正常情况下无匹配的句子不会被长期压住。这一点读的是 `packages/hl-react/src/internal/websocket/reliability.ts`。
- **手机 TWAP 历史与成交列表**：两个 hook 新增只用于展示的 `canConfirmEmpty`，条件见规范。列表原先的 `isRealtimeDegraded && 空` 判断并入 `空 && !canConfirmEmpty`，前者是后者的特例。命名沿用 `useAccountLedger().canConfirmEmpty`。
- **订单簿分栏视图**（`mobile-book-view.tsx`）：过渡期间（有快照、没有实时帧）空的一侧走已有的「行加占位行」分支，此时没有行，只剩占位行。没有新增组件。顺带删掉 `OrderbookEmptySide` 从未被传入的 `compact` 参数，理由见下文的包体。
- **三个历史页**：`isSnapshotUnconfirmed`（有错误、离线或刷新中）成立时，筛选无匹配的位置换成 `HistoryPageUnavailable`，与页面没有任何记录时用的是同一个元素与同一组读屏说明。
- **两个平仓弹窗**：提示框只在 `visibleError` 非空时渲染，而仓位加载时 `visibleError` 恒为空，所以 `userPositions.isLoading` 的三处分支（`role="status"`、`aria-live="polite"`、转圈）到不了。删除后提示框固定为 `role="alert"`。`status-motion-surface-contract.test.ts` 的两条转圈登记移到「已退役」清单。

### 登记表

11 个文件的 `pending` 登记删除，对应文案改标为 `confirmed-empty`、`confirmed-change` 或 `action-feedback`，理由改写为现在的条件。只有两个平仓弹窗的计数变了（各少一个 `role="status"`）；其余 9 个文件的计数不变，上一条记录已经说明这类登记要随修复手工删除。规范「待处理」的表格删掉对应的 11 行，余 7 行，契约的双向检查通过。

### 包体

同机、同条件的两次协议构建（没有 `.env.local`，配对关，固定构建身份，Node 22.15.0），基线 `6c45e83a`，全部预算通过，没有改任何基线或余量：

| 项目 | 基线 | 修复后 | 变化 | 余量 |
| --- | ---: | ---: | ---: | ---: |
| 全部客户端 JS + CSS | 3,391,705 | 3,391,729 | +24 | 6,334 |
| 交易静态启动 | 1,662,902 | 1,663,076 | +174 | 1,795 |
| 手机运行时增量 | 119,743 | 119,745 | +2 | 835 |
| 桌面运行时增量 | 204,705 | 204,683 | −22 | 8,000 |
| `trade-terminal-page` | 128,565 | 128,545 | −20 | 370 |
| `fundingHistory._address` | 6,844 | 6,941 | +97 | 1,379 |
| `tradeHistory._address` | 7,372 | 7,469 | +97 | 2,404 |
| `historicalOrders._address` | 8,138 | 8,238 | +100 | 1,425 |
| `vaults-page` | 30,636 | 30,631 | −5 | 249 |
| `token-selector-popup` | 15,384 | 15,388 | +4 | 467 |

其余命名面的读数与完整表格在[性能基线](../../terminal-performance-baseline.md)的 2026-11-17 一节。

- `trade-terminal-page` 里只有 `mobile-book-view.tsx` 一个模块有改动。第一版修法给空侧组件加了第二个分支，读数 128,623（+58）；按发布配置比协议构建高约 156 字节估算，下一次发布预检会剩不到 200 字节。因此改成复用已有的行梯分支，并删掉那个没有用到的参数，读数降到 128,545。
- 今天的基线构建比[性能基线](../../terminal-performance-baseline.md)记录的 `cdf3a8f6` 协议构建高（总量 3,391,705 对 3,390,984，`trade-terminal-page` 128,565 对 128,557），而客户端代码相同。原因没有查。上表只比较今天的两次构建。

## 验证与限制

工作树基线 `75b18fc0`，Node 22.15.0，pnpm 10.21.0，2026-11-17。

- **修复前失败**：把 11 个组件文件还原到基线、保留测试与登记表，运行新增与改动的 11 个测试文件：34 个用例失败（9 个文件），恢复修复后全部通过。失败的用例覆盖前五项的每一种被动状态，以及两个平仓弹窗的登记表计数与转圈登记。
  - 两个平仓弹窗的行为断言（加载时没有 `role="status"`、`role="alert"` 与转圈）在修复前也通过，因为被删的分支本来就到不了。它们钉住的是现状，不是这次改动。
  - 两个 TWAP 列表各有一种情形（订阅失败）在修复前也通过，原有的 `isRealtimeDegraded` 已经覆盖它。
- **回归组**：`AGENTS.md` 的 Mobile data presentation、Order book、Confirmation surfaces 三组，加上规范「回归入口」的清单，去重后 122 个测试文件一次运行：2,848 项通过，1 项失败。失败的是 `status-motion-surface-contract.test.ts` 的「keeps every remaining spinner on the reviewed list with its count」，原因是 5 秒超时：它用语法树扫描全部源码，当时这台机器的负载约为 42。把时限放到 60 秒单独重跑，该文件 17 项全部通过，这一项用时 5.9 秒。这次改动只删了它的两条登记，没有改它的扫描方式。
- **类型与格式**：`pnpm --filter @sairn/terminal typecheck` 退出码 0（工作树里临时放了图表库，未入库）；`pnpm exec biome check` 对整个仓库 1,778 个文件无改动；`git diff --check` 无输出。
- **记录工具**：`pnpm memory:check` 与 `pnpm memory:test` 通过。
- **机器负载**：这台机器同时有其它会话在跑构建与测试。除上面那一项外，开发过程中还遇到过两次 5 秒超时，重跑都通过：`mobile-history-cards.test.tsx` 的一个既有用例（「filters order history by SDK order type…」，5.8 秒），以及同一文件里这次新增的「keeps the order filter result blank while the retained history is stale」（5.1 秒，正常约 0.2 秒）。没有为此调整任何时限。

限制：

- 行为测试在 jsdom 里渲染真实组件，替换的是 hook 或传输层，不是真实浏览器、真实订阅或真实钱包。没有做手机真机或浏览器里的目视检查，也没有跑浏览器回归套件。
- 「市场目录加载中或失败」「订阅在等新帧」这些状态由测试直接构造，没有在真实网络下观察。
- 没有构建配对开启与发布配置；发布配置下的余量是按 p42 之前的差值估算的。
- 提交 `8057f6fc` 之前没有跑全量终端单测，只跑了上面三组。这个缺口让下一小节的失败留到了 CI。
- 没有跑 Codex 推送前审查：上一条记录写明 CLI 额度到 2026-11-20 才恢复。

### PR #10 的 CI 失败与补修（同日补记）

经运营方同意，`8057f6fc` 推送并开了 [PR #10](https://github.com/haoyu8962-netizen/sairn/pull/10)。它的 CI 有一项失败：「Test terminal and release tooling (1/2)」里 `dialog-notice-radius-contract.test.ts` 的两个用例，都指向 `position-limit-close-modal.tsx`。

- **原因**：这份契约把「圆角还不是 `rounded-16` 的弹窗提示」按 class 字符串登记为待定例外。删掉加载变体后，两个平仓弹窗提示框的 class 从 `cn()` 的两段变成了一个字符串，登记的片段（含已删除的 `text-fg-muted`）不再匹配。提示框的 class 集合与原来的非加载分支相同，渲染没有变，4px 圆角仍是待定的设计决定。
- **市价平仓弹窗为什么没报**：它有同样的问题。两个用例都在循环里断言，遇到第一个失败就停，限价平仓排在前面。本地只改限价那一条后重跑，失败的就换成了市价平仓。
- **补修**：两条例外的 `contains` 改为新的 class 片段，组件没有改。
- **为什么本地没发现**：改的是弹窗的 class，却只跑了数据展示、订单簿与确认面三组，没有跑 `AGENTS.md` 的 Trading terminal visual contract 组，也没有跑全量。改动 class 字符串时，按字符串登记的契约都可能受影响，应当跑全量或至少加上视觉契约组。

补修后的验证（同一工作树，机器负载仍在 26 到 40 之间）：

- `dialog-notice-radius-contract.test.ts` 3 项通过；视觉契约组 16 个文件 418 项通过。
- 全量 `pnpm --filter @sairn/terminal test`：738 个文件，727 通过、10 失败、1 跳过；10,618 项通过、53 项失败、1 项跳过，用时 816 秒。失败里有 15 处是超时（13 处 5 秒、1 处 15 秒、1 处钩子 10 秒），其余是同一文件里超时之后的连带失败。把这 10 个文件单独重跑：10 个文件 201 项全部通过，用时 11 秒。其中 8 个文件这次没有碰过；`status-motion-surface-contract.test.ts` 是上面记过的源码扫描超时；`mobile-order-modification.test.tsx` 失败的是既有的第一个用例（5 秒超时）。
- 同一提交在 CI 上的全量结果是另一份证据：第一片只有上述两项失败（5,528 项通过），第二片通过。
- `pnpm --filter @sairn/terminal typecheck` 无报错；Biome 对改动的文件无改动。
- 查看了一次 PR #10 的检查：两次构建、静态检查、单测第二片、浏览器回归第二片通过；单测第一片失败（即上面两项）；浏览器回归第一片当时还在运行。

补修提交只在本地，没有推送：运营方的同意只覆盖一次推送和开 PR。

### 独立评审后的修改（同日补记）

编排会话转来一轮独立评审（两个提交，`origin/main..HEAD`）。评审确认改单抽屉的改动只涉及展示、两个平仓弹窗在可达状态下渲染不变、其余几处在当前成功的快照上仍显示空结论；没有发现被削弱的守卫。它提出四点，处理如下。

1. **契约在「待处理」清空后会失败**（契约自身的缺陷）。「lists every pending presentation in the policy」原先断言表格至少有一行。这个分支留下 7 行，钱包会话分支会删掉这 7 行，两者都合入后 `main` 上的断言就会失败。改为：按表头定位「待处理」的表格，缺少这一节或表头时失败；行与 `pending` 登记逐文件相等，两边可以同时为空；一文件一行的检查保留。读表函数另有一个夹具测试，覆盖有行、空表、重复行、缺表头、缺小节，以及表格之后的内容不被读入。对真实文档做了三个变异（去掉表头、删一行、重复一行），该用例都失败。
2. **TWAP 的 `canConfirmEmpty` 没有离线条件**（评审核实，属实）。`userTwapHistory` 与 `userTwapSliceFills` 不在 `packages/hl-react/src/store.ts` 的 `FRESH_SNAPSHOT_METHODS` 里，也没有按时间判定的过期，断线不会把它们标为过期；已经结束的请求在离线后仍是 `idle`。所以离线的手机上两个列表还会显示空结论。两个 hook 加上 `useOnlineStatus()`。订阅存储的传输状态没有加：hl-react 只通过 `useApiStatus` 间接公开它，而那个 hook 还带一个每 60 秒的 HTTP 探测，不适合放进这里。系统报告在线、只是套接字断开的那几秒仍是缺口，见后续。
3. **登记表对点按「Modify Order」的答复说得不对**（属实）。上一版把「Market metadata changed. Refresh and try again.」标成「已确认的对象变化」，但市场目录加载中或失败时点按 Modify Order，页签顶部也会给出这句话。这次改了这条路径：目录没有就绪时该按钮保留名称并禁用，`handleRequestModify` 也直接返回，不再给这句答复；目录已加载而绑定不了这个市场时照旧答复。登记理由按现在的条件改写。这条取代了上一版写在「后续」里的同名事项。
4. **空的手机 TWAP 列表在后台刷新失败后没有重试入口**（可选项，没有做）。规范允许空白占位；[TWAP 回归文档](../../twap-regression-tests.md)的状态表原本就写明手机在这类状态下是安静占位、只有桌面有中性「Retry」。给手机加重试入口会改动那张表定下的做法，还要给两个 hook 增加「刷新失败」的输出，适合与桌面 TWAP 表改用 `canConfirmEmpty` 一起做。记为后续，状态表里补了一句说明。

这一轮的验证：

- 修复前失败：把三个源文件还原到 `f0755f76`，新用例有 5 项失败（两个列表的离线用例、hook 的离线用例、Modify Order 禁用的两个用例），恢复后通过。「目录已加载而没有这个市场时点按才答复」是对照用例，前后都通过。
- 全部契约文件（`apps/terminal/src/lib/tests` 下文件名含 `contract` 的测试）：54 个文件 1,141 项通过。
- 这个分支改过或受影响的 16 个测试文件：452 项通过。
- `pnpm --filter @sairn/terminal typecheck` 退出码 0；`pnpm exec biome check` 对整个仓库 1,778 个文件无改动；`git diff --check` 无输出。
- 协议构建重跑（配置同上：没有 `.env.local`，配对关，固定构建身份，Node 22.15.0，`NITRO_PRESET=node-server`），全部预算通过，没有改基线。基线仍是当天早些时候构建的 `6c45e83a`：

| 项目 | 基线 | 评审修改后 | 变化 | 余量 |
| --- | ---: | ---: | ---: | ---: |
| 全部客户端 JS + CSS | 3,391,705 | 3,391,450 | −255 | 6,613 |
| 交易静态启动 | 1,662,902 | 1,662,999 | +97 | 1,872 |
| 手机运行时增量 | 119,743 | 119,732 | −11 | 848 |
| 桌面运行时增量 | 204,705 | 204,641 | −64 | 8,042 |
| `trade-terminal-page` | 128,565 | 128,532 | −33 | 383 |
| `token-selector-popup` | 15,384 | 15,379 | −5 | 476 |
| `api-wallet` | 18,414 | 18,415 | +1 | 1,552 |
| `fundingHistory._address` | 6,844 | 6,943 | +99 | 1,377 |
| `tradeHistory._address` | 7,372 | 7,468 | +96 | 2,405 |
| `historicalOrders._address` | 8,138 | 8,234 | +96 | 1,429 |
| `leaderboard` | 12,060 | 12,059 | −1 | 1,524 |
| `staking` | 24,455 | 24,454 | −1 | 1,177 |
| `vaults-page` | 30,636 | 30,632 | −4 | 248 |
| `fundingComparison` | 10,526 | 10,521 | −5 | 2,112 |
| `funding-history-panel` | 9,389 | 9,381 | −8 | 780 |

  这次只往 `use-account-abstraction-control` 块里加了代码，汇总读数却比上一次构建低（总量低 279，静态启动低 77）。块文件名里的哈希变了，其它块引用它们的字符串随之变化，压缩结果跟着波动；所以两次构建之间这个量级的差值不能当作改动的大小，上文「包体」一节的表格是上一次构建的读数，以这里为准。
- 全量 `pnpm --filter @sairn/terminal test` 又跑了一次（开始时负载约 17，结束时约 35）：738 个文件，734 通过、3 失败、1 跳过；10,671 项通过、3 项失败、7 项跳过，用时 512 秒。3 处失败都是超时（`positions-panel-preload.test.ts` 的 30 秒钩子、`chart-store.test.ts` 的 10 秒钩子及其连带的一项、`mobile-fill-filter-backfill.test.tsx` 的一个 5 秒用例），这三个文件这个分支都没有碰过。单独重跑：3 个文件 31 项全部通过。本机到现在还没有一次不带超时的全量通过。
- 没有重新跑浏览器回归；PR #10 上 `8057f6fc` 的两片浏览器回归已通过（编排会话转述），之后的两个本地提交没有经过 CI。

## 后续与替代关系

本记录不取代其他记录。

- 规范「待处理」余下 7 个文件，由另一个会话按会话解析与地区未解析一组处理。
- 这次读代码时看到、没有改的同类行为，都在受检范围之外：
  - 桌面的两张 TWAP 表（`twap-history-table.tsx`、`twap-fill-history-table.tsx`）空结论仍只要求存在 REST 快照且实时流没有降级，可以改用同一个 `canConfirmEmpty`。
  - 桌面账户表格的委托历史页签（`orders-history-tab.tsx`）筛选无匹配不检查错误、离线与过期。
  - 桌面订单簿（`orderbook-panel.tsx`）也有空侧文字，没有核对它在过渡期间的条件。
- 手机 TWAP 历史与成交列表为空、且请求或订阅出错时没有重试入口（评审第 4 点）。离开子视图再回来会重新请求；要不要给手机加中性「Retry」，与桌面 TWAP 表一起定。
- TWAP 的 `canConfirmEmpty` 没有读订阅存储的传输状态。要补上，需要 hl-react 单独公开 `transportStatus`，或者把这两个订阅加进 `FRESH_SNAPSHOT_METHODS`；后者会改变它们在断线后的过期行为，影响面要先看。
- 手机委托历史与资金费的筛选仍只在各自最近 30 条里查找，没有像成交历史那样补拉，规范里原有的这条差距不变。
