<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-dotted-market-route",
  "date": "2026-11-19",
  "title": "带点的市场链接进入应用壳",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting"],
  "summary": "CloudFront viewer-request、本地静态页分类器和 Service Worker 先认一段或两段的 /trade 路径，再套用文件后缀规则；Service Worker 保持 v11。Codex 提出并出补丁，Claude 对照官方文档核对、复现与变异后原样保留。CloudFront 71 项、相关 Vitest 248 项、终端类型检查通过。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["3d326e55"],
  "sources": [
    { "path": "deploy/cloudfront/functions/terminal-request.js" },
    { "path": "apps/terminal/src/lib/static-pages/static-pages.ts" },
    { "path": "apps/terminal/public/sw.js" },
    { "path": "apps/terminal/src/lib/tests/fixtures/shell-navigation-cases.ts" },
    { "path": "docs/adr/0052-service-worker-startup-asset-cache.md" }
  ],
  "supersedes": []
}
-->
# 带点的市场链接进入应用壳

## 背景与范围

Codex 的核实报告（2026-11-19，第 4 项）指出：`getTradePathForMarket` 会生成 `/trade/xyz:BRK.B`、`/trade/BTC/USD.C` 这类末段带「点 + 1–16 位字母数字」的路径，CloudFront viewer-request 函数、本地静态页分类器和 Service Worker 都把它当成文件。直接打开或刷新时，请求原样送到 S3，得不到应用壳。Codex 给出了候选补丁，Claude 负责对照官方文档核对、复现并裁定。前一轮审查的原始日志和任务标识没有拿到。按快照统计，主网目前没有命中的市场（见 Codex 报告），所以这是潜在缺陷，不是线上事故。

## 结论与依据

- 三处都在服务端路径判断之后、文件后缀判断之前，先认 `^/trade/<一段>(/<一段>)?$`（尾斜杠先去掉）。只要是这个形状，就按导航处理；其它路径的后缀规则（1–16 位）不变。只按路径段匹配，不维护市场字符白名单。Hyperliquid 文档规定 HIP-3 的 dex 名为 2–4 个小写字符、市场名形如 `{dex}:{coin}`，但没有规定 coin 和现货代币名可以用哪些字符（「HIP-3 deployer actions」「Asset IDs」「Deploying HIP-1 and HIP-2 assets」三页均未写），所以不能按字符集收窄。
- 边缘写法在 `cloudfront-js-2.0` 下可用。AWS「JavaScript runtime 2.0 features for CloudFront Functions」列出 ES 5.1 正则全部支持，也支持 `var`/`const`/`let`。「Quotas」页规定函数最大 10 KB，本文件 2,979 字节，测试会断言不超限。「Restrictions on CloudFront Functions」只用 compute utilization 衡量执行时间；新正则没有嵌套量词，耗时随 URI 长度线性增长。
- `request.uri` 是否已做百分号解码，AWS「CloudFront Functions event structure」没有说明，没有找到官方依据。测试同时覆盖 `:` 原文和 `%3A` 两种写法，两种情况都改写到壳。
- Service Worker 不升版本。W3C Service Worker 规范的 Update 算法会逐字节比较新取到的脚本，正文不同就安装新 Worker；导航（非子资源请求）会触发 Soft Update。`sw.js` 在边缘是 `no-store`（`deploy/cloudfront/deploy.mjs`），本身又有 `skipWaiting` 和 `clients.claim`。所以只改分类规则，下一次导航就会换上新 Worker。升 `CACHE_VERSION` 只用于让已缓存的内容失效（ADR 0052）；这次没有改缓存内容，升版本反而会在激活时删掉 `shell-v11`，在写入第一份新壳之前失去离线回退。
- 不会把真实文件改写成壳。`apps/terminal/public` 和构建产物里都没有 `/trade/` 下的文件，只预渲染了 `_shell.html`。`/trade/x.js` 这类探测请求现在拿到的是 200 的壳 HTML（以前是 404），但不会污染缓存：viewer-request 改写 URI 之后，CloudFront 的缓存键就是 `/_shell.html`；Service Worker 只在导航时把响应存为壳，存进去的内容就是当前的壳；`/assets/` 缓存优先路由碰不到 `/trade/`。
- 静态页分类器用原始路径判断 `/trade` 形状、用解码后的路径判断后缀，和边缘、Worker 一样都看原始路径的段数。

## 验证与限制

2026-11-19 在基线 `79b268ea` 的工作树上用 Node `v22.15.0` 运行，以下为运行过并看到的结果：

- 复现：只撤掉三个源文件的改动、保留新测试时，`functions.test.mjs` 失败 1 项（期望 `/_shell.html`，实际 `/trade/xyz:BRK.B`），Vitest 三个文件失败 14 项（市场路由 2、静态页 6、Worker 6）。恢复改动后全部通过。
- 变异：三个文件各做两种变异。去掉第二段（`/^\/trade\/[^/]+$/`）时，边缘、Worker、静态页的测试分别失败；放宽为 `/^\/trade\//` 时，边缘测试失败，Worker 在 `/trade//BRK.B`、`/trade/BTC/USD.C/extra.js` 上失败，静态页同样失败。每次变异后都已还原。
- `pnpm test:cloudfront`：71 项通过、0 项失败。`vitest run` 跑 market-route、market-route-canonical、static-pages、sw-navigation-cache、sw-asset-cache：5 个文件、248 项通过，退出码 0。`pnpm --filter @sairn/terminal typecheck` 退出码 0。Biome 对配置覆盖的 5 个文件无诊断。`git diff --check` 通过。
- 没有验证：真实 CloudFront 与 S3 的响应、`request.uri` 的实际编码形态，以及已安装浏览器里 Worker 的接管。这些要等发布后核对。`memory:test` 的夹具会执行 Git 写操作，本轮没有跑。

## 后续与替代关系

`docs/runtime-guardrails.md` §8 和 `deploy/cloudfront/README.md` 要补一句「交易市场路径优先于文件后缀判断」，交给主会话处理。下一次发布需要同时更新 `gatu-terminal-request` 函数和 `sw.js`；两者谁先上都不会出错，但只有边缘函数先上，旧 Worker 放行的网络请求才能拿到壳。ADR 0052 的缓存决策不变。
