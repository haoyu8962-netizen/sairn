<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-19-external-wallet-deposit-recovery",
  "date": "2026-11-19",
  "title": "外部钱包存款：无哈希时禁止重签与加速/取消后的跟踪",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "资金弹层审查第 1 项（外部钱包没拿到哈希时下一次可重新签名广播）与第 6 项（加速或取消后仍只跟踪旧哈希，最长阻塞 30 天）。Codex 提出并留下未完成草稿（无哈希记录永不过期、靠账户 nonce 二分查找替换交易），Claude 复现两项后弃用草稿，改为外部钱包在广播前写入与赞助路径相同的 EIP-3009 未决授权记录，按钱包广播前明确拒绝、成功回执中的 AuthorizationUsed 事件或 validBefore 到期解除；有哈希记录另存授权 nonce、validBefore 与广播前区块号，旧哈希无回执时按 USDC authorizationState 与 AuthorizationUsed 日志找出真正消耗授权的交易，授权过期未用则按源交易失败结清。钱包错误有数字代码时只按代码判定。本地 Vitest、类型检查与变异已运行；真实钱包、真实 Arbitrum RPC 与真实资金未验证。",
  "thread": null,
  "baseCommit": "79b268eaf0d7ac8f364a3f744c01383bb195bf8a",
  "commits": [],
  "sources": [
    { "path": "docs/cctp-deposits.md" },
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "docs/adr/0040-automatic-email-wallet-deposits.md" },
    { "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts" },
    { "path": "apps/terminal/src/lib/trade/cctp-deposit-tracking.ts" },
    { "path": "apps/terminal/src/lib/tests/use-deposit-routing-guard.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/use-cctp-deposit-tracking.test.tsx" },
    { "url": "https://eips.ethereum.org/EIPS/eip-3009" },
    { "url": "https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v2/EIP3009.sol" },
    { "url": "https://eips.ethereum.org/EIPS/eip-1193" },
    { "url": "https://viem.sh/docs/actions/public/waitForTransactionReceipt" },
    { "url": "https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore" }
  ],
  "supersedes": []
}
-->
# 外部钱包存款：无哈希时禁止重签与加速/取消后的跟踪

## 背景与范围

任务标识未取得（`thread: null`）。来源是本地 Codex 资金弹层审查报告的第 1 项（P1）与第 6 项（P2）。分工：Codex 提出发现并开始修复，因额度用完中断，没有修复报告，工作树里留下 17 个文件的未完成草稿；Claude 核对官方依据、在基线代码上复现、裁定草稿并独立完成修复。基线为 `79b268ea`，只处理这两项。没有做 Git 写操作、真实签名或资金操作，测试不连外网。

## 结论与依据

- 第 1 项成立。基线外部钱包路径在拿到哈希后才写恢复记录。用真实 `useDeposit` 复现：钱包对 `writeContract` 返回 `4900`，重置并重新挂载后再次存款，`signTypedData` 被调用两次、`writeContract` 两次。另一个基线缺口一并复现：错误同时带 `4900` 与「Request rejected …」字样时，按消息被判为钱包明确拒绝，结果显示为失败而非未知。
- 第 6 项成立。基线恢复只查原哈希的回执，空回执一律为等待；用模拟 Arbitrum RPC 复现：链上授权已被另一笔交易使用时，基线持续返回 `waiting`，记录按 30 天保留期阻塞新存款。
- 官方依据：EIP-3009 定义 `authorizationState(authorizer, nonce)` 与 `AuthorizationUsed(authorizer, nonce)`，nonce 每个授权人只能用一次；Circle `stablecoin-evm` 的 `EIP3009.sol` 中 `receiveWithAuthorization` 要求调用者等于收款方、`now < validBefore`，并在使用时发出 `AuthorizationUsed`。Circle 的 Arbitrum→HyperCore 教程以 `ReceiveWithAuthorization` 与 `batchDepositForBurnWithAuth` 为外部钱包路径，`validBefore` 取一小时；没有关于重复提交或幂等的说明。EIP-1193 只把 `4900`/`4901` 定义为断开，不说明交易是否已离开钱包。viem 文档说明替换检测依赖原交易 nonce 与节点能力，节点可能在读取前丢弃被替换交易。Hyperliquid 文档只描述 Bridge2 存款（最低 5 USDC），没有 CCTP 幂等说明。
- 采用的方案：外部钱包在广播前于资金锁内写入与赞助路径相同的未决授权记录；任一模式的记录都在签名前拦截新存款并沿用现有文案。解除条件只有三种链上或钱包事实：广播前明确拒绝（有数字代码时只看代码）、成功回执含 `AuthorizationUsed(owner, authNonce)`、`validBefore` 到期（之后 USDC 拒绝该授权）。最长阻塞一小时，不会永久锁死。有哈希记录另存授权 nonce、`validBefore` 与广播前区块号；旧哈希无回执时，在同一区块读取 `authorizationState` 与区块时间：未用且未到期则等待，未用且已到期则按 `source-receipt-mismatch` 结清，已用则用 `eth_getLogs` 找到消耗授权的交易，通过与原交易相同的回执和调用数据校验（新增授权 nonce 校验）后用其哈希查询 Circle。
- 未采用 Codex 草稿：其无哈希记录没有任何自动解除条件，只能靠钱包明确拒绝解除，与「不能永久锁死」冲突；替换检测要求先在节点上取到原交易 nonce，再对历史区块做 `eth_getTransactionCount` 二分查找，原交易被节点丢弃或节点不支持历史状态时无法工作，并且在恢复查询里写存储。草稿里新增的界面状态与通知改动也一并撤掉，用户可见文案没有新增。

## 验证与限制

- Node `v22.15.0`。运行并看到结果：基线上新增用例失败（第 1 项「expected vi.fn() to be called once, but got 2 times」；第 6 项「expected { status: 'waiting' } to deeply equal { status: 'forward-submitted', … }」）；修复后与存款、CCTP、资金动作相关的 31 个测试文件 939 个用例全部通过；`pnpm --filter @sairn/terminal typecheck` 通过；对改动文件 `biome check --write` 无剩余问题。
- 变异（运行并看到结果）：去掉外部钱包写入授权记录，第 1 项五个用例失败；恢复「消息优先于代码」，断开带拒绝字样的用例失败；把到期判断从 `<` 改为 `<=`，到期结清用例失败；Circle 查询改回原哈希，加速跟踪用例失败。均已改回。
- 没有验证：真实钱包（WalletConnect、浏览器扩展）的错误代码，真实 Arbitrum 公共 RPC 对 `eth_getLogs` 区块范围的限制（公开文档未说明），真实加速/取消交易与真实资金到账，浏览器夹具与真机。
- 已知边界：未带代码而只有拒绝字样之外的非标准钱包错误（如旧版 `-32603` 加「User denied」）现在按未知处理并阻塞至授权到期；对话框自身仍只等待原哈希，加速后在十分钟确认期限结束时显示未知，由页面级跟踪接手；浏览器链接仍指向原哈希；旧格式记录保持原行为。

## 后续与替代关系

- 由主会话提交后补 `commits`，并交 Gemini 终审。
- 未决定事项：授权过期未用时复用的 `source-receipt-mismatch` 文案（「did not match the reviewed deposit. Check your wallet activity」）对取消/丢弃只算部分贴切，若要专门文案需新增可翻译字符串，由运营方决定；是否为外部钱包授权记录单独写 ADR 也由运营方决定。
- 原审查报告第 2、3、4、5、7、8 项不在本任务范围。
