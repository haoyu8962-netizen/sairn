<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-28-static-number-placeholders",
  "date": "2026-11-28",
  "title": "消息里的限额与门槛改为显示时填入的占位符",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "七种语言之后的待决项里，静态数字一项按定稿方案实施。方案先经 Gemini 4 Neon 五轮复评，分数从 5.5 到 9.5。Circle 存款上限、推荐码门槛和排行榜排除规则三类数字改为显示时按数字格式设置填入。出错路径存为带金额的分类失败，五个错误格式化函数改为必须传入数字格式化函数，影响 28 处调用及其上层。14 个目录逐条替换，土耳其语改写一句。阿拉伯语下以空格分组的数字加了隔离字符。新增测试和契约测试做了 11 处变异检查，全部被拦住。未推送。",
  "thread": null,
  "baseCommit": "708b43aa2",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-26-terminal-seven-new-languages.md" },
    { "path": "docs/number-format-setting.md" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "docs/adr/0024-translate-action-errors-at-render.md" },
    { "path": "docs/adr/0036-render-time-number-formatters.md" }
  ],
  "supersedes": []
}
-->
# 消息里的限额与门槛改为显示时填入的占位符

## 背景与范围

同步记录，2026-11-28，没有任务标识。

- **来源**：七种语言任务的待决项里有一条（[七种语言的任务记录](2026-11-26-terminal-seven-new-languages.md)「待决项处理之后」）。4 条消息里写死了按 `,` 分组的数字，这些数字不跟随数字格式设置：
  - Circle CCTP 单笔存款上限（主网 10,000,000、测试网 1,000 USDC）；
  - 推荐码的累计成交量门槛（$10,000）；
  - 排行榜的排除规则（$100,000、$10,000,000）。
- **运营方的决定**：先要求「继续规划」，然后让 Gemini 4 Neon 评估方案，并要求多轮复评；分数过 9 分后，选「按推荐开工」，同意改动全部 14 个目录和改写土耳其语那一句。
- **分支**：`claude/static-number-placeholders`，从 `main` `708b43aa2` 切出（PR #28 合入后）。
- **范围**：不包括订单簿列头和账户表格布局两项，它们的方案见「后续」。

## 结论与依据

### 方案评审

- **评审方式**：方案的各版与评审原文在编排会话的草稿目录里，不入库。Gemini 4 Neon（`gemini-4-neon-xhigh`）只读评审五轮，分数依次为 5.5、7、7、8.5、9.5。
- **各轮改正的要点**：
  - 不在出错时格式化数字（ADR 0024、ADR 0036）。
  - 不新增失败类型的 kind：`order-notification-copy.ts` 只放行 `exchange-error` 和 `action-error`，新的 kind 会被静默丢掉。
  - 隔离字符只在阿拉伯语下加。
  - 改成一个提交：仓库开了 `noUnusedParameters`，只传参数、不使用的中间提交编译不过。
  - 阿拉伯语、法语、土耳其语里数字两边的写法逐条核对。
- **运营方定的一条规则**：复评超过三轮仍未收敛时先停下来问。第三轮后停过一次，运营方选择继续复评。

### 实现

- **失败类型**（`lib/errors/action-error.ts`）：
  - 新增 `AmountLimitCode` 和 `AmountLimitActionFailure`（`kind: "action-error"`，`amount` 是十进制字符串），加入 `ActionFailure`。仓库里按 kind 分支的 9 处代码都能照常处理它，无需改动。
  - 三条消息集中放在 `AMOUNT_LIMIT_MESSAGES`，占位符统一叫 `limit`，由 `describeAmountLimit` 负责格式化。
- **错误类与识别**：
  - `lib/errors/localized-action-error.ts` 新增 `AmountLimitActionError`，英文 `message` 保留，便于看日志。
  - `findOwnActionError` 沿 `.cause` 链最多查 6 层，每层先看是否为 `AmountLimitActionError`，再看是否为 `LocalizedActionError`。
  - 推荐码仍由原来的英文正则识别，命中后得到带门槛的分类失败。门槛提成常量 `config/referral.ts` 的 `REFERRAL_APPLY_VOLUME_LIMIT = "10000"`，`canApplyReferralCode` 也改用它，比较方式不变。
- **格式化函数的签名**：
  - `formatActionFailure`、`describeActionFailure`、`describeActionError`、`formatTransferError`、`formatExchangeActionError` 增加必填参数 `numberFormat`，类型是 `Pick<NumberFormatters, "formatDecimalString" | "isolateNumber">`。它放在 `translate` 之后、可选的 `fallback` 之前；`formatExchangeActionError` 原来就是 `fallback` 在前，所以追加在末尾。
  - 调用方都跟着改：
    - 应用代码里 28 处调用，分布在 21 个文件；
    - 往上一层，`formatPositionSubmitFeedback` 和 `formatTrackedPositionSubmitError` 也要传，影响三个平仓 Hook 和 `order-notification-copy.ts`；
    - 直接调用这些函数的 17 个测试文件，统一改为传 `getNumberFormatters()`。
  - 第一个提交给两个 effect（`embedded-deposit-auto-bridge.tsx`、`cctp-deposit-tracking-notifier.tsx`）的依赖加入了 `numberFormat`。这一做法后来被撤回：自动存款的那个会重新弹出已关闭的通知，两个 effect 最终都改用 `useEffectEvent` 读取格式化函数，见「Codex 只读审查与修订」和「Gemini 终审与修订」。
- **存款**：
  - 新增 `lib/hyperliquid/cctp-deposit-limit.ts` 的 `getCctpDepositLimitFailure`，弹窗的预检查和 `use-deposit.ts` 的抛错共用这一个判断。
  - 弹窗原来那段嵌套三元一并拆掉了。
- **推荐码卡片与排行榜**：
  - 推荐码卡片调用 `describeAmountLimit`，和错误路径共用同一条消息。
  - 排行榜在渲染时填入两个阈值，占位符为 `accountValueLimit` 和 `volumeLimit`。
- **从右到左**：
  - `NumberFormatters` 新增 `isolateNumber`。从左到右时原样返回；从右到左时，只有结果里有空白才包上 U+2066…U+2069。
  - 原因：`fr-FR` 用普通空格 U+0020 分组。在阿拉伯语句子里，`10 000` 会被双向算法排成 `000 10`。浏览器实测，去掉隔离后 `10` 的左边界是 1080.8，位于 `000` 的 1054.7 右侧。
  - 我也实测了 Lingui 填值时不加隔离字符。
- **目录**：
  - `pnpm i18n:extract` 新增 4 条消息，旧的 4 条按 Lingui 的默认做法标为废弃（`#~`）。
  - 13 个目录用临时脚本从各自的旧译文生成：只把数字换成同名占位符，`$`、`دولار`、`美元` 和单位词保持原位。
  - 土耳其语那句原来把后缀接在数字上（`$100,000'ın`），改写为「hem hesap değeri ${accountValueLimit} altında hem de tüm zamanlar hacmi ${volumeLimit} altında olduğunda」，不带后缀，也没有撇号紧贴花括号。
  - 韩语保留 `{limit}를`：门槛固定是 10,000，读作「만 달러」。
  - 改完后的缺失数与改动前相同：ar/es/fr/hi 各缺 35 条，zh 缺 3 条，新增的 7 种语言都是 0。
- **契约**：`catalog-literal-number-contract` 增加一项检查：任何源消息出现分组数字都失败，不论有没有译文；废弃条目不计入。原有的「译文须保留源文数字」检查保留。

### 文档

- `docs/number-format-setting.md`：新增规则 13，回归入口加入新测试。
- `docs/i18n-presentation.md`：改写静态数字那一条规则。
- ADR 0024：补记一段。
- `CHANGELOG.md`：Fixed 下加一条。
- `AGENTS.md`：在数字格式化契约里加一条，并把新测试加进回归组。

## 验证与限制

验证都在本分支未提交的改动上进行，基线是 `main` `708b43aa2`。

- **类型检查**：`pnpm --filter @sairn/terminal typecheck` 退出码 0。
- **改动文件的测试**：22 个测试文件，加上三个契约测试，共 1240 项通过，在改占位符之前跑过一次。新文件 `amount-limit-failure.test.tsx` 13 项通过，契约测试 30 项通过，`leaderboard-fixture.test.tsx` 通过。
- **浏览器测试**：`referral-code-card.pw.ts` 全部 35 项通过，其中新增 1 项：1440px、阿拉伯语配 `fr-FR`，断言数字各段同在一行，且从左到右排列。
- **变异检查**：11 处，各自都会让测试失败，恢复后通过。
  - 浏览器 1 处：从右到左时不加隔离。
  - 单元测试 10 处：
    - 限额不经格式化直接输出；
    - 不识别 `AmountLimitActionError`；
    - 不沿 `.cause` 链查找；
    - 推荐码规则仍写死数字；
    - 存款上限差一（`>=`）；
    - 测试网上限用在主网；
    - 推荐码门槛改成严格小于；
    - 排行榜阈值按货币格式输出（多出 `.00`）；
    - 源消息重新写入分组数字；
    - 从左到右时也加隔离。
- **检查结果**：见下。
- **限制**：
  - 没有母语审校，也没有在真实的阿拉伯语或土耳其语系统里查看；
  - 没有做包体构建，交给 PR 的 CI 核对；
  - 没有推送。

### 检查结果

- 终端全量 Vitest（`--maxWorkers=4`，沙箱外）：821 个文件中 820 个通过、1 个跳过；12,647 项中 12,646 项通过、1 项跳过，没有失败。
- `pnpm --filter @sairn/terminal typecheck` 退出码 0。Biome 检查了改动的 56 个 ts/tsx 文件，全部通过；`tests/browser/` 不在 Biome 的检查范围内。
- 再跑一次 `pnpm i18n:extract`，目录没有新的变化；`pnpm i18n:compile` 通过。
- `pnpm memory:check` 通过，`memory:test` 12 项通过，`git diff --check` 无输出。
- `referral-code-card.pw.ts` 35 项通过，是在全量 Vitest 跑完后单独跑的。

### Codex 只读审查与修订（2026-11-28）

审查用的是 Codex CLI `gpt-6.2-astra`，只读沙箱，推理强度 medium，对象是提交 `df6a2d4af`，约 7.1 万 token，没有跑测试。评分 8/10，没有 P0、P1，有 1 项 P2、3 项 P3。我逐条对照代码核对，四项都成立。

1. **P2：切换数字格式会重新弹出已关闭的自动存款通知。**
   - **原因**：`embedded-deposit-auto-bridge.tsx` 的通知 effect 每次执行都会调用 `toast.*`。用户关闭通知后，展示 ID 被清空，再执行一次就会用新 ID 重新弹出。我把 `numberFormat` 加进依赖后，只切换数字格式也会触发这一步，连不含数字的路由错误也会重新弹出。这正是 AGENTS 操作反馈契约「未变化的状态不重新打开已隐藏的通知」禁止的情况。我在 Codex 报告之前也自己查到了这一条。
   - **修法**：
     - 错误文案改由 `useEffectEvent`（React 19.2）的 `describeDepositError` 生成，它总是读到最新的格式化函数，effect 依赖里不再有 `numberFormat`。
     - Biome 2.2.4 不认识 effect event，会提示把它加进依赖；照提示加了，effect 每次渲染都会重跑。所以按仓库已有的做法逐行忽略这条警告，并写明原因。
     - 新增回归用例「关闭路由错误通知 → 只切换数字格式 → 不再弹出」，主网和测试网各一条。把 `numberFormat` 放回依赖后，两条都失败。
   - **另一个 effect**：`cctp-deposit-tracking-notifier.tsx` 在同一语言下会跳过已经展示过的通知，切换数字格式不会重新弹出，保持不变。
2. **P3：契约测试的识别范围比文档说的窄。** 原来的正则会漏掉带小数的分组数字，例如 `10,000.00`。源消息检查改用单独的正则，带小数的也算，并补了这个反例。文档里的措辞也改准了：英文源消息里以逗号分组的数字。
3. **P3：排行榜的测试证明不了阈值会跟着数字格式走。**
   - **修法**：在 `leaderboard-fixture.test.tsx` 新增一个用例：页面挂载后切换到 `de-DE`，断言同一句里的两个阈值都更新。
   - **变异检查**：把阈值写死为 `"100,000"` 和 `"10,000,000"`，这个用例失败；恢复后 12 项全部通过。
4. **P3：规则 13 把排行榜也写成了出错时保存的带金额失败。** 改为：只有两种 Circle 存款上限和推荐码门槛会这样保存；排行榜的阈值只在页面上显示。

**修订后的检查**：见「检查结果（修订后）」。

### 检查结果（修订后）

- **终端全量 Vitest**（`--maxWorkers=4`，沙箱外）：821 个文件中 820 个通过、1 个跳过；12,650 项中 12,649 项通过、1 项跳过，没有失败。比上一轮多出的 3 项，是两条自动存款回归用例和一条排行榜切换用例。
- **类型与格式检查**：终端 typecheck 退出码 0；Biome 检查了改动的 4 个文件，全部通过。
- **相关测试组**：16 个文件 607 项通过，包括自动存款的两个测试文件、排行榜、契约、新增的限额测试、数字格式、CCTP 通知和存款方式选择。

### Gemini 终审与修订（2026-11-28）

**审查方式**：Gemini 4 Neon（`gemini-4-neon-xhigh`）只读终审，对象是 `708b43aa2..a094f2373`。送审的材料不含原始目录 diff，换成 14 种语言 × 4 条新译文的对照表和旧译文；另附任务记录全文和除目录以外的完整差异，共约 229KB。

**结果**：评分 9/10，没有 P0、P1、P2；不到运营方要求的「大于 9」。其中一个原因是送进去的差异在 `order-notification-copy.ts:176` 之后被截掉了约 41KB，它看不到后面的文件和三份规范文档，所以没法签字。另有 5 项 P3，我逐条对照代码核对，都成立：

1. **`amount-limit-failure.test.tsx` 里写入了原始的 U+2066/U+2069 字符。**
   - 原因：我用写文件工具写入时，`"\u2066"` 被直接转成了不可见字符。推到 GitHub 后会触发「Trojan Source」双向字符告警，审查时也看不到。
   - 处理：改成转义写法，并删掉一个只写不读的数组。整个差异里新增行的双向控制字符已扫过一遍，现在是 0。
2. **`AGENTS.md` 的措辞说得太满。** 原来写的是「消息从不写数字」，改为与契约测试一致：英文源消息不写以逗号分组的数字。
3. **`cctp-deposit-tracking-notifier.tsx` 的依赖里还留着 `numberFormat`。**
   - 处理：和自动存款一样改用 `useEffectEvent`（`describeNotificationError`），并补了用例「关闭失败通知后只切换数字格式，不再弹出」。
   - 限制：这个通知本来就会在同一语言下跳过已经展示过的通知，所以新用例在改动前也能通过，它拦不住「把 `numberFormat` 放回依赖」这一类回归。我试过删掉这个同语言跳过的判断，现有用例中有 5 项失败，说明这个判断本身已有测试覆盖。
4. **缺少存款 Hook 超限路径的端到端测试。**
   - 处理：在 `use-deposit-routing-guard.test.tsx` 新增用例：测试网存 1001 USDC，签名和写合约都不会发生，错误是 `AmountLimitActionError`，经 `formatTransferError` 显示为「Circle testnet deposits are limited to 1,000 USDC per transfer.」。为此在这个文件的设置状态库模拟里补了 `getResolvedFormatLocale`。
   - 变异检查：改成抛普通错误、忽略测试网，都会让这个用例失败。
   - 另查：存款流程只在提交已经开始后才上报错误。超限检查发生在提交之前，所以不会上报；代码里也没有哪一处按 `LocalizedActionError` 与 `AmountLimitActionError` 的类分支。
   - 没做：在 `DepositModal` 里切换数字格式的组件测试。这个弹窗的测试准备工作很重，而预检查用的格式化方式与 `amount-limit-failure.test.tsx` 里那个「切换设置后重新渲染」的探针相同。
5. **任务记录前后不一致。** 「实现」一节已改正，说明两个 effect 最终都改用了 `useEffectEvent`。修订后的检查结果见下。

### 检查结果（终审修订后）

- **终端全量 Vitest**（`--maxWorkers=4`，沙箱外）：821 个文件中 820 个通过、1 个跳过；12,652 项中 12,651 项通过、1 项跳过，没有失败。比上一轮多出的 2 项，是 CCTP 通知和存款 Hook 的新用例。
- **受影响的测试文件**：4 个文件 288 项通过，分别是 `amount-limit-failure`、`cctp-deposit-tracking-notifier`、`embedded-deposit-auto-bridge` 和 `use-deposit-routing-guard`。
- **其他检查**：终端 typecheck 通过；改动的 4 个 ts/tsx 文件跑 Biome 通过；`pnpm memory:check` 通过，`memory:test` 12 项通过，`git diff --check` 无输出。

## 后续与替代关系

- 本记录处理的是七种语言记录「待决项处理之后」里的静态数字一条。
- [搜索大小写记录](2026-11-28-search-fold-funding-leaderboard.md) 对应的 PR #28 已于 2026-11-28 合入 `main`（合并提交 `708b43aa2`）。合并前 CI 7 项全部通过，没有审查意见和评论。
- 同一份定稿方案里另外两项，还没开工：
  - **账户表格布局**：已提议另开会话。
    - 先到官方终端只读取证，量出各列内容的最大宽度。
    - 持仓操作列和委托历史各列按实测加缓冲。委托历史的表格最小宽度按「固定列之和 + 最宽 Type + 缓冲」计算。
    - 手机持仓卡片先改行布局，再让数值不断行，并加 `<bdi>`；单行断言按行框顶部的位置判断。
    - TWAP 是加宽操作列还是去掉 Pause、日语和西语的 Status 列要不要一并加宽，等取证后由运营方定。去掉 Pause 会改全部 14 个目录，那样这一项要排在本 PR 之后。
  - **订单簿与近期成交的列头**：在本 PR 合入后，从新的 `main` 开工。
    - 取证矩阵：14 种语言 × 4 种单位 × 240、263、282px。
    - 263px 时，放不下的语言写订单簿专用的短列头。
    - 240–262px 时，把单位与 `.orderbook-tab-label` 的规则拆开，单独提高隐藏断点，断点取「最小放得下宽度 − 1px」，最高 262px。
    - 282px 时单独处理 Price 列。
    - 近期成交复用 `ORDERBOOK_LABELS.size`。
    - 越南语这类实在写不短的语言，报给运营方，在两种做法里二选一。
