<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-deploy-cli-safety",
  "date": "2026-11-19",
  "title": "CloudFront 发布 CLI：旗标解析、演练副作用、验收漏检与更新失败指引",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "pr-review"],
  "summary": "Codex 审查 h6 的 P1-1、P1-3、P2-2、P2-4 经 Claude 用假 aws 与离线夹具复现成立；保留严格旗标解析、只读本地的演练和扩展后的 verify，撤回对 ADR 0051 探活指引与 describe-function 调用方式的改动。并行发布锁（P1-2）只有 Codex 的设计。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": [],
  "sources": [
    { "path": "deploy/cloudfront/deploy.mjs" },
    { "path": "deploy/cloudfront/deploy-cli.test.mjs" },
    { "path": "deploy/cloudfront/deploy.test.mjs" },
    { "path": "deploy/cloudfront/README.md" },
    { "path": "scripts/collect-inline-script-hashes.mjs" },
    { "path": "docs/adr/0051-release-script-rollback-and-lambda-probe.md" },
    { "path": "docs/adr/0052-service-worker-startup-asset-cache.md" },
    { "url": "https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_UpdateFunction.html" },
    { "url": "https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_PublishFunction.html" },
    { "url": "https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_DescribeFunction.html" },
    { "url": "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/publish-function.html" },
    { "url": "https://docs.aws.amazon.com/cli/latest/reference/lambda/wait/function-updated.html" },
    { "url": "https://docs.aws.amazon.com/lambda/latest/api/API_UpdateFunctionCode.html" }
  ],
  "supersedes": []
}
-->
# CloudFront 发布 CLI：旗标解析、演练副作用、验收漏检与更新失败指引

## 背景与范围

同步记录，未取得会话标识。Codex 审查发布脚本（报告 h6）后留下未提交的候选补丁；Claude 按 2026-11-19 的流程逐项核对官方文档、在没有补丁的代码上复现，并决定最终修法。本条处理 P1 第 1、3 项和 P2 第 2、4 项；P1 第 2 项（并行发布）只有 Codex 的设计，见文末。全程不运行真实 `aws`、不带 `--execute` 触及线上、不做 Git 写操作。

## 结论与依据

| 项目 | 复现（运行过命令并看到结果） | 最终修法与理由 |
| --- | --- | --- |
| P1 第 1 项：`--execute=false`、`--allow-…=false`、`--skip-probe=false` 被当作已给出，带值选项吞掉下一个旗标 | 用只记录参数的假 `aws`（`PATH` 里没有真实 CLI）直接运行基线脚本：`invalidate --distribution D --execute=false` 调用了 `create-invalidation`；三个 `--allow-…=false` 通过闸门进入线上策略读取；`lambda --origin --execute --execute` 打包、更新、等待后才在探活时报错；`--skip-probe=false` 跳过探活。补丁后四条都在任何 `aws` 调用前退出 1。 | 保留 Codex 的按子命令声明选项：布尔旗标只收裸形式，单值参数不可重复，缺值、未知选项、非法 `--origin`、非法 `--network` 在 STS 之前拒绝。文档与工作手册里现有的 20 条命令（日常发布、回滚、首次建站、CSP 接收器、`reupload`、`aliases`、`check-lambda`）逐条交给新解析器，全部通过。 |
| P1 第 3 项：`verify` 给启动资源缺失、旧 SW、标记漂移、geo 缺字段、referral 不可用的发布判绿 | 新回归在基线 `verifyDeployment` 上 12 个子用例全部失败。 | 保留按本地壳核对全部同源启动资源（含桌面/移动清单、图表预取、语言目录）与 `sw.js` 的状态、MIME、缓存头、SHA-256，完整比较 `build-meta.json`，geo 要求两位国家码与两个布尔字段，referral 分开报告 POST 可达与有效决定（`allowed`、`blocked` 都通过）。Claude 补：协议相对地址（`//…`）不算同源；标记不一致时列出不同的字段名。误判风险核对见下文。 |
| P2 第 4 项：演练仍会联网或写文件 | 基线 `aliases` 演练调用 `get-distribution-config` 并把 JSON 写到临时目录；`functions --origin` 演练对 origin 发 HTTP（不可达时以 `fetch failed` 退出）；`functions` 演练写 `.output/edge/terminal-response.js`。补丁后无 `aws` 调用、无 HTTP、无写入。 | 保留。`sync`、`lambda` 的演练原本就不触网；有记录的发布流程都直接带 `--execute`，没有哪一步依赖演练读线上状态。代价：`aliases` 演练不再留下待提交的配置 JSON 供预览。 |
| P2 第 2 项：函数和 Lambda 更新失败后的状态与恢复指引不完整 | 基线在 `terminal-response.js` 缺失时先更新并发布了请求函数；Lambda 等待器以 255 退出时只打印命令失败。 | 两份函数源码与哈希先全部准备好再写云端；失败时报告已成功的发布、失败步骤、读到的 ETag、计划代码 SHA-256，并说明原样重跑同一条 `functions` 是安全的（同一构建再次发布保留线上 PREVIOUS，`rotateScriptHashes`）。Lambda 的 zip、更新、等待失败分别说明已知状态，给出只取状态字段的 `get-function-configuration --query` 命令和本地 zip 的 `CodeSha256`。 |

Claude 撤回或改写的部分：

- 撤回 `describe-function --stage DEVELOPMENT`。官方文档没有写省略 `Stage` 时的默认值；原调用方式在历次真实发布里成功过，改变它没有官方依据，也没有真实环境验证。
- 撤回对探活失败指引的改写（原补丁把「两网已在用这个包，立即重传上一版」改成「先核对再决定」）。这是 ADR 0051 决策 5 和工作手册第 8 节的现行契约，改不改由运营方决定；脚本与文档维持原句。
- 删除 Codex 新加的函数源码语法预检（`vm.Script`）：CloudFront Functions 2.0 允许 `import cf from 'cloudfront'`，脚本模式解析会把合法代码判为错误；无效代码 CloudFront 的 `update-function` 自己会拒绝。
- CLI 测试会以真实资源名运行 `--execute`，只靠替换 `execFileSync` 拦截。Claude 加了防护：测试期间 `PATH` 指向空目录、`AWS_PROFILE` 为不存在的名字、凭证文件指向不存在的路径，并断言每条命令都带这个假 profile。

## verify 会不会误判正常发布

- MIME：发布机的 AWS CLI 2.36.44 用自带的 Python 3.14 猜类型，`.woff2`、`.js`、`.css` 分别得到 `font/woff2`、`text/javascript`、`text/css`；README 记录 2026-11-12 线上实测也是这三个值。另一台机器若用老 Python 且没有系统 `mime.types`，字体可能被写成 `binary/octet-stream`，此时 `verify` 会失败，但 SW 也会拒绝缓存它（ADR 0052），属于应当暴露的问题。
- 缓存头：边缘函数只在配对页改写 `cache-control`；启动资源的缓存头来自对象元数据，与 `objectCacheControl` 一致。
- 传播：新哈希文件名第一次请求就回源，S3 读写强一致；`sw.js`、`build-meta.json` 为 `no-store`，手册在两次失效约 80 秒后才验收。
- `blocked` 地区：`/api/geo` 对受限地区同样返回 200 和两个布尔字段，`referral-geo` 返回 `blocked` 时判为有效。只有 IPdata 不可用（`unavailable`）时失败，那时客户端同样不能判定地区。
- 离线核对：把 p42 与 p41 的真实发布产物按 2026-11-12 实测的头部用假 fetch 提供，`verify` 的三项资源检查全部通过（p42：117 个 `modulepreload`、146 个资源；p41：140 个资源）。

## 验证与限制

- Node `22.15.0`，基线 `79b268eaf0d7ac8f364a3f744c01383bb195bf8a`。
- `pnpm test:cloudfront`：`# tests 116`、`# pass 116`、`# fail 0`。`scripts/collect-inline-script-hashes.test.mjs` 与 `scripts/inject-shell-preloads.test.mjs`：`# tests 14`、`# pass 14`。`scripts/ci-workflows.test.mjs`：`# tests 20`、`# pass 20`。`git diff --check` 退出 0。
- 新回归放在基线脚本上：`verify` 回归 12 个子用例与 referral 用例失败，Lambda 分阶段用例的 zip、更新、等待三个子用例失败（探活子用例按设计与基线一致）。CLI 测试依赖新导出的 `main`，基线上无法导入，所以 P1-1、P2-4、P2-2 的基线行为用假 `aws` 直接运行脚本复现（见上表）。
- 11 个变异（去掉裸旗标检查、`aliases` 演练读 AWS、`functions` 演练采样 origin、报错漏掉已成功的发布、只查最后一个启动资源、接受 `unavailable`、不查 geo 布尔字段、吞掉等待器错误、不查 `sw.js`、只比较提交与发布号、先写云端再查响应函数源码）各自让对应测试失败，源码已还原并逐字节比对。
- `deploy/` 不在 `biome.json` 范围内；新测试文件按仓库规则经标准输入格式化。没有运行终端 typecheck：本次没有改终端 TypeScript，而该命令会枚举授权图表目录。
- 没有验证：真实 CloudFront 的 MIME 与缓存头（只引用了 2026-11-12 的记录）、真实 AWS 对 `describe-function` 省略 `Stage` 的行为、Lambda 失败时的真实输出、真实发布或回滚。

## 后续与替代关系

### 并行发布锁方案（P1 第 2 项，仅设计）

运行过命令并看到结果。用内存桶在 A 写完可变文件、开始写标记前插入完整 B，再继续 A。两次都报告标记匹配，最终 A 的壳和标记与 B 的 SW、manifest 混用。夹具第一轮遗漏了递归复制的模拟，补齐后 `# tests 1`、`# pass 1`、`# fail 0`，该通过意为重现了混合。证据在 `.worklog/deploy-cli-safety/interleaving.test.mjs` 与 `interleaving.log`。

读代码推断的设计。用一个发布编排器把正常发布、回滚与其它会写同一套资源的入口纳入同一互斥范围。首次变更前，以 `If-None-Match: *` 条件写取得终端两网共享锁，可选精确对象键 `_deploy/terminal-release.lock`。写唯一随机 owner token、发布号、目标产物摘要和起始时间，保存返回的 ETag。持锁范围覆盖两个函数、Lambda、静态同步、两次失效和两网验收。在最终验收或经过核对的恢复结束后，匹配 owner token 和 ETag，再条件删除。Functions 的后续设计把发布绑定到本次 update 应答的 ETag，并记录 Lambda ZIP 和静态公开文件摘要。Claude 核对时发现：本机 AWS CLI 2.36.44 自带的 botocore 模型里，`UpdateFunctionResult` 的 ETag 映射到名为 `ETtag` 的响应头，CLI 可能取不到 update 应答的 ETag，这也许正是脚本在 update 之后重新 `describe-function` 的原因；采用这条设计前要先在测试函数上确认 CLI 实际输出。

锁超时只报警。放锁前明确停止旧执行者、确认在途写入结束，再依据旧 ETag 条件释放。仅查 S3 owner 或 ETag 不能给 Lambda、CloudFront 或 S3 的后续写入加 fencing。如果允许自动接管，得先让写入集中于能约束执行者的服务，并设计凭证撤销或逐目标版本条件。现有直达写入路径都必须迁入同一范围，避免手工或旧脚本绕过锁。

最小 IAM 将 `s3:PutObject`、`s3:GetObject`、`s3:DeleteObject` 限定到锁对象 ARN（例如 `arn:aws:s3:::<release-bucket>/_deploy/terminal-release.lock`），正式 S3 上传身份不得绕写该键。版本化恢复若采用读取或删除明确版本，再独立评估对应版本动作。若桶用 SSE-KMS，按实际密钥配置补窄范围的数据密钥与解密权限。仓库策略里的对象权限见 [IAM 策略](../../../deploy/cloudfront/iam/gatu-edge-release-policy.json)。S3 条件删除支持、桶版本控制、KMS 及实际 IAM 状态都待核实，预先要求隔离桶验证冲突、发布与回滚交错、旧进程失去锁后停写及匹配 ETag 才释放。

### 主会话文档同步与待决

- [ADR 0051 决策 5](../../adr/0051-release-script-rollback-and-lambda-probe.md#决策)原文「`/api/geo`（200、两位国家码）」：探活与 `verify` 现在还要求布尔型 `proxy` 与 `tradeRestricted`，应追加一条 2026-11-19 的补记；探活失败的处理不变。
- [ADR 0052](../../adr/0052-service-worker-startup-asset-cache.md#验证)记录的「旧壳没有这个列表时照常通过」仍成立；可补记：有列表时 `verify` 现在核对线上内容。
- 待运营方决定：Codex 建议把探活失败后的「立即重传上一版」改为「先核对修订与失败原因再决定」（工作手册第 8 节 `lambda` 一条、ADR 0051 决策 5）；本次没有改。
- 强制双站探活、API 版本标记、并行发布锁需要单独设计。
