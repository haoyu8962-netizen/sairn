<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-funds-prechecks",
  "date": "2026-11-19",
  "title": "资金弹层：Send 签名前复核目的地址、零地址、交易所回执、存款地区查询占锁、自动存款到期复查与金额精度",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "hyperliquid-api", "pr-review"],
  "summary": "资金弹层审查（h1）第 2、3、4、5、7、8 项全部成立并已修：Send 在资金锁内签名前重问 preTransferCheck，制裁、激活费变化或用户未见过的损失警告都不发送，缺 userExists 的回答视为不可用；Send 与邮箱提款拒绝零地址；sendAsset、spotSend、usdSend、usdClassTransfer、withdraw3、sendToEvmWithData 只有文档规定的 status ok / type default 回执算成功，其余回答按结果不明处理；存款在锁内的地区查询加 15 秒期限，离线暂停不再占锁；自动存款自己的无哈希失败在授权过期后一秒复查；提款最低额向上取到两位小数，Max 标签与 Send/划转成功通知显示精确十进制。没有 Codex 草稿，Claude 独立实现。本地 Vitest（新测试在旧代码上失败、修复后通过，九处变异均被抓到）、两个包的类型检查与 Biome 已运行；真实钱包、真实交易所回执、真实离线场景未验证。",
  "thread": null,
  "baseCommit": "dc9f01fc7cdb9581d05441b2508c7d03b79d4217",
  "commits": ["96e709b8"],
  "sources": [
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/withdrawals.md" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "docs/hyperliquid-sdk-reference.md" },
    { "path": "apps/terminal/src/components/trade/positions/send-modal.tsx" },
    { "path": "apps/terminal/src/domain/trade/send-destination.ts" },
    { "path": "apps/terminal/src/domain/trade/funds-destination-address.ts" },
    { "path": "packages/hl-react/src/internal/exchange/action-acknowledgement.ts" },
    { "path": "apps/terminal/src/domain/trade/funds-action-availability.ts" },
    { "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx" },
    { "path": "apps/terminal/src/lib/trade/withdrawal.ts" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/activation-gas-fee" }
  ],
  "supersedes": []
}
-->
# 资金弹层：Send 签名前复核目的地址、零地址、交易所回执、存款地区查询占锁、自动存款到期复查与金额精度

## 背景与范围

同步记录。来源是 Codex 对资金弹层的只读审查（h1，审查基准 79b268ea），本任务处理其中第 2、3、4、5、7、8 项。第 1、6 项（外部钱包存款无哈希防重签、加速/取消后的跟踪）已在本分支基线 dc9f01fc 修好，见 [外部钱包存款记录](2026-11-19-external-wallet-deposit-recovery.md)；本任务改动与它兼容，没有改它的广播与跟踪逻辑。Codex 本次没有留下草稿，实现、复现与裁定均由 Claude 完成。会话标识未取得（`thread: null`）。

另一个代理同日读了官方终端前端包（报告在本地 scratchpad，未入库）：官方对 TWAP 等动作只在 `status === "ok"` 时报成功、`err` 时报错，其他回答两样都不报；地区只在点击前门控，签名路径不再检查；本记录引用它时标为「官方取证报告（只读代码推断）」。

## 结论与依据

- **第 3 项 Send 沿用旧预检（成立）。** `handleSendClick` 点击时问一次 `preTransferCheck`，之后停在确认页或排队等资金锁期间不再复核；`getSendDestinationVerdict` 不检查 SDK 类型里的 `userExists`。修法：Send 的两个 `preExecutionGuard`（在资金锁内）最后一步用提交时的目的地址与来源再问一次 `preTransferCheck`，经 `normalizePreTransferCheck` 完整校验后与用户看到的内容比较（`assertSendDestinationUnchanged`）：制裁→「Unable to send funds to this address.」，激活费不同→复用 `withdrawal-activation-fee-changed` 文案，出现用户没看到的损失警告或回答异常→「Unable to check the destination address. Nothing was sent.」；都不发送并保留草稿。首次判定也改用 `normalizePreTransferCheck`，缺 `userExists` 不再直接发送。没有新增文案。官方前端只在点击时检查一次（2026-10-30 记录与取证报告），这里与仓库已有的 CCTP 提款锁内复核做法一致，比官方严格。
- **第 7 项零地址（成立）。** `isAddress` 放行零地址，提款与 Send 都没有本地拦截。新增 `isFundsDestinationAddress`，Send 表单、邮箱提款表单与提交入口共用，零地址显示既有的「Enter a valid Ethereum address.」/「Invalid destination address」。协议层对零地址的处理没有找到官方依据，本地拒绝是保守做法。
- **第 5 项畸形回执当成功（成立）。** SDK 0.33.3 `assertSuccessResponse` 只拒绝已知错误形状，`{}` 原样返回（`exchange-action-acknowledgement.test.ts` 用真实 `ExchangeClient` 与假传输复现）。官方文档对这六个方法的成功回答都是 `{'status': 'ok', 'response': {'type': 'default'}}`（Exchange endpoint 页 Send Asset、Core USDC transfer、Initiate a withdrawal request、Transfer from Spot account to Perp account、Send to EVM with data）。修法放在 `useExchange` 的 SDK 调用之后：这六个方法的其他回答抛 `ExchangeResponseUnverifiedError`，`isAmbiguousExchangeActionError` 认它为结果不明，Send、划转、提款显示既有的「… status unknown」常驻警告；其他方法不变。
- **第 4 项存款地区查询占锁（成立）。** `useGeoRestriction().retry` 是 TanStack Query `refetch`，离线时暂停；存款在资金锁内直接 `await`，没有期限。修法：`assertFreshFundsActionGeo` 在信号中止时立即停止等待；存款锁内的地区检查改走它，并用已有的 `createLockedRequestSignal`（15 秒，`DEPOSIT_LOCKED_REQUEST_TIMEOUT_MS`），超时报「Unable to verify regional availability」，迟到的回答不会继续签名。为此把「点击期限」组测试的延迟拆成地区检查最多 10 秒加后续收款人查询，保持原有断言含义。
- **第 2 项自动存款错过到期复查（成立）。** `EmbeddedDepositAutoBridge` 的 `error` 分支在本页自己的无哈希提交失败后只锁住尝试，不安排 `validBefore` 后的复查；规范要求到期后一秒复查。修法：该分支读到未决授权时安排复查；复查时重新读取授权，仍未决（例如另一标签页签了新的）就顺延到它的到期时间，不解锁。刷新后恢复无哈希警告没有做（见后续）。
- **第 8 项精度（成立）。** 0.200001 的转发费给出最低 0.400002，两位小数输入框录不进；Max 标签和 Send/划转成功通知经 JavaScript 数字取整。修法：`getMinimumWithdrawal` 向上取到两位小数（0.41），Max 标签与两条成功通知用 `formatDecimalString`（通知先经 `toPlainDecimal`，`5.` 这类输入照常显示）。净到账额与费用行仍按两位四舍五入显示，未改。

## 验证与限制

工作区基线 dc9f01fc，Node 22.15.0，2026-11-19 本机运行：

- 复现：把 8 个源文件的改动 `git apply -R` 后跑新测试，36 个断言失败（含第 3、5、7、8 项）；第 2、4 项在实现前单独跑即失败（第 4 项表现为测试 5 秒超时、锁未释放）。恢复改动后全部通过。
- 相关测试 10 个文件 445 个用例通过；`use-deposit-routing-guard.test.tsx` 105 个通过；`mobile-data-presentation-contract` 的 Send 文案计数已按新增的两处行动反馈更新登记表。
- 变异（改弱关键一行、看到失败后改回）：零地址判断、激活费比较、最低额取整方向、`useExchange` 的回执检查、`isAmbiguousExchangeActionError` 的映射、spotSend 守卫接线、地区检查的中止等待、错误分支安排复查、复查时重读授权，九处均有测试失败。
- `pnpm --filter @sairn/terminal typecheck`、`pnpm --filter @sairn/hl-react typecheck` 通过；改动文件 `biome check` 无问题。全量终端测试（`vitest run --maxWorkers=2`，沙盒内）10,867 通过、2 失败：一个是展示登记表计数（全量开跑后才更新登记表，更新后单独重跑通过），一个是 `vite-development-cache` 在沙盒内不能监听端口（`listen EPERM`），沙盒外单独重跑通过。
- 未验证：真实钱包签名、真实交易所对畸形回答的表现、真实离线与恢复联网、真实到期复查后的赞助存款。测试只连本机，没有外部网络。

## 后续与替代关系

- 刷新后只凭未决授权记录恢复「Deposit status unknown」警告没有做：它会重新显示用户可能已关掉的通知，涉及 `docs/trading-notifications.md`「不重新打开隐藏通知」的规则，需要运营方决定。
- 提款表单与成功通知里的净到账额、费用仍四舍五入到两位，亚分费率下可能高估不到 0.005；是否改成精确显示待决定。
- `ExchangeResponseUnverifiedError` 只覆盖六个文档规定 `type: "default"` 的方法；`vaultTransfer`、`cDeposit`、`tokenDelegate` 等其他资金方法仍只靠 SDK 的错误形状检查，它们的调用方是否都处理「结果不明」未核对。
- 本任务不替代任何记录。
