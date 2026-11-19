<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-chart-install-review-fixes",
  "date": "2026-11-19",
  "title": "公开仓库安全审查：CI 图表库暴露面、图表安装脚本与 DeepSec 导出目录",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "static-hosting", "pairing-release"],
  "summary": "Codex 安全审查的 CI 图表库、安装脚本与 DeepSec 三项由 Claude 核对。CI 按 GitHub 文档做威胁分析后不改工作流，理由记入 ADR 0054；安装脚本补目录软链检查、clone 选项边界与错误信息去凭据；DeepSec 导出目录加忽略规则。移动配对改为手机本地生成密钥只出设计，未改实现。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": [],
  "sources": [
    { "path": "scripts/fetch-chart-library.mjs" },
    { "path": "scripts/fetch-chart-library.test.mjs" },
    { "path": ".deepsec/.gitignore" },
    { "path": "docs/adr/0054-chart-library-outside-the-repository.md" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "docs/adr/0039-link-mobile-device-builder-fee-and-session-priority.md" },
    { "url": "https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions" },
    { "url": "https://docs.github.com/en/actions/reference/security/secure-use" },
    { "url": "https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching" },
    { "url": "https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets" }
  ],
  "supersedes": []
}
-->
# 公开仓库安全审查：CI 图表库暴露面、图表安装脚本与 DeepSec 导出目录

## 背景与范围

没有取得会话标识（`thread: null`）。来源是 Codex 对公开仓库的安全审查报告（本地 `r7-security-public.md`，不入库）中的四项：P1「有密钥的 CI 作业执行 PR 控制的代码并能读到私有图表库」、P1「移动配对链接携带交易私钥」（只出迁移设计，不改实现）、P2「DeepSec 导出目录没有忽略规则」、P3「图表安装只检查最后一级软链、`git clone` 参数缺少选项边界」。Codex 修复任务在额度用完时中断，没有报告；它留下的草稿由 Claude 逐项裁定，并按 GitHub、pnpm 与 Hyperliquid 官方文档核对。基线 `79b268ea`。

## 结论与依据

- **CI（P1 第 1 项）：机制属实，工作流不改。** fork PR 与 Dependabot 拿不到仓库密钥，没有 `pull_request_target`，手动触发与推标签需要写权限，而有写权限的人本来就能读取全部密钥；剩下的是供应链风险。图表库本来就由生产站在 `/charting_library/*` 公开提供；拆作业只能经构件或缓存传库，在公开仓库里等于公开；pnpm 10 默认不跑依赖的安装脚本，调换顺序无用；环境审批对 PR 运行换不来隔离。完整理由与运营方可做的设置见 [ADR 0054](../../adr/0054-chart-library-outside-the-repository.md) 的同日补记。草稿本来就没有改工作流。
- **安装脚本（P3）：成立，影响低，已改。** 清单路径上的中间目录软链此前能通过核对（内容仍受 SHA-256 约束）；现在逐级 `lstat`。库根不检查，因为它由操作者指定。`git clone` 加 `--`。克隆失败提示原样打印 `CHART_LIBRARY_REPOSITORY`，地址带令牌时会打出令牌；现在去掉用户信息，Git 自己的报错保留（本机 Git 2.54 实测会自行隐去 URL 里的凭据）。
- **对草稿的裁定：** 保留中间目录检查与 `--`；撤掉根目录软链拒绝（会拒绝操作者经软链给出的 `--from`，没有对应威胁）；撤掉随机暂存目录（原来的 `${target}.incoming-${pid}` 先删后建、`rm` 不跟随软链，没有可复现的缺陷）；撤掉「屏蔽 Git stderr、提示里不写地址」，改为去凭据后照常输出；撤掉 `scripts/` 下与 Biome 无关的换行重排（Biome 只检查 `**/src/**`）；撤掉对 ADR 0054 决策 4 原文的改写，改为追加补记。
- **DeepSec（P2）：成立，已改。** `.deepsec/.gitignore` 加 `/findings/`，README 写明命令在 `.deepsec/` 下运行。
- **移动配对（P1 第 2 项）：不改实现。** 官方终端同样把 Agent 私钥放进二维码，而且在查询串里（[ADR 0015](../../adr/0015-link-device-alignment.md) 背景、2026-09-24 官方取证记录）；Hyperliquid `approveAgent` 只需要 Agent 地址。「手机本地生成密钥、桌面只批准地址」的迁移设计在本次交付报告里，涉及 ADR 0015 D7/D8、ADR 0039 与 AGENTS.md 的移动连接契约，需要运营方决定。

## 验证与限制

- Node 22.15.0，`node --test scripts/fetch-chart-library.test.mjs`：在基线脚本上 11 项中 4 项失败（两种中间目录软链、`--` 边界、错误信息含令牌）；改后 11 项通过。三处变异（去掉中间目录检查、去掉 `--`、去凭据函数原样返回）各自让对应用例失败，恢复后通过。
- `git check-ignore .deepsec/findings/example.md`：改前退出码 1，改后 0。
- 用真实 Git 做的一次性实验：当唯一位置参数是空临时目录时，以 `--upload-pack=` 开头的仓库地址没有执行命令；当它是一个已有仓库时会执行。脚本的位置参数是新建的空目录，所以没有证实命令执行。
- 没有验证：GitHub 上的实际密钥作用域、令牌到期设置、fork 运行审批与标签规则集；`pnpm chart:check` 对真实图表库的运行（按任务规则不读图表库）；CI 上的运行。

## 后续与替代关系

- 运营方：核对 `CHART_LIBRARY_TOKEN` 的范围与到期日；决定是否改用 GitHub App 短期令牌；决定是否推进手机本地生成密钥的方案（需要新 ADR 取代 ADR 0015 D7）。
- 加入协作者或让自动化凭外部输入推送分支时，重新评估 CI 结论。
