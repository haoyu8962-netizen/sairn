<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-trading-protection-storage",
  "date": "2026-11-19",
  "title": "三项交易保护改用独立存储键（审查 r2-wave2-signing 的 P1-1、P2-2、P2-3）",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "wallet-onboarding"],
  "summary": "下单确认、市价单最大滑点、延迟保护原与普通设置同存在 global-settings-v2，旧标签页整条写回、两个当前标签页读写交错、更高版本记录冷启动迁移写回都会静默放宽它们。三项改为各自只由显式操作写入的键，迁移基线只写一次；已打开的窗口只跟随更严格的值；global-settings-v2 保持版本 4，并给旧版本写旧值与新值中更严格者；更高版本记录不迁移、不清理、不覆盖。决策见 ADR 0057。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0057-trading-protection-storage.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/adr/0045-l1-action-expiry.md" },
    { "path": "docs/work-memory/sessions/2026-11-12-second-wave-fixes.md" },
    { "path": "apps/terminal/src/stores/use-global-settings-store.ts" },
    { "path": "apps/terminal/src/lib/storage/trading-protection-storage.ts" },
    { "path": "apps/terminal/src/lib/tests/global-settings-cross-window.test.ts" },
    { "path": "apps/terminal/src/lib/tests/global-settings-store.test.ts" }
  ],
  "supersedes": []
}
-->
# 三项交易保护改用独立存储键

## 背景与范围

同步记录，没有取得任务标识。Codex 的离线审查 `r2-wave2-signing`（基线 `79b268ea`）报告 P1-1、P2-2、P2-3；Codex 随后开始修复，因额度用完中断，工作树里留下未完成的草稿，没有修复报告。Claude 核对外部依据、在基线代码上复现、评估草稿后重写了实现与文档。范围只限这三项，审查报告的其他发现不在本任务内。没有做 Git 写操作。

## 结论与依据

- 三项都在基线代码上用 jsdom 测试复现（6 个测试失败，见下）：
  - P1-1：旧版本整条快照写回后，当前窗口和新打开的窗口都回到跳过确认、关闭延迟保护、`5%` 滑点；只有主题的版本 3 记录让已收紧的 `1%` 滑点回到 `2.5%`。
  - P2-2：A 读出记录后 B 开启确认、A 再写主题，B 和新打开的窗口都回到跳过确认。
  - P2-3：版本 5 的宽松值冷启动被采用并以版本 4 写回；当前窗口忽略版本 5 的事件后改主题，整条覆盖了它。
- 外部依据：WHATWG HTML《Web storage》（事件只发给其他窗口、`setItem` 写完才广播、作者应假设没有锁）；MDN《Window: storage event》；W3C《Web Locks API》（只排斥申请同一把锁的代码、仅安全上下文）；zustand 5.0.9 `persist` 源码（创建时同步水合，版本不同且有 `migrate` 时迁移后立即写回）。据此判断 Web Locks 无法约束旧版本代码，改用每项一个只由显式操作写入的键。
- 草稿的取舍：保留「每项独立键 + 只写一次的迁移基线 + 只跟随更严格值」的思路；改掉给旧版本固定写最严格值（会让旧标签页和回滚后的所有用户立刻变成 `0.1%` 滑点）为「旧值与新值中更严格者」；去掉对主题首屏脚本和网络回退读取的改动（高版本记录里的普通设置仍按原样在冷启动读取，不需要改它们）；去掉显式保护操作绕过普通写入的旁路，改为先写自己的键再走普通写入；存储键名改用 `STORAGE_KEYS` 现有的 `名称-v1` 写法；草稿记录里的测试读数不是本次运行得到的，未沿用。
- 规则、格式、迁移与回滚见 [ADR 0057](../../adr/0057-trading-protection-storage.md)。

## 验证与限制

- 以下均为本次运行并看到的结果（Node `v22.15.0`，jsdom）。
- 复现：基线代码只加入复现测试，`global-settings-cross-window.test.ts` 与 `global-settings-store.test.ts` 得到 `Tests 6 failed | 32 passed (38)`。
- 修复后两文件 `Tests 43 passed (43)`。
- 变异（每次只改一行，跑两文件后恢复）：冷启动采用旧记录的确认值，4 个失败；显式操作不写自己的键，16 个失败；版本 5 视为受支持，3 个失败；已打开的窗口直接采用存储值（允许放宽），1 个失败；给旧版本的记录不取更严格者，2 个失败。
- 相关测试：按 `use-global-settings-store`、`GLOBAL_SETTINGS`、三项保护的 hook 名、`theme-color`、`lib/network` 在 `src` 与 `tests` 下检索到 125 个测试文件。第一次运行 `number-format-settings.test.ts` 2 项失败：实现漏掉了旧版本（低于 4）记录在冷启动按版本 4 写回的原有行为；恢复 `migrate` 后再跑，`Test Files 125 passed (125)`、`Tests 2412 passed (2412)`，退出码 0。修正后五个变异重跑，失败数与上面相同。
- `pnpm --filter @sairn/terminal typecheck` 退出码 0；改动的 5 个 TypeScript 文件 `biome check --write` 为 `No fixes applied`；`git diff --check` 无输出；`pnpm memory:check` 通过。`pnpm memory:test` 会在临时仓库做 Git 写入，本次未运行。
- 没有验证：真实浏览器多窗口与跨进程写入时序、真实的发布回滚与重新升级、旧版本代码与本版本同时运行的真机场景。

## 后续与替代关系

- [第二波修复记录](2026-11-12-second-wave-fixes.md)「已知边界」里关于发版过渡期旧标签页整份写回、高版本数据被覆盖的两条，对这三项保护由 ADR 0057 处理；普通设置仍是读改写，同一任务内读与写之间落下的其他窗口写入仍可能被覆盖。
- 需要运营方知道的取舍：回滚发布后，三项保护可能比用户在新版本里的最新选择更严格；「升级—回滚—在旧版本里收紧—再升级」会回到新版本里的选择（ADR 0057 后果与边界）。
