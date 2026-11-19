# ADR 0054：图表库移出仓库，仓库公开，历史重写

- 状态：已接受并实施（2026-11-13）。分支 `chore/chart-library-fetch`，未合入 `dev`、未发布。CI 没有在新仓库上跑过：Actions 目前关闭，`CHART_LIBRARY_TOKEN` 还没有配置。 2026-11-17 补记：已经 PR #1 合入 `main`（`3c31c852`，2026-11-13）；Actions 已开启，新仓库的 CI 已运行并通过（PR #4、PR #6）；2026-11-15 的 p42 从这个仓库构建并发布（[p42 发布记录](../work-memory/sessions/2026-11-15-cloudfront-release-p42.md)）。
- 关联：[运行时护栏](../runtime-guardrails.md) §4（TradingView 生命周期与本地补丁）；[Agent 工作手册](../agent-handbook.md)第 3 节；[ADR 0016](0016-dev-first-pull-requests-and-ci-tiers.md)（CI 分层）；[ADR 0027](0027-brand-single-source-and-identifier-rename.md)（仓库名保留 `gatu`）；`deploy/verify-chart-build.mjs` 与 `deploy/manifests/tradingview-charting-library.json`。

## 背景

2026-11-13，原托管账号 `zora4523-bot` 被 GitHub 封停：仓库网页返回 404，拉取与推送被拒绝，PR、评论、CI 记录与仓库设置无法取回。运营方决定换到账号 `haoyu8962-netizen`，并把仓库设为公开。

原仓库把 TradingView Advanced Charts 的文件（1,163 个，含一处本地补丁）放在 `apps/terminal/public/charting_library/` 里一起跟踪。它的许可不允许公开再分发，所以原样公开不可行。

## 决策

1. **公开仓库 `haoyu8962-netizen/sairn` 不含图表库，历史里也不含。** 用 `git filter-repo` 从 `dev` 与 `main` 的全部历史里去掉三处路径（`apps/terminal/public/charting_library/`、早期的 `public/charting_library/`、`src/types/charting_library.d.ts`）以及根目录早期提交过的 `.env`（只含 WalletConnect 项目标识，本来就会打进前端包）。**所有提交号因此改变**；2026-11-13 之前的任务记录、ADR 与发布记录里引用的提交号是原仓库的，在公开仓库里查不到，旧提交号与新提交号的对照在 `docs/work-memory/legacy-commits.txt`（2,502 行，其中 2,469 个在本仓库里）；`pnpm memory:check` 对解析不到的提交号改查这张表，表里没有的仍然失败。原仓库的 PR 编号（#1–#161）同样不再可查。
   同日第二次重写：公开约一小时后发现 148 个提交的作者或提交者邮箱是运营方的个人邮箱（第一次只扫了文件内容，没有查提交元数据）。用 `git filter-repo --mailmap` 把它换成原账号的 GitHub 匿名邮箱并强制推送，文件树不变，提交号再变一次；对照表按最终提交号重新生成，没有迁移的 33 个提交记为四十个零。上游作者的公开邮箱没有改动。强制推送之后，旧提交在 GitHub 上仍可凭提交号或经已有 PR 的时间线访问，所以把那个仓库改为私有并改名为 `gatu-app-old-history`（留给运营方删除），另建了现在这个公开仓库（当时名为 `gatu-app`，同日按运营方要求改名为 `sairn`），只推送重写后的 `main`、本分支与 p41 标签；PR 编号从 1 重新开始。
2. **只迁移 `dev` 与 `main`。** 四个 `archive/` 标签（其中两个是 Across 归档）与其他工作分支没有推到公开仓库。
3. **图表库放在同一账号下的私有仓库 `gatu-chart-library`**，文件位于仓库根目录，内容就是原仓库 `dev` 上的那一份（含本地补丁）。
4. **`pnpm chart:fetch`（`scripts/fetch-chart-library.mjs`）把它装进 `apps/terminal/public/charting_library/`。** 来源依次是 `--from <目录>`、环境变量 `CHART_LIBRARY_DIR`、克隆 `CHART_LIBRARY_REPOSITORY`（默认是上面的私有仓库）。只复制清单里列出的文件；复制前按清单核对来源的每个文件（大小与 SHA-256），复制到临时目录并再次按清单精确核对（不得多出文件）之后才替换目标目录，失败时已安装的那份保持不动。目标目录已与清单一致时什么都不做。`pnpm chart:check` 只核对。
5. **目标目录进 `.gitignore`**，清单文件仍在仓库里，是图表库内容的唯一依据。升级图表库的顺序：更新私有仓库 → 用 `deploy/verify-chart-build.mjs --generate-manifest` 重新生成清单 → 提交清单。
6. **CI 的四个工作流**（`Static Checks`、`Terminal Tests`、`Terminal Browser Tests`、`Production Builds`）在安装依赖之前用 `actions/checkout` 把私有仓库检出到 `.chart-library-src`（需要仓库密钥 `CHART_LIBRARY_TOKEN`，对私有仓库只读），再运行 `node scripts/fetch-chart-library.mjs --from .chart-library-src`。私有仓库名取 `${{ github.repository_owner }}/gatu-chart-library`，再换账号时不用改工作流。

## 备选方案

- **保持私有。** 不需要任何改动，是此前的做法（工作手册第 3 节）。运营方选择公开。
- **连同图表库一起公开。** 违反图表库许可，公开后收不回，也会让新账号面临下架投诉。不做。
- **只在最新提交里删除图表库，保留历史。** 历史里仍能取到全部文件，等于公开。
- **图表库放 S3 或作为构建机上的本地目录。** 可行，但 CI 需要另一套凭据；私有仓库与 `actions/checkout` 用同一种机制，本地也能用现有的 Git 凭据克隆。`--from` 与 `CHART_LIBRARY_DIR` 保留了改用其他来源的出口。
- **Git submodule。** 没有私有仓库权限的人克隆时会报错，且子模块目录里的 `.git` 文件会被当成图表库的多余文件。

## 后果与边界

- 没有私有仓库权限的人（包括来自 fork 的 PR，它们拿不到仓库密钥）无法类型检查、构建或跑依赖图表库的测试；这是许可决定的。
- 新克隆在 `pnpm install` 之后要跑一次 `pnpm chart:fetch`。本机已有的旧克隆与工作树指向被封停的仓库，提交号与公开仓库不一致，不能直接推送，需要重新克隆。
- 公开仓库里仍有 `Claude Code` 与 `Claude Code Review` 两个工作流，以及 `deploy/cloudfront/iam/` 下带云账号标识的策略文件；本次没有改动它们。
- Actions 的密钥与变量、分支保护需要在新仓库重新配置；公开仓库的 Actions 不计费，[ADR 0016](0016-dev-first-pull-requests-and-ci-tiers.md) 里按计费分钟做的取舍可以重新评估。
- 历史扫描：对公开副本运行过 gitleaks，582 条命中集中在两个生成的市场数据文件与测试夹具里，按文件与变量名判断不是真实密钥，没有逐条核对值。

## 2026-11-19 补记：安装脚本的路径与克隆参数

公开仓库安全审查（Codex 提出，Claude 核对）的两项低风险发现，已改：

- 清单路径上根目录以下的每一级目录必须是真实目录，文件本身仍须是普通文件（此前只用 `lstat` 检查最后一级）。目录软链能把清单路径指到别处；内容仍受 SHA-256 约束，所以影响只是读到「哈希相同的别处文件」，改动是为了让「清单文件都是真实文件」这条规则完整。库的根目录不检查：`--from`、`CHART_LIBRARY_DIR` 由操作者指定，经软链给出也照常使用。
- `git clone` 在仓库地址前加 `--`，以 `-` 开头的 `CHART_LIBRARY_REPOSITORY` 不再被当作选项。克隆失败的提示去掉地址里的用户名与密码（地址可能带令牌）；Git 自己的报错照常输出，Git 会自行隐去地址里的凭据（本机 Git 2.54 实测）。
- `scripts/fetch-chart-library.test.mjs` 用合成库与记录参数的 Git 替身覆盖这几条，不需要私有库或网络。

## 2026-11-19 补记：CI 里图表库与 PR 代码在同一个作业（审查后保持现状）

审查指出：四个工作流在同一个作业里检出私有库、运行 PR 检出中的脚本、安装依赖并构建或测试，PR 控制的代码能读到图表库。核对结论是机制属实，但工作流不改，理由如下。

- **谁能让带密钥的运行执行自己的代码。** fork 的 PR 拿不到仓库密钥（GitHub 文档「Using secrets in GitHub Actions」），检出私有库那一步直接失败；Dependabot 触发的运行也拿不到 Actions 密钥；工作流里没有 `pull_request_target` 与 `workflow_run`；手动触发和推标签需要写权限。所以走带密钥路径的代码都来自有写权限的人，而 GitHub 文档写明有写权限的人本来就能读取仓库的全部密钥（「Secure use reference」）。目前写权限只有仓库所有者。
- **剩下的真实暴露面是供应链。** 被投毒的依赖或 action 在这些作业里运行时能读磁盘上的图表库，也可能取到本作业引用的 `CHART_LIBRARY_TOKEN`（同一文档：被攻破的 action 能访问仓库配置的密钥）。
- **图表库的字节本来就公开提供。** 生产站在 `/charting_library/*` 下原样提供整个库（`deploy/cloudfront/distribution-config.mjs` 的 `CHART_PATH_PATTERNS`），浏览器都能下载；许可禁止的是在公开仓库里再分发。供应链攻击者从 CI 读到的，不比从网站下载的多。
- **拆成两个作业反而更糟。** 由受信任作业取库再交给 PR 作业，只能经构件或缓存传递：构件对有读权限的人开放（「Downloading workflow artifacts」），公开仓库就是所有人；基分支的缓存任何能开 PR 的人都能读（「Dependency caching reference」）。这等于把库公开。PR 作业照样执行依赖代码、持有库字节，只少了令牌。
- **调换顺序或 `--ignore-scripts` 没有作用。** pnpm 10 默认不运行依赖的生命周期脚本（v10.0.0 发布说明），本仓库没有配置 `onlyBuiltDependencies`，本机 `node_modules/.modules.yaml` 的 `ignoredBuilds` 列出了 esbuild、lefthook 等 9 个包；而类型检查、构建和测试本身就执行全部依赖代码。
- **环境（environment）加必需审批换不来隔离。** 部署分支规则按 `GITHUB_REF` 匹配，PR 运行是 `refs/pull/<N>/merge`，要让 PR 检查拿到密钥就得放行所有 PR；必需审批则要求所有者为自己的每次推送点批准（「Deployments and environments」）。
- 同一批依赖也在运营方本机（有云账号与发布凭据）和发给用户的前端包里运行，CI 隔离不是防供应链的主要位置。

需要运营方在 GitHub 设置里做、代码不变的事：`CHART_LIBRARY_TOKEN` 保持细粒度、只授权 `gatu-chart-library`、只读 Contents，并设置到期日、按期轮换（「Managing your personal access tokens」建议设到期日）；怀疑泄露时先撤销；fork PR 的运行保持需要批准；发布标签用规则集保护；不引入 `pull_request_target`、`workflow_run` 或自托管 runner。如需让被盗令牌很快失效，可改用 GitHub App 的短期安装令牌，这要新建 App，由运营方决定。

前提：结论依赖「能在本仓库推分支或触发运行的只有所有者」。以后加入协作者，或让自动化（例如 Claude 工作流）凭外部输入推送分支时，要重新评估。

## 验证

在公开仓库的克隆上（Node 22.15.0）：

- `node --test scripts/fetch-chart-library.test.mjs`：5 项通过。
- `node --test scripts/ci-workflows.test.mjs`：20 项通过（[ADR 0055](0055-single-main-branch-and-release-tags.md) 去掉晋升覆盖之后是 19 项）。
- `pnpm memory:test`：12 项通过；`pnpm memory:check`：加对照表之前因旧提交号失败，之后通过。
- `pnpm chart:check`：未安装时退出码 1；安装后报告 1,163 个文件与清单一致。
- `pnpm typecheck`：退出码 0。
- 删除目标目录后不带 `--from` 运行 `pnpm chart:fetch`（用本机的 GitHub 凭据克隆私有仓库）：安装 1,163 个文件，`chart:check` 通过；往 `charting_library.js` 末尾加两个字节后 `chart:check` 退出码 1，再次 `chart:fetch` 修复。
- 图表相关 Vitest 5 个文件 137 项通过（`chart-build-assets`、两个 `chart-library-loader-handshake`、`tradingview-chart`、`chart-asset-cache-policy`）。
- 生产构建（固定身份、配对关闭）退出码 0；`node deploy/verify-chart-build.mjs apps/terminal/public apps/terminal/.output/public deploy/manifests/tradingview-charting-library.json` 退出码 0。

没有验证的：新仓库上的 CI（含 `actions/checkout` 检出私有仓库那一步）；全量单测与浏览器套件；发布脚本对新仓库产物的运行。
