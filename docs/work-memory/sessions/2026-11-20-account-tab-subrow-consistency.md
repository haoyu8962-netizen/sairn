<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-20-account-tab-subrow-consistency",
  "date": "2026-11-20",
  "title": "账户标签页第二行统一：TWAP 子标签与各页筛选栏对齐",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry"],
  "summary": "运营方指出手机 Trade 页 TWAP 的子标签栏与 Orders 等页的筛选栏样式不一致。量测确认只有 TWAP 一行不同（左留白 8px、文字起点 22px、600 字重；其余为 14px、24px、400）。按官方终端的做法保留下划线子标签，但与主标签的文字起点和字重对齐；桌面同样对齐，并统一桌面 Order History 筛选器的默认文案。只用无头浏览器在未连接状态下量过，真机未验证。",
  "thread": null,
  "baseCommit": "ba78481a",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/twap/twap-subview-tabs.tsx" },
    { "path": "apps/terminal/src/lib/tests/account-tab-subrow-contract.test.ts" },
    { "path": ".claude/rules/style-ui-guide.md" }
  ],
  "supersedes": []
}
-->
# 账户标签页第二行统一（2026-11-20）

## 背景与范围

同步记录，未取得任务标识。运营方在本机开发服务器上选中手机 Trade 页的 TWAP 子标签栏与 Orders 筛选栏，指出样式不一致，要求参考官方终端 `app.hyperliquid.xyz/trade/HYPE` 同一位置的做法，检查所有标签页并统一。范围是 Trade 页账户区的七个标签页，手机与桌面。

## 结论与依据

- **改动前的读数（无头 Chromium，390px 与 1440px，未连接钱包）：** 手机上 Positions、Orders、Trade History、Funding Payments、Order History 的第二行一致：高 36px、左留白 14px、首个控件文字起点 24px、12px/400 的 27px 高筛选按钮。TWAP 一行不同：左留白 8px、文字起点 22px、12px/600。Balances 没有第二行。主标签文字起点 24px、13px/500。桌面上只有 TWAP 有第二行，文字起点比主标签靠左 8px（27 对 35）。
- **官方终端的做法（同日只读查看，1440px 与 390px）：** TWAP 的 Active / History / Fill History 是下划线子标签，不是筛选按钮；文字起点与主标签相同（桌面都在 15px），字重与主标签相同（12px/400），选中项靠亮色文字加下划线区分；筛选器（Type、Side）放在主标签行右侧。
- **做法：** 子标签保留为标签。手机行 `px-2` → `px-3.5`、标签 `px-3.5` → `px-2.5`；桌面行 `px-3` → `px-5`；字重 `font-semibold` → `font-medium`；下划线只画在文字下方。桌面 Order History 筛选器未筛选时的文案由 `All types` / `All statuses` 改为 `Type` / `Status`，与手机版和 Open Orders 一致。
- **没有照搬的官方做法：** 官方子标签与主标签同字号；这里子标签保持 12px，与同一行位置的筛选按钮同字号。这是代理的判断。

## 验证与限制

- 改动后同一脚本读数：手机六个有第二行的标签页首个控件文字起点都是 24px，与主标签文字起点相同；桌面 TWAP 子标签与主标签都是 35px。脚本是临时的，没有留在仓库里。
- 自动检查结果见提交所在的回复；本记录不替它们作证。
- 没有验证：真机触摸、已连接钱包并有数据的状态、右到左语言。

## 后续与替代关系

- 待运营方决定：手机 Balances 没有第二行（官方在该位置放 Hide Small Balances），是否补一行；仪表盘的历史页面（`/historicalOrders`、`/tradeHistory`）筛选器仍用 `All types` / `All statuses`，是否也改。
- Codex 只读对抗审查（2026-11-20，提交 `56894ebb`）两条 P3：契约没有钉住桌面主标签的内边距与字重（已补断言）；右到左语言下手机主标签条用物理方向的 `pr-7` 留渐隐区，首个标签比第二行多缩进 14px，这是改动前就有的，本次没有修，规范里已注明，留作后续。
- 规则写在 `.claude/rules/style-ui-guide.md`（Account tab second row）。
