<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-26-terminal-seven-new-languages",
  "date": "2026-11-26",
  "title": "交易终端新增七种界面语言（编排记录）",
  "kind": "task",
  "status": "recorded",
  "topics": ["i18n-runtime"],
  "summary": "按单语言闭环为交易终端依次增加 ko、zh-TW、vi、tr、ru、pt、id，七种都已逐个提交，终验（语言菜单、全量验证、包体重定基线、文档）已完成，未推送。Gemini 4 Neon 定术语表、翻译与接入，Codex 只读对抗审查，Claude 编排、核实与提交。进行中。",
  "thread": null,
  "baseCommit": "ce3259b68",
  "commits": ["39e976a3a", "75dc13273", "a094e3561", "6749e8cd9", "8c9a9ea8e", "a2b51473a", "66c6c6f31", "357c3ff81", "cdb95aa7c", "020469061"],
  "sources": [
    {"path": "apps/terminal/lingui.config.ts"},
    {"path": "apps/terminal/src/config/i18n.ts"},
    {"path": "apps/terminal/src/config/chart.ts"},
    {"path": "apps/terminal/src/lib/bootstrap-error-copy.ts"},
    {"path": "apps/terminal/src/lib/link-locale.ts"},
    {"path": "docs/i18n-presentation.md"},
    {"path": "apps/terminal/src/lib/fonts/font-readiness.ts"},
    {"path": "docs/adr/0059-language-aware-startup-fonts.md"},
    {"path": "apps/terminal/src/config/orderbook-labels.ts"},
    {"path": "docs/orderbook-layout.md"},
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
| 1 韩语 `ko` | 是（60 条，编排改 3 处） | 是（25 个文件） | 2,152 条，错误 0 | 27 个文件 1,158 项通过；修复后 18 个文件 909 项通过 | 2 轮：8.2 → 9.3，P0–P2 清零；批次末补修 3 条拒单原因（第 3 轮 9.5） | `39e976a3a`，补修 `6749e8cd9` |
| 2 繁体中文 `zh-TW` | 是（145 条含台湾界面用词，编排改 8 处） | 是（28 个文件，含 `link-locale.ts`、`spot-asset-info.ts`、`styles.css`） | 2,152 条，错误 0，简体专用字 0 | 27 个文件 1,172 项通过；变异 3 个全部抓到；修复后 19 个文件 983 项通过 | 2 轮：7.0 → 9.2，P0–P2 清零，第 2 轮 P3 已修 | `75dc13273` |
| 3 越南语 `vi` | 是（60 条，编排改 1 处） | 是（25 个文件；IBM Plex 越南语子集提交时撤回，2026-11-27 按 ADR 0059 补做，见「字体方案」） | 2,152 条，错误 0 | 25 个文件 1,167 项通过；修复后 19 个文件 1,049 项通过 | 2 轮：6.5 → 9.2，P0–P2 清零（字体闸门、订单簿列头两项待决定） | `a094e3561` |
| 4 土耳其语 `tr` | 是（60 条，编排改 3 处） | 是（26 个文件，含 `font-readiness.ts` 的 `tr: "ğ"`） | 2,152 条，错误 0；土耳其语专用扫描 0 条 | 27 个文件 1,237 项通过（修复后重跑同） | 2 轮：8.4 → 9.2，P0–P2 清零，第 2 轮 P3 已修；搜索 İ 失配为既有缺陷，待决定 | `a2b51473a` |
| 5 俄语 `ru` | 是（121 条，编排改 3 处） | 是（26 个文件，含 `ru: "Ж"`；另改 `bootstrap-entry-watchdog` 的体积断言） | 2,152 条，错误 0；俄语专用扫描 0 条 | 27 个文件 1,305 项通过（看门狗断言改写后） | 3 轮：8.2 → 8.3 → 9.2，P0–P2 清零 | `66c6c6f31` |
| 6 巴西葡萄牙语 `pt` | 是（60 条，未改术语，补一条 `=0` 复数规则） | 是（26 个文件，不加字体样例） | 2,152 条，错误 0；葡语专用扫描 0 条真问题 | 27 个文件 1,372 项通过 | 2 轮：8.0 → 9.1，P0–P2 清零，第 2 轮 P3 已修 | `357c3ff81` |
| 7 印尼语 `id` | 是（60 条，编排改 3 处，其中 1 处译后撤回） | 是（26 个文件，TradingView `id_ID`，不加字体样例） | 2,152 条，错误 0；印尼语专用扫描 0 条真问题 | 27 个文件 1,439 项通过 | 2 轮：7.0 → 9.2，P0–P2 清零 | `cdb95aa7c` |

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

- 批次末补修（繁中与越南语审查都发现 Post Only 拒单原因被译成「将会成交」，回头检查已提交的韩语）：原译「포스트 온리 주문이 즉시 체결되는 상태였습니다」没有说出被拒，另两条拒单原因（超过最大仓位数量、未平仓量增长过快）用陈述现在时。交 Gemini 改为「…거부되었습니다」三句；Codex 第 3 轮（极窄，约 2.5 万 token，9.5 分）确认无问题，并扫过韩语目录里其他交易所拒单原因，未发现同类遗漏。两轮审查没有抓到这一条，说明逐条短词审查对长句里的语态问题覆盖不足，后续语言把「拒单原因」列为固定攻击面。

### 2 繁体中文 `zh-TW`

- 接入：照日语、韩语先例补齐配置与测试矩阵（显示名 繁體中文，Intl `zh-TW`，TradingView `zh_TW`，语言顺序 en、zh、zh-TW、ja、ko、hi、es、fr、ar），另有三处繁中特有的改动：
  - `config/i18n.ts` 新增 `isTraditionalChineseTag`：语言为 `zh`、且含 `Hant` 书写体系或 `TW`/`HK`/`MO` 地区时为真，显式的 `Hans` 优先于地区（`zh-Hans-HK` 是简体）。
  - `lib/link-locale.ts` 的 `parseLinkLocale` 改为按小写整码查表（`zh-TW` 含大写，原来的 `isValidLocale(小写值)` 永远认不出它），再按上一条把繁体标签路由到 `zh-TW`，其余中文标签（`zh-CN`、`zh-SG`、`Hans`）路由到 `zh`；`_` 当作 `-`。存储的始终是规范码 `zh-TW`。
  - `domain/market/spot-asset-info.ts`：Hyperliquid 快照只有简体描述，繁中界面返回 null、沿用不支持语言的回退，不混入简体。另一个可选做法是直接显示简体描述（信息更多但混用两种字形），未采用，可由运营方改回。
  - `styles.css`：`:root:lang(zh-TW)` 下 `--font-market-close` 的中文回退改为 PingFang TC 与 Microsoft JhengHei；原栈写死的 PingFang SC 与 Microsoft YaHei 会用大陆字形标准显示繁体字。Inter 栈靠 `system-ui` 按 `lang` 选字体，不需要改。
- 术语表（Gemini xhigh 草稿 145 条，含台湾界面常用词；编排审核改 8 处后锁定，审查后又补 2 处）：Earn 的 Supply 用「供應」，代币供给改称「發行量」以免撞词；用户的资金费支付记录「資金費紀錄」（费率历史才是「資金費率紀錄」）；「滑價」；「僅減倉」「僅掛單」；钱包「連結 / 中斷連結」，网络与交易会话的连接「連線」（`Stay Connected` 为「保持連線」）；第 1 轮后补「自選」，并把 `Transfer` 的边界写明为用户自有余额之间（含现货与质押），金库存入/提领不用「劃轉」。

| English | msgctxt | 译法 | 被否决的写法 |
| --- | --- | --- | --- |
| Deposit |  | 存入 | 充值 (Mainland phrasing); 入金 (futures-only, clashes with Vault/Staking deposits and Depositors); 存款 (sounds like fiat bank savings) |
| Deposit | `Trading toolbar action` | 存入 | 入金, 存款, 充值 |
| Withdraw |  | 提領 | 提現 (Mainland phrasing); 提款 (sounds like ATM cash withdrawal); 出金 (unnatural on Earn for taking back supplied assets) |
| Withdraw | `Trading toolbar action` | 提領 | 出金, 提款, 提現 |
| Available to Withdraw |  | 可提領 | 可提款, 可出金, 可提現 |
| Transfer |  | 劃轉 | 轉帳 (implies external recipient, overlaps with Send); 轉移 (too generic) |
| Transfer USDC | `Deposit method` | 轉入 USDC | 劃轉 USDC (reserved for internal Spot/Perps transfers) |
| Send |  | 發送 | 傳送 (more for files/messages); 轉帳 (blurs with internal Transfer) |
| Bridge |  | 跨鏈 | 橋接 (less idiomatic as an exchange action button) |
| Earn |  | Earn | 收益, 理財 (fixed project rule forbids translating the product name Earn) |
| Supply |  | 供應 | 供給 (economics register), 存入借貸 (long; 存入 is reserved for Deposit) |
| Borrow |  | 借入 | 借款 (noun-heavy, less parallel with action button 償還) |
| Repay |  | 償還 | 還款 (more colloquial fiat-loan tone) |
| Market |  | 市場 | 市價 (strictly Order type); 交易對 (narrower than perp + spot markets) |
| Market | `Order type` | 市價 | 市場 (means trading pair/venue) |
| Limit | `Order type` | 限價 | 限制 (wrong financial sense) |
| Stop Market |  | 停損市價 | 止損市價 (Mainland 止損); 觸價市價 (breaks symmetry with 停利市價) |
| Stop Limit |  | 停損限價 | 止損限價 (Mainland 止損); 觸價限價 (breaks symmetry with 停利限價) |
| Scale |  | 分段委託 | 分段訂單 (breaks 委託 order consistency); 比例訂單 (inaccurate) |
| TWAP |  | TWAP | 時間加權平均價格 (fixed project rule forbids translating TWAP) |
| Terminate |  | 終止 | 取消 (reserved for Cancel order); 關閉 (reserved for Close dialog) |
| Take Profit |  | 停利 | 止盈 (Mainland phrasing) |
| Stop Loss |  | 停損 | 止損 (Mainland phrasing) |
| TP/SL |  | 停利/停損 | 止盈止損 (Mainland phrasing); 停利停損 (harder to scan without slash) |
| TP/SL | `Current orders column` | 停利/停損 | 止盈 / 止損 (Mainland phrasing and wider spacing) |
| Reduce Only |  | 僅減倉 | 只減倉 (Mainland phrasing) |
| Post Only |  | 僅掛單 | 只掛單 (Mainland phrasing) |
| TIF |  | TIF | 有效期 (fixed project rule forbids translating TIF) |
| Margin |  | 保證金 | 按金 (Hong Kong phrasing) |
| Isolated |  | 逐倉 | 分離 (Japanese calque); 獨立倉位 (too verbose) |
| Cross |  | 全倉 | 交叉 (literal English calque) |
| Leverage |  | 槓桿 | 杠杆 (Simplified characters) |
| Maintenance Margin |  | 維持保證金 | 維護保證金 (non-standard finance wording) |
| Initial Margin |  | 原始保證金 | 初始保證金 (Mainland phrasing); 起始保證金 (less standard than TAIFEX term) |
| Collateral |  | 擔保品 | 抵押品 (Mainland phrasing) |
| Liquidation |  | 強制平倉 | 爆倉 (colloquial slang); 清算 (means clearing/settlement in Taiwan traditional finance) |
| Liquidation Price |  | 強平價格 | 清算價格 (blurs with settlement); 爆倉價 (slang) |
| Funding Rate |  | 資金費率 | 融資利率 (equity margin lending term) |
| Funding | `Cumulative position funding` | 資金費 | 資金費率 (that is the rate, not cumulative fee paid/received) |
| Funding History |  | 資金費紀錄 | 資金費率紀錄 for payments (that is the rate) |
| Open Interest |  | 未平倉量 | 持倉量 (ambiguous with user's own position size) |
| Mark Price |  | 標記價格 | 市場價格 (confuses Mark Price with Last/Market Price) |
| Oracle Price |  | 預言機價格 | 外部參考價 (loses protocol precision) |
| Mid |  | 中間價 | 中價 (less clear); 仲值 (Japanese loanword) |
| Spread |  | 價差 | 買賣價差 (too wide for compact order-book center divider) |
| Slippage |  | 滑價 | 滑點 (Mainland wording) |
| Perps |  | 永續合約 | 合約 (too vague in Taiwan, sounds like legal contract); 無期限期貨 (Japanese calque) |
| Spot |  | 現貨 | 實物 (wrong sense) |
| Order Book |  | 訂單簿 | 盤口 (Mainland colloquial); 委買委賣 (too long for tab header) |
| Trades |  | 成交 | 交易 (blurs with Trade action/nav tab) |
| Bid |  | 買盤 | 出價 (auction tone) |
| Ask |  | 賣盤 | 要價 (auction tone) |
| Positions |  | 部位 | 倉位, 持倉 (Mainland-flavored as standalone nouns) |
| Open Orders |  | 目前委託 | 當前委託 (Mainland 當前); 未成交訂單 (verbose) |
| Order History |  | 委託紀錄 | 委託歷史 (Mainland 歷史 phrasing); 訂單歷史 (breaks 委託 consistency) |
| Trade History |  | 成交紀錄 | 成交歷史 (Mainland 歷史 phrasing); 交易紀錄 (blurs fills with ledger transfers) |
| Filled |  | 已成交 | 已完成 (vague, used for Completed) |
| Triggered |  | 已觸發 | 觸發成功 (verbose) |
| Rejected |  | 已拒絕 | 被拒 (too terse/informal) |
| Canceled |  | 已取消 | 已撤單 (Mainland/old stock-terminal phrasing); 已撤銷 (legal tone) |
| PNL |  | 損益 | 盈虧 (Mainland phrasing) |
| Unrealized PNL |  | 未實現損益 | 未實現盈虧 (Mainland 盈虧); 浮動盈虧 (Mainland colloquial) |
| Realized PNL |  | 已實現損益 | 已實現盈虧 (Mainland 盈虧) |
| ROE |  | ROE | 權益報酬率 (too wide for compact tables and badges) |
| Entry Price |  | 開倉價格 | 持倉均價 (inconsistent between cards and close modals) |
| Size |  | 數量 | 大小 (literal English calque, unnatural for order/position quantity) |
| Notional |  | 名目價值 | 名義價值 (Mainland phrasing) |
| Account Value |  | 帳戶價值 | 賬戶價值 (wrong character variant 賬) |
| Equity |  | 淨值 | 權益 (ambiguous with user rights/privileges in Taiwan unless qualified) |
| Balances |  | 餘額 | 余额 (Simplified characters) |
| Available |  | 可用 | 可利用 (Japanese calque) |
| Long |  | 多 | 長倉 (Hong Kong / literal phrasing) |
| Short |  | 空 | 短倉 (Hong Kong / literal phrasing) |
| Buy |  | 買入 | 買進 (traditional equity-only phrasing, less symmetrical with Taiwan crypto UI 買入 / 賣出) |
| Sell |  | 賣出 | 沽出 (Hong Kong phrasing) |
| Unified account |  | 統一帳戶 | 整合帳戶 (less standard on Taiwan crypto exchanges); 統一賬戶 (wrong variant) |
| Portfolio margin |  | 投資組合保證金 | 資產組合保證金 (breaks Portfolio consistency) |
| Account mode |  | 帳戶模式 | 賬戶模式 (wrong variant) |
| Vaults |  | 金庫 | 保險庫 (implies cold-storage security rather than pooled trading vault) |
| Leader |  | 管理者 | 帶單員 (implies copy-trading rather than vault management); 領導者 (literal) |
| Depositors |  | 存入者 | 存款人 (bank savings tone); 入金者 (breaks 存入 consistency) |
| Child |  | 子金庫 | 子 (ambiguous bare character); 子項 (generic) |
| Closed |  | 已關閉 | 已平倉 (reserved for closed trading positions); 已結束 (less precise) |
| Staking |  | 質押 | 抵押 (blurs with borrowing collateral) |
| Validator |  | 驗證者 | 驗證人 (Mainland phrasing); 驗證節點 (longer, conflates operator with hardware node) |
| Delegate |  | 委任 | 委託 (collides with trading Order = 委託) |
| Undelegate |  | 解除委任 | 解除委託 (collides with trading orders); 取消委任 (less idiomatic for unbonding) |
| Commission |  | 佣金率 | 傭金 (wrong character — 傭 means hired servant); 分潤 (blurs with referrals); 手續費 (blurs with trading Fees) |
| Referrals |  | 推薦 | 返佣 (too narrow); 邀請 (reserved for Invite traders = 邀請交易者) |
| Referral code |  | 推薦碼 | 邀請碼 (breaks Referrals = 推薦 consistency) |
| Rewards |  | 獎勵 | 回報, 報酬 (investment return concepts, not program incentives) |
| Fees |  | 手續費 | 費用 (too generic unless referring to Funding Payments = 資金費用) |
| Maker |  | 掛單方 | 做市商 (refers to institutional market makers, not passive order role) |
| Taker |  | 吃單方 | 主動成交方 (too long for table cells and filters) |
| Builder fee |  | Builder 手續費 | 建構者費用 (obscures Hyperliquid protocol concept); 開發者手續費 (inaccurate) |
| Reverse | `Position action` | 反手 | 反向 (adjective, less clear as action verb); 反轉 (describes market trend reversal) |
| Close |  | 關閉 | 平倉 (only for closing trading positions, never for dialogs) |
| Close Position |  | 平倉 | 關閉部位 (unnatural in Taiwan futures) |
| Close all |  | 全部平倉 | 一鍵全平 (Mainland colloquial phrasing) |
| Market Close |  | 市價平倉 | 市價關閉 (wrong verb) |
| Limit Close |  | 限價平倉 | 限價關閉 (wrong verb) |
| Cancel |  | 取消 | 撤單, 刪單 (inconsistent across dialogs and orders) |
| Cancel all | `Current orders toolbar` | 全部取消 | 取消所有 (less idiomatic than 全部取消 in Taiwan) |
| Agent |  | Agent | 代理, 代理人 (sounds like a sales broker or network proxy) |
| API Wallet |  | API 錢包 | 介面錢包 (API must stay untranslated) |
| Connect |  | 連結 | 連接 (Mainland register) |
| Disconnect |  | 中斷連結 | 斷開連接 (Mainland wording) |
| Wallet |  | 錢包 | 皮夾 (physical wallet only) |
| Stay Connected |  | 保持連線 | 保持連接 (Mainland wording) |
| Enable Trading |  | 啟用交易 | 開啟交易 (less formal than 啟用) |
| Leaderboard |  | 排行榜 | 龍虎榜 (traditional stock slang) |
| Portfolio |  | 投資組合 | 資產組合 (breaks Portfolio margin consistency) |
| Mainnet |  | 主網 | 正式網路 (verbose) |
| Testnet |  | 測試網 | 測試環境 (vague) |
| Delisted |  | 已下架 | 已下線 (Mainland phrasing, sounds like network offline) |
| Spot Dust Conversion |  | 現貨小額轉換 | 現貨零頭轉換 (Mainland phrasing, awkward in Taiwan) |
| Account |  | 帳戶 | 賬戶 (non-standard variant in Taiwan); 帳號 (login username, not financial account) |
| Settings |  | 設定 | 設置 (Mainland phrasing) |
| Default |  | 預設 | 默認 (Mainland phrasing) |
| Loading |  | 載入中 | 加載中 (Mainland phrasing) |
| Refresh |  | 重新整理 | 刷新 (Mainland phrasing) |
| Export |  | 匯出 | 導出 (Mainland phrasing) |
| Download |  | 下載 | 載下 (non-standard) |
| Copy |  | 複製 | 拷貝 (colloquial loanword) |
| Notifications |  | 通知 | 提醒 (narrower) |
| Search |  | 搜尋 | 搜索 (Mainland phrasing) |
| Network |  | 網路 | 網絡 (Mainland/HK phrasing) |
| Server |  | 伺服器 | 服務器 (Mainland phrasing) |
| Mobile |  | 行動裝置 | 移動端, 移動設備 (Mainland phrasing) |
| Desktop |  | 桌面版 | 桌面端 (Mainland phrasing); 桌面 (alone sounds like the OS desktop folder) |
| QR code |  | QR Code | 二維碼 (Mainland phrasing) |
| Log in |  | 登入 | 登錄 (Mainland phrasing; means register/record in Taiwan) |
| Email |  | 電子郵件 | 郵箱 (Mainland phrasing); 電郵 (Hong Kong phrasing) |
| Support |  | 支援 | 支持 (Mainland phrasing for technical/feature support) |
| Data |  | 資料 | 數據 (Mainland phrasing for general/account/market data) |
| Information |  | 資訊 | 信息 (Mainland phrasing); 訊息 (reserved for chat/toast messages) |
| Enable |  | 啟用 | 激活 (Mainland phrasing) |
| Permission |  | 權限 | 許可 (too narrow, sounds like legal permit) |
| User |  | 使用者 | 用戶 (Mainland phrasing) |
| Link |  | 連結 | 鏈接 (Mainland phrasing); 關聯 (weaker for device linking) |
| Screen |  | 畫面 | 屏幕 (Mainland phrasing) |
| Browser |  | 瀏覽器 | 流覽器 (non-standard) |
| Install |  | 安裝 | 裝設 (hardware tone) |
| Theme |  | 主題 | 皮膚 (Mainland phrasing) |
| Language |  | 語言 | 語系 (technical locale term, not user-facing setting) |
| Favorites |  | 自選 | 我的最愛, 收藏 (mixed in the first draft) |

不译：`{BRAND_NAME}`、`Earn`、`Alo`、`Gtc`、`Ioc`、`USDC`、`HYPE`、`BTC`、`ETH`、`USD`、`Hyperliquid`、`HyperCore`、`HyperEVM`、`HIP-3`、`Arbitrum`、`CCTP`、`Circle`、`TradingView`、`Privy`、`WalletConnect`、`MetaMask`、`TWAP`、`TIF`、`API`、`AI`、`Defi`、`Gaming`、`Layer 1`、`Layer 2`、`Meme`、`ROE`、`ROI`、`APR`、`APY`、`LTV`、`TVL`、`RO`、QR Code、`CSV`、`PWA`、`DEX`、`Gas`、`Agent`、`Builder`、`SDK`。

- 机器闸门的繁中附加项：约 196 个常用简体专用字的检测（先在简体目录上正向对照，报出 1,812 条），以及 44 组大陆用词扫描（信息、网络、设置、默认、登录、导出、刷新、加载、数据、菜单、窗口、搜索、界面、盈亏、用户、当前、实时、添加、创建、保存、视图、获取、仓位、滑点、只减仓、连接、断开、充值、提现、存款、提款等）。命中的 19 处经逐条判定为误报：「存入金額」含「入金」子串、「用戶端」是台湾的 client 译法、「文件／說明文件」在台湾正指文档。
- Codex 第 1 轮（约 18.2 万 token，7.0 分）：1 项 P1、3 项 P2、2 项 P3，核实后处理：
  - P1 成立：Post Only 拒单原因「A Post Only order would have matched immediately」原译「僅掛單委託將會立即成交」把被拒读成将要成交，改为「此僅掛單委託因會立即成交而遭拒絕」。
  - P2 部分成立：「劃轉」用在金库那条（实际是金库存入或提领）改为「金庫存入或提領」；质押与现货之间的转移判为正确用法、不改（都是用户自有余额，台湾交易所界面通用「劃轉」），理由交第 2 轮证伪。
  - P2 成立：自选功能混用「自選 / 我的最愛 / 收藏」，统一为「自選」；`USD Value` 与账户启用费提示里的 `USD` 被译成「美元」，改回 `USD`。
  - P3 成立：两条「No partial … history is shown.」改为「因此不顯示不完整的（委託）紀錄」；Ethereum 介绍「智能合約」改为「智慧合約」。
  - 审查方指出锁定术语表的风格段仍写「供給」，已改为「供應」（目录本身一直用「供應」）。
  - 既有 P2 同韩语：三处价格值的无上下文 `Market` 在繁中显示「市場」，待运营方决定。
- Codex 第 2 轮（窄范围，约 8.1 万 token，9.2 分）：第 1 轮处理全部确认，包括质押与现货之间保留「劃轉」的判断（「文案交代了方向与佇列，未发现具体误导」）；补查了 `exchange-error-text.ts` 映射的全部拒单原因、金库/Earn/子账户/跨链里的资金用词，无 P0–P2。1 项 P3：两条拒单原因（超过最大部位数量、未平倉量增加过快）没有写出「被拒」的假设关系，交 Gemini 改为「該筆委託因會……而遭拒絕」，未再送审。

### 3 越南语 `vi`

- 接入：照先例补齐（显示名 Tiếng Việt，Intl `vi-VN`，TradingView `vi`，语言顺序 en、zh、zh-TW、ja、ko、vi、hi、es、fr、ar）。Gemini 第一次接入因尝试了未放行的命令而零改动退出，放行 `rg`、`sort`、`diff`、`awk` 并在任务书写明只许用这些命令后重跑成功。
- 字体（最终未改）：IBM Plex Sans 只声明了 latin 子集，越南语带调字母在 `font-market-close` 界面（交易页头、市场概览、代币选择、账户表格、资金弹窗）上逐字用回退字体。接入时曾为它加上越南语子集的 `@font-face`，第 1、2 轮审查指出启动字体等待只检查 latin 字面，单加子集会让这些字母在冷缓存首屏可能短暂不可见，「比不加更差」不能排除；这是有取舍的决定，提交前撤回了子集，改为在 `docs/i18n-presentation.md` 写明现状，并把「加子集 + 让启动字体等待跟随持久化语言」作为一个整体方案交运营方决定。Inter 的越南语子集本来就有同样的冷缓存不可见风险。
- 术语表（Gemini xhigh 草稿 60 条，对齐币安/Bybit/OKX 越南语界面；编排改 1 处：草稿让 `Cross` 保留英文而 `Isolated` 译成 Cô lập，成对的保证金模式统一为 Chéo / Cô lập）：

| English | msgctxt | 译法 | 被否决的写法 |
| --- | --- | --- | --- |
| Deposit |  | Nạp | 'Nạp tiền' (implies fiat cash and is longer on tight buttons), 'Gửi tiền' (overlaps with Send and sounds like retail banking) |
| Withdraw |  | Rút | 'Rút tiền' (implies fiat cash and reads awkwardly on Earn when taking back supplied crypto tokens), 'Thu hồi' (unnatural for external wallet withdrawals) |
| Transfer |  | Chuyển | 'Chuyển khoản' (bank-wire nuance, too long for buttons), 'Chuyển tiền' (too long, implies fiat), 'Gửi' (reserved for Send to another address) |
| Send |  | Gửi | 'Chuyển' (reserved for internal Transfer between own balances), 'Gửi đi' (longer without added clarity) |
| Bridge |  | Bridge | 'Cầu nối' (awkward as a verb in 'Bridging to Hyperliquid...' and 'Bridge failed'), 'Chuyển liên chuỗi' (too long for tabs) |
| Earn |  | Earn | 'Kiếm lời', 'Sinh lời', 'Thu nhập' (must never translate the product name 'Earn') |
| Supply |  | Cung cấp | 'Nạp' (reserved for Deposit), 'Gửi' (reserved for Send), 'Cho vay' (contradictory in 'Supply to Borrow') |
| Borrow |  | Vay | 'Đi vay' (colloquial, longer), 'Vay mượn' (informal) |
| Market |  | Thị trường | 'Cặp giao dịch' (too long for tight columns/tabs), 'Chợ' (informal) |
| Market | `Order type` | Thị trường | 'Lệnh thị trường' (too long for tabs and columns), 'Giá thị trường' (creates redundant 'Giá: Giá thị trường'), 'Market' (Binance/Bybit/OKX VN localize Limit and Market) |
| Limit | `Order type` | Giới hạn | 'Lệnh giới hạn' (too long for tabs/columns; use only in full prose), 'Limit' (localized to 'Giới hạn' on major VN exchanges) |
| Stop Market |  | Stop Market | 'Cắt lỗ thị trường' (factually wrong—stop orders can open positions on breakout, not only cut losses), 'Dừng thị trường' (clunky literal translation) |
| Scale |  | Chia tỷ lệ | 'Tỷ lệ' (means ratio), 'Quy mô' (misses order-splitting semantics), 'Rải lệnh' (informal trader slang) |
| TWAP |  | TWAP | 'Giá bình quân theo thời gian' (never translate TWAP) |
| Terminate |  | Chấm dứt | 'Hủy' (reserved for Cancel on standard orders), 'Dừng' (overlaps with Pause = 'Tạm dừng' and 'TWAP stopped' = 'TWAP đã dừng'), 'Kết thúc' (can imply normal completion) |
| TP/SL |  | TP/SL | 'Chốt lời/Cắt lỗ' (too long for tight columns, badges, and buttons) |
| Reduce Only |  | Chỉ giảm | 'Chỉ giảm vị thế' (too long for checkboxes/badges), 'Reduce Only' (major VN exchanges consistently translate to 'Chỉ giảm') |
| Post Only |  | Post Only | 'Chỉ đăng' (reads like social-media posting out of context), 'Chỉ làm Maker' (wordier, non-standard) |
| TIF |  | TIF | 'HL' or translated abbreviation (must never translate TIF) |
| Margin |  | Ký quỹ | 'Biên độ' (wrong meaning), 'Tiền cọc' (informal), 'Margin' (VN exchanges consistently use 'Ký quỹ' for labels) |
| Isolated |  | Cô lập | 'Độc lập' / 'Tách biệt' (non-standard on VN exchanges), 'Isolated' (universally localized to 'Cô lập' on Binance/Bybit/OKX VN) |
| Cross |  | Chéo | Cross (would leave one margin mode in English next to Cô lập), Toàn phần (non-standard) |
| Leverage |  | Đòn bẩy | 'Tỷ lệ đòn bẩy' (unnecessarily verbose in labels/headers) |
| Collateral |  | Tài sản thế chấp | 'Tài sản đảm bảo' (banking/legal wording, less common on VN crypto exchanges), 'Ký quỹ' (reserved for Margin) |
| Liquidation Price |  | Giá thanh lý | 'Giá cháy tài khoản' (slang), 'Giá bị thanh lý' (wordier) |
| Funding Rate |  | Tỷ lệ funding | 'Tỷ lệ tài trợ' / 'Lãi suất tài trợ' (literal mistranslations; 'tài trợ' means sponsorship) |
| Funding | `Cumulative position funding` | Phí funding | 'Tỷ lệ funding' (that is the percentage rate, not cumulative USD paid/received), 'Phí tài trợ' (literal mistranslation) |
| Open Interest |  | Hợp đồng mở | 'Lãi suất mở' (mistranslation of 'interest'), 'Vị thế mở' (confuses market-wide OI with user's own open positions) |
| Mark Price |  | Giá đánh dấu | 'Giá thị trường' (confuses Mark Price with Market/Last Price), 'Giá niêm yết' (wrong concept) |
| Spread |  | Chênh lệch | 'Chênh lệch giá mua/bán' (too long for the order book divider), 'Biên độ' (means price range/amplitude) |
| Slippage |  | Trượt giá | 'Độ lệch giá' (less idiomatic), 'Slippage' (VN exchanges consistently localize this to 'Trượt giá') |
| Perps |  | Vĩnh cửu | 'Hợp đồng tương lai' (broader than perpetuals), 'Hợp đồng vĩnh cửu' (too long for tabs/badges; use only in explanatory prose), 'Phái sinh' (too broad) |
| Spot |  | Giao ngay | 'Tại chỗ' (literal mistranslation), 'Tiền mặt' (means cash) |
| Order Book |  | Sổ lệnh | 'Bảng giá' (too generic), 'Sổ đặt lệnh' (unnecessarily long) |
| Trades |  | Khớp lệnh | 'Giao dịch' (overlaps with the 'Trade' navigation tab and verb), 'Mua bán' (informal) |
| Positions |  | Vị thế | 'Lệnh đang mở' (confuses open positions with Open Orders), 'Trạng thái' (means status) |
| Open Orders |  | Lệnh đang mở | 'Lệnh mở' (ambiguous with orders that open a position), 'Đơn hàng đang mở' (e-commerce wording) |
| Filled |  | Đã khớp | 'Đã thực hiện' / 'Hoàn thành' (too generic; 'Completed' = 'Hoàn tất'), 'Đã lấp đầy' (literal mistranslation) |
| PNL |  | PNL | 'Lãi/Lỗ' or 'Lời/Lỗ' (longer in tight badges/headers like 'PNL (ROE %)'; keep 'Lãi' and 'Lỗ' for Profit/Loss) |
| Entry Price |  | Giá vào lệnh | 'Giá đầu vào' (literal mistranslation), 'Giá nhập' (inventory term), 'Giá mở cửa' (means session open price) |
| Size |  | Số lượng | 'Khối lượng' (reserved for Volume), 'Kích thước' (longer and unnatural in 'Enter size' / 'Close size') |
| Account Value |  | Giá trị tài khoản | 'Tổng tài sản tài khoản' (redundant and too long) |
| Balances |  | Số dư | 'Tiền mặt' (means cash), 'Tài sản' (reserved for Asset) |
| Long |  | Long | 'Mua lên' / 'Mua khống' (non-standard in VN crypto derivatives, too long for badges), 'Dài' (literal mistranslation) |
| Buy |  | Mua | 'Đặt mua' (too long for action buttons) |
| Account mode |  | Chế độ tài khoản | 'Loại tài khoản' (reserved for Account type) |
| Vault |  | Vault | 'Kho tiền' (physical-bank feel, wordy in compounds), 'Kho' (means warehouse), 'Quỹ' (implies regulated investment fund) |
| Staking |  | Staking | 'Đặt cược' (gambling connotation) |
| Commission |  | Hoa hồng | 'Thưởng giới thiệu' (wrong concept—that is referral reward), 'Phí giao dịch' (trading fee), 'Tỷ lệ hoa hồng' (too long for table columns) |
| Referrals |  | Giới thiệu | 'Tiếp thị liên kết' (means affiliate, too long), 'Đề xuất' (means recommend) |
| Fees |  | Phí | 'Lệ phí' (government/administrative fee), 'Chi phí' (means general cost) |
| Reverse | `Position action` | Đảo chiều | 'Đảo ngược' (generic inversion), 'Lật vị thế' (slang) |
| Close Position |  | Đóng vị thế | 'Tất toán' (banking/loan term), 'Thanh lý' (reserved strictly for forced Liquidation) |
| Cancel |  | Hủy | 'Xóa' (means delete/remove), 'Hủy bỏ' (wordier) |
| API Wallet |  | Ví API | 'Ví đại lý' (wrong meaning of Agent) |
| Wallet |  | Ví | 'Ví tiền' (wordier, physical-wallet feel) |
| Leaderboard |  | Bảng xếp hạng | 'Xếp hạng' (overlaps with Rank = 'Hạng') |
| Portfolio |  | Danh mục | 'Hồ sơ đầu tư' (means investor profile), 'Tài sản' (reserved for Asset) |
| Mainnet |  | Mainnet | 'Mạng chính' (longer and less idiomatic in VN crypto terminals) |
| Settings |  | Cài đặt | 'Thiết lập' (implies initial onboarding/setup rather than preferences menu) |

不译：`{BRAND_NAME}`、`Earn`、`Alo`、`Gtc`、`Ioc`、`USDC`、`HYPE`、`BTC`、`ETH`、`USD`、`$SPCXD`、`Hyperliquid`、`HyperCore`、`HyperEVM`、`HIP-3`、`Arbitrum`、`CCTP`、`Circle`、`TradingView`、`Privy`、`WalletConnect`、`MetaMask`、`TWAP`、`TIF`、`API`、`AI`、`Defi`、`Gaming`、`Layer 1`、`Layer 2`、`Meme`、`TP/SL`、`PNL`、`ROE`、`ROI`、`APR`、`APY`、`TVL`、`LTV`、`OI`、`RO`、`DEX`、`SDK`、`CSV`、`QR`、`PWA`、`Long`、`Short`、`Maker`、`Taker`、Post Only、Stop Market、Stop Limit、`Vault`、`Staking`、`Validator`、`Bridge`、`Mainnet`、`Testnet`、`Agent`、`Builder`、`Oracle`。

- Codex 第 1 轮（约 18.6 万 token，6.5 分）：3 项 P1、3 项 P2、1 项 P3，核实后处理：
  - P1 成立：`Market Close` 原译「Đóng thị trường」读成关闭市场，改为「Đóng theo giá thị trường」，`Limit Close` 同步为「Đóng theo giá giới hạn」，相关的 10 条说明、设置项与全部平仓的复数消息一起改。锁定术语表里原来就写着「Đóng thị trường」，这条是术语表本身的缺陷。
  - P1 成立：两条通用 Stop 触发价校验写成了「止损」触发价（`Giá kích hoạt cắt lỗ`），而它们也校验开仓的 Stop 单，改为中性的「Giá kích hoạt phải cao hơn / thấp hơn giá đánh dấu」。
  - P1 成立（与繁中同类）：Post Only 拒单原因写成「将会立即成交」，改为「bị từ chối vì sẽ khớp ngay nếu được chấp nhận」；同类的两条拒单原因（超过最大仓位数量、未平仓量增长过快）一并改。
  - P2 成立但不在本任务修：启动字体闸门（`lib/fonts/font-readiness.ts`）只检查两族的 latin 字面，冷缓存下越南语带调字母可能在首屏后短暂不可见（`font-display: block`）；Inter 的越南语子集原本就有同样问题。根治要改共享的启动代码，按运营方规则记为待决定，已写进 `docs/i18n-presentation.md`。新加的 IBM Plex 越南语子集随之撤回（见上「字体」）。
  - P2 先判不成立、实测后改判成立：账户模式紧凑值「Tài khoản」。第一次截断扫描显示不裁切，但那次开发服务器是在加入 `vi` 之前启动的，Lingui 的 Vite 插件只认启动时的语言清单，页面 `lang` 是 `vi` 而文字全是英文，扫描作废（这是本任务的流程失误，之后的扫描都抽样核对页面文字）。重启后实测 1440 宽交易页 58/53px 被裁切，改为「Chế độ」（标签仍是「Tài khoản」），重测不再裁切。
  - P2 成立：句子里的「nạp tiền / rút tiền / chuyển tiền」正是锁定术语表否决的写法，12 条改为「nạp / rút / chuyển」或「nạp tài sản / rút tài sản」，银行转账语境不动。
  - P3 成立：`Add to Target` →「Thêm ký quỹ đến mức mục tiêu」，`Remove Margin` →「Giảm ký quỹ」。
  - 实测新发现、未改：1440 宽桌面订单簿列头「Số lượng (BTC)」的「(BTC)」溢出 3px（32/29）。该列用的是全站共用、无上下文的 `Size`，只改越南语目录会连带改掉下单表单等处，根治要给订单簿列加消息上下文或调布局，记为待运营方决定。
  - 既有 P2 同前两种语言：三处价格值的无上下文 `Market`，越南语显示「Thị trường」，恰好也能读成市价，影响比日语、韩语小。
- Codex 第 2 轮（窄范围，约 10.6 万 token，9.2 分）：第 1 轮的 P1、P2、P3 修复全部确认；补查拒单原因、止损限定、全部平仓与反手的说明，无新增 P0–P3。它确认 `Stop trigger must be above/below liquidation price` 保留「cắt lỗ」合理（只用于持仓 TP/SL 的止损分支）。对字体它判断「保留子集 + 记录局限」不能算无回归，于是撤回子集；撤回后的越南语截断结果见「截断检查」。

### 字体方案（2026-11-27，运营方选 A，ADR 0059）

- 起因：越南语第 1 轮审查的 P2（启动字体等待只覆盖拉丁子集）。按目录字符统计（草稿脚本 `font-faces-by-locale.mjs`，重叠范围按最后声明的字体面算），现有十种语言只有越南语用到拉丁以外的子集；运营方在第 4 个语言前要求先定方案，选 A。
- 实施（独立提交，不改任何 `.po`）：`styles.css` 为 IBM Plex 补声明五个子集，顺序与范围同 Inter；`lib/fonts/font-readiness.ts` 加 `LOCALE_FONT_SAMPLES`（越南语 `ạă`）、`fontTextForLocale` 与 `warmFonts`；启动门控按保存的语言、`MarketOverview` 按当前语言带上样例等字体；语言按钮在指针进入、按下、焦点时预热全部语言名称（菜单用 IBM Plex）。不做热切换等待、按语言预载与 Service Worker 保留子集，理由见 ADR 0059。
- 测试：新增 `locale-font-subset-contract`、`language-switcher-font-warm`，扩展 `font-readiness`、`startup-font-display-contract`、`root-startup-fallback`、`market-overview`；`root-provider-split` 的源码断言随门控写法更新。11 个变异各自让对应测试失败，均已还原；其中「门控初始检查不带文字」起初没被抓到，补了「目录与拉丁字体都已可用时仍等子集」一例后抓到。
- 浏览器实测（本机开发服务器 3005，Playwright 无头 Chromium 与 WebKit，冷上下文，每个非拉丁子集人为延迟 1.5 秒，草稿脚本 `font-wait-probe.cjs`）：越南语两种引擎都在四个子集到达后约 50 毫秒才显示（390 宽手机界面约 180–210 毫秒），显示时样例在两套字体上都可用；门控临时改回旧写法后，Chromium 在子集到达前显示、样例不可用；延迟 6 秒时约 3 秒后显示（上限生效）；英文冷启动只下载两个拉丁子集，悬停语言按钮只多下载 IBM Plex 越南语子集，打开菜单时「Tiếng Việt」的计算字体是 IBM Plex、字形可用。指针事件由脚本注入，不是物理输入；不是生产构建、真实网络或真机。
- Codex（gpt-6-astra，只读）两轮：第 1 轮 9.0，无 P0–P2，3 项 P3（文档没分开启动与按内容的下载、PO 解析器不拒绝不支持的写法且计入文件头、预热测试不证明菜单仍能打开）全部修复；第 2 轮 9.1，无 P0–P2，3 项 P3（CRLF 目录会被误拒、热切换等待的代价写重了、展示规范把覆盖说成所有文字）全部修复，CRLF 修复有变异确认。jsdom 里脚本注入的 pointerdown/pointerup 有无预热处理器都打不开该菜单，所以「按下」路径只在浏览器里验证。
- 终端全量 Vitest（沙箱外，`--maxWorkers=3`，在第 1 轮修复之前的工作区上运行）：777 个文件中 776 通过、1 跳过，11,926 项中 11,925 通过、1 跳过，0 失败。之后的改动只涉及两个新测试与文档，已单独重跑相关测试。

### 4 土耳其语 `tr`

- 开工前按要求重读核对表；运营方 2026-11-27 同意让 Gemini 在后台先起草俄语、葡萄牙语、印尼语的术语表（只写草稿目录，不改仓库），锁定、翻译、接入、审查、提交仍按序号逐个做。理由：多语言同时改仓库会在 `lingui.config.ts`、`config/i18n.ts` 和二十多个测试矩阵上冲突，也违反「做完一个再进下一个」。
- 术语表：Gemini xhigh 草稿 60 条，编排改 3 处：`Market Close` / `Limit Close` 写成仓位动作「Piyasa fiyatıyla kapat / Limit fiyatla kapat」（草稿「Piyasa kapat」读作关闭市场，与越南语同错）；`Mark Price` 用「İşaret fiyatı」（本项目统一采用；Codex 指出 Bybit TR 用「Gösterge fiyatı」，所以这不是行业唯一说法）；`Maker/Taker` 用短标签「Yapıcı/Alıcı」（完整说法为「Piyasa yapıcı/alıcı」，列头放不下）。其余照草稿：Yatır/Çek、Transfer、Gönder、Piyasa（交易对与市价单同词）、Kâr al/Zarar durdur、Yalnızca azalt、Marjin、İzole/Çapraz、Kaldıraç、Likidasyon、Fonlama oranı、Açık pozisyon、Vadeli/Spot、Emir、Pozisyon、Long/Short 与 Post Only 保留英文、Kasa（金库）。风格：句子用 siz、全部句首大写、占位符后不接格位后缀、百分号位置照源文。
- 翻译：8 批各 269 条，并行，每批 130–198 秒，0 缺失。编排抽查后把 3 条交易所拒单原因改为「Emir reddedildi: kabul edilseydi …」（草稿只说「本会成交」）。
- 土耳其语专用扫描（草稿脚本 `tr-scan.mjs`：占位符后的后缀、撇号紧挨花括号、ASCII 替代字母、首字母为无点 I 的词、术语表否决写法）0 条；在一份人为塞入错误的副本上 6 类全部报出。
- 接入：Gemini `accept-edits` 按任务书改 26 个文件，没碰清单以外的文件；编排核对源码改动（语言顺序 en、zh、zh-TW、ja、ko、vi、hi、es、fr、tr、ar，`tr-TR`，TradingView `tr`，启动错误页文案，字体样例）。
- Codex 第 1 轮（8.4 分，无 P0/P1）：P2 `Add to Target` 直译成「加到目标」，改为「Hedefe kadar marjin ekle」；P2 `Trader` 一族留了英文且与同页「Yatırımcı」不一致，四条统一；P3 `To Spot` 的「Spota」改为「Spot'a」；P3 HIP-3 免责声明的「izinsiz」易读成「擅自」，改为「izin gerektirmeden」；P3 术语表的否决理由改写如上。它数出与原文相同的条目 43 条（编排脚本按豁免表报 25 条），逐条核过，只有 Trader 一族需译。既有 P2：搜索与金库搜索的 `toLowerCase()` 对土耳其语 İ 失配，见「待运营方决定」第 5 项。
- Codex 第 2 轮（窄范围，9.2 分）：第 1 轮修复全部确认；补查 trader 残留、专名后缀（Spot、Mainnet、Testnet、Hyperliquid、Arbitrum）、permissionless 与逐仓编辑器，无新增 P0–P2。P3 一处「Arbiscan'i」与同类提示的「Arbiscan'ı」不一致，已统一；它建议把 `Remove Margin` 的「Marjin kaldır」润色为「Marjin azalt」，注明非必修，没改（按钮与说明句用词会对不上）。
- 截断后修复：Staking 页验证者筛选框的 `All validators`（「Tüm doğrulayıcılar」）在 1440 与 1100 宽 105/96px 被裁；该 msgid 只用于这个筛选框，其余选项是状态，改为「Tümü」，重扫与英文一致。

### 5 俄语 `ru`

- 运营方 2026-11-27 要求：做完一个语言默认直接开下一个，不再询问；推送、开 PR 前仍停下。
- 术语表：Gemini xhigh 草稿 121 条（超过 40–60 条的要求，与繁中 145 条同理，覆盖越全各批越一致，全部保留），编排改 3 处：`Post Only` =「Только мейкер」（草稿「Только размещение」看不出含义）；`Mid` =「Мид」（草稿「Ср.」与平均价的缩写撞车）；`Reverse` =「Развернуть」（交易里的说法是 развернуть позицию）。草稿已把 `Market Close` / `Limit Close` 写成「Закрыть по рынку / по лимиту」。风格：按钮用不定式，句子用小写 вы，ордер 与 аккаунт，复数四类，е 代 ё，«ёлочки»。
- 翻译：8 批各 269 条，每批 131–186 秒，0 缺失。俄语专用扫描（草稿脚本 `ru-scan.mjs`：西里尔与拉丁混写的词、俄语句子里的直引号、заявка/заказ/счет、复数缺类别、ё）0 条；8 条 стоп-лосс 都在止损语境，通用 Stop 校验写「Цена триггера стопа」。编排抽查后改 6 条：3 条拒单原因改为「Ордер отклонен: …」；`Add to Target`「Добавить до цели」改为「Добавить маржу до цели」；`Remove Margin`「Удалить маржу」（删除）改为「Уменьшить маржу」，其风险说明同步。
- 接入：Gemini `accept-edits` 按任务书改 26 个文件，没碰清单以外的文件。
- 看门狗体积：`bootstrap-entry-watchdog.test.tsx` 原先要求内联在 `<head>` 的启动看门狗脚本整体 < 4096 字节，这个数没有文档来由；脚本内联了每种语言的启动失败文案，加入俄语后 4155 字节，之后每加一种语言还会再涨。编排自行决定（未请示，汇报时说明）把它拆成两条：代码部分（脚本减去内联的文案 JSON）< 2560 字节（当前约 2.1 KB），每种语言的文案 < 512 字节（当前最长的印地语 316 字节）；往代码里塞 600 字节、把一种文案拉长 500 字节，各自让断言失败，均已还原。
- Codex 第 1 轮（8.2 分，无 P0/P1）：P2 窄控件截断风险（逐仓与长订单类型名，源码推断）；P2 `Following {0} days`「Следует」改「Участие: {0} дн.」；P2 `Place Limit Close`「Разместить лимитное закрытие」改「Разместить ордер на закрытие」；P2 两个实际按钮用了祈使或名词（`Confirm in wallet`、`Swap Stablecoins`），改为不定式；P2 扫码入口三种叫法，统一为「Привязать кошелек с компьютера」；P3「фактического плеча」统一为「эффективного плеча」；P3 看门狗单语言预算改按转义后的内联形式计算。它指出拆分后的看门狗断言不再保留整体 4096 字节上限，属于预算口径变化。
- 窄控件实测（草稿脚本 `label-fit-probe.cjs`：在开发服务器的真实元素里依次填入候选词量宽度，Playwright 无头 Chromium，属脚本注入）：手机 375 宽保证金模式按钮 53px，「Изолированная」92px → `Isolated` 改「Изолир.」47px。手机订单类型标签 53px 下英文「Stop Market」67、「Stop Limit」57 本来就截断，俄语改用最短通行写法「Стоп-маркет / Стоп-лимит」（桌面 1100 宽 91px 内放得下，1440 宽高级订单页签 69px 内仍截断，英文「Stop Market」78 同样截断），`Scale` 改「Сетка」。截断扫描另报出 `Advanced`「Расширенные」94/69 → 「Другие」，手机默认订单类型 `Market [Order type]`「Рыночный」62/58 → 「Рынок」（`Limit [Order type]` 同步为「Лимит」）。
- 顶部导航：完整矩阵的俄语 12 项里首轮 3 项失败（1380 宽连接钱包、有存款按钮时导航与钱包控件间距 −7.8～9.7px，要求 ≥ 16px）；`Leaderboard`「Таблица лидеров」改「Рейтинг」并同步 7 条相关文案后 12 项通过。
- Portfolio 概览下拉框（`packages/ui` 的 Select 触发器）里「Фьючерсы」64/56 截断，法语「Perpétuels」61/56 同样截断，判为既有限制，未改。
- Codex 第 2 轮（8.3 分）：第 1 轮七项中六项确认；P2 无上下文的 `Limit`（下单控件实际用它）仍是「Лимитный」，改「Лимит」；P2 有数据状态的账户表格固定宽度列头（未连接扫描覆盖不到）：`Funding [Cumulative position funding]`、`Mark Price`、`Liquidation Price`、`Direction`、`Original Size` 改为「Финансир.」「Цена марк.」「Цена ликв.」「Направл.」「Исх. размер」，编排在开发服务器页面里用真实字体（600、11px、canvas measureText）量得 59.2/64、62.3/92、59.9/90、49.4/60、64.5/84（原译 94.9、98.4、97.0、71.7、96.2，均超宽，与 Codex 按字体文件估算的一致）；P3 `Scale…` 校验统一为「сетка」措辞；P3 TWAP 引导改为不绑定入口名称的说法，`Advanced` 按其建议改「Еще」。它认可「Сетка」「Рынок / Лимит」「Изолир.」。
- Codex 第 3 轮（窄范围，9.2 分）：第 2 轮四项全部确认；查了五个缩写在其他调用处（TP/SL 弹窗、盈亏分享图、逐仓保证金、Earn、筛选器、CSV）的读法，没有需要拆分 msgid 的语义损失；成交、资金费、委托历史表与三个独立历史页的列头未发现新的俄语超宽。

### 6 巴西葡萄牙语 `pt`

- 术语表：Gemini xhigh 草稿 60 条，没改任何术语就锁定（先前以为漏了 `Market Close`，其实写在 `Close` 条目的说明里）。补一条复数规则写进语言说明：CLDR 把 0 也归入 `pt` 的 `one`，数量可能为 0 时加 `=0`。
- 翻译：8 批各 269 条，0 缺失。葡语专用扫描（草稿脚本 `pt-scan.mjs`：欧洲葡语写法、tu、仓位动作、复数缺 `=0`）没有真问题：唯一的「tu」是「perpétuas」词尾误报，两条复数已有 `=1`。编排审查前改 8 条：3 条拒单原因改为「Ordem rejeitada: …」，`Add to Target`、`Place Limit Close`，金库跟投天数两条（「Seguindo」是社交意义的关注），扫码入口名称统一。
- 窄控件（按俄语的教训，在审查前用真实元素与真实字体实测）：手机默认订单类型「A mercado」60/53 → 「Mercado」；`Scale`「Escalonada」→「Escala」（5 条校验同步为「ordem em escala」）；`Stop Market`「Stop a mercado」→「Stop Market」；账户表格列头 `Funding [Cumulative position funding]`、`Mark Price`、`Liquidation Price`、`Original Size` 改为「Financ.」「Preço marc.」「Preço liq.」「Tam. original」（39.0/64、63.9/92、49.7/90、65.8/84）。截断扫描另把 Staking 的 `All validators` 改为「Todos」。
- Codex 第 1 轮（8.0 分，无 P0/P1）：前两项 P2（列头、手机订单类型）是审查期间已改的内容；另修 P2 资金费比较的「principais mercados」（应为主 DEX）、P2 `Your Supplied`、P2 跟投天数「1 dias」（改为「Dias no cofre: {0}」）、P3 permissionless。不改 P3 `Done`（同一 msgid 也是状态，「Concluído」也是 iOS 巴西葡语的标准按钮写法）；接受 P3：`many` 也用于整百万，省略理由改为这些消息的数量到不了百万。三处价格值用无上下文 `Market` 的既有问题在葡语里不可见（两条 `Market` 现都是「Mercado」）。
- Codex 第 2 轮（窄范围，9.1 分）：第 1 轮各项确认；P3 一条设置说明仍引用旧按钮名「A mercado」，改为「Mercado」。它提示 `PNL (Price Change %)` 列（去掉排序箭头约 118px）可能偏紧，编排用真实字体量得葡语「PNL (variação de preço %)」141.8（英文 117.8），改为「PNL (variação %)」92.3。

### 7 印尼语 `id`

- 术语表：Gemini xhigh 草稿 60 条，编排改 3 处：`Market Close` / `Limit Close`「Tutup market / limit」改为仓位动作「Tutup dengan market / limit」；`Leaderboard`「Papan peringkat」改为「Peringkat」（俄语在 1380 宽导航上被这一项挤爆）；`Rewards`「Imbalan」改为「Hadiah」——这一处在翻译后撤回：锁定的「Hadiah」写进了每批提示词，Gemini 仍在全部 51 处用「Imbalan」，复核认为 imbalan 是印尼语金融语境的标准译法（rasio risiko/imbalan、imbalan staking），保持全目录一致。
- 翻译：8 批各 269 条，0 缺失。PO 硬校验报出 7 条「品牌字面量」，是误报：「Pengaturan」含有已退役品牌名「gatu」的字母，草稿脚本改为整词匹配（仓库的 `brand-catalog-contract` 本来就按整词）。印尼语专用扫描（草稿脚本 `id-scan.mjs`：马来语写法、非正式称呼、仓位动作、数字后的重叠）没有真问题（「pasar-pasar ini」是正常复数）。编排审查前改 10 条：3 条拒单原因、`Add to Target`、金库跟投天数两条（「Mengikuti」是社交意义的关注）、资金费比较的主 DEX、两条 permissionless、Staking 的 `All validators` 改「Semua」。
- 窄控件：手机订单类型与保证金模式保留英文写法，与英文同宽；用真实字体量账户表格列头，`Funding [Cumulative position funding]`「Biaya pendanaan」91.1/64 与 `PNL (Price Change %)`「PNL (Perubahan harga %)」137.3/118 超宽，改为「Biaya pend.」62.2 与「PNL (Perubahan %)」104.1。截断扫描 21 组与英文基线完全一致。
- Codex 第 1 轮（7.0 分）：P1 `Rewards compound automatically`「otomatis digandakan」（自动翻倍）改为「otomatis didelegasikan ulang」；P2 累计资金费与无上下文 `Funding` 同名，改为「Biaya pend.」；P2 存款方式 `Transfer USDC [Deposit method]` 与内部划转同名，改为「Deposit USDC」；P2 推荐奖励说明的「biaya referral」改为被推荐交易者支付的交易手续费；P2 两条存款限额把「10,000,000」「1,000」改成了本地分隔符，恢复源文写法（数字跟随数字格式设置，不随界面语言）。由此核查全部目录：已提交的 tr、ru、pt 同样改了这几条（pt 另有推荐码的 `10,000`），另做修复提交；原有的 es、fr 也如此，见待决第 6 项。它数出与原文相同的条目 86 条（编排脚本报 67 条），逐条看过没有整句漏译。
- Codex 第 2 轮（窄范围，9.2 分）：第 1 轮五项全部确认；逐组核对 10 组「相同 msgid、不同上下文」的条目与机制性动词，没有新的必修项；全目录静态数字与源文一致。

### 截断检查（本批次）

- 方法：`apps/terminal/.env.local` 从本机 sairn 克隆复制（不读内容，Git 忽略；没有它页面会落到运行时致命错误页），沙箱外起开发服务器（3077），用仓库的 Playwright 无头 Chromium，按语言写入 `locale-v1` 后打开页面，等 12–20 秒，列出可见、有自身文字、`overflow` 非 visible 或 `text-overflow: ellipsis` 且内容宽于盒子的元素，排除 `sr-only`，与英文基线逐元素比较。扫描器先用一个人为溢出的元素做正向对照。
- 覆盖：交易页、Portfolio、Earn、Vaults、Staking、Referrals、Leaderboard，各 1440、1100、390 宽，未连接钱包的默认状态。不含弹窗、下拉菜单、有持仓或委托时的表格（例如 84px 的订单类型列、`Original Size` 列）、悬停提示；这是脚本读取的几何，不是人眼或像素比对。
- 结果：ko、zh-TW 在全部页面与宽度下与英文基线一致。vi 修复账户紧凑值后，在撤回 IBM Plex 越南语子集之前与之后各扫一次，结果相同：只比英文多出 1440 宽订单簿列头「(BTC)」一处。2026-11-27 按 ADR 0059 补回子集后在开发服务器 3005 上重扫 en 与 vi（每个页面抽样确认是对应语言），结果仍是这一处（32/29px）。

## 验证与限制

以下都在工作树 `ce3259b68` 加上对应语言的未提交改动上实际运行。

### 韩语 `ko`

- PO 硬校验（草稿脚本）：2,152 条与 `en` 同集同序，空译文、占位符、标签、`{BRAND_NAME}`、ICU、复数类别、品牌字面量错误均为 0；修复后重跑仍为 0。7 条与原文相同的是 APR、APY、ROI、TVL、LTV、`{periodLabel} ROI`、`Arbitrum (CCTP)`，韩语界面惯例保留。
- `pnpm i18n:extract`：ko 2,152 条、Missing 0，其他 7 个 `.po` 在 `git status` 下无变化（ar/es/fr/hi 的 35 与 zh 的 3 是废弃 `#~` 条目计数）；`pnpm i18n:compile` 通过。修复后重跑结果相同。
- Biome（沙箱外运行；沙箱里读不了系统证书）：18 个改动的 ts/tsx，修正 1 处格式后通过。`pnpm --filter @sairn/terminal typecheck` 通过。
- Vitest：全部改动过的测试加 i18n 契约组（`i18n-reactivity-contract`、`i18n-hot-switch`、`lingui-helper-translator-contract`、`catalog-completeness-contract`、`brand-catalog-contract`、`bootstrap-entry-watchdog`、`client-bootstrap-error` 等）27 个文件 1,158 项通过；审查修复后改动测试加两个 i18n 契约 18 个文件 909 项通过。全量终端 Vitest 未在韩语单独运行，留到本批次结束统一跑。
- Playwright（沙箱外，修复前的目录）：`referral-code-card.pw.ts` 22 项、`position-close-all.playwright.config.ts` 51 项、`TOP_NAV_CONNECTED_MATRIX=full` 下 `--grep " ko"` 的顶部导航 12 项通过。审查修复的 7 条不在这些夹具里。
- 未做：开发服务器目视检查、交易页以外页面的韩语布局、母语审校、真机；生产构建与包体测量留到终验。

### 繁体中文 `zh-TW`

- PO 硬校验：2,152 条同集同序，各类错误 0，简体专用字 0；两轮修复（13 条覆盖）后重跑仍为 0。6 条与原文相同的是 APR、APY、ROI、TVL、LTV、`{periodLabel} ROI`。
- `pnpm i18n:extract`：zh-TW 2,152 条、Missing 0；ko 与其他 7 个 `.po` 无变化；`pnpm i18n:compile` 通过。每次修复后都重跑过。
- Biome（沙箱外）20 个改动的 ts/tsx/css，修正 1 处格式后通过；typecheck 通过。
- Vitest：改动测试加 i18n 与字体契约 27 个文件 1,172 项通过；最终修复后改动测试加 `i18n-hot-switch`、`i18n-reactivity-contract`、`startup-font-display-contract` 19 个文件 983 项通过。
- 变异（改源码、跑对应测试、确认变红后还原）：去掉 `parseLinkLocale` 的繁中分支，`link-locale.test.ts` 2 项失败；去掉小写化，1 项失败；去掉 `spot-asset-info.ts` 的繁中回退，`spot-asset-info.test.ts` 2 项失败。
- Playwright（沙箱外，第 1 轮修复前的目录）：`referral-code-card.pw.ts` 24 项、`position-close-all.playwright.config.ts` 56 项、`TOP_NAV_CONNECTED_MATRIX=full` 下 `--grep " zh-TW"` 12 项通过。
- 未验证：`:root:lang(zh-TW)` 的字体回退只在源码层面确认选择器与运行时 `lang` 相容，没有在浏览器里读计算字体；没有台湾母语审校与真机。

### 越南语 `vi`

- PO 硬校验：2,152 条同集同序，各类错误 0；两轮修复（31 条覆盖）后重跑仍为 0。27 条与原文相同的都是锁定保留英文的术语（Long/Short、Post Only、Stop Market、Stop Limit、Trailing Stop、Vault、Staking、Validator、Bridge、PNL、Maker/Taker、Oracle、Funding 等）。Codex 第 1 轮按另一口径数到 51 条逐字相同（含数字格式与重复上下文），未据此判漏译。
- `pnpm i18n:extract`：vi 2,152 条、Missing 0；其他 9 个 `.po` 无变化；`pnpm i18n:compile` 通过；每次修复后重跑。
- Biome（沙箱外）改动的 ts/tsx 通过；typecheck 通过。撤回字体后 `styles.css` 已与基线一致。
- Vitest：改动测试加 i18n 与字体契约 25 个文件 1,167 项通过；第 1 轮修复后 19 个文件 1,049 项通过。
- Playwright（沙箱外，第 1 轮修复前的目录）：`referral-code-card.pw.ts` 26 项、`position-close-all.playwright.config.ts` 61 项、完整矩阵下 `--grep " vi "` 的顶部导航 12 项通过。
- 截断：见「截断检查」。未做母语审校、真机。

### 土耳其语 `tr`

- PO 硬校验：2,152 条同集同序，各类错误 0；13 条覆盖（拒单原因 3 条、两轮审查修复 9 条、截断 1 条）后重跑仍为 0。复数只有 `one`/`other`，5 条 ICU 都有两类。
- `pnpm i18n:extract`：tr 2,152 条、Missing 0，其他 10 个 `.po` 无变化；`pnpm i18n:compile` 通过。
- Biome（沙箱外）19 个改动的 ts/tsx 通过；typecheck 通过。
- Vitest：接入测试加 i18n 与字体契约 27 个文件 1,237 项通过，审查修复后重跑相同；`locale-font-subset-contract` 确认土耳其语在两套字体上都只多用拉丁扩展子集。
- Playwright（沙箱外）：`referral-code-card.pw.ts` 28 项（审查修复后重跑仍 28 项）、`position-close-all.playwright.config.ts` 66 项、完整矩阵下 `--grep " tr "` 的顶部导航 12 项通过。后两组跑在审查修复之前，修复的 8 条不在这两个夹具里。
- 截断：开发服务器 3006（加入 `tr` 后启动），交易页、Portfolio、Earn、Vaults、Staking、Referrals、Leaderboard 各 1440、1100、390 宽，21 组都抽样确认页面文字是土耳其语，与当天的英文基线逐元素比较：只多出 Staking 筛选框一处，改短后重扫一致。不含弹窗、下拉菜单与有数据状态。
- 未做母语审校、真机。

### 俄语 `ru`

- PO 硬校验：2,152 条同集同序，各类错误 0；44 条覆盖（拒单原因 3、保证金编辑器 3、两轮审查修复 24、截断与导航 14）后重跑仍为 0。复数 5 条都有 one/few/many/other。
- `pnpm i18n:extract`：ru 2,152 条、Missing 0，其他 11 个 `.po` 无变化；`pnpm i18n:compile` 通过。Biome 19 个改动的 ts/tsx 通过；typecheck 通过。
- Vitest：27 个文件，看门狗断言改写前 1 项失败（4155 字节），改写后 1,304 项通过；全部修复后 1,305 项通过。`locale-font-subset-contract` 确认俄语只多用西里尔子集。
- Playwright（沙箱外）：`referral-code-card.pw.ts` 30 项、`position-close-all.playwright.config.ts` 71 项通过；顶部导航完整矩阵 ` ru ` 首轮 9/12，改短「Рейтинг」后 12/12。
- 截断：开发服务器 3005（加入 `ru` 后启动），7 个页面 × 3 宽，21 组都抽样确认是俄语。首轮比英文多出 5 处（交易页高级订单页签 2、手机订单类型 1、Portfolio 下拉框 2）；修复后重扫交易页、Portfolio、排行榜，只剩 Portfolio 下拉框（既有限制，见上）。
- 未做母语审校、真机；手机订单类型标签在英文下也会截断的既有限制未处理。

### 巴西葡萄牙语 `pt`

- PO 硬校验：2,152 条同集同序，各类错误 0；28 条覆盖后重跑仍为 0。5 条复数缺 `many`（只用于整百万及以上，这些消息到不了），3 条有 `=0`。
- `pnpm i18n:extract`：pt 2,152 条、Missing 0，其他 12 个 `.po` 无变化；compile、Biome（18 个 ts/tsx）、typecheck 通过。
- Vitest：27 个文件 1,372 项通过（最终目录重跑相同）；字体契约确认葡语只用拉丁子集。
- Playwright（沙箱外）：`referral-code-card.pw.ts` 32 项（最终目录重跑相同）；`position-close-all` 76 项里 74 项通过、2 项失败——失败的是 zh-TW 565 宽与 fr 1000 宽的布局等待超时（当时截断扫描与 Codex 同时在跑），单独重跑这两项与葡语用例 7 项全部通过；顶部导航完整矩阵 ` pt ` 12 项通过（最终目录重跑相同）。
- 截断：开发服务器 3005（加入 `pt` 后启动），7 个页面 × 3 宽，21 组都确认是葡语。比英文多出 4 处：手机订单类型（已改）、Staking 筛选框（已改）、Portfolio 下拉框「Perpétuos」58/56（既有限制，法语、俄语同样）、订单簿列头「Tamanho (BTC)」（待决第 3 项）。重扫交易页与 Staking 后只剩订单簿列头。
- 未做母语审校、真机。

### 印尼语 `id`

- PO 硬校验：2,152 条同集同序，各类错误 0（品牌字面量改为整词匹配后）；18 条覆盖后重跑仍为 0。只有 `other`，两条 `=1`。
- `pnpm i18n:extract`：id 2,152 条、Missing 0，其他 13 个 `.po` 无变化；compile、Biome（18 个 ts/tsx）、typecheck 通过。
- Vitest：27 个文件 1,439 项通过（修复后重跑相同）；看门狗体积断言在 14 种语言下成立。
- Playwright（沙箱外）：`referral-code-card.pw.ts` 34 项、`position-close-all` 81 项、顶部导航完整矩阵 ` id ` 12 项通过。
- 截断：开发服务器 3005（加入 `id` 后启动），7 个页面 × 3 宽，21 组都确认是印尼语，与英文基线完全一致。
- 未做母语审校、真机。

### 静态数字修复（印尼语之后）

- 土耳其语、俄语、葡萄牙语的目录里恢复源文的数字写法（tr、ru 各 2 条存款限额，pt 另有推荐码门槛 `$10,000`），共 7 行，其他行零变化；相关测试 5 个文件 288 项通过。
- 新增 `catalog-literal-number-contract.test.ts`：每个目录里，消息写死的分组数字必须与源文逐字相同；`es`、`fr` 的现存违例列为待决例外（待决第 6 项）：`es` 2 条消息 2 个数字，`fr` 4 条消息 5 个数字，共 6 条消息 7 个数字。把土耳其语改回「10.000.000」，契约失败，已还原。
- 推送前的 Codex 复查（low，两个提交：数字修复 8.5、包体重定基线 9.5）：P2 子串匹配会放过「1,000 → 11,000」与出现次数变化；P2 例外只按数字登记，违例转移到另一条消息时被旧例外抵消；P3 检测能力靠法语现存的违例证明；P3 记录里的例外数量不准。改为按整词匹配并比较出现次数、例外绑定到具体消息（过期例外也失败）、用内存夹具验证检测能力、不支持的 PO 写法直接失败；变异：土耳其语改回本地写法、修好西语一条例外的同时弄坏另一条正确的消息，各自让契约失败，均已还原。规则写进 `docs/i18n-presentation.md`，测试加入 AGENTS.md 的运行时翻译回归组。

### 批次收尾

- 终端全量 Vitest（沙箱外，`pnpm --filter @sairn/terminal test --maxWorkers=4`，在 `a094e3561` 加上未提交的韩语拒单原因补修上运行，当时没有其他重负载）：775 个文件中 774 通过、1 跳过，11,898 项中 11,897 通过、1 跳过，0 失败，约 210 秒。
- 没有运行：生产构建与包体预算（留到终验）、`pnpm typecheck` 的全仓版本（只跑了终端的 typecheck）、交易页以外页面的弹窗与有数据状态的截断检查、真机。
- 扫描用的 `apps/terminal/.env.local` 是从本机 sairn 克隆复制的，扫描结束后已删除；`apps/terminal/public/charting_library/` 由 `scripts/fetch-chart-library.mjs` 安装，Git 忽略，不入库。

### 订单簿数量列头（2026-11-27，待决定第 3 项）

- 改法：`ORDERBOOK_LABELS.size` 改为 `msg({ message: "Size", context: "Order book column" })`，只有桌面订单簿列头（`orderbook-panel.tsx`）用它；`TRADE_PANEL_LABELS.size` 原来直接引用这条，改为自己的 `msg\`Size\``，下单表单与其他处的 `Size` 译文不变。`pnpm i18n:extract` 后每个目录只多这一条，另有一行来源注释从 `orderbook-labels.ts` 换成 `trade-panel-labels.ts`；新增的 7 个目录 Missing 0，原有目录的 Missing 数与改动前相同。
- 译文：12 个目录沿用各自的 `Size`；越南语「Lượng」（锁定术语表的 `Số lượng` 去掉「Số」），没用编排建议的「KL」，因为它是「Khối lượng」的缩写，而术语表把「Khối lượng」留给 Volume；葡萄牙语「Tam.」，同目录已有「Tam. original」。
- 实测（开发服务器 3015，填好译文后启动；Playwright 无头 Chromium；`/trade/BTC?lang=…`，逐组核对页面 `lang` 与列头文字；Inter Variable 12px；草稿脚本 `orderbook-size-probe.cjs`、`orderbook-unit-probe.cjs`，不入库）：
  - 1440×900：面板 267px，三列各 81px，单位 `(BTC)` 32px、间距 2px，文字预算 47px。改前复现了报告：越南语「Số lượng」50.23px、单位 29/32；葡萄牙语「Tamanho」52.25px、单位 27/32（正向对照）。改后越南语 35.84px、葡萄牙语 27.58px；英文「Size」24.06px，俄语「Размер」43.92px。
  - 1100×900：面板 310px，列宽 57.19/114.41/114.41，改前改后都不裁切。
  - 第一轮结论只针对基础币 `(BTC)` 与 1440、1100 两种宽度：14 种语言都不裁切数量与累计两列的单位；各语言列宽相同，列头几何不变。截图只给越南语和葡萄牙语看过。
  - 第一轮另把面板强制设为 279px 与 240px：279px 全部不裁切；240px（每列 72px，文字预算 38px）时西语「Tamaño」（单位 25/32）、俄语（26/32）、印尼语「Ukuran」（29/32）的数量单位与土耳其语「Toplam」的累计单位（28/32）被裁切，英文与新的越南语、葡萄牙语不裁切。更正（Gemini 审查第 2 项）：当时把两者都写成「用户手动收窄才会出现」不对。279px 是三等分列档的上沿，默认布局在 1506–1511px 就是这个宽度；只有 240px 这样低于 263px 的宽度才只在手动收窄时出现。
- 第二轮实测（Gemini 4 Neon 只读审查 8/10 之后，同一开发服务器与浏览器）：
  - 档位：只用英文扫视口宽度。1421px 时面板 263px、三列各 79.66px；1440px 为 267px；1505px 为 278px；1506–1511px 为 279px，三列各 85px；1512px 起面板 280px，列宽变为 1:2:2（51.19/102.41/102.41）；md 的 1001px 为 282px，1420px 为 402px。所以三等分列档在默认布局里是 lg 的 1421–1511px，md 不进入这一档。`orderbook-layout.md` 原来写「≤279 px 的容器档只在用户手动收窄列边界时出现」，已改正。
  - 矩阵：14 种语言 × 1421/1440/1512/1001 四种宽度 × 四种单位，共 224 组，每组的页面 `lang` 都与目标语言一致。单位一种是页面真实的 `(BTC)`，另外三种把两列单位元素的文字临时换成 `(USDC)`（永续的计价币单位，`orderbook-panel-safety` 里计价模式显示的就是它）、`(HYPE)` 和 `(FARTCOIN)`，元素与字体不变。没有用下拉框真的切换计价模式，也没测现货与 HIP-3 市场。
  - 基础币 `(BTC)`：14 种语言在四种宽度下都不裁切。
  - 四个字母的单位，只在 1421–1511px 的三等分档里出问题，1512px 与 md 全部放得下：
    - 数量列：西语（1421 宽 `(USDC)` 33/43）、俄语（34/43）、印尼语（37/43）在 `(USDC)` 与 `(HYPE)` 下，1421 与 1440 宽都裁切。
    - 累计列：土耳其语「Toplam」（`(USDC)` 36/43、`(HYPE)` 36/41），阿拉伯语「الإجمالي」（只在 `(USDC)` 下，41/43）。土耳其语在 1421 宽 `(USDC)` 下数量列也差 1px（42/43）。
    - 越南语「Lượng」只在 1421 宽 `(USDC)` 下差 1px（42/43），1440 宽放得下（35.84 + 2 + 43 ≤ 81）。
    - 英文、葡萄牙语「Tam.」以及中日韩、印地语、法语都不裁切。
  - 八个字母的 `(FARTCOIN)`：在三等分档里所有语言都裁切，英文也一样（1421 宽 54/68），这是单位自身的 `truncate`。1512px 与 md 时英文、中文（简繁）、日语、韩语、印地语、葡萄牙语、法语放得下，越南语（65/68）、印尼语、西语、土耳其语、俄语、阿拉伯语仍裁切。
  - 以上属既有限制或这次没能完全消除的情况，本次不改，列为下面「待运营方决定」第 7 项。
- 测试：
  - `orderbook-catalogs.test.ts` 用 `harness/po-catalog.ts` 读目录条目，逐语言断言共用 `Size` 与列头 `Size` 各一条、译文如上、没有 `fuzzy` 标记，列头条目的来源只有 `orderbook-labels.ts`，共用条目来自 `trade-panel-labels.ts`。再按 Lingui 的消息 ID 规则把这两条装进一个 i18n 实例，断言 `ORDERBOOK_LABELS.size` 与 `TRADE_PANEL_LABELS.size` 各自解析到自己的译文。
  - `orderbook-panel-safety.test.tsx` 用越南语、葡萄牙语目录里的这两条渲染真实的 `OrderbookPanel`，断言数量列头是「Lượng(HYPE)」「Tam.(HYPE)」。
  - 变异检查（Gemini 审查第 1 项列出的三种回归）：两个定义互换 4 项失败；`context` 拼成 `Orderbook column` 15 项失败；面板改用 `TRADE_PANEL_LABELS.size` 2 项失败。第一轮只断言两个 ID 不相等，拦不住这三种回归。

## 后续与替代关系

### 待运营方决定（都需要改共享源码，本批次没有改）

1. 三处价格值仍用无上下文的 `Market`（反向开仓确认的价格、桌面与手机市价触发单的价格单元格：`position-reverse-confirmation-modal.tsx`、`orders-tab.tsx`、`mobile-orders-tab.tsx`），表达的是「按市价」，却显示成「市场」：日语「市場」、韩语「마켓」、繁中「市場」；越南语「Thị trường」两义皆可，影响较小。修法是源码改用已有的 `Order type` 上下文，所有语言的显示都会变。
2. 越南语字体：已决定（2026-11-27 运营方选方案 A），按 ADR 0059 实施，见「字体方案」。
3. 订单簿 `Size` 列头在 1440 宽越南语下溢出 3px（「Số lượng (BTC)」的「(BTC)」），巴西葡萄牙语同样溢出 5px（「Tamanho (BTC)」，32/27）。订单簿用的是全站共用、无上下文的 `Size`，修法是给订单簿列加消息上下文后单独译短，或调整列头布局。（已处理，2026-11-27：订单簿列头改用 `Order book column` 上下文，越南语「Lượng」、葡萄牙语「Tam.」，见「订单簿数量列头」。）
4. 繁中界面的现货资产描述：本批次选择不显示简体描述（沿用不支持语言的回退）；另一选项是直接显示 Hyperliquid 的简体描述。
5. 搜索对土耳其语 İ 失配（土耳其语审查发现的既有缺陷）：`lib/search/utils.ts` 与 `components/vaults/domain/vaults.ts` 用不带语言参数的 `toLowerCase()`，用户输入「İNİT」会变成带组合点的「i̇ni̇t」而搜不到 `INIT`，金库名「İstanbul」与查询「istanbul」也不匹配。修法要为展示名称与搜索输入定一条统一的大小写规则（资产符号与地址仍按协议规则），属于改共享源码。
6. 原有目录的数字写法（印尼语审查时发现）：`es` 与 `fr` 把两条存款限额（`10,000,000 USDC`、`1,000 USDC`）改成了本地分隔符，`fr` 另有两条消息（排行榜账户排除说明里的 `100,000` 与 `10,000,000`、推荐码门槛的 `10,000`），共 6 条消息 7 个数字。这些静态数字不经过数字格式器，会随界面语言变写法，与「数字跟随数字格式设置」的规则不符；彻底的修法是把限额改成由数字格式器填入的占位符（改共享源码），或在这两个目录里恢复源文写法（本任务不改原有目录）。
7. 订单簿列头在四个字母的单位下仍会裁切（2026-11-27 第 3 项处理后实测，见「订单簿数量列头」第二轮）：默认布局中 lg 的 1421–1511px 是三等分列档，单位为 `(USDC)`（永续计价模式）或 `(HYPE)` 这类四个字母的基础币时，西语、俄语、印尼语的数量列与土耳其语、阿拉伯语的累计列裁切单位；越南语「Lượng」在 1421 宽 `(USDC)` 下差 1px。英文与葡萄牙语不裁切。修法二选一：一是给这些语言的列头写更短的形式，累计列要另加 `Order book column` 上下文；二是调整列头布局，例如单位不截断、改由文字让位，这会影响所有语言。八个字母以上的符号连英文也截断，属于布局本身的取舍。

### 下一批次（4 土耳其语、5 俄语、6 巴西葡萄牙语、7 印尼语）接力要点

- 先读本记录的核对表与上面的待决定事项；从 `origin/main` 加上本分支的提交开始。
- 工具（分批、写回、PO 硬校验、截断扫描、Gemini 与 Codex 的调用脚本）放在本会话的草稿目录，不入库；新会话照「流程与工具」一节重建即可。
- 教训：加入新语言后要重启开发服务器（Lingui 的 Vite 插件只认启动时的语言清单，否则页面 `lang` 对而文字仍是英文）；截断扫描要抽样核对页面文字，并先用正向对照证明扫描器能报出裁切；Gemini 的 `accept-edits` 运行要放行 `rg` 等只读命令，否则一碰未放行命令就零改动退出；把「交易所拒单原因的语态」「仓位动作与市场名词的歧义」「通用 Stop 校验不要写成止损」列为固定审查攻击面；术语表也要审（越南语的 `Market Close` 错在术语表本身）。
- 字体：新语言的目录用到拉丁以外的子集时，在同一个提交里给 `LOCALE_FONT_SAMPLES`（`lib/fonts/font-readiness.ts`）加样例，每个子集一个字符；`locale-font-subset-contract` 会报出缺的或多的子集。按字母表预计土耳其语要拉丁扩展（如 `ğ`），俄语要西里尔（如 `Ж`），葡萄牙语和印尼语不需要。接入后要重启开发服务器再做截断扫描。
- 教训（俄语）：默认状态的截断扫描看不到只在选中后才出现的标签（保证金模式、高级订单类型），要用 `label-fit-probe.cjs` 把候选词塞进真实元素量宽度，并和英文比较以区分既有限制；顶部导航完整矩阵会报出导航与钱包控件的挤压，长语言先看 `Leaderboard` 这类最长的导航项。
- 俄语、葡萄牙语、印尼语的术语表草稿已在草稿目录（各自的 `glossary.json`，俄语 121 条、葡萄牙语与印尼语各 60 条），未锁定。（更正 2026-11-27：先前说葡萄牙语草稿漏了 `Market Close` / `Limit Close`，是看漏了——它们写在 `Close` 条目的说明里，「Fechar a mercado / Fechar com limite」；）每个草稿都要按「仓位动作」「拒单原因」「通用 Stop」三类攻击面过一遍。
- 俄语的复数需要 `one`/`few`/`many`/`other` 四个类别，硬校验已会对缺失类别给出提示；土耳其语要注意 ICU 的撇号转义（`'` 紧挨 `{`）；印尼语的 TradingView 代码是 `id_ID`；葡萄牙语的 `?lang=pt-BR` / `pt-PT` 都会回退到 `pt`（当前解析逻辑已支持）。

### 终验收尾（2026-11-27 完成）

- 语言菜单（草稿脚本 `language-menu-probe.cjs`，开发服务器，Playwright 无头 Chromium，en 与 ru）：18 项（3 种数字格式、14 种语言、重置）。1440×900 不滚动；1100×700、375×667、320×568 可滚动且最后一项能滚到可见；四种尺寸都没有被截断的语言名，菜单都在视口内。
- 全量验证：`pnpm i18n:extract`（14 个目录，新增 7 个 Missing 0，原有 7 个无差异）、`pnpm i18n:compile`、`pnpm typecheck`（hl-react、ui、terminal）通过；Biome 对分支改过的 34 个 ts/tsx/mjs 通过；`pnpm memory:check`、`memory:test`（12 项）通过；终端全量 Vitest（沙箱外，`--maxWorkers=4`，在 `020469061` 加上未提交的预算脚本与文档改动上运行）：778 个文件中 777 通过、1 跳过，12,218 项中 12,217 通过、1 跳过，0 失败。
- 包体：按 `docs/terminal-performance-baseline.md` 配对构建（`main` `ce3259b6` 与分支 `02046906`，Node 22.15.0，无 `.env.local`，固定标识，两种配对状态，日志在 `.worklog/2026-11-27/i18n-languages-rebaseline/`）。总量 +273,149 / +273,270，其中 271,353 是 13 个非英文目录块（7 个新目录各 34–48 kB gzip，用户只下载所选语言的一个）；静态启动 +1,940 / +1,768（`vendor-router` +1,469）；其他面不变。总量基线上调 +273,270 到 3,677,509，静态启动上调 +1,940 到 1,668,662，余量不变；新基线下分支配对开读数为总量 +6,887（余 3,113，与 `main` 相同）、静态启动 +9,392（余 608）、手机运行时 +9,254（余 746）。`node --test scripts/check-client-bundle-budget.test.mjs` 19 项通过。未构建生产发布配置（生产 `.env.local`、配对开）。
- 文档：`docs/i18n-presentation.md`（语言清单、各语言规则、字体样例、静态数字规则）、`CHANGELOG.md`（七种语言各一条、字体与 IBM Plex 子集一条）、ADR 0059、`docs/terminal-performance-baseline.md`、AGENTS.md 回归清单已随各提交同步。各语言的锁定术语表仍只在草稿目录；若以后要长期对照，可整理成一份规范文档（未做）。
