<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-twap-queue-hardening",
  "date": "2026-11-19",
  "title": "TWAP 终止排队：点击时的签名身份、离线点击与跨标签页重复",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry", "hyperliquid-api", "pr-review"],
  "summary": "在 79b268ea 复现 TWAP 终止排队时同 owner 换会话或换 epoch 后旧点击由新身份签名、离线点击联网后发出、两个标签页各发一次。点击时记下签名身份并在执行守卫里比较，离线点击立即结束；跨标签页重复交给交易所的幂等拒绝，不加本地共享记录。资产锁授予后签名前等待（第 6 项）当时只评估规则；同日按运营方「照官方终端做法」的决定，`twapCancel` 不再豁免 ADR 0053 的 15 秒入队上限，超时报未发送。Codex 起草、Claude 核对与裁定；实盘、真实钱包与原生 Web Locks 未验证。",
  "thread": null,
  "baseCommit": "79b268ea",
  "commits": ["bb3744a4", "2895af38"],
  "sources": [
    { "path": "apps/terminal/src/hooks/trade/use-twap-cancel.ts" },
    { "path": "packages/hl-react/src/hooks/useExchange.ts" },
    { "path": "packages/hl-react/src/internal/exchange/request-scheduler.ts" },
    { "path": "apps/terminal/src/lib/tests/exchange-start-deadline.test.tsx" },
    { "path": "docs/hyperliquid-signing.md" },
    { "path": "apps/terminal/src/lib/tests/twap-cancel-queue.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/twap-cancel-hook.test.tsx" },
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/adr/0053-exchange-action-start-deadline.md" },
    { "path": "docs/adr/0039-link-mobile-device-builder-fee-and-session-priority.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets" },
    { "url": "https://w3c.github.io/web-locks/" },
    { "url": "https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request" }
  ],
  "supersedes": []
}
-->
# TWAP 终止排队：点击时的签名身份、离线点击与跨标签页重复

## 背景与范围

基线 `79b268ea`（公开仓库 `main`）。来源是 2026-11-19 Codex 审查报告 `r1-wave3-signing` 的第 1 项（P1，排队期间同一 owner 从钱包会话换成 Agent-only 后旧点击由新会话执行）、第 2 项（P2，离线点击、联网后自动提交）、第 4 项（P2，两个标签页对同一 TWAP 各提交一次）；第 6 项（资产锁授予后签名前等待可能卡住）只评估规则、不改实现。流程：Codex 出发现和候选补丁，Claude 核对官方依据、复现并裁定最终修法，主会话验证与提交。Codex 写补丁时撞到用量上限中断，没有修复报告，留下的是未写完的草稿。没有取得会话标识（`thread: null`）。

## 结论与依据

- 第 1 项成立。`useTwapCancel` 原来只比较 `clientKey` 与 `env`；`useExchange` 的 `mutationFn` 在拿到资产锁之后才捕获会话与注册租约，于是排队期间换了会话模式（ADR 0039 的导入 Agent-only 优先于钱包会话，或反过来）或注册 epoch，旧点击按新身份签名。调度器本来把会话模式、签名器、注册 epoch、Agent 公钥和 Agent-only 激活代际都算进请求代际，排队前的等锁段漏掉了这层绑定。修法：`useExchange` 返回 `captureSigningIdentity()`（会话租约、owner 签名器绑定、注册租约），并导出 `isSameExchangeSigningIdentity`；点击时捕获，捕获不到就提示 "Request not submitted"、不登记；执行守卫在入队前与 SDK 边界各比较一次；会话变化的 effect 立即作废排队中的终止。提示沿用 `twap-cancel-identity-changed`（"The trading account or network changed…"），对同 owner 的会话或密钥更换只是近似，没有新增文案。
- 第 2 项成立，按 `AGENTS.md`「an action submitted offline fails at once」与 ADR 0053 决策 6：离线点击在登记和申请资产锁之前结束，复用 "Request not submitted"。真实按钮在离线时会被被动数据的过期状态换成占位，可点击窗口只在断网事件与重渲染之间，未在浏览器里测量。
- 第 4 项现象成立、后果不构成缺陷，不做本地去重。官方文档写明对已终止的 TWAP 再发 `twapCancel` 返回 `TWAP was never placed, already canceled, or filled.`（Exchange endpoint · Cancel a TWAP order）；SDK 0.33.3 的 `assertSuccessResponse` 把单项 `status.error` 抛成 `ApiRequestError`，第二个标签页按 ADR 0024 原样显示交易所原文、记为失败；TWAP ID 不复用，不会误伤别的订单。Codex 草稿的 localStorage 共享终止记录（`twap-cancel-coordination.ts` 与 `TwapReconciliation` 的改动）未采用：存储写不进时终止整体失败关闭；另一页写下 `submitting` 后崩溃，记录要靠之后的新鲜活动快照才能转成可重试，快照不来就一直挡住这一单的终止。这些都会挡住降风险的撤单，代价大于一次被交易所拒绝的重复请求。
- 第 6 项只评估。读代码：会话锁的持有者都有上限（执行前守卫 10 秒 `PRE_EXECUTION_GUARD_TIMEOUT_MS`，其余是同步的存储读写与 active-owner 锁），撤单的法律复核 10 秒封顶，HTTP 有超时；Codex 的复现用的是永不释放的替身。Web Locks 规范：锁授予后 `signal` 被忽略，按名字先进先出，agent 终止时释放它的锁。可选规则：A 维持 ADR 0053 决策 4（撤单授予资产锁后不设上限）；B 只给豁免撤单的会话锁获取加一个远大于现有上限的封顶（例如 60 秒），超时报未发送；C 给资产锁之后的整段签名前等待设上限（ADR 0053 备选表已否决：拥堵时拒绝降风险撤单）；D 只在界面上给 `submitting` 计时（请求可能仍会发出，结论不实，排除）。推荐 A，若要纵深防御再加 B，需改 ADR 0053，由运营方决定。

## 验证与限制

- Node `v22.15.0`。复现：去掉补丁后，`twap-cancel-queue.test.tsx`（真实 `useExchange`、TanStack Query、请求调度器与 pending store，Web Locks 与 SDK 为替身）里同 owner 换会话、换 epoch、离线点击三项都看到 SDK 替身被调用 1 次，两个标签页的用例看到 2 次。
- 最终版本：`twap-cancel-queue.test.tsx` 与 `twap-cancel-hook.test.tsx` 共 38 项通过；把源码改动反向应用后其中 6 项失败（SDK 边界 epoch、同 owner 换会话、换 epoch、离线、两种点击时无签名身份）。跨标签页用例在基线上同样通过，它钉的是「第二次请求交给交易所、原文显示」这条规则。
- 变异（各自恢复）：去掉执行守卫的身份比较、比较器不看会话租约、不看 epoch、去掉离线检查、去掉会话 effect 里的身份比较、点击时不要求签名身份、`captureSigningIdentity` 不看租约是否有效，各让对应用例失败。Codex 草稿里锁授予处的单独比较与入队前守卫重复，变异显示没有用例能区分，已删除。
- 相关回归 67 个文件 1495 项通过（引用 `useExchange` 的测试、全部 TWAP 与 exchange 测试、`trading-guard-session`、`order-submission-wiring`）；`pnpm --filter @sairn/terminal typecheck` 与 `pnpm --filter @sairn/hl-react typecheck` 通过；改动文件 `biome check --write` 通过。
- 未运行：真实钱包签名、交易所、原生浏览器 Web Locks、真机；断网瞬间按钮可点击窗口未测量；第 6 项的会话锁持有者是否都有上限只读了代码。

## 2026-11-19 补充：第 6 项按官方做法设上限

- 决定来源：运营方当日决定「需要决定的事项照官方终端的做法执行」。官方终端（取证报告第 1 项，前端包静态阅读、未在界面上触发）点 Terminate 直接发 `twapCancel`，不排队、不等待、不重试，失败用通知提示，交易所拒绝原样显示，没有 Retry。
- 判断：上一轮读代码的结论（会话锁持有者、法律复核、HTTP 各自有限）仍成立，但拿到资产锁之后的整段等待（调度器排队、复核、会话锁、SDK 内的时钟同步与 nonce 锁）合计没有上限；会话锁可能由被节流的后台标签页持有。等待期间这一 TWAP 的终止停在 `submitting`，再点被忽略。在 `bb3744a4` 上复现：会话锁被占 16 秒，锁一放开终止照样签名发出。
- 修法（上一轮的选项 B 的变体，但不另设更长的上限）：`twapCancel` 从 `getExchangeStartDeadlineMs` 的豁免中移除，复用 ADR 0053 对其他动作的 15 秒入队上限与全部中止机制；超时显示 ADR 0053 的现成文案，通知记为失败，可以立即再点；不加 Retry，不新增文案。`cancel`、`cancelByCloid` 仍豁免（TP/SL 替换依赖撤单完成，不在这次决定内）。nonce 串行、点击时签名身份核对、离线立即失败都不受影响：截止只发生在调用签名器之前。
- 改动：`request-scheduler.ts`；`twap-cancel-queue.test.tsx` 新增 16 秒与 14 秒两项；`exchange-start-deadline.test.tsx` 豁免名单改为两种撤单；ADR 0053 文末补记、ADR 索引、`hyperliquid-signing.md`、`trading-notifications.md`、`CHANGELOG.md`。
- 验证（Node `v22.15.0`，Vitest 4.0.16，沙盒外运行）：修改前新增的 16 秒用例失败（SDK 替身被调用 1 次），14 秒用例通过；修改后两项通过。变异：把 `twapCancel` 放回豁免名单，`twap-cancel-queue` 的 16 秒用例与 `exchange-start-deadline` 的名单用例失败，已还原。引用 `useExchange`、TWAP、调度器、签名时限或 `trading-guard` 的 136 个测试文件 3219 项通过，退出码 0；`pnpm --filter @sairn/terminal typecheck` 与 `pnpm --filter @sairn/hl-react typecheck` 退出码 0；改动的三个 TypeScript 文件 `biome check --write` 为 `No fixes applied`；`git diff --check` 通过。
- 没有运行：真实钱包、交易所、原生浏览器 Web Locks、后台标签页节流下的实际时长。

## 后续与替代关系

- ADR 0053「应用层入口的点击时限」表格的 TWAP 终止行可补一句：点击时离线或没有签名身份立即结束，执行守卫比较点击时的签名身份。
- 第 6 项已按官方做法处理（见上一节）；ADR 0053 已补记。普通撤单（`cancel`、`cancelByCloid`）是否同样设上限未决定。
- 同 owner 换会话或换密钥时的作废提示只是近似，要准确需新增文案并补齐各语言目录，由运营方决定。
- 外部钱包会话没有 Agent 时点 `Terminate`，现在提示 "Request not submitted"（原来是通用的身份变化提示），都没有引导去开启交易，属于既有缺口。
