<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-21-funds-session-and-api-wallet-quiet",
  "date": "2026-11-21",
  "title": "资金弹窗在会话解析中保留草稿；API 钱包列表静默展示",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "wallet-onboarding", "pr-review"],
  "summary": "修复 2026-11-21 核实成立的两条中等严重度缺陷。F5a：GlobalModals 用含钱包地址的 key 挂载存款、划转、发送、兑换弹窗，钱包会话解析期间地址暂时为空就整窗重挂载、草稿丢失；新增 useFundsSessionKey，解析期间钱包相关部分沿用最近一个已定的值，网络切换照常生效；存款弹窗的存款、提款、Bridge 页签在解析中给忙碌占位，不再显示 Wallet not connected。F6a：API 钱包列表去掉 role=alert 警告块与 Loading/Refreshing/Unavailable 文字，按四态展示，新增 retained 状态（刷新失败时静默保留本页收到过的列表，管理操作仍禁用，给中性 Retry）。新测试在修改前失败。执行守卫不变。",
  "thread": null,
  "baseCommit": "f0f789bc",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/hooks/trade/use-funds-session-key.ts" },
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/api-wallet-list.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/api-wallet-state.ts" },
    { "path": "docs/mobile-data-presentation.md" }
  ],
  "supersedes": []
}
-->
# 资金弹窗在会话解析中保留草稿；API 钱包列表静默展示

## 背景与范围

同步记录，2026-11-21，未取得任务标识。运营方在核实结果出来后要求先修两条中等严重度项（核实记录在分支 `claude/layout-integrity-pilot` 的 `2026-11-21-ui-report-functional-verification.md`，随那个分支合入后可读）。工作树 `.claude/worktrees/funds-session-quiet`，分支 `claude/funds-session-and-api-wallet-quiet`，基线 `main` `f0f789bc`，与 PR #15 互不依赖。

## 结论与依据

**F5a（资金弹窗在会话解析中丢草稿）**

- 原因在上层：`GlobalModals` 以 `${env}:${clientKey}:${sessionMode}:${walletAddress}:${walletIntent}` 作存款、划转、发送、兑换弹窗的 key。重连或钱包目录初始化时 `walletAddress`、`clientKey`、`sessionMode` 暂时变成未连接的值，弹窗整窗重挂载。11-17 为发送、划转弹窗做的「解析中输入保留」测试直接渲染弹窗，没有经过这个 key，所以没有发现。
- 新增 `hooks/trade/use-funds-session-key.ts`：解析期间（`useWalletSession().isResolving`）钱包相关部分沿用最近一个已定的值，用 React 的「渲染期间按条件调整 state」写法，被放弃的渲染不会改动已存的值；网络（`env`）从不沿用。解析结束后身份没变就不重挂载；定在另一个账户、确认未连接或 10 秒上限到期时按新身份重挂载。这只影响展示：各弹窗在签名前仍按实时身份校验，执行守卫与提交身份检查都没有改。
- 存款弹窗的存款、提款、Bridge 三个页签在解析中渲染 `data-slot="funds-session-resolving"` 的忙碌占位（`PassiveDataPlaceholder busy`，最小高度 160px），不再显示「Wallet not connected」与连接按钮。提款金额等草稿是 `DepositModal` 自身的 state，表单卸载再挂上时原样回填。Bridge 页签卸载时执行照旧转到后台。

**F6a（API 钱包列表的被动横幅）**

- `ApiWalletPageState` 新增 `retained`：读取失败、但当前列表是本页开始读取后收到的（`useDataReceivedSinceMount`，键为网络与账户）。在此之前缓存的数据不保留，按首次失败处理。`retained` 不可操作（`isApiWalletPageOperable` 为假），生成、授权与删除都禁用；「Verify again」的重读不受影响。
- 列表：首次失败只给中性「Retry」，去掉 `role="alert"`、红色图标、错误标题和说明；`retained` 时列表保留，下方给「Retry」，保留的空列表只给「Retry」；表头只在显示列表时写「N authorized」，后台刷新只设 `aria-busy`。`action-progress-label-contract` 与 `status-motion-surface-contract` 的登记随之删去；`use-api-wallet-controller-query` 中「授权后重读失败」的预期由 `error` 改为 `retained`（空列表是本页收到的，按新规则保留，仍不可操作）。

规范：`docs/mobile-data-presentation.md`「钱包会话解析中」表新增两行（资金弹窗的挂载、存款弹窗各页签），「受约束的入口」新增 API 钱包页。CHANGELOG 已更新。

## 验证与限制

- 新测试：`use-funds-session-key.test.tsx`（真实 `useWalletSession` 加会话阶段工具，8 项）、`deposit-modal-withdrawal-routing-guard.test.tsx` 新增 2 项、`api-wallet-list-passive.test.tsx`（桌面与手机各 5 项）、`api-wallet-state.test.ts` 新增用例。变异：钩子不沿用身份时 8 项中 5 项失败；存款弹窗换回修改前时新增 2 项失败；列表换回修改前时 10 项全部失败。
- 本机全量终端 Vitest（`--maxWorkers=4`）：765 个文件、11,295 个用例通过，1 个文件跳过；终端类型检查通过；Biome 检查改动文件通过。审查轮次见下文补记。
- 没有在浏览器或真机上复现重连；没有用真实钱包验证。

## 后续与替代关系

- F5b–F5d（账户类型弹窗、Link mobile device 弹窗与仪表盘页面在解析中的展示）仍待处理。
