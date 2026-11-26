<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-24-claude-pr-audit",
  "date": "2026-11-24",
  "title": "核对 Claude 工作树与 main 的 PR 合并状态",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "work-memory"],
  "summary": "核对迁仓后 Sairn 的 GitHub PR 和六个 Claude 工作树。18 个 PR 全部已合入 main a2e337e0。布局巡检分支有一个 main 尚未包含的提交和三个未暂存改动，远端没有同名分支或 PR。签名会话拆分前快照仍在本地，后续工作已通过 #17 和 #18 合入。旧仓库实时查询被拒，依据当前 main 的 Git 历史核对了旧 #160/#161 的迁移结果。",
  "thread": null,
  "baseCommit": "a2e337e0",
  "commits": ["1af0b547", "f0f789bc", "fa82e486", "ebdc7413", "48fde2e2", "9ac903f4"],
  "sources": [
    { "url": "https://github.com/haoyu8962-netizen/sairn/pulls?q=is%3Apr" },
    { "path": "docs/work-memory/sessions/2026-11-14-orchestration-handover.md" },
    { "path": "docs/work-memory/sessions/2026-11-13-repository-move-and-chart-library.md" },
    { "path": "docs/work-memory/sessions/2026-11-23-signer-session-guard-handover.md" },
    { "path": "docs/work-memory/legacy-commits.txt" }
  ],
  "supersedes": []
}
-->
# 核对 Claude 工作树与 main 的 PR 合并状态

## 背景与范围

2026-11-24（Asia/Shanghai）同步记录。运营方要求检查 Claude 的工作目录中还有哪些 PR 没有合入 `main`。本次从旧 `gatu` 检出查到迁仓后的固定克隆 `sairn`，对照两者的本地 Git 引用，并在新仓库查 GitHub 实时结果。未取得本次任务的会话标识。

## 结论与依据

- 新仓库只有远端分支 `main`，本次头部为 `a2e337e0`。GitHub 列出的 #1–#18 均为 `MERGED`，目标均为 `main`。Claude 工作树对应的界面规范修复 #15、官网行情快照 #16、资金会话 #17、签名会话守卫 #18 均在主线历史中。
- 六个现有 Claude 工作树里，`layout-integrity-pilot` 有唯一尚未合入的新工作。分支 `claude/layout-integrity-pilot` 的头为 `e60d68f0`，唯一独有的非合并提交 `7368e225` 为裁切和文字截断的浏览器巡检。另有 `layout-integrity.pw.ts`、`layout-integrity.ts`、`mobile-history-cards.pw.ts` 的未暂存改动。GitHub 全状态 PR 列表和远端分支列表均没有这个分支。
- `claude/signer-session-guard-presplit` 的 `df2703fe` 是本地拆分前快照。按[签名会话交接记录](2026-11-23-signer-session-guard-handover.md)，其展示层与执行层工作在 #17、#18 中拆分、调整并合入。
- 旧仓库缓存的 `origin/main` 为 #158 的 `766a8566`，`origin/dev` 为 #161 的 `61505614`。旧 #160、#161 经历史重写后的合并提交分别为 `48fde2e2`、`9ac903f4`，都已进入新仓库 `main`。旧 #152、#159 的发布文档内容随新 #3 纳入，旧 #153 的行情快照工作由新 #2 接续。

## 验证与限制

- 在 `sairn` 执行 `git fetch origin` 成功。用 `git ls-remote --heads origin` 核对远端只有 `main`，提交为 `a2e337e0`。用 `gh pr list --state open` 得到空列表，用 `gh pr list --state all --limit 100` 得到上述 18 个已合并 PR。
- 用 `git worktree list --porcelain`、各工作树的 `git status --short --branch`、分支日志和祖先关系核对本地状态。用 `docs/work-memory/legacy-commits.txt` 对照旧提交号，并以 `git merge-base --is-ancestor` 验证映射后的旧 #160、#161 在新 `main`。
- 旧仓库的 Git 远端和 GitHub 连接器返回账号停用错误，旧 PR 的实时状态无法核对。新仓库的命令行查询成功。未运行应用测试、构建或部署。
- 隔离工作树初次生成索引时缺少历史记录引用的图表库文件。从已有本地克隆补齐该忽略文件并切换到 Node 22.15.0 后，`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（12/12）均通过，`git diff --check` 通过。

## 后续与替代关系

布局巡检工作仍保存在原工作树，由原任务接续。本次核查没有发起、合并或关闭 PR，也不取代迁仓交接或发布记录。
