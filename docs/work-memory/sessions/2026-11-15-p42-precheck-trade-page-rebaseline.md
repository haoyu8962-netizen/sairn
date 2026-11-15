<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-15-p42-precheck-trade-page-rebaseline",
  "date": "2026-11-15",
  "title": "p42 发布预检与 trade-terminal-page 重定基线",
  "kind": "task",
  "status": "recorded",
  "topics": ["static-hosting", "pr-review"],
  "summary": "接手编排交接后核对状态，按运营方要求做 p42 发布预检：main cdf3a8f6 的发布配置构建通过全部预算，但 trade-terminal-page 只剩 196 字节，低于手册要求的 200，预检不通过。运营方选「先重定基线」。按复现规则构建同一提交，把此前没有计入的 6 字节增长加进基线（124,909 → 124,915），预检构建对新基线余 202。没有发布。",
  "thread": null,
  "baseCommit": "cdf3a8f6",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-14-orchestration-handover.md" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "docs/agent-handbook.md" },
    { "path": "scripts/check-client-bundle-budget.mjs" }
  ],
  "supersedes": []
}
-->
# p42 发布预检与 trade-terminal-page 重定基线

## 背景与范围

同步记录，2026-11-14 至 2026-11-15，未取得任务标识。运营方贴出[编排交接记录](2026-11-14-orchestration-handover.md)的摘要，随后说「开始 p42 预检」，看到结果后选「先重定基线」。

范围：核对交接记录里的状态；p42 发布预检；`trade-terminal-page` 一项预算的重定基线。没有发布，没有改应用代码。

## 结论与依据

### 状态核对（2026-11-14）

- 交接记录已经通过 PR #5 合入 `main`（`cdf3a8f6`），不再只在本机。远端只有 `main`，没有打开的 PR，最新发布标签是 `cloudfront-2026-11-12-p41`。
- 线上 `https://app.sairn.ai/build-meta.json` 的发布号是 p41，三个闸门全开。`main` 在 p41 标签之后有 72 个提交没有发布。
- `~/我的项目/sairn` 里没有 `apps/terminal/.env.local` 与 `.env.across.local`（交接记录「需要运营方做的」第 1 项还没做）。

### 发布预检

发布工作树 `~/我的项目/sairn-release-p42`（仓库外），检出 `cdf3a8f6`，Node 22.15.0、pnpm 10.21.0 按锁文件安装。`apps/terminal/.env.local` 软链到旧克隆 `~/我的项目/gatu` 里的同名文件，没有读内容；图表库从固定克隆复制，`pnpm chart:check` 报告与清单一致（1163 个文件）。开关与 p41 相同：配对开、三个闸门开、测试网赞助充值关、`VITE_HYPERLIQUID_TESTNET` 为空，发布号 `cloudfront-2026-11-15-p42`。

构建成功：453 个 chunk，无循环静态导入，预算脚本全部通过，`build-meta.json` 的闸门值与预期一致。按手册第 8 节的余量要求（总量 1,000，其余 200）：

| 预算 | 读数 | 余量 | 结果 |
| --- | ---: | ---: | --- |
| 总量 | 3,394,329 | 3,734 | 通过 |
| 静态交易启动 | 1,664,201 | 670 | 通过 |
| 手机运行时增量 | 119,741 | 839 | 通过 |
| 桌面运行时增量 | 204,654 | 8,029 | 通过 |
| `trade-terminal-page` | 128,713 | 196 | 不通过 |
| `vaults-page` | 30,637 | 243 | 通过 |
| `token-selector-popup` | 15,378 | 477 | 通过 |

其余命名块的余量都在 1,000 以上。

### 重定基线

按[性能基线](../../terminal-performance-baseline.md)的复现规则，在固定克隆的新工作树里构建同一提交：没有 `.env.local`，固定构建身份，`VITE_MOBILE_PAIRING_ENABLED=false`。`trade-terminal-page` 读 128,557，余 352。

2026-11-05 定基线时协议构建读 127,808、余 358。此后这个块增长 749 字节，第三波只计入了其中的 743，剩下 6 字节没有计入。本次把这 6 字节加进基线：124,909 → 124,915，允许增量不变。对新基线，协议构建余 358，p42 预检构建余 202。读数、对照来源与局限写在性能基线文档的「Trade-page re-baseline before release p42」一节。

## 验证与限制

- 两次构建都在 Node 22.15.0 下完成，退出码 0；日志在 `~/我的项目/p42-precheck-build.log` 与 `p42-rebaseline-off.log`，没有入库。
- 这次没有构建对照的基准树，6 字节是用性能基线文档里已有的读数算出来的。
- 改完基线后没有重新构建：202 是用预检构建的读数对新基线算出的，正式构建与预检构建只差构建时间。
- 脚本测试与记录校验的结果见提交前的运行（`node --test scripts/*.test.mjs`、`pnpm memory:check`、`pnpm memory:test`）。
- 没有做真机、真实钱包验收，也没有发布。

## 后续与替代关系

本记录不取代其他记录。

- 本次改动合入 `main` 后，在发布工作树检出新的 `main` 重做一次预检，再发布 p42 并打标签。
- 发布配置下 `trade-terminal-page` 的读数比协议构建高约 150 字节（本次 156，p40 前 139）。按协议构建留约 350 字节的基线，发布构建只剩约 200，正好在预检门槛上；p38、p40、p42 三次预检都停在这一项。要不要提高这一项的允许增量，或改在发布配置下定这一项的基线，待运营方决定。
- 工作手册第 1、3 节仍有旧仓库名与 `dev` 的写法，本次没有改，可并入交接记录建议的文档合批。
- 把两个环境文件拷到 `~/我的项目/sairn` 仍待运营方做；在那之前发布工作树的软链指向旧克隆。
