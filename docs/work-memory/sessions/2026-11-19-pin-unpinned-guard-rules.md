<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-pin-unpinned-guard-rules",
  "date": "2026-11-19",
  "title": "为测试审计列出的 14 条未钉住守卫规则补测试，并把 5 处过度模拟的测试接到真实执行路径",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "account-funding", "hyperliquid-api", "wallet-onboarding"],
  "summary": "Codex 测试审计（r6-test-strength）列出 14 条删去守卫后相关测试仍全绿的规则，以及 10 处替身接管生产行为的测试。Codex 写到一半因额度中断；Claude 逐条在 79b268ea 上用临时变异核对：14 条说法全部成立（原测试副本在变异下全绿），新增测试在同一变异下失败。过度模拟取前 5 处，用新增的 scheduled-exchange 测试夹具让市价平仓、提现、Send/Transfer 经过真实 useExchange、真实资金锁和真实 SDK 到本地 transport，Agent 授权经过真实 privy signer、真实租约模块和真实 SDK。只改测试，实现文件没有改动；没有发现实现违反规则。浏览器多标签页的 nonce 时序、真实钱包与真机没有验证。",
  "thread": null,
  "baseCommit": "79b268ea",
  "commits": ["a91dbfbc"],
  "sources": [
    { "path": "AGENTS.md" },
    { "path": "docs/hyperliquid-signing.md" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/adr/0017-market-close-confirmed-size-ceiling.md" },
    { "path": "docs/api-wallet-redesign-notes.md" },
    { "path": "docs/leaderboard-vaults-staking-redesign-notes.md" },
    { "path": "docs/trading-onboarding.md" },
    { "path": "apps/terminal/src/lib/tests/harness/scheduled-exchange.ts" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes" },
    { "url": "https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request" }
  ],
  "supersedes": []
}
-->
# 为未钉住的守卫规则补测试

## 背景与范围

同步记录，2026-11-19，未取得任务标识。Codex 测试审计报告 `r6-test-strength`（本地草稿，未入库）在 `79b268ea` 上列出两类问题：「没有被测试钉住的 14 条规则」和「过度依赖模拟的 10 处测试」。任务是前者全部补测试、后者改最严重的 5 处，只加或改测试，不改实现。Codex 写到一半因额度中断，留下 13 个测试文件的草稿与一个新夹具，没有报告；Claude 核对草稿、重写有问题的部分并完成验证。

## 结论与依据

做法：为每条规则把原测试文件复制一份，临时改实现的关键一行，同时运行原副本与新测试，再把实现改回。原副本全绿说明「没有钉住」成立，新测试变红说明补上了。14 条全部成立，没有一条已被既有测试钉住，也没有发现实现违反规则。

| 规则 | 依据 | 变异 | 新测试 |
|---|---|---|---|
| 本地 Agent 的 L1 快速签名与 SDK 一致 | `docs/hyperliquid-signing.md` 第 68 行；SDK 0.33.3 `signing/_l1.js` 传数值 `chainId: 1337`、`source` 主网 `a` 测试网 `b` | 主网用测试网摘要；去掉 `chainId === 1337`；改成比较 `1337n` | `l1-agent-signing`：用 SDK `signL1Action` 对照两网；1338 反例回退 |
| 市价平仓最终订单的 `s` 与 `r` 必须等于规划值 | ADR 0017；`docs/confirmation-surfaces.md` 第 21 行 | 分别删 `order.s`、`order.r` 比较 | `position-market-close-submit`：经真实 `useExchange` 与 SDK，规划后改一个字段，签名与请求为 0 |
| 自动充值签名后、广播前复核法律状态 | `AGENTS.md` 第 48 行 | 自动路径跳过第二次复核 | `use-deposit-routing-guard` |
| 兑换方向必须等于确认报价 | `docs/confirmation-surfaces.md` 第 21 行 | 删 `order.b` 比较 | `spot-swap-execution-guard` |
| nonce 分配取独占锁 | Hyperliquid「Nonces and API wallets」要求每地址唯一 nonce；MDN `LockManager.request`：`shared` 可被多处同时持有 | `exclusive` 改 `shared` | `cross-tab-nonce-manager`：锁替身按 `mode` 授锁并断言调用参数 |
| 兑换余额有独立 60 秒新鲜期 | `AGENTS.md` 第 82 行；`SWAP_BALANCE_MAX_AGE_MS`（规范文档未写数值） | 删余额年龄判断 | `spot-swap-execution-guard`：订单簿年龄 0，余额 60,000 允许、60,001 拒绝 |
| 邮箱提现拒绝本地址的任意大小写 | `docs/runtime-guardrails.md` 第 371 行 | 自提判断按原始大小写比较 | `funds-destination-rules`、`deposit-modal-withdrawal-routing-guard` 改用含 a–f 的地址 |
| 赞助充值广播前仍须有 paymaster | `docs/cctp-deposits.md` 第 259、261 行 | 删广播前的 `!smartClient.paymaster` | `use-deposit-routing-guard` |
| 广播前用最新 Fast Transfer 容量 | `docs/cctp-deposits.md` 第 88 行 | 第二次比较改用第一次的容量 | `use-deposit-routing-guard`：直充与赞助两条路径 |
| API 钱包只用成功刷新的 `extraAgents` 对账 | `docs/api-wallet-redesign-notes.md` 第 37、74 行 | 删 `snapshot.error == null` | `api-wallet-reconciliation` |
| 金库提款对账须匹配 owner | `docs/leaderboard-vaults-staking-redesign-notes.md` 第 234 行 | 删 `delta.user` 比较 | `funds-action-reconciliation` |
| 一次赞助授权只能有一个匹配成功事件 | `docs/cctp-deposits.md` 第 95 行；`docs/runtime-guardrails.md` 第 473 行 | `!== 1` 改 `=== 0` | `cctp-deposit` |
| builder fee 终查期间换 owner 不得完成 | `docs/trading-onboarding.md` 第 720–723 行；Hyperliquid「Builder codes」：须由主钱包签 | 删终查后的 `assertSameWallet` | `builder-fee-approval` |
| 有交易所时钟时丢弃恰好 `T + 1 day` 的记录 | `docs/hyperliquid-signing.md` 第 599 行；Hyperliquid：nonce 须在 (T − 2 days, T + 1 day) 内 | `>=` 改 `>` | `cross-tab-nonce-manager` |

过度模拟的前 5 处：nonce 锁替身（同上）；Agent 授权改为真实 privy signer、真实租约模块、真实 SDK，签名期间关闭会话，断言转译后的原因与 transport 为 0；提现、Send/Transfer、市价平仓经新夹具 `harness/scheduled-exchange.ts` 走真实 `useExchange`、真实资金锁与真实 SDK。证明这些用例比原替身更敏感的变异：删去 `useExchange` 在 SDK 调用前的最后一次 `executionGuard`（原文件全绿，新增 6 项失败）；把资金动作的法律复核挪到资金锁外（新增 4 项失败）；让租约匹配恒为真（原文件全绿，新增 1 项失败）。

## 验证与限制

均在 Node 22.15.0、Vitest 4.0.16 下运行并看到结果：按关键词选出的 70 个测试文件 `1538 passed`；`pnpm --filter @sairn/terminal typecheck` 退出码 0；改动文件 `biome check` 无问题；`git diff --check` 通过；实现文件无改动。每条变异都已改回。

## 后续与替代关系

- 只把 Agent 授权签名后的租约检查删掉时，新用例仍通过：transport 边界的租约检查独立挡住了请求。这是两层防护，不是缺口。
- nonce 锁写成 `shared` 时两个真实浏览器标签页的重复分配时序没有在浏览器里复现。
- 审计第三节的另外 5 处（TWAP 撤单、builder fee 真实状态推导、TWAP 下单、自动充值宿主、手机 Agent 同步弹窗）没有处理。
- 真实钱包、真机与线上行为没有验证。
