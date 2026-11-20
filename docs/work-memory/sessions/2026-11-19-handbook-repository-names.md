<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-handbook-repository-names",
  "date": "2026-11-19",
  "title": "工作手册与工作记录说明对齐公开仓库的分支名（事后补记）",
  "kind": "retrospective",
  "status": "recorded",
  "topics": ["docs-governance", "work-memory"],
  "summary": "事后补记，依据提交 e84e383f：Agent 工作手册里集成分支、工作树基线与清理前核对的 origin/dev 改为 origin/main，原仓库的 PR 编号与计费读数标为历史参考，CI 成本一条改写为公开仓库现状；工作记录说明里 INDEX.md 的冲突说明改为原仓库分支合并时的历史情形。只改文档，没有运行时影响。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["e84e383f"],
  "sources": [
    { "path": "docs/agent-handbook.md" },
    { "path": "docs/work-memory/README.md" },
    { "path": "docs/adr/0055-single-main-branch-and-release-tags.md" }
  ],
  "supersedes": []
}
-->
# 工作手册与工作记录说明对齐公开仓库的分支名（事后补记）

## 背景与范围

事后补记，由 2026-11-19 集成后的文档同步写成；没有取得任务标识。来源是修复任务 `w3-handbook-names` 的 Codex 报告（本机 `.worklog/2026-11-19/codex/`，Git 忽略）。仓库 2026-11-13 起只有 `main`（ADR 0055），手册里仍有以 `origin/dev` 为基线的步骤。

## 结论与依据

提交 `e84e383f` 的改动（12 行手册、2 行 README）：集成分支与工作树从 `origin/main` 建；清理工作树前核对分支提交已在 `origin/main`（核对祖先关系）；原仓库 PR #74、#130、#32 的编号与计费读数保留并标为历史参考；CI 成本一条改写为公开仓库不计费、原私有仓库的记录见 ADR 0016；删去向旧 CI 手选清单添加测试时去重的指令。`docs/work-memory/README.md` 的 INDEX.md 冲突说明改为「早于 ADR 0049 的原仓库分支合并时」。

## 验证与限制

Codex 报告自述在 Node `v22.15.0` 上 `pnpm memory:check` 通过，依据是读 ADR 与工作流文件，没有查询远端状态。本记录没有复跑；集成后的读数见总记录 [2026-11-19-codex-review-claude-fixes](2026-11-19-codex-review-claude-fixes.md)。

## 后续与替代关系

没有后续事项。本记录不替代任何记录。
