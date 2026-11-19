<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-orderbook-probe-gating",
  "date": "2026-11-19",
  "title": "订单簿回切探测的显示门控与门闩后取消（审查第 5 项）",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "market-recovery"],
  "summary": "审查第 5 项两种情形均在基线上用假时钟复现：手机订单簿切走后的十秒保温期仍推进回切计时并发起主源尝试；排在分组门闩后的尝试在离线或隐藏后仍调用 transport。修法：显示状态单独传入回切 hook；store 只为 l2 键在最后一个消费者离开时中止信号，门闩后检查。Codex 草稿未写完，门闩可中止等待与确认中止两部分未采用。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0003-orderbook-transport-isolation.md" },
    { "path": "apps/terminal/src/hooks/trade/use-orderbook-feed.ts" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-book-view.tsx" },
    { "path": "packages/hl-react/src/store.ts" },
    { "path": "packages/hl-react/src/hooks/useL2BookSubscription.ts" },
    { "path": "apps/terminal/src/lib/tests/orderbook-feed-probe-cancellation.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/use-l2-book-subscription.test.tsx" }
  ],
  "supersedes": []
}
-->
# 订单簿回切探测的显示门控与门闩后取消

## 背景与范围

Codex 审查报告 `r1-wave3-signing.md` 第 5 项（P2）：紧凑订单簿隐藏后仍可开始主源探测；离线后已排队的探测仍可进入 transport。Codex 修复任务被额度打断，只留下未写完的草稿（11 个文件改动加 2 个新文件），没有修复报告。Claude 核对官方文档与仓库规范，在没有草稿的基线上复现，独立决定修法；只处理第 5 项。未做 Git 写操作、未连外部网络。

## 结论与依据

- 规范：ADR 0003 2026-11-13 补记规定等待期与观察期只在页面可见、在线、订单簿显示时计时，尝试中途转入隐藏或离线则放弃、不计失败；`AGENTS.md` Order book contract 要求经共享连接与连接池预算订阅。
- 官方依据：Hyperliquid 文档「Rate limits and user limits」（https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits）列出每 IP 最多 10 条 WebSocket 连接、每分钟新建 30 条、1000 个订阅、每分钟 2000 条发出消息；「Subscriptions」（https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions）说明 `l2` 的 `s`/`m` 与 `l2Book` 的 `nSigFigs`/`mantissa` 相同。多余的尝试走共享连接，不新建连接，单次代价是一条订阅加一条退订消息，远低于上限；问题在于违反 ADR 的放弃规则，而不是限额风险。
- 情形一（成立，运行过）：`MobileBookView` 只把含十秒保温的 `enabled` 传给 `useOrderbookFeed`，hook 把它当作「显示」。基线上降级后第 55 秒切走面板，第 60 秒主源仍被启用（`expected true to be false`）。
- 情形二（成立，运行过）：真实 store、`useL2BookSubscription` 与分组门闩，transport 替身；尝试排在另一分组门闩之后时离线或隐藏，再释放门闩，transport 调用由 1 次变 2 次。原因是 store 释放最后一个消费者时只删 runtime，未完成的 `subscribe` 继续执行，确认后才退订。
- 修法：`useOrderbookFeed` 新增必填参数 `shown`，`shown && pageActive` 控制计时与尝试，保温只保留已在供数的订阅；`MobileBookView` 传 `isBookViewActive`。store 只为 `l2` 键建 `AbortController`，在 refCount 归零删除 runtime 时中止；`useL2BookSubscription` 在取门闩前后检查信号，已中止就归还门闩并抛错，store 因 runtime 已换而忽略该错误，不计失败。
- 草稿裁定：采用 app 层的 `shown` 分离（改为必填，避免默认值让新调用方回到旧缺陷）、移动与回切测试；采用 store 中止信号的思路。未采用：门闩 `waitUntilAvailable` 可中止（排队者最多本地等 5 秒，不触及 transport，属于额外改动）、把父信号接到 transport 确认（已进入 transport 的订阅由 store 原有路径在确认后退订，结果相同）、对应的两个测试与 ADR/CHANGELOG 的原措辞。`internal/websocket/` 与连接池未改。

## 验证与限制

运行过并看到结果（Node 22.15.0，worktree 基于上述提交）：

- 基线复现：`vitest run mobile-orderbook-subscription.test.tsx orderbook-feed-probe-cancellation.test.tsx` 4 个新用例失败；保留 app 修复、撤回 hl-react 修复时，`orderbook-feed-probe-cancellation` 两例与「grouping gate holds it」一例失败。
- 修复后四个聚焦文件 `Tests 61 passed (61)`。
- 变异四次，均失败后改回：去掉 `shown &&`（3 例失败）；删 store 中止调用（3 例）；删门闩后检查（3 例）；把中止挪到 refCount 判断之前（共享消费者用例失败）。
- 相关 43 个测试文件（按 orderbook、l2-book、l2-subscription、book-、store-、use-sub、subscription、ws-transport、websocket-half、visibility 选取，排除 soak 与 benchmark）：`Test Files 43 passed (43)`、`Tests 628 passed (628)`，exit 0。
- `pnpm --filter @sairn/terminal typecheck`、`@sairn/hl-react typecheck` 无错误；改动文件 Biome 通过。

未验证：真实浏览器或手机上的切页、断网与恢复时序；测试使用 jsdom、假时钟、脚本派发事件与 transport 替身。

## 后续与替代关系

不替代历史记录。主会话可在 `AGENTS.md` 回归清单 `src/lib/tests/orderbook-feed-l2-retry.test.tsx` 一行后加入 `src/lib/tests/orderbook-feed-probe-cancellation.test.tsx`。提交后补 `commits`。
