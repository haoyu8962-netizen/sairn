<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-dead-code-low-risk-cleanup",
  "date": "2026-11-19",
  "title": "死代码低风险清理：删除 UI_TEXT 与 lib/errors 桶文件，给旧设计和功能计划补历史状态",
  "kind": "task",
  "status": "verified",
  "topics": ["docs-governance", "i18n-runtime"],
  "summary": "Codex 死代码取证（基线 79b268ea）建议的低风险一组，由 Claude 逐项复核后裁定：删除 config/ui-text.ts 的废弃 UI_TEXT 对象（保留 SideLabels 与 getSizeModeLabel）、重新提取七个语言目录、删去 action-progress-label-contract 的过期登记；删除无消费者的 lib/errors/index.ts 桶文件；给 docs/redesign.md、docs/error-handling-architecture.md 与三份 features 早期计划追加历史状态并在 features/README.md 登记。lib/chart/index.ts 保留：任务记录 2026-10-02-remove-dead-chart-format-module 把它列为来源，删除会让 memory:check 失败，而记录不能为通过校验改写。FavoritesStrip、boneyard-js、依赖收敛与共享包导出不在本次范围。类型检查、全部契约测试与受影响测试、scripts 测试与 memory:check 通过。",
  "thread": null,
  "baseCommit": "79b268ea",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/config/ui-text.ts" },
    { "path": "apps/terminal/src/lib/tests/action-progress-label-contract.test.ts" },
    { "path": "docs/redesign.md" },
    { "path": "docs/error-handling-architecture.md" },
    { "path": "features/README.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-remove-dead-chart-format-module.md" }
  ],
  "supersedes": []
}
-->
# 死代码低风险清理：删除 UI_TEXT 与 lib/errors 桶文件，给旧设计和功能计划补历史状态

## 背景与范围

Codex 对基线 `79b268ea` 做了死代码、遗留文件与依赖重复取证，并把「废弃翻译对象、无消费者桶文件、历史文档状态」列为可以放进同一个低风险 PR 的一组。Codex 开始修复后因额度中断，只留下未完成的草稿，没有修复报告。本记录是 Claude 复核草稿并独立完成的结果。任务标识没有取得，`thread` 为 null。

范围只包括这一组。依赖收敛（会改 `pnpm-lock.yaml`）、`patches/`、共享包公开导出、`boneyard-js` 替换与其余 70 个零引用声明都不在本次范围。

## 结论与依据

- `UI_TEXT`（`apps/terminal/src/config/ui-text.ts`）：全仓只有 `i18n-reactivity-contract.test.ts` 的「组件不得使用它」断言和历史评审文本提到它，没有代码读取。删除对象和因此失去用途的两个导入，保留仍被使用的 `SideLabels` 与 `getSizeModeLabel`。七个 `messages.po` 用 `lingui extract` 重新生成，结果与草稿逐字节相同：去掉 `ui-text.ts` 的来源行，五个只由它提供的消息（Balance、Cross Leverage、Failed to load order book.、Margin Ratio、Margin Used）转为过时条目。`action-progress-label-contract.test.ts` 删去 `config/ui-text.ts` 的登记；保留登记时该测试失败（目录里 38 项对登记 37 项），证明契约会抓到这项过期登记。
- `apps/terminal/src/lib/errors/index.ts`：没有模块导入它。`@/lib/errors` 在删除前后都解析到同级的 `lib/errors.ts`（文件优先于目录索引），`errors.test.ts` 用到的 `formatErrorForDisplay` 来自该文件。旧文档 `docs/error-handling-architecture.md` 的示例按 `@/lib/errors` 导入一套从未落地的 API，因此在文首追加历史状态说明，原文保留。
- `apps/terminal/src/lib/chart/index.ts`：同样没有模块导入，但保留。任务记录 `2026-10-02-remove-dead-chart-format-module.md` 的 `sources` 列出这个路径，删除后 `pnpm memory:check` 报 `ENOENT` 失败；工作记录 README 规定不能删除来源以绕过校验，历史记录也不改写。以后若要删它，需要先决定如何为已删路径登记来源。
- `docs/redesign.md` 文首追加历史状态与现行规范链接；`features/arbitrum-deposit.md`、`isolated-margin.md`、`sdk-api-directory.md` 文首追加历史计划说明，原 `Planned` 字段保留，并在 `features/README.md` 新增「Historical Plans」表登记现行参考。
- 草稿里的 `dead-code-cleanup-contract.test.ts` 撤掉：它只断言文件不存在和文档里含某些词，钉的是这次改动的实现，不是规则；导入失效由类型检查发现，目录与登记一致由既有契约发现。
- `FavoritesStrip` 无消费者，但 `2026-09-16-market-header-view-migration.md` 记载它是有意保留的组件入口，本次不删。

## 验证与限制

在工作树（基线 `79b268ea` 加本次改动）上运行并看到结果：

- `pnpm typecheck`（hl-react、ui、terminal）退出 0。
- `pnpm exec vitest run --maxWorkers=2 src/lib/tests/*contract*.test.ts` 加 `errors`、`action-error`、`i18n-hot-switch`、`chart-datafeed`、`order-validation`、`trade-header*` 测试：57 个文件、1305 项全部通过。
- `node --test scripts/*.test.mjs`：80 项通过；`pnpm memory:check` 通过（删除 `lib/chart/index.ts` 时失败，见上）；`git diff --check` 无输出；`biome check` 对改动的 TypeScript 文件无修改。

没有运行完整终端测试、生产构建、包体预算与浏览器检查；源码字节减少不等于生产包体减少。

## 后续与替代关系

- `lib/chart/index.ts` 的去留，取决于工作记录如何引用已删除文件。
- 其余零引用声明、`boneyard-js` 替换、终端 Tailwind 版本对齐、viem／wagmi／WalletConnect 收敛与共享包导出裁剪，按 Codex 取证报告各自单独处理。
