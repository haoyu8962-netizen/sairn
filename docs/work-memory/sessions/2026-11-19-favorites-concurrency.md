<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-favorites-concurrency",
  "date": "2026-11-19",
  "title": "收藏跨窗并发写入与 Agent 会话未知数值回写",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "wallet-onboarding"],
  "summary": "审查第 3 项成立并修复：收藏与选择按操作在 Web Lock 内读取、应用、写入，界面立即更新，没有 Web Locks 时同步写入。第 7 项只在应用自己写不出的数字上复现，判为不修并记下边界。",
  "thread": null,
  "baseCommit": "79b268ea",
  "commits": ["0945c1c0"],
  "sources": [
    { "path": "apps/terminal/src/stores/use-market-store.ts" },
    { "path": "apps/terminal/src/lib/tests/market-store-cross-window.test.ts" },
    { "path": "packages/hl-react/src/signing/agent-registration-session.ts" },
    { "path": "apps/terminal/src/lib/tests/agent-registration-session-forward-compat.test.ts" },
    { "path": "docs/hyperliquid-signing.md" },
    { "path": "docs/work-memory/sessions/2026-11-13-third-wave-fixes.md" },
    { "url": "https://html.spec.whatwg.org/multipage/webstorage.html" },
    { "url": "https://w3c.github.io/web-locks/" },
    { "url": "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API" },
    { "url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify" }
  ],
  "supersedes": []
}
-->
# 收藏跨窗并发写入与 Agent 会话未知数值回写

## 背景与范围

Codex 审查报告 `r1-wave3-signing.md` 的第 3 项（P2，收藏并发写入丢新增、复活已删除）与第 7 项（P3，Agent 注册会话同一 epoch 回写改变未知数值字段）。流程按运营方 2026-11-19 的安排：Codex 提出发现并开始写候选补丁，额度在 21:54 用完，留下未完成的草稿且没有修复报告；Claude 核对官方依据、在基线上复现、裁定草稿并独立完成修复；主会话负责验证与提交。基线为 `main` `79b268ea`，Node 22.15.0。未取得任务会话标识。

## 结论与依据

**第 3 项成立（运行过并看到结果）。** 基线 `use-market-store.ts` 在 zustand persist 的 `setItem` 里同步读取存储、按上次同步的差异合并、整份写回。读与写之间没有跨窗口的原子边界。用例在 B 窗口的 `localStorage.setItem` 前插入 A 窗口的完整操作：A 新增 `HYPE` 时最终存为 `["BTC","ETH","SOL"]`（丢了 `HYPE`），A 删除 `ETH` 时也存为 `["BTC","ETH","SOL"]`（`ETH` 复活）。HTML 规范 Web Storage 一章的引言说明 `localStorage` 是共享状态，并建议作者假定没有锁，以「读、加一、写回」为例说明两个窗口会得到错误结果（[HTML Standard, 12.1 Introduction](https://html.spec.whatwg.org/multipage/webstorage.html)）。插入发生在同步代码的两次调用之间，属于人为构造的交错；真实浏览器里两个窗口要在极短时间内同时修改收藏才会遇到，影响面小。

**修法。** 收藏增删与各 scope 的市场选择改为显式操作：收藏记录点击时的目标状态（加入或移除），不是「切换」，所以两个窗口同时点同一个市场不会互相抵消。点击时立即更新界面状态，不等锁；持久化在名为 `market-prefs-v2:lock` 的 Web Lock 里读取当前存储、应用这一个操作、写回 v3 记录。本窗口尚未写入的操作保存在 `pendingEdits`，收到别窗的 `storage` 事件或从往返缓存恢复时，先取存储里的收藏，再叠上这些待写操作，避免界面倒退。zustand persist 只用于同步水合，其 `setItem` 改为空操作。所选市场仍由各窗口自己保存：别窗的写入只更新本窗的收藏，不改本窗的选择；选择与当前值相同时不发请求。

- Web Locks 依据：锁管理器属于存储桶，同源的标签页与 worker 共用（§1、§2.2）；同名请求只有队首可授予，因此按请求顺序执行（§2.5、§4.4）；回调结束即释放（§2.4、§3.2.1）；文档不完全活动时 `request()` 以 `InvalidStateError` 拒绝，取不到锁管理器时以 `SecurityError` 拒绝（§3.2.1）；接口带 `[SecureContext]`（[Web Locks API](https://w3c.github.io/web-locks/)）。MDN 记载该 API 只在安全上下文提供，自 2022 年 3 月起各主流浏览器都已支持（[MDN, Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)）。
- zustand 时序（读 `node_modules/zustand/esm/middleware.mjs`，5.0.9）：`persistImpl` 包装的 `set` 与 `api.setState` 每次都同步调用 `storage.setItem`（第 362–370 行）；水合用未包装的 `set`，只有迁移后才写回（第 409–416 行）；同步存储下 `toThenable` 让水合在 `create` 时同步完成。所以 `setItem` 改为空操作后，水合与 `useMarketStore.setState` 都不会写存储，写入只发生在 `writeMarketEdit`。
- 没有 Web Locks 的回退（非安全上下文，例如用局域网 IP 的 http 地址打开开发服务器）：同一个同步任务内读取、应用、写入，即修复前的行为，保留原有的极短竞争窗口。锁请求在回调运行前被拒绝时，同样直接写入一次；回调里写入失败（例如配额）时不重试，界面保留这次改动，直到下一次从存储同步。
- 草稿裁定：保留了 Codex 的「显式操作 + 待写集合 + persist 只水合」思路；删除了它的 IndexedDB 回退（`market-preference-lock.ts`）。理由：IndexedDB 读写事务确实会串行，但它为源新增一个持久数据库，而且打开失败时草稿直接放弃写入，比修复前更差；没有 Web Locks 的情形主要是非安全上下文，修复前的同步写入已够用。锁请求的拒绝路径与写入失败路径按上面改写。测试改写为不依赖实现细节的规则：读写之间插入别窗操作后新增保留、删除不复活；等锁期间界面立即显示并经受别窗更新；两窗同时点同一收藏按各自点击写入；选择各窗独立；锁请求被拒仍写入。

**第 7 项判为不修（复现运行过，判断为读代码与实验推断）。** 用 Codex 的合成记录（`9007199254740993`、`1e400`、嵌套 `1e-400` 与 `-0`）走 `persistAgentForRegistration` 同一 epoch 回写，基线把它们改成 `9007199254740992`、`null`、`0`、`0`，现象属实。但这些数字只能由手写文本产生：本应用每个版本都用 `JSON.stringify` 写这条记录，`BigInt` 会让它抛错，`Infinity` 与 `NaN` 写成 `null`（[MDN, JSON.stringify()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify)），`-0` 写成 `0`。对 `JSON.stringify` 写出的任何有限 double，解析再序列化得到同一段文本：Node 22.15.0 上随机抽取约 200 万个有限 double 加边界值，差异为 0。这条规则来自 ECMA-262 的 Number::toString（§6.1.6.1.20，取能还原原值的最短数字串），本次未取得该节原文引用。在签名会话路径上为一个不存在的字段手写 JSON 分词器（草稿做法）风险高于收益，因此撤掉草稿，改加一条用例，固定「`JSON.stringify` 能写出的数字原样回写」。

## 验证与限制

运行过并看到结果（Node 22.15.0、Vitest、`--maxWorkers=2`，不连外部网络）：

| 检查 | 结果 |
| --- | --- |
| 基线上只加复现用例 | `Test Files 2 failed (2)`、`Tests 6 failed \| 22 passed (28)`：两个读写交错用例、等锁显示、选择等锁、锁被拒回退（后三项是新行为的断言，基线同步写入所以不满足），以及 Codex 的数值用例 |
| 修复后 `market-store-cross-window` 与 `persisted-store-hydration` | `Tests 31 passed (31)` |
| 变异 M1：锁内改用点击时的快照、不读存储 | 7 个用例失败，含两个交错用例 |
| 变异 M2：同步存储时不叠加待写操作 | 「等锁期间显示并经受别窗更新」失败 |
| 变异 M3：锁请求被拒后不写入 | 「锁请求被拒仍写入」失败；三处变异均已还原并复跑 `17 passed (17)` |
| 相关测试（引用该 store、收藏、选择、导航、Agent 注册会话的 38 个文件） | `Test Files 38 passed (38)`、`Tests 983 passed (983)`，退出 0 |
| `pnpm --filter @sairn/terminal typecheck` | 通过，无输出错误 |
| `pnpm exec biome check --write`（3 个改动的 TypeScript 文件） | `No fixes applied` |

没有验证：真实浏览器多标签页、原生 Web Locks（用例中的锁是可控替身）、真机。读代码推断的边界：

- Web Locks 规范不规定锁的释放与另一进程看到 `localStorage` 新值之间的先后；多进程浏览器里如果锁先授予、存储变更后到，仍可能读到旧值。没有找到官方依据证明或排除这一点。
- 页面在拿到锁之前关闭时，排队的操作没有写入。
- 旧版本的窗口不申请这把锁，新旧版本并存期间仍按修复前的方式竞争。
- 第 7 项：如果将来的版本用 `JSON.rawJSON` 写出超出 double 精度的数字，本版本回写会改变它；这类值应写成字符串。

## 后续与替代关系

- 交主会话：`docs/hyperliquid-signing.md` 第 600 行原句为 “An Agent registration session record keeps fields this version does not know and writes them back while the record keeps its epoch; a new epoch (a new session, `closing` or `closed`) starts without them.” 建议补一句说明未知数值按 JavaScript number 读写，数值超出 double 精度的未来字段须写成字符串。
- `CHANGELOG.md` 第 21 行 “Favorites follow other tabs, and two tabs no longer overwrite each other's favorites; each tab keeps its own selected market.” 与本次行为一致，无需修改。
- `docs/work-memory/sessions/2026-11-13-third-wave-fixes.md` 记录了第三波首次加入跨窗合并时的验证，本记录补上读写交错的证据，不替代它。
