<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-referral-initiating-account",
  "date": "2026-11-19",
  "title": "推荐结果按发起账户核对，拒绝无法使用的邀请码（事后补记）",
  "kind": "retrospective",
  "status": "recorded",
  "topics": ["pr-review", "wallet-onboarding"],
  "summary": "事后补记，依据提交 ba6dca8e 的 diff：推荐请求结果需要核对时，按发起时的账户与网络重新读取推荐快照（当前账户已切换时直接请求该账户，4 秒超时），结果记在发起账户的任务上，读不到时为未确认而非失败；/join 只接受推荐提交路径能用的 1–20 位 ASCII 字母数字；排行榜显示名为空白时显示地址；API 钱包页在可读（非断开、非非主钱包）且仍挂载时复查结果不明的请求。第二轮（大写邀请码、悬停显示完整地址）见 2026-11-19-referral-join-uppercase-leaderboard-title。验证读数见集成验证。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["ba6dca8e"],
  "sources": [
    { "path": "apps/terminal/src/hooks/trade/use-referral-actions.ts" },
    { "path": "apps/terminal/src/lib/trade/referral-join.ts" },
    { "path": "apps/terminal/src/components/api-wallet/use-api-wallet-controller.ts" },
    { "path": "apps/terminal/src/components/leaderboard/leaderboard-view.tsx" },
    { "path": "apps/terminal/src/lib/tests/use-referral-actions.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/use-api-wallet-controller-query.test.tsx" }
  ],
  "supersedes": []
}
-->
# 推荐结果按发起账户核对，拒绝无法使用的邀请码（事后补记）

## 背景与范围

事后补记，由 2026-11-19 集成后的文档同步写成；没有取得任务标识。来源是 Codex 审查 `h4-referral-apiwallet-leaderboard` 与修复任务 `w22-referral-apiwallet`（本机 `.worklog/2026-11-19/codex/`，Git 忽略）。Codex 修复任务中断、没有报告；Claude Fable 代理完成第一轮（`ba6dca8e`）。同一分支第二轮按官方做法把邀请码改为大写并给排行榜加完整地址悬停（`6936980b`），有自己的记录 [2026-11-19-referral-join-uppercase-leaderboard-title](2026-11-19-referral-join-uppercase-leaderboard-title.md)。

## 结论与依据

按 diff 读出的改动：

- `use-referral-actions.ts`：签名提交之后核对结果时，不再要求发起时的账户仍是当前账户。发起账户仍是当前账户时照旧 `refetchReferral()`；已经切换时用 `infoQueryOptions` 对发起账户与网络直接请求 `referral`（4 秒超时、不重试）。读失败得到 `null`，按既有规则报告为未确认。提交后的页面刷新只在发起账户仍是当前账户时进行。
- `referral-join.ts`：`/join` 的码先经 `normalizeReferralCode` 与 `isValidReferralCode`，与推荐提交路径同一规则；原先只拦路径分隔符、控制字符与编码后的危险字符，空格与非 ASCII 字母会被接受而无法提交。
- `leaderboard-view.tsx`：只含空白的显示名按没有显示名处理，显示缩写地址与奖杯图标。
- `use-api-wallet-controller.ts`：复查结果不明的请求改为在页面可读（不是断开、不是非主钱包）时进行，并要求控制器仍挂载；原先要求页面可操作。

文档同步：`/join` 的码规则由第二轮写进 `docs/runtime-guardrails.md`；`CHANGELOG.md` Unreleased / Fixed 在 2026-11-19 集成后补了一条。

## 验证与限制

- 新增 `leaderboard-trader-link.test.tsx`、`use-api-wallet-controller-query.test.tsx`，扩充 `use-referral-actions.test.tsx`、`referral-action-modal.test.tsx`、`referral-join.test.ts`。没有找到修复代理的运行输出；修复前是否失败、变异情况本记录无法证明。集成后的读数见集成验证与总记录 [2026-11-19-codex-review-claude-fixes](2026-11-19-codex-review-claude-fixes.md)。
- 没有真实钱包签名或真实推荐码提交。

## 后续与替代关系

- 仓库没有专门的推荐页规范文档；是否另立由主会话决定（第二轮记录已提出）。
- 本记录不替代任何记录。
