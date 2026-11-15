<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-15-cloudfront-release-p42",
  "date": "2026-11-15",
  "title": "CloudFront 生产发布 p42（三波审查修复，单分支流程下的第一次发布）",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "pr-review"],
  "summary": "运营方依次说「推送并开 PR」「合并」「发布 p42」。重定基线的 PR #6 四项 CI 通过后合入 main ebb8dbe9；在发布工作树按发布配置构建这个提交，预检通过（总量余 3,533，trade-terminal-page 余 203），同一份产物直接发布为 cloudfront-2026-11-15-p42（三闸门全开）：functions → lambda（版本 26，探活通过）→ sync（一次成功，1,655 次上传）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。这是迁到 haoyu8962-netizen/sairn、只有 main 之后的第一次发布，三波审查修复随它上线。真机与真实钱包验收没有做。",
  "thread": null,
  "baseCommit": "cdf3a8f6",
  "commits": ["488e53d0", "ebb8dbe9"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-15-p42-precheck-trade-page-rebaseline.md" },
    { "path": "docs/work-memory/sessions/2026-11-14-orchestration-handover.md" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "docs/agent-handbook.md" },
    { "path": "deploy/cloudfront/README.md" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/pull/6" },
    { "url": "https://app.sairn.ai/build-meta.json" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p42

## 背景与范围

同步记录，未取得任务标识。时间都是 UTC+8，2026-11-15。接着[预检与重定基线记录](2026-11-15-p42-precheck-trade-page-rebaseline.md)：那份记录写到重定基线的提交 `488e53d0` 留在本机为止。之后运营方的决定依次是：

1. 「推送并开 PR」：推送分支，开出 PR #6；
2. 「查 CI 结果」，随后「合并」；
3. 看到第二次预检的读数后，「发布 p42」。

本记录覆盖从 PR #6 到 p42 上线验证。p41 之后 `main` 上的全部提交（三波审查修复、仓库迁移相关改动、本次重定基线）随这次发布上线。

## 结论与依据

**PR #6。**

- 推送前核对 `origin/main` 仍是 `cdf3a8f6`。Codex 推送前审查没有运行：CLI 报额度用完，2026-11-20 恢复。
- 四个作业通过：`Build terminal (pairing false)` 4m53s、`Build terminal (pairing true)` 4m19s、`Test terminal and release tooling` 两片 5m23s 与 6m43s。检查列表里没有浏览器回归与 `Static Checks`，没有查原因。没有评论与审查。
- 以合并提交合入，锁定头提交 `488e53d0`：`main` = `ebb8dbe9`。`gh pr merge` 的一次请求报 TLS 握手超时，用 `git fetch` 核对了合并提交在 `origin/main` 上。

**预检即发布构建。** 发布工作树 `~/我的项目/sairn-release-p42` 检出 `ebb8dbe9`，没有重装依赖（合并只改脚本与文档，锁文件未变）。Node 22.15.0，开关与 p41 相同，`SAIRN_BUILD_SHA=ebb8dbe9…`、`SAIRN_RELEASE_ID=cloudfront-2026-11-15-p42`。453 个 chunk，无循环静态导入，预算脚本全部通过。余量是用各项上限减读数算的：

| 预算 | 读数 | 余量 |
| --- | ---: | ---: |
| 总量 | 3,394,530 | 3,533 |
| 静态交易启动 | 1,664,287 | 584 |
| 手机运行时增量 | 119,745 | 835 |
| 桌面运行时增量 | 204,648 | 8,035 |
| `trade-terminal-page` | 128,712 | 203 |
| `vaults-page` | 30,635 | 245 |
| `token-selector-popup` | 15,375 | 480 |

这次预检用的就是要发布的提交和正式的构建身份，所以没有再构建一次，直接发布了这份产物。

- `build-meta.json`：`ebb8dbe9 / cloudfront-2026-11-15-p42`，配对开；CCTP 主网赞助开、测试网外部钱包开、测试网赞助关；两网银行卡入金开；图表入口仍是 `charting_library.6d17e2dafb1007c4.js`。
- `build:lambda` 用同一组身份变量构建：`index.mjs` 235,215 字节；`deploy.mjs check-lambda` 报两个入口自包含。
- `deploy/verify-chart-build.mjs`（三个参数）退出码 0；产物里的 `sw.js` 与源文件相同；`_shell.html` 与 `assets/` 不含 `gatu.ai`。

**发布。**

- 空跑：`functions`、`lambda`、`sync` 的计划正常。
- `functions --execute --origin https://app.sairn.ai`（约 19:22:00–19:22:14）：两个函数发布到 LIVE，响应函数里是 4 个当前加 1 个上一版的内联脚本哈希。
- `lambda --function-name gatu-terminal-api --origin https://app.sairn.ai --execute`（19:22:18–19:22:33）：版本 26，代码 49,272 字节；探活通过（`/api/health` 204，`/api/geo` 返回真实结论）。
- `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（19:22:37–19:27:03）：一次成功，1,655 次上传，结尾为 `Release markers match the local build byte for byte: _shell.html, build-meta.json`。
- 失效（19:27:14–19:27:23）：主网 `ET9CNVE6L1GWN` 的 `IE3YD8WDR0N10WXNE53JXU1ZL3`，测试网 `E3Q2SAX402CR9F` 的 `I2WDA307U8R1AT3K0TGB37AYOG`。

## 验证与限制

- `verify`（失效约 95 秒后，19:28:59–19:29:33）：
  - `--origin https://app.sairn.ai --network mainnet` 15/15 ok；
  - `--origin https://testnet.sairn.ai --network testnet` 16/16 ok；
  - 两网 `build metadata parity` 都是 `ebb8dbe9 / cloudfront-2026-11-15-p42 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`；壳预加载 117 条。
- 发布后重读测试网的 `build-meta.json`，是 `ebb8dbe9 / cloudfront-2026-11-15-p42`。
- `csp-coverage.mjs https://app.sairn.ai`（19:29:33–19:31:47），结果来自解析完整 JSON 报告：33 步、0 违规、0 控制台错误，`scriptSrcViolations` 与 `otherViolations` 都为空，没有 report-only 头；跳过 2 步，与 p34–p41 相同；桌面 7 个面板，手机 3 个导航项。
- 运行时测试：没有在本机重跑全量终端 Vitest；PR #6 的 CI 两片单测在 `488e53d0` 上通过，`ebb8dbe9` 的树与它相同。
- 未做：
  - 真机与真实钱包验收。三波修复的关键路径（签名地址核对、TWAP 排队、订单簿回切、多标签页设置与收藏、诊断复制）都还只有自动测试与代码审查；
  - 真实浏览器登录与下单、Safari、Firefox 与读屏；
  - 回滚演练。
- CHANGELOG 仍在 Unreleased 下，与此前各次相同。发布日志在 `~/我的项目/p42-*.log`，没有入库。
- 发布工作树：`sairn-release-p42` 保留到下次发布；`gatu-release-p41` 是回滚产物；`gatu-release-p40` 可以删除，尚未删除。发布工作树的 `.env.local` 仍软链到旧克隆 `~/我的项目/gatu`。

## 后续与替代关系

本记录不取代其他记录。

- 标签 `cloudfront-2026-11-15-p42` 指向 `ebb8dbe9`，写本记录时只在本机，推送要运营方同意（推送会触发 `Production Builds`）。
- 按交接记录的顺序，下一步是真机与真实钱包验收三波修复。
- `trade-terminal-page` 在发布配置下只余 203：下一个让它变大的改动会让预检再次不通过。提高这一项的允许增量，或改在发布配置下定它的基线，待运营方决定。
- 删除 `gatu-release-p40` 及更早的发布工作树前，先问运营方。
- 工作手册第 1、3 节仍有旧仓库名与 `dev` 的写法，本次只校订了第 8 节。
