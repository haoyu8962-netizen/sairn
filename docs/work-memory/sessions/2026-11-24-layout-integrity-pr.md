<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-24-layout-integrity-pr",
  "date": "2026-11-24",
  "title": "布局巡检分支接续与提交前验证",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "docs-governance"],
  "summary": "接手布局巡检分支既有的三份未提交改动。复现并修复单轴滚动、无盒包装和零尺寸容器的巡检盲点。手机历史与金库夹具等真实内容就绪后再读取几何，手机待处理清单仍按字段命中数比较。范围限于浏览器测试、夹具和文档。",
  "thread": null,
  "baseCommit": "e60d68f0",
  "commits": ["7368e225", "a2e337e0"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-21-layout-integrity-pilot.md" },
    { "path": "docs/layout-integrity.md" },
    { "path": "apps/terminal/tests/browser/layout-integrity.pw.ts" },
    { "path": "apps/terminal/tests/browser/mobile-history-cards.pw.ts" },
    { "path": "apps/terminal/tests/browser/vaults-list.pw.ts" }
  ],
  "supersedes": []
}
-->
# 布局巡检分支接续与提交前验证

## 背景与范围

2026-11-24 同步记录，未取得任务标识。运营方要求检查 Claude 的布局巡检分支及 3 个未提交改动，测试通过后提交、推送并开 PR 到 `main`。接手时 `claude/layout-integrity-pilot` 位于 `e60d68f0`，已包含当时的 `origin/main` `a2e337e0`。原有未提交改动位于布局探针、探针自测和手机历史卡片测试。

## 结论与依据

- 保留原有的滚动内容跳过规则及按字段计数的手机历史卡片待处理清单。审查复现了滚动轴混用、无盒和零尺寸包装的误报或漏报，修正判定并补进既有探针自测。
- 手机历史夹具等待成交、委托和资金费三组卡片及其明细可见，再等字体就绪，另检查可见的 SMALL2000 徽标文字未被裁切。金库测试在量测前等待列表或详情已经渲染，并检查页面异常。
- `docs/layout-integrity.md` 记录按字段计数的边界和需人工复核的 CSS 情形。本分支只涉及测试、夹具和文档。

## 验证与限制

- 审查使用本机 Chrome 最小 HTML 验证混合滚动轴、无盒裁切边界、零尺寸包装和容差。其后独立复审没有发现阻塞项。
- Playwright 使用本机 Chrome 跑手机历史卡片 7 项。探针和金库共用配置 22 项在本机 Chrome 通过，最终探针规格也和金库规格一起用 `CI=1` 的 Playwright 自带 Chromium 在 macOS 上复跑 22 项通过。
- `pnpm typecheck` 通过，覆盖终端和两个共享包。CI 工作流契约 20 项通过。`git diff --check` 通过。仓库 Biome 配置未纳入浏览器测试目录，定向命令未检查文件。
- Node 24.15.0 下运行 `pnpm --filter @sairn/terminal test --maxWorkers=4`，774 个文件和 11,697 项通过，1 个文件和 1 项跳过，退出码 0。
- 金库测试在 CI 浏览器分片内。探针自测与手机历史卡片独立夹具仍按文档用本地命令验证。没有运行真机、Safari 或发布验收。

## 后续与替代关系

本记录接续试点记录。手机历史卡片已有的截断与裁切问题仍在测试的 `PENDING` 清单中，实际布局由后续界面任务调整。
