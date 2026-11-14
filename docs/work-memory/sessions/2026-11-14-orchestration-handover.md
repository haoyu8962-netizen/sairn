<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-14-orchestration-handover",
  "date": "2026-11-14",
  "title": "编排交接：仓库迁移与三波审查修复之后的状态、待办与决定",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "docs-governance", "static-hosting"],
  "summary": "运营方额度将尽，要求停下全部任务并交接。仓库已迁到公开的 haoyu8962-netizen/sairn，只有 main；三波审查修复都已合入 main（eb903605），均未发布，线上仍是 p41。本记录列出当前状态、没有修完的审查项、需要运营方决定或操作的事，以及下一个会话的起点。",
  "thread": null,
  "baseCommit": "eb903605",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-12-global-defect-review.md" },
    { "path": "docs/work-memory/sessions/2026-11-13-repository-move-and-chart-library.md" },
    { "path": "docs/work-memory/sessions/2026-11-13-third-wave-fixes.md" },
    { "path": "docs/adr/0054-chart-library-outside-the-repository.md" },
    { "path": "docs/adr/0055-single-main-branch-and-release-tags.md" },
    { "path": "docs/adr/0056-no-external-requests-from-automation.md" },
    { "path": "docs/agent-handbook.md" }
  ],
  "supersedes": []
}
-->
# 编排交接（2026-11-14）

## 背景与范围

同步记录，未取得任务标识。运营方：「所有任务先停，跟着做下编排交接，我额度快没了。」交接时没有运行中的子代理或后台任务。下一个会话先读本记录、[agent 工作手册](../../agent-handbook.md)，再 `git fetch` 核对 `main` 与打开的 PR。

## 结论与依据

### 当前状态（2026-11-14 核对）

- **仓库：** `haoyu8962-netizen/sairn`，公开，只有 `main`（`eb903605`），没有打开的 PR。`main` 有分支保护（必须经 PR、禁止强推与删除、对管理员生效），只允许 merge commit，合并后自动删分支。
- **固定克隆：** `~/我的项目/sairn`，依赖与图表库已装好（`pnpm chart:fetch`）。本记录所在分支 `docs/handover-2026-11-14` 只在本机。
- **旧克隆：** `~/我的项目/gatu` 指向被封停的 `zora4523-bot/gatu-app`，不能推送；里面没有尚未迁移的工作（已逐个分支核对）。
- **私有仓库：** `gatu-chart-library`（图表库，CI 用 `CHART_LIBRARY_TOKEN` 只读检出，令牌 2027-11-13 到期）；`gatu-app-old-history`（带旧历史，等运营方删除）。
- **工作流：** 没有定时工作流，任何工作流都不请求交易所接口（ADR 0056）。`Claude Code Review` 在仓库设置里手动停用。CI 全量终端单测两片各约 5 分钟。
- **线上：** 仍是 p41（标签 `cloudfront-2026-11-12-p41`）。三波修复都在 `main` 上，**都没有发布**。

### 规则变化（下一个会话要遵守）

- 分支流程见 ADR 0055：PR 直接进 `main`，没有 `dev`。2026-11-13 之前的记录里的 `dev`、晋升 PR、`Promotion coverage` 已过时。
- 旧提交号对照在 `docs/work-memory/legacy-commits.txt`；PR 编号从 #1 重新开始，旧仓库的 #1–#161 查不到。
- 不加定时工作流，不让 CI 请求第三方接口；测试只连本机（ADR 0056）。运营方认定旧账号因定时任务被封，因果未经 GitHub 确认。
- 提交身份用 `haoyu8962-netizen` 与它的 noreply 邮箱（全局 git 配置已改）。公开前要查提交元数据里的邮箱，不只扫文件内容。

### 全局审查没有修完的项

- **部分修：** P1-3 地区接口（WAF 速率规则、`geo_lookup_failure` 告警要在 AWS 上配）；P1-6 发布后重下（根因是应用入口与第三方库同块，没动）；P2-17 契约漏洞（`mobile-data-presentation-contract` 证明了没修）。
- **没修：** P2-18 文档状态漂移（ADR 索引多行仍写「未合入 dev」）；P2-19 巨型组件与双端重复；P3：发布从不删除旧文件、IAM 文件含 AWS 账号标识（现在公开）、死代码、依赖（viem 多版本等）、规则体量、iOS 启动图。
- **待证实（没查）：** TP/SL 父单被拒的批量回包判定；Privy 会话令牌存储方式；`/api/*` 5xx 是否被 CDN 缓存；带点的市场路由。
- **修复中新发现：** TWAP 终止的执行宿主仍在页签面板里；`wallet-modal.tsx` 对话框打开时在 effect 里重连、可能走到邮箱钱包创建（按「只由点击打开」登记，待确认是否符合 ADR 0033）；手机持仓页签的被动加载转圈与 `command-menu` 没有关闭控件，待设计决定。

## 验证与限制

本记录只陈述状态，不新增验证。三波修复的读数见各自记录；所有修复只经过自动测试与代码审查，真实钱包、真机、真实浏览器多标签页没有验证，也没有按 ADR 0055 的单分支流程完整发布过一次。

## 后续与替代关系

本记录不取代其他记录。

**需要运营方做的：**

1. 把旧克隆的 `.env.across.local`、`apps/terminal/.env.local` 拷到 `~/我的项目/sairn` 对应位置（代理不读这些文件）。
2. 在 AWS Lambda 控制台确认 `gatu-terminal-api` 的超时是 30 秒（不是就改成 30 秒）。
3. 删除私有仓库 `gatu-app-old-history`。
4. 决定官网快照的 7 天规则：大约 2026-11-20 之后触发官网构建的 PR 会失败。选项：每周在本机跑 `pnpm --filter @sairn/website markets:snapshot` 并提交，或把日期检查从构建挪到官网发布前。
5. 上面「修复中新发现」里的三项决定；是否轮换 IPdata 密钥；`/api/*` 的 WAF 与告警。
6. 回复独立会话「按任务选模型与思考强度」：贴 `/usage`、`/effort` 输出，决定 `log-reader` 的行数门槛。

**下一个会话的建议顺序：**

1. 按新流程做一次发布（p42）：预检、构建、发布、打 `cloudfront-<日期>-p42` 标签，并按发布结果校订工作手册第 8 节。三波修复要先上线才谈得上真机验收。
2. 真机与真实钱包验收三波修复的关键路径（签名地址核对、TWAP 排队、订单簿回切、多标签页设置与收藏、诊断复制）。
3. 低风险合批：P2-18 文档状态、`mobile-data-presentation-contract`。
4. 需要设计或运营方决定后再做：P2-19 重构、发布删除旧文件、IAM 文件里的账号标识。
