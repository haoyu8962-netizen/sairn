<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-hl-react-helper-tests",
  "date": "2026-11-19",
  "title": "hl-react 签名、存储与传输辅助函数补测（事后补记）",
  "kind": "retrospective",
  "status": "recorded",
  "topics": ["hyperliquid-api", "pr-review"],
  "summary": "事后补记，依据提交 f456bcf6：只新增 9 个测试文件（active owner 租约、Agent 签名器淘汰、批量更新器、交易所生命周期、帧接收时间、历史委托新鲜度、接收年龄、重连退避、订阅身份），不改生产代码。Codex 报告自述 53 个用例、12 次变异全部触发失败，本记录未复跑。已加入 AGENTS.md 回归清单。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["f456bcf6"],
  "sources": [
    { "path": "apps/terminal/src/lib/tests/hl-active-owner-lease.test.ts" },
    { "path": "apps/terminal/src/lib/tests/hl-exchange-lifecycle.test.ts" },
    { "path": "apps/terminal/src/lib/tests/hl-reconnect-backoff.test.ts" },
    { "path": "AGENTS.md" }
  ],
  "supersedes": []
}
-->
# hl-react 签名、存储与传输辅助函数补测（事后补记）

## 背景与范围

事后补记，由 2026-11-19 集成后的文档同步写成；没有取得任务标识。来源是修复任务 `w4-hl-react-tests` 的 Codex 报告（本机 `.worklog/2026-11-19/codex/`，Git 忽略）：先做 `packages/hl-react/src` 的静态覆盖视图（读代码推断，不是运行时覆盖率），再为原先没有直接测试的单元补测。提交 `f456bcf6` 只新增测试，不改生产代码。

## 结论与依据

新增的 9 个文件（`apps/terminal/src/lib/tests/`）：`hl-active-owner-lease`、`hl-agent-signer-eviction`、`hl-batched-updater`、`hl-exchange-lifecycle`、`hl-frame-receipt`、`hl-historical-order-freshness`、`hl-receipt-age`、`hl-reconnect-backoff`、`hl-subscription-identity`。签名与租约相关的三个放进 `AGENTS.md` 的钱包签名分组，传输与新鲜度相关的六个放进 WebSocket 恢复分组（2026-11-19 集成后补）。

## 验证与限制

- Codex 报告自述：9 个文件覆盖 12 个原先没有直接测试的单元，共 53 个用例；12 次变异全部触发失败，恢复后用例与终端类型检查通过。这是来源报告的读数，本记录没有复跑。集成后的读数见集成验证与总记录 [2026-11-19-codex-review-claude-fixes](2026-11-19-codex-review-claude-fixes.md)。
- 这些测试钉的是辅助函数的行为，不证明真实交易所或真实浏览器中的签名与重连。

## 后续与替代关系

覆盖视图里仍为「间接」或「没有运行时测试」的模块没有继续补。本记录不替代任何记录。
