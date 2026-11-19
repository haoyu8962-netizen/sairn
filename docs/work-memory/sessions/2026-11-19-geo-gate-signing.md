<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-geo-gate-signing",
  "date": "2026-11-19",
  "title": "P1-2 地区判定接入命名 Agent 授权与可开仓改单的执行守卫",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "jurisdiction-marketing", "wallet-onboarding", "order-entry"],
  "summary": "Codex 第二轮签名审查 P1-2 经 Claude 复现成立：地区受限或无法核实时，API 钱包与 Mobile QR 的命名 Agent 授权、非只减仓的改单仍会签名。改为在授权钩子和两端改单执行守卫上按共享地区查询拒绝；撤权、无名交易连接 Agent、只减仓改单与撤单保持可用。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": ["bb6f46bd"],
  "sources": [
    { "path": "docs/adr/0042-japan-allowed-trading-region.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/adr/0038-unnamed-default-agent-for-trading-connection.md" },
    { "path": "apps/terminal/src/lib/geo/trading-region.ts" },
    { "path": "apps/terminal/src/lib/tests/use-explicit-agent-approval.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/desktop-orders-cancel-all.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/mobile-order-modification.test.tsx" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/order-book" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-3-deployer-actions" }
  ],
  "supersedes": []
}
-->
# P1-2 地区判定接入命名 Agent 授权与可开仓改单的执行守卫

## 背景与范围

Codex 第二轮签名审查（本机草稿目录 `r2-wave2-signing.md`，未入库）的 P1-2 称：地区结果为 unavailable 或受限时，API 钱包授权与现有订单修改仍能进入签名流程。原报告标注为读代码推断。Codex 的修复任务在额度用完时中断，没有修复报告，工作树里留下未完成的草稿。本记录是 Claude 核对草稿、独立复现并定稿的结果。基线 `79b268ea`。

## 结论与依据

**发现成立。** 在基线代码上新增的测试复现了三处：命名 Agent 授权（API 钱包、Link mobile device 的 `Mobile QR`）在地区受限、代理或查询失败时照常进入签名与发送；桌面和手机改单的 `batchModify` 执行守卫不读地区，非只减仓的改单照常发出。

**规范依据。** ADR 0042「背景与约束」与 `config/geo.ts` 的注释都写明受限访客的 Agent 授权、下单与资金操作被拦。`runtime-guardrails.md` §2「Exits stay open」（2026-10-30）规定本终端自己的地区检查不拦平仓、TP/SL、撤单和逐仓保证金，只拦开仓、兑换、反手与资金动作，理由是查询失败或误判时不能把仓位锁死。改单在两份文档里都没有点名。Hyperliquid 官方文档把 modify 按它下的新单归类（Order book 页：「Modifies are categorized according to the new order they place」）；HIP-3 的 `setReduceOnly` 只减仓模式允许只减仓单、把订单改成只减仓单和撤单（HIP-3 deployer actions 页）。

**采用的划分。**

- 命名且非零地址的 Agent 授权需要本终端地区判定为允许。检查点：进入钩子时、法律检查之后与钱包弹窗之前、签名之后发送之前、等待发送锁时。读共享地区查询的缓存，刷新失败视为无法核实。
- 撤销命名 Agent（零地址）照常：撤权只缩小权限。
- 无名的交易连接 Agent 不在钩子里拦：平仓、TP/SL 等退出弹窗通过 `TradingActionButton` 建立交易连接，拦了会违背退出规则；下单面板本来就在交易受阻时不启动它。
- 改单只在所有替换单都是只减仓时视为退出；其余（含现货单）视为开仓，在执行守卫的两次检查里按地区拒绝。撤单不受影响。

**对 Codex 草稿的裁定。** 保留其思路：共享判定函数、钩子订阅地区查询、发送锁检查、SDK 包装错误的解包、API 钱包控制器把地区拒绝作为「未发送」退回审核。改掉两处：草稿在钩子里拦了所有非零地址的授权，会挡住退出弹窗里的无名交易连接 Agent；草稿拦了所有改单，包括只减仓改单。判定函数移到 `lib/geo/trading-region.ts`，因为三个浏览器夹具把 `@/hooks/use-geo-restriction` 整个替换成只导出 `useGeoRestriction` 的模块，从那里导出新函数会让夹具加载失败。草稿用 `guardedSigner` 包装签名器，改为在执行回调开头检查，效果相同、改动更小。草稿的任务记录、CHANGELOG 和守则条目按最终划分重写。

## 验证与限制

运行环境 Node `v22.15.0`、Vitest `v4.0.16`，在 Codex 工作树（基线 `79b268ea` 加本次未提交改动）上运行：

- 复现：未改代码时，授权钩子新增用例 9 项失败；控制器 2 项失败；桌面与手机改单各 4 项失败。允许地区、只减仓改单、撤单、撤权与无名 Agent 的用例在修复前后都通过。
- 修复后：授权钩子 40 项、控制器 36 项、桌面订单 54 项通过；相关 88 个测试文件 2066 项通过（含 i18n 与目录契约）；`pnpm --filter @sairn/terminal typecheck` 退出 0；改动文件 `biome check` 无问题；`git diff --check` 通过。
- 变异：去掉命名判定、去掉入口检查、去掉签名后检查、去掉发送锁检查、去掉解包、把撤权也拦住、去掉桌面或手机改单检查、`every` 改成 `some`、去掉控制器分支、让无法核实视为允许，共 11 个变异，各自让对应用例失败，均已还原。
- 一次合跑中 `mobile-agent-sync-modal.test.tsx` 的两秒长按用例失败，单独重跑两次 29 项全过；该文件替换了授权钩子，与本改动无关，判为负载下的计时波动。

没有做：浏览器夹具与 Playwright 套件、真实钱包签名、真实交易所改单、受限地区的真实访问。Link mobile device 对话框只靠钩子层测试覆盖，没有渲染对话框验证报错文案。API 钱包页和改单按钮在地区受阻时仍可点击，拒绝发生在签名之前。

## 后续与替代关系

- 需要运营方决定：无名交易连接 Agent 是否在地区无法核实时也拒绝（现为不拒绝，以免外部钱包用户无法平仓）；改单是否按只减仓划分（现为只减仓允许、其余拒绝）；`updateLeverage`、手动切换账户模式、条款签署、`UnifiedAccountAutoSetup` 是否受本终端地区判定约束（规范未写，现均不拦）。
- 普通下单与 TWAP 只在点击时（`canExecuteOrder`）读地区，SDK 边界的执行守卫不再复核；规范未要求，本次未改。
- 可选的界面跟进：地区受阻时禁用 API 钱包授权、Link mobile device 和非只减仓订单的编辑入口，并复用已有文案说明。
- 提交号待主会话提交后补入 `commits`。
