<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-staking-account-isolation",
  "date": "2026-11-19",
  "title": "质押：迟到的核验、草稿与微量余额绑定到账户（事后补记）",
  "kind": "retrospective",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "事后补记，依据提交 f0348bc8 的 diff：质押核验在移除跨标签页资金标记、等锁之后再确认执行仍属当前账户，否则不把结果发布给新账户；操作弹窗的草稿绑定 env 与 owner，账户或网络变化时关闭，语言切换不受影响；现货 HYPE 可用额用 toPlainDecimal 输出，极小余额不再变成指数写法。验证读数见集成验证。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["f0348bc8"],
  "sources": [
    { "path": "apps/terminal/src/components/staking/use-staking-actions.ts" },
    { "path": "apps/terminal/src/components/staking/staking-view.tsx" },
    { "path": "apps/terminal/src/components/staking/domain/staking.ts" },
    { "path": "apps/terminal/src/components/staking/__tests__/use-staking-actions.test.tsx" }
  ],
  "supersedes": []
}
-->
# 质押：迟到的核验、草稿与微量余额绑定到账户（事后补记）

## 背景与范围

事后补记，由 2026-11-19 集成后的文档同步写成；没有取得任务标识。来源是 Codex 审查 `h2-earn-staking-vaults` 中归给质押的几项与修复任务 `w15-staking-account-isolation`（本机 `.worklog/2026-11-19/codex/`，Git 忽略）。Codex 修复任务中断、没有报告；Claude Fable 代理完成修复，主会话提交为 `f0348bc8`。同一审查的 Vault 与 Earn 各项见 [2026-11-19-vault-earn-funds-guards](2026-11-19-vault-earn-funds-guards.md)。

## 结论与依据

按 diff 读出的改动：

- `use-staking-actions.ts`：恢复核验确认匹配后，`removeFundsActionMarkerSafely` 要等跨标签页锁；等完之后先用 `executionIsCurrent(lease)` 确认执行仍属当前 owner，不是就直接返回，不把成功结果写给已切换的账户。
- `staking-view.tsx`：打开的操作（委托、解除委托、存入、取出）按 `env:owner` 记录，owner 或网络变化时草稿清空、弹窗关闭；语言切换不改变 owner，草稿保留。
- `domain/staking.ts`：`parseSpotHypeAvailable` 用 `toPlainDecimal`，`0.0000001` 这类余额不再输出为 `1e-7`（Big.js 默认 `NE = -7`，见 `.claude/rules/hyperliquid.md`）。

没有新增可翻译文案，没有改规范文档；`CHANGELOG.md` Unreleased / Fixed 在集成后补了一条。

## 验证与限制

- 提交扩充了 `staking-domain.test.ts`、`staking-view.test.tsx`、`use-staking-actions.test.tsx`（新用例包括语言切换保留草稿、锁释放后不发布旧账户的匹配）。没有找到修复代理的运行输出；修复前是否失败、变异情况本记录无法证明。集成后的读数见集成验证与总记录 [2026-11-19-codex-review-claude-fixes](2026-11-19-codex-review-claude-fixes.md)。
- 没有真实质押操作或多标签页浏览器验证。

## 后续与替代关系

- 解除委托的锁定判断与设备墙钟比较的问题，在 Vault 记录里评估为不改、待运营方决定。
- 本记录不替代任何记录。
