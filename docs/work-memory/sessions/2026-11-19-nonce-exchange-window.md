<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-nonce-exchange-window",
  "date": "2026-11-19",
  "title": "P2-1：用可靠的交易所估时分配 Hyperliquid nonce",
  "kind": "task",
  "status": "verified",
  "topics": ["hyperliquid-api", "pr-review"],
  "summary": "有可靠交易所估时时，nonce 以估时为基准分配；Codex 提出与候选补丁，Claude 对照官方 nonce 规则核对、复现并裁定。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": [],
  "sources": [
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "path": "docs/hyperliquid-signing.md" },
    { "path": "docs/adr/0045-l1-action-expiry.md" },
    { "path": "docs/work-memory/sessions/2026-11-12-second-wave-fixes.md" },
    { "path": "packages/hl-react/src/internal/exchange/cross-tab-nonce-manager.ts" },
    { "path": "packages/hl-react/src/internal/exchange/server-clock.ts" },
    { "path": "packages/hl-react/src/clients.ts" },
    { "path": "apps/terminal/src/lib/tests/cross-tab-nonce-manager.test.ts" },
    { "path": "apps/terminal/src/lib/tests/exchange-action-expiry.test.ts" }
  ],
  "supersedes": []
}
-->
# P2-1：用可靠的交易所估时分配 Hyperliquid nonce

## 背景与范围

同步记录，未取得任务标识。来源是 2026-11-19 第二轮签名审查报告的 P2-1：有可靠的交易所时间样本时，跨标签页 nonce 分配器仍以设备墙钟生成 nonce，只用交易所估时判断未来上限。分工按运营方当日的流程：Codex 提出发现并留下未提交的候选补丁，Claude 对照官方文档核对、复现并裁定最终修法，主会话负责提交与文档同步。范围只含 P2-1；同一报告的其余条目和 P3「损坏记录重置」不在本次处理。

## 结论与依据

**官方规则**（[Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)）：每个签名者保存最高的 100 个 nonce；新交易的 nonce 必须大于该集合的最小值且从未用过；nonce 按签名者计（Agent 签名时是 Agent 地址）；nonce 必须落在 `(T - 2 days, T + 1 day)`，`T` 是交易所在区块的 Unix 毫秒时间戳。官方对生成方式的建议是每批请求取一个原子计数器并递增，计数器「可在需要时快进到当前 Unix 毫秒」。[Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint) 各动作的 `nonce` 字段写「Recommended to use the current timestamp in milliseconds」。官方没有说明「当前时间」取设备时钟还是交易所时钟；窗口按区块时间判定，所以在设备时钟偏差超过窗口时，交易所估时比设备时钟更贴近规则本意。没有找到官方终端如何生成 nonce 的依据。

**采用的修法**：`allocateNonce` 以 `exchangeNow ?? Date.now()` 为基准，用同一基准计算未来上限，候选值取基准与仍在窗口内的历史记录加 1 中的较大者，到达上限时拒绝且不重写记录。这就是官方建议的「递增计数器 + 快进到当前毫秒」，只是有可靠样本时「当前毫秒」取交易所估时。记录格式、按网络与签名者分开的键、Web Lock 和读回校验不变。

**逐个情形的判断**：

- 单调与唯一：任何基准下候选值都不低于记录加 1，只有估时存在且记录不低于 `估时 + 1 天` 时才丢弃记录；按上面的窗口规则，这样的记录交易所不可能已接受。批量下单是一个动作一个 nonce；同一毫秒的连发逐一加 1。
- 两个标签页：锁内读写同一条记录，一页有样本、一页没有时，两页仍共用加 1 的下限，不会重复。
- 设备休眠或时钟被改：`estimateNow()` 在墙钟与单调钟不一致时返回 `undefined`，分配退回设备时钟并保留下限，与 2026-11-12 的约定相同。L1 动作在 SDK 里先算 `expiresAfter` 再取 nonce，所以休眠后的 L1 动作会先重新取样，再以估时分配；用户签名动作不取样，沿用设备时钟。
- 估时未补往返时间，可能比区块时间略早，离 `T - 2 days` 的下限很远，不影响接受。

**对候选补丁的裁定**：生产代码三行改动保留。测试方面，Codex 把既有用例「keeps counting from a record ahead of the clock」的记录改成 `version: 2` 加 `lane` 字段，这与已有的「keeps the floor of a newer record version」重复，改回 `version: 1`，保留设备快三天的条件；删除旧用例「refuses a nonce from a device clock beyond the exchange window」是对的，它钉的正是被修掉的行为。另外新增两条规则测试：一页有样本、一页（设备慢或快一小时）没有样本时交替分配严格递增且首个值等于估时；设备慢三天时同一估时毫秒内连发 20 次得到连续值。报告中「无样本且记录异常时签名前主动取样」的建议没有采用：它会改变用户签名动作和关闭延迟保护时的取样行为，需按 ADR 0045 的契约另行决定。

## 验证与限制

Node `v22.15.0`。定向命令为在 `apps/terminal` 下运行 `pnpm exec vitest run --maxWorkers=2 src/lib/tests/cross-tab-nonce-manager.test.ts src/lib/tests/exchange-action-expiry.test.ts`。

- 用 `git apply -R` 撤掉生产代码改动、保留测试：`Test Files 2 failed (2)`，`Tests 9 failed | 44 passed (53)`；设备慢三天时分配器返回 `1799740800000`，估时为 `1800000000000`；设备快三天时本地拒绝。
- 重新应用后：`Test Files 2 passed (2)`，`Tests 53 passed (53)`，退出码 0。
- 变异一，基准改回 `Date.now()`：`10 failed | 43 passed`。变异二，去掉「记录加 1」下限：`17 failed | 36 passed`。变异三，丢弃条件 `>=` 改为 `>`：`1 failed | 52 passed`。三处均已还原。
- `AGENTS.md` 签名与连接回归组加上引用分配器、服务器时钟和客户端的另外 8 个文件：`Test Files 75 passed (75)`，`Tests 1238 passed (1238)`，退出码 0。
- `pnpm --filter @sairn/terminal typecheck` 与 `pnpm --filter @sairn/hl-react typecheck` 退出码 0；三个 TypeScript 文件 `pnpm exec biome check --write` 为 `No fixes applied`；`git diff --check` 通过。

测试使用模拟墙钟、模拟单调钟、模拟 Web Locks 和拦截 `fetch` 的 SDK 夹具，没有连接交易所。真实设备休眠、真钱包签名、真实浏览器多标签页、服务端 100 个 nonce 集合下的实际接收结果都没有验证。`pnpm memory:test` 的夹具会执行 `git init`、`git add`、`git commit`，按本次不做 Git 写操作的范围跳过。

## 后续与替代关系

由主会话同步文档：[Stored nonce and Agent records](../../hyperliquid-signing.md#stored-nonce-and-agent-records-2026-11-12) 首条中的「the future window is judged against the exchange's time」应改为可靠估时同时用作分配基准和未来上限，窗口内的记录继续作为递增下限，候选值到达 `T + 1 day` 时拒绝且不重写记录；「Without such an estimate, for example after the device slept, the device clock is used as before.」仍然成立。[CHANGELOG.md](../../../CHANGELOG.md) 的 Unreleased / Fixed 需补一条用户可见的说明。主会话提交后在 `commits` 中补提交号。
