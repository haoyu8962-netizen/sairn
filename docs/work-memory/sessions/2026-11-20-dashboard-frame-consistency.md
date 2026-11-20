<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-20-dashboard-frame-consistency",
  "date": "2026-11-20",
  "title": "仪表盘页面统一外框：左右留白、最大宽度、手机版式与标题字号",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review"],
  "summary": "运营方报告切换 Vaults 与 Staking 等页面时内容一宽一窄。原因是每个路由在 dashboard-frames.ts 里各写一套留白与最大宽度，三个页面在手机上是通栏平面。现在十一个数据页面共用一个外框常量与一个最大宽度变量，手机上全部是带 16px 留白的圆角面板，页面标题统一为 text-xl。只在未连接钱包的状态下用无头浏览器量过，真机与已连接状态未验证。",
  "thread": null,
  "baseCommit": "ba78481a",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/config/dashboard-frames.ts" },
    { "path": "apps/terminal/src/lib/tests/dashboard-frame-view.test.tsx" },
    { "path": "apps/terminal/tests/browser/dashboard-frame-audit.mjs" },
    { "path": ".claude/rules/style-ui-guide.md" }
  ],
  "supersedes": []
}
-->
# 仪表盘页面统一外框（2026-11-20）

## 背景与范围

同步记录，未取得任务标识。运营方在本机开发服务器上选中 Staking 与 Vaults 的面板，指出两页的框宽不一致，切换时一短一长，手机端也有，要求双端保持一致并检查其他地方有没有同类问题。范围是 Portfolio、Earn、Vaults（含详情）、Staking、Referrals、Leaderboard、Funding Comparison、API Wallet 和三个历史页；法律、Docs、Support 是阅读栏，不在范围内。

## 结论与依据

- **原因（改动前在 `ba78481a` 上量得）：** 每个路由在 `DASHBOARD_FRAMES` 里各写一套 `mainClassName`。桌面左右留白有 40px 与 32px/64px 两套，最大宽度有 1440px 与 1600px 两个；上边距有 16、20、24、32px；手机上 Leaderboard、Funding Comparison、API Wallet 没有留白、面板不带圆角（当时规范允许的「通栏平面」）。窗口 1266px 时 Staking 内容宽 1138px、Vaults 1186px，与运营方的截图一致。
- **同类问题：** 页面标题字号也各不相同（桌面 20、28、40px，手机 16、20、24、32px），Portfolio 标题是常规字重。
- **做法：** 新增 `DASHBOARD_MAIN_CLASS`，十一个数据路由全部引用它；最大宽度只留一个变量 `--dashboard-frame-max`（90rem），删除 `--earn-frame-max`、`--earn-frame-wide-max`、`--staking-frame-max`、`--api-wallet-frame-max`。三个通栏页面改为始终 `overflow-hidden rounded-24`。页面 `<h1>` 统一为 `text-xl font-bold`。API Wallet 的有效期三选项在 360px 以下改为单列，因为面板变窄后 320px 宽度上标签被截断。
- **数值的选择是代理的判断：** 40px 留白与 1440px 是改动前多数页面的取值；运营方只要求「一致」，没有指定数值。
- **规范与契约：** `.claude/rules/style-ui-guide.md`（Dashboard page gutters）改为单一外框、手机不再有通栏平面、标题同一字号；`dashboard-frame-view.test.tsx` 钉住共享外框、唯一的宽度变量、页面目录里不出现只在桌面生效的圆角、以及各页标题字号；`dashboard-surface-radius-contract.test.ts` 删除通栏平面的例外。

## 验证与限制

- `node apps/terminal/tests/browser/dashboard-frame-audit.mjs http://localhost:3005`（无头 Chromium，未连接钱包，2026-11-20，工作区在 `ba78481a` 之上）：1720、1440、1266、1100、375px 五种宽度下十二个路由的留白、上边距、内容宽度、标题字号全部相同，无横向溢出，退出码 0。这是脚本读数，不是人工视觉审查。
- 另用无头浏览器在 375 与 320px 看了三个原通栏页面的截图，并确认有效期标签不再被截断。
- 自动检查的结果见提交说明所在的回复；本记录不替它们作证。
- 没有验证：已连接钱包的各状态、真机、右到左语言、浅色主题的观感。页面内部的卡片间距、面板内边距（16px 与 20px 并存）没有统一。

## 后续与替代关系

- 取代 `.claude/rules/style-ui-guide.md` 里 2026-09-29 的「通栏平面」规则，以及两份设计笔记里对应的外框取值（已各追加更正）。
- 待运营方决定：是否认可 40px / 1440px 这组数值；Portfolio 标题由常规字重改为粗体是否保留；Vaults 是一整张面板而 Staking 是分开的卡片，这一结构差异没有动。
