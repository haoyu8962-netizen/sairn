<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-referral-join-uppercase-leaderboard-title",
  "date": "2026-11-19",
  "title": "邀请链接的码转大写，排行榜空显示名悬停显示完整地址",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review"],
  "summary": "运营方 2026-11-19 决定需要决定的事项照官方终端做。两处按官方改：/join/:code 解析出的码统一转大写，与提交前的 normalizeReferralCode 一致，路由用新函数 resolveReferralJoinRouteCode 比较两侧都转大写后的码，小写链接仍能打开邀请；排行榜显示名为空时，交易者链接加回 title（完整地址），不加 aria-label，可访问名称仍是可见的缩短地址。4 个邀请链接用例与 4 个排行榜用例在修复前失败，三处变异都让测试变红。没有做浏览器或真机验收。",
  "thread": null,
  "baseCommit": "ba6dca8e",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/lib/trade/referral-join.ts" },
    { "path": "apps/terminal/src/routes/join.$code.tsx" },
    { "path": "apps/terminal/src/lib/tests/referral-join.test.ts" },
    { "path": "apps/terminal/src/components/leaderboard/leaderboard-view.tsx" },
    { "path": "apps/terminal/src/components/leaderboard/__tests__/leaderboard-trader-link.test.tsx" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/leaderboard-vaults-staking-redesign-notes.md" },
    { "url": "https://www.w3.org/TR/accname-1.2/" }
  ],
  "supersedes": []
}
-->
# 邀请链接的码转大写，排行榜空显示名悬停显示完整地址

## 背景与范围

同步记录，2026-11-19，未取得任务标识。任务来自编排会话：运营方当天决定「需要决定的事项照官方终端的做法执行」，官方做法取自同日对官方终端生产包的静态阅读（取证报告第 6、10 项，不在仓库中）。审查报告 `h4-referral-apiwallet-leaderboard` 由 Codex 提出，上一轮（`ba6dca8e`）已让邀请链接只接受可提交的码、排行榜空显示名回退到缩短地址，并去掉了 `title`。本轮只做两处与官方对齐的改动。

基线为分支 `codex/referral-apiwallet` 的 `ba6dca8e`。

## 结论与依据

1. **`/join/:code` 转大写（改）。** 官方入口对路由参数调用 `toUpperCase()`；Sairn 提交 `setReferrer` 前的 `normalizeReferralCode` 也转大写，但链接解析保留原样，邀请页显示的码与实际提交的码大小写不同。现在 `parseReferralJoinPath` 返回转大写后的码（仍只接受 1–20 位 ASCII 字母与数字）。路由原先比较「浏览器路径解析出的码」与「路由解码后的参数」，转大写后小写链接会变成 404，因此新增 `resolveReferralJoinRouteCode`，两侧都转大写后比较。
2. **排行榜空显示名加回 `title`（改）。** 官方在显示名为空时显示缩短地址并悬停提示完整地址。现在交易者链接在没有可见显示名时带 `title`（完整地址），有显示名时不带；不加 `aria-label`。依据 W3C Accessible Name and Description Computation 1.2：链接有可见文字内容时，可访问名称取自内容，`title` 只作为描述，所以名称与可见文字一致（WCAG 2.5.3 Label in Name 不受影响）。

## 验证与限制

运行过并看到结果（Node 22.15.0，Vitest `--maxWorkers=2`，沙盒外运行）：

- `referral-join.test.ts` 改动前 4 个用例失败（含新函数不存在），改动后 17 个全部通过；`leaderboard-trader-link.test.tsx` 改动前 4 个用例失败，改动后通过。
- 变异：解析结果改回原样返回，4 个用例失败；路由比较改为直接比较原参数，1 个用例失败；`title` 改为缩短地址，4 个用例失败。每次都改回原文。
- 推荐、排行榜、i18n、品牌目录、公网来源、仪表盘圆角等 18 个测试文件 471 个用例通过；`pnpm --filter @sairn/terminal typecheck` 退出 0；改动的 TS/TSX 文件 `biome check --write` 退出 0。`boot-dashboard-route.test.ts` 钉的路由源码字符串随变量名更新。

没有做的：浏览器中打开小写邀请链接、悬停查看提示；读屏实测；官方做法只来自压缩代码阅读。

## 后续与替代关系

- 仓库没有专门的推荐页规范文档，邀请链接的规则暂写在 `docs/runtime-guardrails.md` 关于 `/join/$code` 的段落之后；是否另立文档由主会话决定。
- 本记录不替代任何既有记录；`commits` 待主会话提交后补。
