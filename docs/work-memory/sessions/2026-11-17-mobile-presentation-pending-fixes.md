<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-17-mobile-presentation-pending-fixes",
  "date": "2026-11-17",
  "title": "修复手机数据展示规范「待处理」里只涉及展示的一组",
  "kind": "task",
  "status": "recorded",
  "topics": ["market-recovery", "pr-review"],
  "summary": "登记式契约建好后留下 18 个 pending 文件。这次修掉其中只涉及展示的 11 个：改单抽屉的提示、红框与 aria-invalid 共用一份不含被动原因的可展示结果；手机委托历史、资金费页签与三个历史页的筛选无匹配只在快照当前时下结论；两个手机 TWAP 列表的空结论要求 hook 新增的 canConfirmEmpty；订单簿分栏视图的空侧在过渡期间用占位行；两个平仓弹窗删掉不可达的加载变体。执行守卫没有改动。每项有渲染真实组件的行为测试，34 个新用例在修复前失败。同机同条件的协议构建全部预算通过，trade-terminal-page 比基线少 20 字节，没有改基线。剩下 7 个文件属于会话解析与地区未解析一组，另行处理。没有做真机或浏览器验收。",
  "thread": null,
  "baseCommit": "75b18fc0",
  "commits": [],
  "sources": [
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "docs/work-memory/sessions/2026-11-17-mobile-presentation-contract-registry.md" },
    { "path": "apps/terminal/src/lib/tests/mobile-data-presentation-registry.ts" },
    { "path": "apps/terminal/src/lib/tests/mobile-data-presentation-contract.test.ts" },
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
- 没有跑全量终端单测。
- 没有跑 Codex 推送前审查：上一条记录写明 CLI 额度到 2026-11-20 才恢复。

## 后续与替代关系

本记录不取代其他记录。

- 规范「待处理」余下 7 个文件，由另一个会话按会话解析与地区未解析一组处理。
- 这次读代码时看到、没有改的同类行为，都在受检范围之外：
  - 桌面的两张 TWAP 表（`twap-history-table.tsx`、`twap-fill-history-table.tsx`）空结论仍只要求存在 REST 快照且实时流没有降级，可以改用同一个 `canConfirmEmpty`。
  - 桌面账户表格的委托历史页签（`orders-history-tab.tsx`）筛选无匹配不检查错误、离线与过期。
  - 桌面订单簿（`orderbook-panel.tsx`）也有空侧文字，没有核对它在过渡期间的条件。
- 手机当前委托页签里，点「Modify Order」时如果解析不出市场（包括市场目录加载中或失败），页签顶部会回答「Market metadata changed. Refresh and try again.」。这是对一次点击的答复，登记表按既有口径归为操作反馈；但目录只是在加载时，这句话的说法并不准确。更合适的做法是这时禁用该按钮，这次没有改。
- 手机委托历史与资金费的筛选仍只在各自最近 30 条里查找，没有像成交历史那样补拉，规范里原有的这条差距不变。
