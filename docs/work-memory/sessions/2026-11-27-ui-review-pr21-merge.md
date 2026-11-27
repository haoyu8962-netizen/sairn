<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-27-ui-review-pr21-merge",
  "date": "2026-11-27",
  "title": "UI/UX 审查 PR #21 的 CI 与合并核对",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review"],
  "summary": "PR #21 的八项 CI 在 ef9ffabc9 上全部通过，其中 Build terminal 在配对开关两态下都通过了重定后的包体预算；PR 上没有审查或评论。按运营方授权用 merge commit 合入 main，合并提交 4548175ea。CI 的包体读数与本地规程构建相差几十字节，配对开时静态启动余 463 字节、总量余 2,622。",
  "thread": null,
  "baseCommit": "ef9ffabc9",
  "commits": ["03c1b5260", "559fcc702", "7d92841da", "ef9ffabc9", "4548175ea"],
  "sources": [
    { "url": "https://github.com/haoyu8962-netizen/sairn/pull/21" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/actions/runs/45968669125" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/actions/runs/45968669073" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/actions/runs/45968669139" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/actions/runs/45968669053" },
    { "url": "https://github.com/haoyu8962-netizen/sairn/actions/runs/45968668962" },
    { "path": "docs/work-memory/sessions/2026-11-27-multi-agent-ui-review-phase-1.md" },
    { "path": "docs/terminal-performance-baseline.md" }
  ],
  "supersedes": []
}
-->
# UI/UX 审查 PR #21 的 CI 与合并核对

## 背景与范围

同步记录，2026-11-27，未取得任务标识。[PR #21](https://github.com/haoyu8962-netizen/sairn/pull/21) 承载多模型 UI/UX 审查的修复，经过如下：

- **首次推送**：`03c1b5260`。CI 的 `Build terminal` 两态都因客户端包体预算失败。
- **后续三个提交**：
  - `559fcc702`：修复 R3 暂停的 P2；
  - `7d92841da`：B-16 与 T-02；
  - `ef9ffabc9`：按规程重定包体基线。
- **运营方授权**：「CI 通过后合并 PR」。

经过、验证与后续见 [任务记录](2026-11-27-multi-agent-ui-review-phase-1.md)。本记录只核对 CI 与合并。

## 结论与依据

**CI**：八项检查在 PR 头 `ef9ffabc9` 上全部通过，包括：
- 静态检查；
- 配对开关两态的终端构建；
- 两个终端测试分片；
- 两个浏览器回归分片；
- 官网构建。

合并前用 `gh pr view` 的 `statusCheckRollup` 确认这八项属于 `ef9ffabc9`，PR 状态为 `CLEAN`。

**审查**：PR 的审查、行内评论与讨论留言均为空。

**合并**：用 `gh pr merge --merge` 普通合并（不 squash、不 rebase），GitHub 返回 `4548175ea`，合并时间 2026-11-27T09:34:34Z。拉取 `main` 后确认它的两个父提交为原 `main` `ce3259b68` 和经过核查的 PR 头 `ef9ffabc9`。

**CI 的包体读数**：来自 run 45968669125，对照的是重定后的基线。

| 预算 | 配对关读数 | 余量 | 配对开读数 | 余量 |
|---|---:|---:|---:|---:|
| 客户端总量 | 3,429,998 | 5,561 | 3,432,937 | 2,622 |
| 交易页静态启动 | 1,683,346 | 1,483 | 1,684,366 | 463 |
| 手机运行时增量 | 121,966 | 756 | 121,960 | 762 |
| 桌面运行时增量 | 209,789 | 2,894 | 209,705 | 2,978 |
| `trade-terminal-page` | 131,149 | 259 | 131,138 | 270 |
| `token-selector-popup` | 16,270 | 451 | 16,270 | 451 |
| `vaults-page` | 30,878 | 398 | 30,883 | 393 |

与本地规程构建（`7d92841da`，固定身份）相比，配对开时总量多 60 字节，静态启动少 63 字节，各路由面相差不到 20 字节。CI 与本地的构建身份和提交都不同，这些差值不能单独归因到构建身份。

## 验证与限制

- CI 结果来自 GitHub。本地验证属于提交前的任务，见任务记录。
- 合并进 `main` 不等于发布。线上版本以最新的 `cloudfront-*` 标签为准，这批改动没有发布，也没有做真机验收。
- 发布配置（生产 `.env.local`、配对开）没有构建。静态启动在 CI 配对开时只余 463 字节，发布预检要求 200，要由预检实测。
- 本记录在合并之后另开分支补写，没有改动已合并的任务记录。

## 后续与替代关系

剩余事项见任务记录的「后续与替代关系」，主要是三类：
- Bridge 重新开启前要处理的几项；
- 几处更深的测试缺口；
- 拆分 `domain/market/selector-quote.ts`，把弹窗专用的格式化代码移出启动路径。

本记录不替代任何既有记录。
