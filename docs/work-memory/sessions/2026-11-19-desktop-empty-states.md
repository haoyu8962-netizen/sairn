<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-desktop-empty-states",
  "date": "2026-11-19",
  "title": "桌面 TWAP、委托历史与订单簿空侧只按当前数据下结论（事后补记）",
  "kind": "retrospective",
  "status": "recorded",
  "topics": ["market-recovery", "pr-review"],
  "summary": "事后补记，依据提交 0396f11f 的 diff 与 Codex 修复报告：桌面 TWAP 历史与成交表改用 canConfirmEmpty 判定空结论；桌面委托历史页签的无匹配句子与表头条数只在快照就绪且无错误、未离线、未过期（或有匹配行）时显示；桌面订单簿某一侧只在当前快照该侧本身为空时显示 No orders。补齐 2026-11-17 手机登记表任务留下的桌面后续。验证读数见集成验证。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["0396f11f"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/positions/twap-history-table.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/twap-fill-history-table.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/orders-history-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/orderbook/orderbook-panel.tsx" },
    { "path": "apps/terminal/src/lib/tests/desktop-twap-history-empty.test.tsx" },
    { "path": "docs/mobile-data-presentation.md" }
  ],
  "supersedes": []
}
-->
# 桌面 TWAP、委托历史与订单簿空侧只按当前数据下结论（事后补记）

## 背景与范围

事后补记，由 2026-11-19 集成后的文档同步写成；没有取得任务标识。来源是修复任务 `w2-desktop-empty-states` 的 Codex 报告（本机 `.worklog/2026-11-19/codex/`，Git 忽略）：2026-11-17 的手机数据展示登记表任务把这三处桌面行为列为后续（[登记表记录](2026-11-17-mobile-presentation-contract-registry.md)、[待修记录](2026-11-17-mobile-presentation-pending-fixes.md)）。Codex 写了候选补丁与报告，Claude 代理核对后由主会话提交为 `0396f11f`。

## 结论与依据

按 diff 读出的改动：

- `twap-history-table.tsx`、`twap-fill-history-table.tsx`：空结论条件从「实时源未降级」改为 `useTwapHistory` / `useTwapSliceFills` 的 `canConfirmEmpty`（与手机两张列表相同：在线、最近一次请求成功且空闲、订阅 active 且未过期）。
- `orders-history-tab.tsx`：新增 `canShowResult`（快照 `ready`，且有匹配行或没有错误、离线、过期）；不成立时列表为空白占位、表头不显示条数；成立且无匹配时才显示「No orders match these filters.」。
- `orderbook-panel.tsx`：卖侧与买侧各自只在当前有效快照的该侧数组为空时显示 `OrderbookSideEmpty`，否则是占位行；原先只要有当前快照就显示。

文档同步（2026-11-19 集成后补）：`docs/mobile-data-presentation.md` 手机 TWAP 一条末尾补了桌面的三处现行做法；`CHANGELOG.md` Unreleased / Fixed 补了一条。

## 验证与限制

- Codex 报告自述相关测试 553 项通过、四次变异都触发失败、完整类型检查当时待验证；这是来源报告的读数，本记录没有复跑。新增 `desktop-twap-history-empty.test.tsx`，扩充 `desktop-orders-history-direction.test.tsx`、`desktop-twap-tab.test.tsx`、`orderbook-panel-safety.test.tsx`。集成后的读数见集成验证与总记录 [2026-11-19-codex-review-claude-fixes](2026-11-19-codex-review-claude-fixes.md)。
- 没有浏览器或断网实测。

## 后续与替代关系

本记录补齐 2026-11-17 两份记录列出的桌面后续，不替代它们。
