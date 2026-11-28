<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-28-zh-tw-spot-asset-descriptions",
  "date": "2026-11-28",
  "title": "繁中现货资产描述：项目审校的台湾正体译文",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "繁中界面的现货资产信息弹窗原来只显示通用说明（快照只有简体，繁中有意返回 null）。运营方选定 B-lite：以官方简体为底、对照英文，把 133 条译成台湾正体并作为项目文案入库，已有本地审校文案的 7 条（HYPE 四个交易对、SPCXD、UBTC、USOL）照旧显示本地文案，绝不显示简体。方案经 Gemini 4 Neon 四轮评审（7.5→8.5→8.8→9.3），译文与代码经 Codex 三轮对抗审查（8.0→8.5→8.5，全部发现已处理），Gemini 终审 9.5。契约测试拦住了 51 个变异；包体配对构建后总量基线 +12,740、trade-terminal-page +54。无头读取是开发服务器加真实接口，不是构建产物，也没有台湾母语审校与真机。未推送。",
  "thread": null,
  "baseCommit": "708b43aa2",
  "commits": [],
  "sources": [
    { "path": "docs/spot-asset-information.md" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "docs/work-memory/sessions/2026-11-26-terminal-seven-new-languages.md" },
    { "path": "apps/terminal/src/domain/market/spot-asset-descriptions-zh-tw.ts" },
    { "path": "apps/terminal/src/lib/tests/spot-asset-zh-tw-contract.test.ts" }
  ],
  "supersedes": []
}
-->
# 繁中现货资产描述：项目审校的台湾正体译文

## 背景与范围

2026-11-28 运营方指出繁中界面的现货资产描述不显示，要求规划实现方案。这是当时同步写的任务记录，会话标识未取得（`thread: null`）。

起因（已核实）：现货描述来自 Hyperliquid 官方前端快照（`hyperliquid-asset-info-snapshot/v1`，2026-07-29 生成），只有 `en`、`es`、`fr`、`zh-CN`；2026-11-26 加入繁中时，`spot-asset-info.ts` 对繁中标签有意返回 `null`，不混入简体，「直接显示简体」作为备选留给运营方（[七种语言记录](2026-11-26-terminal-seven-new-languages.md) 待决第 4 项）。弹窗因此只显示「此現貨市場在 Hyperliquid 上交易 X/Y。」。

工作树最初停在旧账号的 `main`（落后 2662 个提交，没有繁中），评审前先移到公开仓库的 `main`；开工时公开 `main` 又合入 PR #28，基线快进到 `708b43aa2`。

范围：`apps/terminal` 的现货描述加载、新增繁中数据文件、测试、文档与包体基线。不改简体与其他语言的显示，不改官方简体本身，不刷新快照，不改生成器。

## 结论与依据

### 方案选择

候选：A 直接显示简体；B 构建时用 OpenCC 转换并保留转换管线；C 浏览器运行时转换；D 人工从英文翻译；E 维持现状。Gemini 4 Neon（`gemini-4-neon-xhigh`，只读）第 1 轮给 B 打 7.5，指出 B 会顶掉已审校的本地文案、包体必然超预算、`docs/i18n-presentation.md` 明文禁止简转繁，并建议 B-lite：一次性翻译校对后作为项目文案入库，仓库不保留转换管线与依赖。理由：快照自 2026-07-29 起没有刷新、原始快照不在本机；官方简体机翻问题多（「超流动 / 超流体」6 处、「实用程序」2 处，「产量农场」「复制交易」「燃气费」「梅姆」「梗币」「模因」各 1 处），短语替换不够。运营方选 B-lite。方案修订三版，评分 8.5 → 8.8 → 9.3，第 4 轮没有开工前必须修改的问题。各轮评审原文在本地证据目录（见「验证与限制」）。

### 实现

- **数据**：`apps/terminal/src/domain/market/spot-asset-descriptions-zh-tw.ts`，133 条，结构同主文件，每条自带身份字段与 `descriptionKind`，`descriptions` 只有 `zh-TW`；另记来源常量 `SPOT_ASSET_ZH_TW_SOURCE_GENERATED_AT`、`SPOT_ASSET_ZH_TW_SOURCE_SHA256`。
- **排除**：弹窗中快照文本要占的位置已有 Lingui 审校文案时不收：`asset` 类且有 `localDescriptionId`，或 `provider` 类且有 `localProviderId`。现在是 `@107` `@207` `@232` `@255`（HYPE）、`@465`（SPCXD）、`@142`（UBTC）、`@156`（USOL）。UFART、UZEC 的 Unit 说明没有本地文案，收入。
- **运行时**：`spot-asset-info.ts` 的 `getDescriptionLocale` 对繁中标签返回 `zh-TW`；`loadSpotAssetDescription` 先判语言，不支持的语言直接返回、不加载块；繁中只动态导入繁中文件。缺条或身份不符回退本地文案或通用说明，绝不显示简体。`market-asset-info.tsx` 在渲染时取一次 `const locale = i18n.locale`，查询键与查询函数共用（Codex 第 1 轮 P1：查询函数在执行时再读语言，延迟执行时可能把简体结果缓存到繁中键下）。
- **翻译流程**：Gemini（`gemini-4-neon-high`，只读）分 3 批（45/44/44），源文相同的 5 组、HyBridge 5 条、Unit 2 条放在同一批；不用 OpenCC 初稿（Gemini 第 2 轮建议，避免「公用程式」「權杖」一类硬伤锚定改写）。规则与术语表全文存于本地证据 `translate-rules.md`，要点见下。
- **内容来源规则**：以简体为内容来源；简体错译英文时按英文纠正，两者是不同文案时照简体。逐条定案：6 处「超流动」类误译写回 Hyperliquid；`@129` / `@243` 把译反的「除了 Hyperliquid」改为「除了 Hyperliquid 之外，也在多個 CEX 與 DEX 上交易」；`@178` 按英文写「Delta 中性、超額擔保的穩定幣」，去掉简体的「增值」「无风险套利」；`@40` 保留英文名称，括注写「注意力不足 Hyperliquid 障礙」；`@126` `@47` `@59` `@17` 照简体。
- **术语**：以 `zh-TW/messages.po` 为准（現貨、代幣、錢包、質押、滑價、使用者、網路、存入、跨鏈、擔保品、永續合約、最大發行量），另定社群、專案、數位、Gas 費、迷因幣、人工智慧、實際用途、功能型代幣（utility token）、跟單交易、流動性挖礦、跨鏈橋（名词 bridge）、協議（目录 2:1）、生態系統、技術堆疊、互通性、效能、內建、即時、進階、介面、智慧財產權、川普、避險、報酬、代幣發行平台（launchpad）。

### 审查与修复

- Codex（`gpt-6.2-astra`，只读，`low`）第 1 轮两路各 8.0。代码路 3 个 P1：查询键与查询函数的语言不一致（已修）；数字不带单位、「100 萬」改「100 億」测不出，`Hyperliquidity` 换成 `Telegram` 也测不出（数字带单位比对、保留标记改为按值完全相等、新增拉丁字母词双向核对）；身份校验的四个字段没有单独测（逐字段用例）。另有显示层未覆盖（新增 HYPE、UBTC、UZEC 的渲染断言）、行分隔符只拒绝 LF 等。译文路 10 个 P1（`@40` 括注仍带「過度流動性」、`@69` team supply、`@105` lurker、`@160` ratios、`@23` 主语、`@13` 主语与 left curver、`@129`/`@243` in-game sinks、`@157` 漏 Combat、`@70` 双关、`@253` 加密貨幣）、7 个 P2（「沒有銷售」「最大供應量」「delta-neutral 避險」「啟動平台」等）、7 个 P3，全部采纳，另按同类问题改了 `@37`，共 27 条。
- 第 2 轮（窄范围，两路各 8.5）：代码路 P1「`@1` 两个百分比对调测不出」，新增「数字、代号、拉丁字母词按源文顺序出现」的检查（133 条里只有 4 条顺序不同，都是有意的）；P2「Gas 全局例外、拉丁字母词可任意重复」，改为 Gas 只在源文有「燃气费 / 燃料费 / gas」时放行、繁中每个词的次数不得超过两种源文的较大值；P3 槽位断言改为分别检查资产段与提供方段，文档分槽写明回退顺序。译文路 P1 `@129`/`@243`「把代币写成了消耗机制」、P2 `@179` 归属歧义、P3 `@40` 搭配，都已改。没有照搬建议里多出的两个 `$MON`：保留标记按值完全相等，多出的代号会被拒绝。
- 第 3 轮（合并一路，8.5）：P1「`@1` 改写成『其餘的 30% 與 40% 分別給了 Hyperliquidity 和創建這款代幣的人』，标记与顺序都不变」，通用检查判断不了意思，改为凡源文带百分比的条目必须登记审校过的分配句（现在只有 `@1`），译文逐字包含；P2 四个调序例外改为固定各自审校后的标记序列，`@40` 的重复例外写成次数上限 2；P3 Gas 上限改为取简体概念次数与英文次数的较大值，不再相加。
- Gemini 4 Neon 终审（`gemini-4-neon-xhigh`，只读）：第一次在第 76 步想把命令输出重定向到 `/tmp`，被拒绝后整轮没有输出；补上预先算好的简体字清单核对、再次写明不许写文件后重跑，评 8.5，唯一必须修改的是本记录把常用字数写成 41（实际 36），已改正。可选建议都采纳了：`@118` 的「占據」与 `@10` 统一为「佔據」，`@199` 的「交匯處」与 `@139` 统一为「交會」；百分比登记的扫描范围加上英文；补「迷因」的正向术语检查；基线文档分别写明各运行时余量是配对开还是关。核对时还发现存档的 OpenCC 结果是更早一次 cn→t 的输出（258 字），与清单依据的 cn→tw（257 字）不是同一次，已重新生成 `changed-cn-to-tw.txt` 并核对：257 字减去 19 个排除字正好是测试里的 238 字，旧文件改名并在首行注明已被替代。窄范围复核第一次因一条带进程替换 `<(...)` 的命令被拒而没有输出，把两份 OpenCC 结果的逐字比对预先算好后重跑，评 9.5，没有必须修改的问题，已过运营方要求的 9 分。
- 包体测量中发现的代码问题：最初的 `await (isTraditional ? import(a) : import(b))` 让打包器保留两个描述模块的全部导出，主描述块多出两个来源常量（136 gzip 字节）；改为 `loadDescriptions` 里两个分支各自解构导入后为 0。

## 验证与限制

- 基线 `708b43aa2`，改动在工作树 `claude/traditional-chinese-spot-asset-description-ec2e77`。
- 单测：`spot-asset-zh-tw-contract`、`spot-asset-info`、`market-asset-info` 三个文件 56 项通过（Node 24.15.0 本机）；全量终端单测见下。`pnpm --filter @sairn/terminal typecheck` 通过；Biome 检查改动文件无问题；`node --test scripts/check-client-bundle-budget.test.mjs` 19 项通过。全量终端单测（`vitest run --maxWorkers=4`，在 Bash 沙盒内）821 个文件、12,638 项：12,636 通过、1 跳过、1 失败；失败的是 `vite-development-cache.test.ts` 的同端口用例，报错 `listen EPERM 127.0.0.1:5173`（沙盒不允许监听本地端口），在沙盒外单独重跑该文件通过。`pnpm memory:check`、`pnpm memory:test`（12 项）与 `git diff --check` 通过。
- 变异（改源码或数据、跑对应测试、恢复）：第 1 轮 17 个全部变红；第 2 轮 22 个，变红 20 个，另 2 个按设计不变红（加入英文原文已有的词 `test` 属于允许的借词；删除测试断言本身不算变异），换成「加入英文也没有的词」「把 HYPE 塞进繁中表（契约与运行时各一）」后 3 个都变红；第 3 轮 5 个、第 4 轮 4 个、终审后 2 个（「迷因幣」改成「表情幣」、「佔據」写成简体「据」）全部变红。测试改动后把第 2 轮整组重跑一次，结果相同（其中一个查找串因 `@129` 改写而不再存在，跳过）。变异清单与结果存于本地证据。
- 包体（按 `docs/terminal-performance-baseline.md` 的流程，两个干净 detached worktree 依次构建，Node 22.15.0、无 `.env.local`、固定构建身份、`NITRO_PRESET=node-server`、配对关与开各一次并跑 `perf:startup`；数字为配对关 / 配对开，取最终状态那次构建）：总量 +12,292 / +12,740，新增繁中懒加载块 12,327，主描述块 0，静态启动 +98 / +118（105 个资源不变），手机运行时 +18 / +8，桌面运行时 +28 / +79，`trade-terminal-page` +37 / +54。`client-chunk-graph.json` 显示繁中块只被 `trade-terminal-page` 动态导入。同一份代码只差两条描述里两个字的两次分支构建，配对开总量分别量到 +12,533 与 +12,740，`trade-terminal-page` 分别是 +47 与 +54：新块改变了其他块引用的带哈希文件名，这种浮动和代码改动本身是同一量级。重定基线：总量 3,702,262 → 3,715,002，`trade-terminal-page` 127,624 → 127,678（`main` 本来就只余 155 / 179，低于发布预检的 200，保持 `main` 的余量，不借机放大）；其他面余量都在 200 以上，未改。最终那两次分支构建把 `pnpm --filter @sairn/terminal build` 整条链（chunk 环检查、预算、壳预加载、内联脚本哈希）都跑完了；用最终基线对配对开的产物重跑预算脚本通过（+7,042，与 `main` 相同）。早先两次分支构建的读数分别存于 `bundle/superseded-ternary/`（三元导入多出 136 字节那次）与 `bundle/superseded-pre-wording/`（统一用字之前）。详细表格见 `docs/terminal-performance-baseline.md`。
- 版本边界：全量单测与无头读取跑在终审后两处改字（`@118`、`@199`）和两条契约测试补充之前；之后复跑了三个相关测试文件（56 项通过）、终审后变异与最终状态的配对包体构建，其余 818 个测试文件不引用这份数据。
- 无头验证（Chromium 无头读取，不是真人查看，也不是真机）：在本工作树的开发服务器上（3047，从主检出复制 `.env.local`，验证后删除），连真实 Hyperliquid 接口，用 `?lang=zh-TW` 打开交易页并点开资产信息弹窗。LICK 显示繁中快照译文，HYPE 显示本地文案「HYPE 是 Hyperliquid 的原生代幣。」，UBTC 显示本地描述与本地 Unit 说明，UZEC 显示通用句与繁中快照的 Unit 说明；打开弹窗之前四个用例都没有请求描述模块，打开后只请求 `spot-asset-descriptions-zh-tw.ts`。简体对照（`?lang=zh`）只请求 `spot-asset-descriptions.generated.ts` 并显示简体。偏离方案 D10 的地方：方案写的是在构建产物上用 `page.route` 本地夹具，实际用了开发服务器和真实接口，因为页面启动需要的接口不止 `spotMeta`；构建产物里「只下载繁中块」由产物图证明，未在浏览器里对构建产物复核。
- 未覆盖：没有台湾母语审校，没有真机；契约测试判断不了意思，意思靠审查；简体专用字清单不保证完整（编制规则：只收台湾正体文本里不会出现的字，用 OpenCC 1.4.2 的 cn→tw 在源文上找出 257 个会转换的字，人工排除于、冲、准、几、占、台、后、征、扑、杠、采、游、里、党、着、么、并、划、术 19 个，得到的 238 个就是测试里的源文清单，再加 36 个常用字；OpenCC 只在 scratchpad 里临时安装，没有进仓库依赖）；`社區` 作为禁用词只适用于这批加密资产描述。
- 本地证据（Git 忽略）：`.worklog/2026-11-28/zh-tw-spot-asset-descriptions/`，含方案各版与四轮 Gemini 评审原文、翻译任务书与输出、修订 JSON、作者脚本、变异清单、Codex 各轮任务书与报告、包体构建日志与读数。

## 后续与替代关系

- 替代 [2026-11-26 七种语言记录](2026-11-26-terminal-seven-new-languages.md) 待决第 4 项「繁中界面的现货资产描述」的当时做法（不显示描述）；那份记录的其余内容不受影响。
- 快照刷新时按 `docs/spot-asset-information.md` 的 Traditional Chinese 一节操作：先查原始快照有没有 `zh-TW` / `zh-Hant`，有就交运营方决定；没有就重新生成、按契约测试点名的交易对补译并更新指纹。
- 2026-07-29 之后新上的现货在所有语言下都没有描述，属于另一项工作。
- 官方简体本身的错译（「超流动性」等）仍会显示在简体界面，未处理。
