<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-17-adr-status-drift-after-p42",
  "date": "2026-11-17",
  "title": "p42 之后校订 ADR 状态与工作手册里的旧仓库写法（全局审查 P2-18）",
  "kind": "task",
  "status": "recorded",
  "topics": ["docs-governance", "pr-review"],
  "summary": "运营方说「继续任务」。p42 已上线，交接记录建议的下一项里只有文档合批不需要运营方到场。逐个核对 ADR 索引里写着「未合入」「未发布」的 20 行：用提交祖先关系、发布记录里的提交号和旧提交号对照表，确定每个 ADR 实际进 main 的途径与最早随哪次发布上线，改了索引的状态栏，并在 19 个 ADR 文件的状态行末尾加一条 2026-11-17 补记。工作手册第 1、2、3、6 节里的旧仓库名与 dev 写法改为现状。只改文档；其余 14 个 ADR 正文与 10 份专题文档里的同类写法没有核对。",
  "thread": null,
  "baseCommit": "fbc72929",
  "commits": [],
  "sources": [
    { "path": "docs/adr/README.md" },
    { "path": "docs/agent-handbook.md" },
    { "path": "docs/work-memory/legacy-commits.txt" },
    { "path": "docs/work-memory/sessions/2026-11-12-global-defect-review.md" },
    { "path": "docs/work-memory/sessions/2026-11-14-orchestration-handover.md" },
    { "path": "docs/work-memory/sessions/2026-11-15-cloudfront-release-p42.md" }
  ],
  "supersedes": []
}
-->
# p42 之后校订 ADR 状态与工作手册里的旧仓库写法

## 背景与范围

同步记录，2026-11-17，未取得任务标识。运营方：「继续任务」。[交接记录](2026-11-14-orchestration-handover.md)的建议顺序是 p42 发布 → 真机与真实钱包验收 → 低风险合批 → 待决项。p42 已于 2026-11-15 上线；验收只能由运营方在设备上做，所以这次做低风险合批里的文档部分：[全局审查](2026-11-12-global-defect-review.md)的 P2-18（文档状态漂移），加上 [p42 预检记录](2026-11-15-p42-precheck-trade-page-rebaseline.md)后续里提到的工作手册旧写法。

开始前核对：`origin/main` 是 `fbc72929`，没有打开的 PR；标签 `cloudfront-2026-11-15-p42` 触发的 `Production Builds` 已通过；线上 `build-meta.json` 是 `ebb8dbe9 / cloudfront-2026-11-15-p42`。

只改文档。没有处理 P2-17 剩下的 `mobile-data-presentation-contract` 漏洞，它要改测试，另开一次。

## 结论与依据

### 核对方法

- 每个 ADR 取它的文件第一次出现的提交；索引里另外点名的合并提交（PR #73、#77、#107）用 `docs/work-memory/legacy-commits.txt` 换成现在的提交号。
- 各次发布记录 front matter 的 `commits` 同样换成现在的提交号。一个 ADR 的提交是哪次发布的提交的祖先，就算随那次发布上线；取编号最小的一次。
- 用两个发布标签再核一遍：`cloudfront-2026-11-12-p41`（`875bd2c4`）与 `cloudfront-2026-11-15-p42`（`ebb8dbe9`）。
- 抽查原文：p26 记录提到 PR #77，p28 记录提到 PR #73，p32 记录提到 PR #107，p33 记录写明带上 ADR 0042 并从同一提交发布官网，p36 记录写明晋升 PR #133 含 #129、#131、#132，p41 记录提到 #156。p41 标签下的 `apps/terminal/src/config/geo.ts` 里没有 `"JP"`。

### 结果

| ADR | 进入 `main` 的途径 | 最早上线 |
| --- | --- | --- |
| 0027、0032 的 PR #73 部分 | PR #73 合入 `dev`（2026-10-08） | p28（2026-10-08） |
| 0033、0035 | PR #77 合入 `dev`（2026-10-04） | p26（2026-10-08） |
| 0041 | PR #107 合入 `dev`（2026-10-12） | p32（2026-10-14） |
| 0042 | p33 的晋升 | p33（2026-10-27） |
| 0043、0044 | p33 的晋升 | 官网 2026-10-27 发布，与 p33 同一提交 |
| 0045–0048 | 晋升 PR #133 | p36（2026-11-02） |
| 0049 | PR #156，p41 的晋升 | 只涉及文档与脚本，p41 的提交包含它 |
| 0050 的 2026-11-12 补记 | 最后一次 `dev` → `main` 合并 `b23cce99`（2026-11-13） | p42（2026-11-15） |
| 0051–0053 | 同上 | p42 |
| 0054、0055 | 新仓库 PR #1（`3c31c852`） | p42 从新仓库构建；p42 是单分支流程下第一次发布 |
| 0056 | 新仓库 PR #4（`d96a8e84`） | 不涉及线上产物 |

ADR 0051 的状态原来写「新脚本未以 `--execute` 运行过」：p42 用它完成了 functions、lambda、sync、invalidate、verify，回滚仍没有演练。ADR 0054、0055 原来写「新仓库上 CI 未跑过」：PR #4 与 PR #6 的运行已通过。

### 改动

- `docs/adr/README.md`：上表 20 行的状态栏改为现状；改完后索引里不再有「未合入」「未发布」。
- 19 个 ADR 文件（0027 除外，它的状态行已有 p24 的补记）：状态行末尾加一条「2026-11-17 补记」，原文不动。
- `docs/agent-handbook.md`：
  - 第 1 节：查状态改为看 `origin/main` 与发布标签，仓库名改为 `haoyu8962-netizen/sairn`，核对旧提交先查对照表；
  - 第 2 节：不开 auto-merge 的理由改为 `main` 的分支保护只要求经 PR、没有必选检查。2026-11-17 用 `gh api repos/haoyu8962-netizen/sairn/branches/main/protection` 核对：`required_status_checks` 为空，必须经 PR，对管理员生效，禁止强推与删除；
  - 第 3、6 节：`check-runs` 命令的仓库名，以及两处「基于 `dev`」改为 `main`。
- `docs/adr/0054-chart-library-outside-the-repository.md`：「关联」里指向 ADR 0027 的链接文件名写错（`…-and-sairn-rename.md`），改为实际文件名。这是链接检查发现的原有错误。

## 验证与限制

- 只改了文档，没有运行应用测试。`git diff --check` 干净；`memory:check` 与 `memory:test` 的结果见提交前的运行。
- 「最早上线」是从发布记录的提交号推出来的，没有去读各次发布当时的线上产物。p25 与 p29 没有发布记录；上表的结论都落在有记录的相邻版本之间，不受影响（p26 记录写明 p25 只是旧域名清理发布的保留名）。
- ADR 文件的出现提交代表它所在分支的改动，不逐条证明 ADR 里每个决策的实现都在那次发布里。只抽查了 ADR 0042 的受限清单。
- 各 ADR 状态里的「真机未验收」「真实钱包验收未做」「真实账号验收未做」原样保留，这次没有新的验收，也没有核对它们是否已在别处完成。
- 没有核对的：
  - ADR 0019–0024、0026、0028–0031、0034、0036、0037 正文里的「未发布」「未合入」字样（它们在索引里的状态栏没有这类写法）；
  - `docs/` 下 10 份专题文档里的同类字样：`hyperliquid-sdk-coverage-review.md`、`market-funding-history.md`、`twap-regression-tests.md`、`funding-comparison.md`、`position-tpsl-slippage-warning.md`、`leverage-position-limit.md`、`open-interest-cap.md`、`sdk-feature-integration-plan.md`、`marketing/jp-launch-email/README.md`、`marketing/beyond-crypto-review.md`。
- 工作手册第 3 节「CI 成本」里原私有仓库的计费读数是明确标注的历史内容，没有动。

## 后续与替代关系

本记录不取代其他记录。

- 上面两组没有核对的文档，可以用同样的方法再做一批。
- P2-17 的 `mobile-data-presentation-contract` 漏洞仍没有修。
- 真机与真实钱包验收、交接记录里需要运营方做的六件事不变。
