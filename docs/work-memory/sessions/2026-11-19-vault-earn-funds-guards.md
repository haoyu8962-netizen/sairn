<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-vault-earn-funds-guards",
  "date": "2026-11-19",
  "title": "Vault 锁内复核、Earn 全额判定与操作历史空结论、Vault 上限与 APR 展示",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "Codex 只读审查（Earn、Staking、Vaults）提出的五项在 79b268ea 上逐项复现后修复：Vault 在跨标签页资金锁内重读来源余额、账户模式、Vault 详情与权益后才签名（vaultTransfer 加入 TRADING_PRE_EXECUTION_GUARD_METHODS）；Earn 取出的全额意图改用未取整的存款与流动性、抵押额度比较；Earn 操作历史的空结论改用共享账本的 canConfirmEmpty；Vault 的最大可取额标签与 Max 同源（六位向下取整）；极小 APR 不再变成科学计数法而显示为未知。墙钟偏差一项只做评估，建议不套用 ADR 0022。Codex 的修复草稿因额度中断未完成，由 Claude 核对、改写并补测试。每项测试在修复前失败、修复后通过，六个变异都被测试拦下。没有真实钱包、真实下单或浏览器验收。",
  "thread": null,
  "baseCommit": "79b268ea",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/vaults/use-vault-action-controller.ts" },
    { "path": "packages/hl-react/src/hooks/useExchange.ts" },
    { "path": "apps/terminal/src/domain/earn.ts" },
    { "path": "apps/terminal/src/hooks/earn/use-earn-data.ts" },
    { "path": "apps/terminal/src/components/earn/earn-view.tsx" },
    { "path": "apps/terminal/src/components/vaults/domain/vaults.ts" },
    { "path": "docs/adr/0021-earn-borrow-lend-page.md" },
    { "path": "docs/adr/0022-subscription-staleness-monotonic-clock.md" },
    { "path": "docs/earn.md" },
    { "path": "docs/mobile-data-presentation.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/for-vault-depositors-legacy" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/protocol-vaults" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/borrowlend" }
  ],
  "supersedes": []
}
-->
# Vault 锁内复核、Earn 全额判定与操作历史空结论、Vault 上限与 APR 展示

## 背景与范围

同步记录，2026-11-19，未取得任务标识。来源是 Codex 对 Earn、Staking 与 Vaults 的只读缺陷审查（基线 `79b268ea`）。本任务处理其中第 2、3、6、8、9 项，第 7 项只评估；其余各项（Staking 的账户串线、草稿重绑、微量 HYPE）由其他任务处理。

Codex 按同一份说明写过修复草稿，但在额度用完时中断，没有报告，草稿处于中间状态：第 2 项没有动手，第 6 项把空结论接到了 `ledger.status === "ready"`（与原缺陷等价，没有修好），Earn 弹窗测试为一条历史用例改写了整个文件的 mock。Claude 把草稿当参考，逐项复现、改写并补齐测试。改动只涉及 Vault、Earn 文件，以及 `useExchange` 白名单里的一行。

## 结论与依据

1. **Vault 锁内复核（成立）。** 原先 Vault 在 `mutateAsync` 之前读余额、账户模式、详情与权益；排队等到跨标签页资金锁时，另一个标签页刚完成的 Earn 存入或模式变更都看不到，只能靠交易所拒绝。`useExchange` 只允许白名单里的交易签名方法使用锁内守卫，所以修法是把 `vaultTransfer` 加入 `TRADING_PRE_EXECUTION_GUARD_METHODS`（与 ADR 0021 D12、ADR 0041 的做法相同），并给 Vault 传 `preExecutionGuard`：在锁内用守卫的中止信号直接请求 info 接口，存入读 `vaultDetails`、`clearinghouseState`、`userAbstraction`、`spotClearinghouseState`，取出读 `vaultDetails`、`userVaultEquities`，再用同一个 `verifyVaultActionPreflight` 和标记里的原子金额复核。守卫失败时 SDK 未被调用，标记删除，结果为 `apiError`，提示复用已有文案。锁外预检保留，因为对账基线来自它。Vault 在 Agent-only 会话里本来就禁用，守卫在该租约上会被拒绝的限制不影响它。
2. **Earn 全额判定（成立，生产触发范围待证实）。** 原判定把存款与 Max 都向下取整到 `weiDecimals` 再比较。手算（Big.js，`weiDecimals = 6`）：存款 `1.0000009`、池流动性 `1.0000001`；Max = floor(min(1.0000009, 1.0000001), 6) = `1.000000`，显示 `1.00`；全额量 = round(1.0000009, 6, down) = `1.000000`；`1.00 ≥ 1.000000` 成立，于是记为全额意图并发送 `amount: null`，但真实存款比流动性多 `0.0000008`（不到一个原子单位）。ADR 0021 D2 只允许在没有流动性或抵押限制时发送 `null`。修法：存款直接与 `reserveBalance` 比较；抵押品用乘法核对 `supplied × oraclePx × ltv ≤ availableToBorrowUsd`，不做除法。修复后这种情形回到精确数量，剩余不足 $1 时由已有的最小仓位校验挡住提交。交易所收到超出流动性的 `null` 时是拒绝还是部分执行，没有找到官方依据（官方文档没有 `borrowLend` 动作；SDK 只写「null = full」）；`supply.value` 与储备池 `balance` 是否会带超过 `weiDecimals` 的位数，也没有官方依据，2026-09-27 的 Earn 记录曾把它列为保留限制。
3. **Earn 操作历史空结论（成立）。** 共享账本在一次成功快照后刷新失败时仍返回 `status: "ready"`，同时 `canConfirmEmpty: false`；Earn 只看前者，所以会显示 `No earn actions yet`。修法是 `EarnData` 新增 `canConfirmEmptyHistory`，取 `ledger.canConfirmEmpty`，`HistoryTable` 只在它为真且没有行时显示空结论；保留的行照常显示（移动端数据展示规范：失败或刷新中的快照不下空结论）。
4. **Vault 最大可取额标签（成立）。** `maxWithdrawable = 9.999999` 时标签按两位小数四舍五入显示 `$10.00`，Max 填 `9.999999`。新增 `getVaultMaxAmount`（Max 与标签共用，六位向下取整、至少两位小数）与 `formatVaultWithdrawalLimit`（经 `formatDecimalString` 只换分隔符），详情页与弹窗提示都改用它。存入弹窗的「Verified wallet balance」有同类四舍五入，没有在本次范围内改。
5. **极小 APR（成立）。** `Big(String(1e-7)).toString()` 得到 `1e-7`，格式化器的十进制校验不认，显示 `--`。改为 `toPlainDecimal`（内部 `toFixed()`），列表与详情同一路径；零、正负极小值都按正常舍入显示。
6. **墙钟偏差（评估，不改）。** Vault 取出与 Staking 解除委托的锁定判断把服务器给的绝对时间戳与 `Date.now()` 比较，设备时钟偏快会提前显示可取、通过本地预检，最终由交易所判定；偏慢会推迟。ADR 0022 解决的是「接收后经过多久」的相对年龄，单调时钟给不出绝对时间，所以不适用。可选做法是 ADR 0045 已有的交易所时钟估计（`server-clock.ts` 的 `estimateNow()`），取它与墙钟中较早者作为「现在」，估计不可用时回退墙钟；这会改 hl-react 的导出面与两处页面，属于 P3，留给运营方决定。官方文档只给出锁定期（普通 Vault 1 天、HLP 4 天，从最近一次存入起算），没有说明提前提交时的错误。

## 验证与限制

- 复现（实际运行）：把源码改动反向应用、保留新测试，在 `79b268ea` 的源码上 Earn 三个文件 6 条用例失败、Vault 与 `useExchange` 五个文件 11 条用例失败；重新应用后全部通过。
- 变异（实际运行，各自只跑相关测试）：去掉 Vault 的 `preExecutionGuard`（5 条失败）、白名单去掉 `vaultTransfer`（1 条失败）、Earn 全额改回比较取整后的存款（2 条失败）、空结论改回 `ledger.status === "ready"`（1 条失败）、上限标签改回 `formatVaultUsd`（3 条失败）、APR 改回 `toString()`（2 条失败）。每次改回后文件复原。
- 相关测试（实际运行）：Earn、Vault、资金动作、账本、`useExchange` 锁与白名单，以及小数显示、数字格式响应、日期语言、移动端数据展示、i18n、目录完整性、圆角、设计令牌等契约，共 44 个文件 1189 条通过。`pnpm --filter @sairn/terminal typecheck` 与 `pnpm --filter @sairn/hl-react typecheck` 通过；改动文件 `biome check --write` 无改动。
- Vault 控制器测试里的 `useExchange` 是替身：它在两次 `executionGuard` 之间调用 `preExecutionGuard`，不含真实资金锁；锁内顺序由 `use-exchange-funds-action-lock.test.tsx` 新增的一条用真实 `useExchange` 与模拟独占锁的用例覆盖。多标签页的真实浏览器行为、info 接口在交易所返回后是否立即一致，都没有验证。
- 没有新增可翻译文案；没有真实钱包、签名、下单或浏览器验收。

## 后续与替代关系

- 文档待主会话更新：ADR 0021 D12「新增白名单 `TRADING_PRE_EXECUTION_GUARD_METHODS`，目前只有 `borrowLend`」与 `docs/hyperliquid-sdk-reference.md` 第 56 行「currently `borrowLend`」需改为 `agentSetAbstraction`、`borrowLend`、`vaultTransfer`；ADR 0021 D12 中「本 PR 之前已有的交易签名资金动作（`vaultTransfer`、…）同样在锁内排队并做联网的法律校验」需注明 Vault 现在也有锁内守卫；`CHANGELOG.md` 的 Unreleased 需记录五项用户可见的变化。
- 第 7 项是否改用交易所时钟估计，待运营方决定。存入弹窗余额标签的四舍五入可另行对齐。
- 不替代任何记录；补充 2026-09-27 Earn 记录里「全额判定按向下取整比较」的保留限制。
