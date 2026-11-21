<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-21-ui-report-functional-verification",
  "date": "2026-11-21",
  "title": "核实 UI 合规报告中未处理的功能缺陷",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "account-funding", "order-entry"],
  "summary": "运营方要求先核实 2026-11-20 UI 合规报告中未处理的第二类功能缺陷。用一个工作流对 8 组 15 条逐条核实（每组一个核实代理读代码、测试和规范，再由独立代理尝试推翻），复核代理没有推翻任何一条：3 条成立、10 条部分成立、2 条不成立。中等严重度两条：会话解析期间资金弹窗随 key 重挂载丢失草稿（主会话已对原文核对），API 钱包列表仍显示被动错误横幅和加载文字。没有修改代码。",
  "thread": null,
  "baseCommit": "dbe65bce",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-20-ui-compliance-review-fixes.md" },
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/trade-form-scale.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/api-wallet-list.tsx" },
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "docs/trading-toolbar-redesign.md" }
  ],
  "supersedes": []
}
-->
# 核实 UI 合规报告中未处理的功能缺陷

## 背景与范围

同步记录，2026-11-21，未取得任务标识。接 [2026-11-20 的修复记录](2026-11-20-ui-compliance-review-fixes.md)：那次只处理了高严重度项，第二类功能缺陷列在后续里、没有核实。本次只核实，不修改代码。核实对象是 PR #15 分支头 `dbe65bce` 的代码。

方法：一个工作流，8 组 15 条，每组先由一个代理读代码、测试与规范给出成立 / 部分成立 / 不成立，再由另一个代理重新打开文件尝试推翻（共 16 个代理）。复核代理没有推翻任何一条。资金相关的 F5a 由主会话对原文核对（`global-modals.tsx` 的 `fundsSessionKey` 含 `walletAddress` 与 `walletIntent`，被用作存款、划转、发送、兑换弹窗的 `key`）。

## 结论与依据

| 编号 | 结论 | 严重度 | 要点 |
| --- | --- | --- | --- |
| F1a Scale 订单数清空回弹 | 成立 | 低 | 桌面与手机共用 `TradeFormScale`，`setScaleLevels(Number(e.target.value) \|\| 4)` 让字段清不空，「10」会变成「410」，输入「0」被悄悄改成 4。越界值被校验器和 `createScaleOrderLevelPlan` 拦下，不是执行安全问题。`docs/order-entry-layout-audit.md` 要求清空后保持安静、非空无效值给反馈。修法：像 Size Skew 一样存字符串草稿，提交前解析。 |
| F2a 成交历史 Type 写死 `Trade` | 部分成立 | 低 | 桌面表格与 CSV、手机 CSV 都写死 `Trade`，与 `docs/trading-toolbar-redesign.md` 的成交历史 Type 分类（本账户或协议强平优先）和手机筛选冲突：按「Liquidated」筛选导出，Type 仍是 Trade。报告说「现货与永续也标成 Trade」不成立，面板的分类是强平 / 普通成交。 |
| F3a 账户类型表单以模式作 key | 部分成立 | 低 | 机制属实，但普通轮询值不变时不会重挂载；打开时从加载到有值的重挂载是有意的初始预选。真正丢选择的只有另一标签页、设备或 ADR 0041 自动设置改了模式，而且结果是失败关闭。 |
| F4a 发送弹窗对新账号的模式提示 | 部分成立 | 低 | SendModal 在模式不支持时用自己写死的「Select a supported account mode…」，没用 hook 已经按 ADR 0041 算好的原因；新账号在 awaiting-funds / pending 阶段会看到它。 |
| F5a 会话解析期间资金弹窗丢草稿 | 成立 | 中 | 草稿丢失来自上层：`GlobalModals` 用含钱包地址与意图的 key 挂载存款、划转、发送、兑换弹窗，解析期间地址变化就整窗重挂载。存款弹窗内部在解析中也会换成未连接界面。修法：解析期间 key 沿用最近一个已定身份，存款各分支给忙碌占位；执行守卫不动。 |
| F5b Bridge 页签与账户类型弹窗的未连接结论 | 部分成立 | 低 | Bridge 页签在解析中已被父层卸载，用户看到的是父层的「Wallet not connected」；账户类型表单在解析中会显示 Connect。 |
| F5c Link mobile device 弹窗重挂载 | 部分成立 | 低 | sessionKey 含 `hasWalletAccess`，解析中会重挂载并中止当前操作；中止本身是执行守卫要求的，问题是解析中给出的展示与可用性。 |
| F5d 仪表盘页面未接入 isResolving | 部分成立 | 低 | 质押、推荐、金库、API 钱包在会话解析中会给出未连接结论和可点的 Connect，也没有登记在 `docs/mobile-data-presentation.md` 的待处理表。 |
| F6a API 钱包列表的被动横幅 | 成立 | 中 | 读取失败时有 `role="alert"` 的红色警告块，表头显示「Refreshing…」「Loading…」「Unavailable」，与质押、推荐、金库按四态静默处理的做法不一致，也不在规范点名的入口里。 |
| F7a 存款上限文案的千分位 | 成立 | 低 | 上限金额写死在消息里（`10,000,000`、`1,000`），不跟随数字格式设置；各语言译文同样写死。 |
| F7b `packages/ui` 的英文 aria-label | 部分成立 | 低 | Alert、AlertGlobal、Tag 写死且不可覆盖，但终端目前没有渲染到这些默认值，属于潜在问题。 |
| F8a 余额计数用浮点 | 部分成立 | 低 | 写法不合 `.claude/rules/hyperliquid.md` 的比较约定，但正的十进制字符串转成 double 仍大于 0，计数结果与 Big.js 相同。 |
| F8b 改单抽屉限价框圆角 | 不成立 | 无 | `rounded-20` 等于 10px，与同表单的 `rounded-[10px]` 渲染相同。 |
| F8c Earn 表格缺 scrollableRegionLabel | 部分成立 | 低 | 三张表都没传，其他仪表盘宽表都传了；只有真的横向溢出时才影响键盘与读屏用户。 |
| F8d 手机切换单位的重复调用 | 不成立 | 无 | 第二次写入同值会被 store 跳过，没有任何效果。 |

## 验证与限制

结论来自静态阅读与代理的交叉复核，没有运行测试，也没有在浏览器或真机上复现。F5a 之外的条目没有逐条由主会话复核原文。

## 后续与替代关系

建议的处理顺序：F5a（资金弹窗草稿）与 F6a（API 钱包被动横幅）两条中等严重度；其次 F2a、F4a、F5b–F5d、F1a、F7a；F7b、F8a、F8c 可随相关文件改动时顺带处理。F8b、F8d 不需要处理。
