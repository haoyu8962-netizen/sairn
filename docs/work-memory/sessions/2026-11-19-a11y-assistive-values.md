<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-a11y-assistive-values",
  "date": "2026-11-19",
  "title": "读屏读到数量单位、余额、持仓数值与字段错误（事后补记）",
  "kind": "retrospective",
  "status": "recorded",
  "topics": ["order-entry", "pr-review"],
  "summary": "事后补记，依据提交 90a7135a 的 diff：下单数量框把单位接进可访问描述，Max 按钮名称改为余额本身、Use max 文案只留在 title，持仓行与手机持仓卡给出 TP/SL 与保证金数值、接近强平的读屏提示（新增可翻译文案 Near liquidation），PNL 列的切换提示改为描述，触发价、限价、Send/Transfer 金额与 TP/SL 限价的错误接到 aria-describedby，Enable Trading 失败为 alert，阿拉伯语下反手确认的箭头翻转。原修复代理没有写任务记录，验证读数见集成验证。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["90a7135a"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/tradebox/trade-form-fields.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-row.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-position-card.tsx" },
    { "path": "apps/terminal/src/lib/tests/position-accessible-values.test.tsx" },
    { "path": "docs/reduce-only-repair-plan.md" }
  ],
  "supersedes": []
}
-->
# 读屏读到数量单位、余额、持仓数值与字段错误（事后补记）

## 背景与范围

事后补记，由 2026-11-19 集成后的文档同步写成，不是修复当时的同步记录；没有取得任务标识。来源是 Codex 无障碍审查 `r8-a11y` 与修复任务 `w20-a11y-high`（本机 `.worklog/2026-11-19/codex/`，Git 忽略）。Codex 的修复任务在额度用完时中断，没有修复报告；Claude Fable 代理按 `w20` 的范围（高优先级全部、中优先级里只改属性的条目）完成修复，主会话提交为 `90a7135a`。修复代理的最终报告没有入库，本记录只写提交信息与 diff 能证明的内容。

## 结论与依据

按 diff 读出的改动：

- 下单数量（桌面 `trade-form-fields.tsx`，手机 `mobile-trade-size-control.tsx` / `mobile-trade-size-view.tsx`）：数量单位元素有了 `id`，输入框的 `aria-describedby` 总是包含它，有错误时再接错误。
- Max 入口（桌面与手机）：去掉覆盖名称的 `aria-label`，`Use max reducible size` / `Use max available balance` 只在 `title` 里，按钮名称就是显示的余额；`docs/reduce-only-repair-plan.md` 已追加更正。
- 触发价与限价：错误文本由 `getOrderPriceFieldErrorMessage`（`order-validation-presentation.ts`）取出，以隐藏元素接到输入框的 `aria-describedby`，桌面与手机相同；TP/SL 弹窗的数量与两个限价错误同样接上。
- Send 与 Transfer 金额超出余额时，输入框描述为现有文案「Insufficient balance」。
- 持仓：桌面行与手机卡在强平价接近时追加读屏专用的「Near liquidation」；TP/SL 按钮描述为两项价格，保证金按钮描述为金额与 Cross/Isolated；PNL 列的切换按钮不再用 `aria-label` 覆盖可见列名，提示改为描述。
- `trade-panel.tsx` 的 Enable Trading 失败文本加 `role="alert"`；手机下单视图的同类错误同样处理。
- 反手确认的方向箭头加 `rtl:-scale-x-100`。
- 新增一条可翻译文案「Near liquidation」，七个语言目录都有条目。

## 验证与限制

- 新增 `position-accessible-values.test.tsx`，并扩充了数量、TP/SL、反手、资金余额、会话解析中等既有测试（文件见提交）。没有找到修复代理的运行输出；测试是否在修复前失败、是否做过变异，本记录无法证明。集成后的测试读数见集成验证与总记录 [2026-11-19-codex-review-claude-fixes](2026-11-19-codex-review-claude-fixes.md)。
- 没有用真实读屏软件（VoiceOver、TalkBack、NVDA）核对，也没有真机核对。

## 后续与替代关系

- 审查里需要视觉或交互改动的条目没有做，列在总记录的待决定事项：手机强平价与超额输入的可见非颜色标记、通知停留时长、订单簿提示可悬停、TIF 释义键盘可达、手机紧凑订单簿的非颜色区分。
- 本记录不替代任何记录。
