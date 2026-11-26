<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-26-terminal-seven-new-languages",
  "date": "2026-11-26",
  "title": "交易终端新增七种界面语言（编排记录）",
  "kind": "task",
  "status": "recorded",
  "topics": ["i18n-runtime"],
  "summary": "按单语言闭环为交易终端依次增加 ko、zh-TW、vi、tr、ru、pt、id；本批次做前三个。Gemini 4 Neon 定术语表、翻译与接入，Codex 只读对抗审查，Claude 编排、核实与提交。进行中。",
  "thread": null,
  "baseCommit": "ce3259b68",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/lingui.config.ts"},
    {"path": "apps/terminal/src/config/i18n.ts"},
    {"path": "apps/terminal/src/config/chart.ts"},
    {"path": "apps/terminal/src/lib/bootstrap-error-copy.ts"},
    {"path": "apps/terminal/src/lib/link-locale.ts"},
    {"path": "docs/i18n-presentation.md"},
    {"path": "docs/work-memory/sessions/2026-10-28-japanese-interface-language.md"}
  ],
  "supersedes": []
}
-->
# 交易终端新增七种界面语言（编排记录）

## 背景与范围

2026-11-26 运营方要求：由 Claude Code 任总编排与质量负责人，指挥 Gemini 4 Neon（定术语表、翻译、单语言接入与修复）和 Codex（只读对抗审查），为交易终端（`apps/terminal`）依次增加七种界面语言：韩语 `ko`、繁体中文 `zh-TW`、越南语 `vi`、土耳其语 `tr`、俄语 `ru`、巴西葡萄牙语 `pt`、印尼语 `id`。本次执行批次是第 1–3 个；后续批次读本记录的核对表接力。

- 单语言闭环：冻结术语表 → 接入与分批翻译（每批 250–350 条，脚本写回 `.po`）→ 机器硬闸门（PO 结构、占位符、ICU、品牌字面量、提取零污染、契约与单测）→ Codex 只读对抗审查 → 核实、定向修复、窄范围复审 → 独立提交。做完一个、审过一个、提交一个，再进入下一个。
- 范围红线：只改 `apps/terminal` 及其配置、测试、夹具、预算与文档；不改官网 `apps/website` 与 `brand/`；不改现有 7 种语言（en/zh/ja/hi/es/fr/ar）的 `.po` 译文。推送、开 PR、合并前停下等运营方授权。
- 工作树 `.claude/worktrees/ios-tab-loading-state-69bc1c`，分支 `claude/terminal-i18n-orchestration-587e12`。会话开始时它停在原仓库（已封停账号）的旧历史 `766a85668`，按手册同步为新仓库 `haoyu8962-netizen/sairn` 的 `main` `ce3259b68`（含日语先例 `bf41e08d`）；图表库用 `scripts/fetch-chart-library.mjs --from` 从本机 sairn 克隆安装（不入库）。
- 防遗漏基线：`git show --stat bf41e08d`（日语的完整改动清单），外加本次确认的额外接入点（`link-locale.ts` 的区域码解析、`spot-asset-info.ts` 的描述语言回退、各语言矩阵测试与 Playwright 夹具）。

## 进度核对表

每开始下一个语言前先重读本表。「—」表示未开始。

| 语言 | 术语表定稿 | 接入点齐备 | PO 硬校验 | 契约/单测 | Codex 对抗轮次与结论 | Commit SHA |
| --- | --- | --- | --- | --- | --- | --- |
| 1 韩语 `ko` | 是（60 条，编排改 3 处） | 是（25 个文件） | 2,152 条，错误 0 | 27 个文件 1,158 项通过；修复后 18 个文件 909 项通过 | 2 轮：8.2 → 9.3，P0–P2 清零 | 韩语提交（本记录随下一个语言补写提交号） |
| 2 繁体中文 `zh-TW` | — | — | — | — | — | — |
| 3 越南语 `vi` | — | — | — | — | — | — |
| 4 土耳其语 `tr` | — | — | — | — | — | — |
| 5 俄语 `ru` | — | — | — | — | — | — |
| 6 巴西葡萄牙语 `pt` | — | — | — | — | — | — |
| 7 印尼语 `id` | — | — | — | — | — | — |

## 结论与依据

### 流程与工具

- 角色：Gemini 4 Neon 经 `agy` CLI 运行（沙箱外，因为它要监听本地端口、写自己的日志目录）。术语表草稿用 `gemini-4-neon-xhigh`、只读 plan 模式；分批翻译与定向修复用 `gemini-4-neon-high`、只读 plan 模式，结果以 JSON 返回，由脚本写回 `.po`；接入改动用 `gemini-4-neon-high` 的 `accept-edits` 模式，任务书限定文件清单，禁止 git、pnpm、node、sed、rm、mv。Codex CLI 0.172.0 的 `gpt-6-astra`、`-s read-only`、`medium` 做对抗审查。Claude Code 审核并锁定术语表、核实每条审查发现、跑机器闸门、写记录与提交。
- 分批：`en/messages.po` 的 2,152 条活跃消息按目录顺序切成 8 批（每批 269 条）。每条附 `msgctxt`、`#.` 占位说明、前 4 个 `#:` 源文件以及已审过的 zh/ja 译文（只作语义参考），加锁定术语表与硬格式规则。
- 机器闸门（草稿目录里的临时脚本，不入库）：用 `pofile` 与 `@messageformat/parser` 检查活跃条目与 `en` 同集同序、空译文、占位符多重集合（含复数分支的参数集合）、`<0>` 标签、`{BRAND_NAME}` 次数、ICU 解析、复数键属于该语言的 CLDR 类别且含 `other`、品牌字面量、NFC。脚本先在 `ja` 上校准（0 错误），再用人为破坏的副本做变异（缺 `other`、品牌字面量、丢标签、丢占位符各一处，全部报错）。

### 1 韩语 `ko`

- 接入：`lingui.config.ts`、`config/i18n.ts`（显示名 한국어，Intl `ko-KR`）、`config/chart.ts`（TradingView `ko`）、`bootstrap-error-copy.ts`，以及照日语先例的全部语言矩阵测试、`position-close-all` 与 `referral-code-card` 两个夹具（未注册的语言直接抛错，不回退英文）和 `top-nav-connected` 的完整矩阵。语言顺序定为 en、zh、ja、ko、hi、es、fr、ar。`link-locale.ts` 不需要改（`ko-KR`、`ko_KR` 已回退到 `ko`），只补测试；`spot-asset-info.ts` 对 `ko` 返回 null，沿用不支持语言的回退。
- 术语表（Gemini xhigh 草稿 60 条，编排审核后改 3 处：清算价一族统一为韩国交易所通行的 청산가，강제청산 只用于强平事件本身；`Reduce Only` 由「감소 전용」改为「축소 전용」；`Jailed` 定为「정지됨」）：

| English | msgctxt | 译法 | 被否决的写法 |
| --- | --- | --- | --- |
| Deposit | `Trading toolbar action` | 입금 | 예치 (reserved for Earn Supply), 충전 (fiat/prepaid tone) |
| Withdraw | `Trading toolbar action` | 출금 | 인출 (banking/ATM tone, less common on Korean crypto exchanges) |
| Transfer |  | 이체 | 전송 (reserved for Send to another Hyperliquid address), 이동 (too generic) |
| Send |  | 전송 | 이체 (reserved for internal Transfer), 보내기 (less concise in compounds like '전송 실패') |
| Bridge |  | 브릿지 | 브리지 (strict academic orthography; Korean crypto UIs overwhelmingly use 브릿지), 크로스체인 (describes property, not action) |
| Supply |  | 예치 | 공급 (collides with token circulating/total supply '공급량'), 입금 (reserved for Deposit) |
| Borrow |  | 대출 | 차입 (institutional accounting register), 빌리기 (too colloquial) |
| Market |  | 마켓 | 시장 (collides mentally with 시장가 and sounds macroeconomic), 종목 (stock-market term) |
| Market | `Order type` | 시장가 | 마켓 (reserved for trading pair), 시장가 주문 (too long for tabs/badges) |
| Limit | `Order type` | 지정가 | 리밋 (non-standard in Korean exchange UIs), 한정가 (never used) |
| Stop Market | `Order type` | 스탑 시장가 | 스톱 시장가 (keep 스탑 spelling consistent across all stop terms), 손절 시장가 (too narrow; stop orders can also enter positions) |
| Scale | `Order type` | 스케일 | 분할 주문 (ambiguous with TWAP), 배율/크기 (wrong literal sense) |
| Terminate |  | 중단 | 종료 (reserved for position Close and closed Vaults), 취소 (reserved for Cancel) |
| TP/SL | `Current orders column` | TP/SL | 익절/손절 (longer; Korean futures exchanges keep TP/SL in headers and buttons) |
| Reduce Only |  | 축소 전용 | 감소 전용 (unnatural), 리듀스 온리 (transliteration) |
| Post Only |  | 포스트 온리 | 지정가 전용 (inaccurate; regular limit orders can take liquidity), 게시 전용 (literal mistranslation) |
| TIF |  | TIF | 유효기간 (fixed rule keeps abbreviation TIF untranslated) |
| Margin |  | 증거금 | 마진 (use 마진 only in named modes like 마진 모드 and 포트폴리오 마진) |
| Isolated |  | 격리 | 분리 (Japanese calque, not used on Korean exchanges) |
| Leverage |  | 레버리지 | 배율 (too generic) |
| Collateral |  | 담보 | 증거금 (reserved for Margin) |
| Liquidation |  | 강제청산 | 청산 alone in prose (easily confused with voluntary position close by some readers) |
| Funding Rate |  | 펀딩 비율 | 자금조달률 (academic/Japanese calque; Korean exchanges use 펀딩 비율) |
| Funding | `Cumulative position funding` | 펀딩비 | 자금조달료 (unidiomatic), 펀딩 비율 (rate, not paid/received USDC amount) |
| Open Interest |  | 미결제약정 | 오픈 인터레스트 (unnecessary transliteration), 미청산 계약 (non-standard) |
| Mark Price |  | 마크 가격 | 표시 가격 (literal), 시장 평균가 (collides with Average Price and lacks a short header form) |
| Mid |  | 중간가 | 미드 (transliteration), 중앙값 (statistical median) |
| Slippage |  | 슬리피지 | 가격 미끄러짐 (literal, never used) |
| Perps |  | 무기한 선물 | 선물 alone (homonym with 'gift' in Korean, especially in 'To Perp'), 영구 계약 (Chinese calque) |
| Spot |  | 현물 | 스팟 (less standard than 현물 on Korean exchanges) |
| Order Book |  | 호가창 | 오더북 (casual speech; exchange tabs use 호가창), 주문장 (archaic) |
| Trades |  | 체결 | 거래 (too broad; reserved for Trade/Trading), 매매 (stock-market tone) |
| Positions |  | 포지션 | 보유 현황 / 보유량 (spot/stock wording) |
| Open Orders |  | 미체결 주문 | 열린 주문 (literal mistranslation), 오픈 오더 (non-standard) |
| Filled |  | 체결됨 | 채워짐 (literal mistranslation), 완료 (ambiguous with completed transfers/TWAP) |
| Triggered |  | 트리거됨 | 발동됨 (less standard than 트리거됨 on Korean crypto futures exchanges) |
| PNL |  | 손익 | 수익 (misses losses), PnL untranslated (locale guidance prefers 손익) |
| Entry Price |  | 진입가 | 매수가 (wrong for short positions), 개시 가격 (unidiomatic) |
| Size |  | 수량 | 크기 (literal mistranslation) |
| Account Value |  | 계정 평가액 | 계정 가치 (slightly literal), 총 잔고 (misses unrealized PnL) |
| Balances |  | 잔고 | 잔액 (more bank-account oriented; Korean crypto exchanges prefer 잔고) |
| Long |  | 롱 | 매수 포지션 (too long for badges/tags) |
| Buy |  | 매수 | 구매 (reserved for fiat/card purchases like 'Card purchase' = '카드 구매') |
| Unified account |  | 통합 계정 | 단일 계정 (loses unified margin meaning), 유니파이드 계정 (unnecessary transliteration) |
| Vaults |  | 볼트 | 금고 (sounds like a physical safe rather than a DeFi strategy vault) |
| Leader |  | 운용자 | 리더 (evokes Korean '리딩방' scam groups when combined with Leading -> 리딩 중), 관리자 (sounds like system admin) |
| Staking |  | 스테이킹 | 예치 (reserved for Earn Supply) |
| Delegate |  | 위임 | 대리 / 맡기기 (wrong register) |
| Commission |  | 수수료율 | 커미션 (implies referral kickback), 추천 보상 (wrong concept) |
| Referrals |  | 추천 | 레퍼럴 (informal loanword; major Korean exchanges use 추천 in navigation) |
| Fees |  | 수수료 | 비용 (too generic) |
| Reverse | `Position action` | 반전 | 뒤집기 (too colloquial), 리버스 (less standard on Korean exchange buttons), 스위칭 (slang) |
| Close |  | 종료 | 청산 (collides with forced Liquidation), 닫기 (for UI dialogs only, never positions) |
| Cancel |  | 취소 | 철회 (formal/legal), 중단 (reserved for Terminate TWAP) |
| API Wallet |  | API 지갑 | API 월렛 (inconsistent with 지갑 used for Wallet everywhere) |
| Connect |  | 연결 | 접속 (implies website/server login rather than wallet connection) |
| Portfolio |  | 포트폴리오 | 자산 현황 (too vague; 포트폴리오 is universal on Korean exchanges) |
| Mainnet |  | 메인넷 | 주 네트워크 (literal, never used) |
| Delisted |  | 상장폐지 | 거래 지원 종료 (too long for compact market badges) |
| Spot Dust Conversion |  | 현물 소액 잔고 전환 | 현물 먼지 전환 (literal mistranslation), 현물 더스트 전환 (unidiomatic loanword) |

不译：`{BRAND_NAME}`、`Earn`、`Alo`、`Gtc`、`Ioc`、`Hyperliquid`、`HyperCore`、`HyperEVM`、`HIP-3`、`Arbitrum`、`CCTP`、`Circle`、`TradingView`、`Privy`、`WalletConnect`、`MetaMask`、`TWAP`、`TIF`、`API`、`TP/SL`、`RO`、`ROE`、`ROI`、`APR`、`APY`、`LTV`、`TVL`、`CSV`、`QR`、`PWA`、`SDK`、`AI`、`Defi`、`Gaming`、`Layer 1`、`Layer 2`、`Meme`、Token symbols and tickers (USDC, HYPE, BTC, ETH, USD, etc.)。

- 复数：韩语只有 `other`。`cancel-all-orders-modal` 与 `position-close-all-modal` 的两条消息，英文 `one` 分支语义不同（「该笔订单」「可能不再受保护」），保留 `=1` 分支；三条计数消息只用 `other`。
- Codex 第 1 轮（约 17.6 万 token，8.2 分）：无 P0/P1；4 项 P2、2 项 P3，逐条对照源码核实全部成立，交 Gemini 定向修复后由脚本写回：
  - 手机导入页「scan a new QR from desktop」原译读成在桌面上扫码，改为「데스크톱에 표시된 새 QR 코드를 스캔하세요」（与日语先例同类）。
  - 订单类型 `Vault Close` 原译「볼트 종료」读成金库停止运营，改为「볼트 포지션 종료」，测试期望同步。
  - 止损输入框的无障碍名称 `Stop loss return` / `… unit` 原译「손절 수익」把亏损读成收益，改为「손절 손익」。
  - 文档未同步：`docs/i18n-presentation.md` 的维护语言清单与「Every maintained language is complete」规则加入韩语，`CHANGELOG.md` 增加条目。原计划在七种语言完成后统一收口；按 AGENTS.md「文档与实现同一改动」的约定改为每个语言随提交更新，终验时再整体核对。
  - P3：`Current validity`（API 钱包到期日）改为「현재 만료일」；两条「No partial … history is shown.」原译否定范围有歧义，改为「불완전한 (주문) 내역은 표시하지 않습니다」。另补 `?lang=ko_KR` 测试。
  - 既有 P2（不计分、本任务不改）：反向开仓确认与市价触发单的三处价格值仍用无上下文 `Market`，韩语显示「마켓」，与日语记录里的「市場」同源。要修需改源码改用 `Order type` 上下文，影响所有语言，记为待运营方决定。
  - 无法确认、不改：Hangul 走系统字体回退；`Spot Dust Conversion`（「현물 소액 잔고 전환」）在 84px 的订单类型列会截断，该列有 tooltip，长度与日语相当。
- Codex 第 2 轮（窄范围，只审第 1 轮修复并补查同类问题；约 10.2 万 token，9.3 分）：第 1 轮处理全部确认，无新增 P0–P3；补查了 122 个含 `aria-label` / `title` / `sr-only` 的引用文件里的方向类名称、手机与桌面方向和否定范围，未发现同类问题。

## 验证与限制

以下都在工作树 `ce3259b68` 加上对应语言的未提交改动上实际运行。

### 韩语 `ko`

- PO 硬校验（草稿脚本）：2,152 条与 `en` 同集同序，空译文、占位符、标签、`{BRAND_NAME}`、ICU、复数类别、品牌字面量错误均为 0；修复后重跑仍为 0。7 条与原文相同的是 APR、APY、ROI、TVL、LTV、`{periodLabel} ROI`、`Arbitrum (CCTP)`，韩语界面惯例保留。
- `pnpm i18n:extract`：ko 2,152 条、Missing 0，其他 7 个 `.po` 在 `git status` 下无变化（ar/es/fr/hi 的 35 与 zh 的 3 是废弃 `#~` 条目计数）；`pnpm i18n:compile` 通过。修复后重跑结果相同。
- Biome（沙箱外运行；沙箱里读不了系统证书）：18 个改动的 ts/tsx，修正 1 处格式后通过。`pnpm --filter @sairn/terminal typecheck` 通过。
- Vitest：全部改动过的测试加 i18n 契约组（`i18n-reactivity-contract`、`i18n-hot-switch`、`lingui-helper-translator-contract`、`catalog-completeness-contract`、`brand-catalog-contract`、`bootstrap-entry-watchdog`、`client-bootstrap-error` 等）27 个文件 1,158 项通过；审查修复后改动测试加两个 i18n 契约 18 个文件 909 项通过。全量终端 Vitest 未在韩语单独运行，留到本批次结束统一跑。
- Playwright（沙箱外，修复前的目录）：`referral-code-card.pw.ts` 22 项、`position-close-all.playwright.config.ts` 51 项、`TOP_NAV_CONNECTED_MATRIX=full` 下 `--grep " ko"` 的顶部导航 12 项通过。审查修复的 7 条不在这些夹具里。
- 未做：开发服务器目视检查、交易页以外页面的韩语布局、母语审校、真机；生产构建与包体测量留到终验。

## 后续与替代关系

- 全部 7 种完成后的终验收尾：语言菜单 14 种语言的滚动与裁切、全量验证、包体基线对照与更新、`docs/i18n-presentation.md` / `CHANGELOG.md` 收口。
- 每个新语言的懒加载目录块约增加 3.9 万字节 gzip，而总量预算只允许 +10,000：在终验重定基线之前，带新语言的提交在 CI 的包体预算检查处会失败。
