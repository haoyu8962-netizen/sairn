<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-27-account-tables-layout-integrity",
  "date": "2026-11-27",
  "title": "有数据的账户表格：14 种语言的截断与溢出检查",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime", "vite-cache"],
  "summary": "新增账户表格浏览器夹具（端口 4192），用固定假数据渲染真实的桌面账户面板（1440/1100）与手机账户视图（390），14 种语言逐元素与英文对照截断、裁切和表格单元格溢出。七种新语言里 ko、zh-TW 只差日期格式；vi、id、pt、tr、ru 的 21 条译文改短后，剩余语言独有问题都要改布局或日期格式，记为待决定。读数为 macOS Chrome 的脚本读取，CJK、印地、阿拉伯文依赖系统字体。",
  "thread": null,
  "baseCommit": "5a0a345b",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/tests/browser/account-tables.pw.ts" },
    { "path": "apps/terminal/tests/browser/account-tables.browser.tsx" },
    { "path": "apps/terminal/tests/browser/layout-integrity.ts" },
    { "path": "docs/layout-integrity.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/work-memory/sessions/2026-11-26-terminal-seven-new-languages.md" }
  ],
  "supersedes": []
}
-->
# 有数据的账户表格：14 种语言的截断与溢出检查

## 背景与范围

同步记录，未取得任务标识。编排会话（交易终端多语言国际化编排）派发：七种新语言（ko、zh-TW、vi、tr、ru、pt、id，PR haoyu8962-netizen/sairn#22）上线前的截断扫描只覆盖了未连接钱包时的默认页面（[七语言记录](2026-11-26-terminal-seven-new-languages.md)「截断检查」），账户表格（持仓、当前委托、TWAP、成交历史、资金费历史、委托历史）和手机账户卡片只有有数据时才出现，没有在真实布局里检查过。

本分支基于 #22 的头 `5a0a345b`（本工作树原来停在旧仓库的历史上，与新仓库无共同祖先，先重置到该提交）。范围：新增夹具与测试、探针加一个字段、文档；译文只改七个新目录，原有目录与共享源码的问题只记录。

## 结论与依据

### 夹具与对照方法

- `tests/browser/account-tables.*`（独立 Vite 配置与缓存 `node_modules/.vite-account-tables`，端口 4192，`pnpm --dir apps/terminal test:browser:account-tables`）。1440、1100 宽在真实 `react-grid-layout` 桌面网格里渲染真实的 `PositionsPanel`；390 宽渲染真实的 `MobilePositionsView`，每张卡片展开。点开持仓、当前委托、TWAP（当前 / 历史 / 成交）、成交历史、资金费、委托历史共 8 个视图逐一检查。
- 数据全部本地：市场目录用真实的 `createMarkets` 处理合成元数据（含 HIP-3 的 `xyz:SMALL2000`、`flx:TSLA`、现货 `@107`），持仓含逐仓、全仓、无强平价、TP/SL；委托含 Stop/Take Profit 的市价与限价、只减仓、Post Only、IOC、带子单的 TP/SL；TWAP 当前 2 笔与历史 6 种状态；历史委托 17 条覆盖较长的状态与类型（`marginCanceled`、`positionIncreaseAtOpenInterestCapRejected`、`Spot Dust Conversion`、`Vault Close`、`Twap Slice` 等）；成交含强平与反手。数据 hook、钱包会话、地域判定为桩。币种图标 URL 在浏览器内用本地 SVG 应答，其余非回环请求记录并使测试失败（ADR 0056），三次完整运行都为 0。浏览器时区固定为 UTC，否则日期文字随机器时区变化，结果不可复现（首轮在本机时区下跑，英文手机委托历史的时间与 UTC 下不同）。
- 逐元素对照：`findLayoutIntegrityIssues` 的结果新增 `anchor`（从根起的子元素序号路径）。同样的数据在各语言下 DOM 结构相同，所以同一 `anchor` 就是同一元素。每个宽度先读英文，再读其余 13 种语言：英文在同一元素上也有的结果算既有限制（`EN_PENDING`），只有该语言有的算新问题（`LOCALE_ONLY_PENDING`）。
- 新增 `spilled` 检查（只在本测试里）：桌面表格是 `table-fixed` 且数值不换行，超宽内容盖到相邻一栏而不是被隐藏，探针不报。截图里英文持仓表的「1,234.567 SMALL2000」压在仓位价值上，正是这一类。判定为单元格内文字超出所在 `td`/`th` 超过 1px，且路上没有隐藏溢出的祖先。

### 英文也有的既有限制（`EN_PENDING`，各语言不重复登记）

- 桌面（1440 与 1100 结果相同，表格列宽固定并可横向滚动）：持仓表数量列「1,234.567 SMALL2000」溢出 43px、「1,234,567.8 FARTCOIN」42px、「98,765,432 kPEPE」13px；仓位价值列 2px ×4；市场列 HIP-3 标记「xyz」10px；资金费列「+1,234.57 USDT」26px。当前委托表：「Reduce Only」标签 64/52px 截断并被表头裁切 12px，方向「Close Long」65/60、「Close Short」69/60，类型「Take Profit Market」106/84、「Take Profit Limit」94/84，市场按钮「SMALL2000」73/70，价格列溢出 5px ×2，TP/SL 列「$400.00 / $300.00」溢出 36px。成交历史方向「Market Order Liquidation: Open Long」溢出 44px。
- 手机 390：当前委托卡片市场按钮「内容高 31px、盒子 17px」（×8）是误报，按钮的 44px `::after` 触控区计入了 `scrollHeight`，截图里市场名完整；时间「11/20/26, 9:30 AM」106/98；TWAP 历史与成交的数量、手续费、盈亏 109–127/104；成交与资金费卡片的数量、金额、方向（与 2026-11-21 手机历史卡片清单同类）；委托历史两位数小时的时间 113/107、类型「Take Profit Limit」91/89、「Take Profit Market」101/89、「Spot Dust Conversion」119/89，价格「$97,654.3」超出卡片 4px。

### 七种新语言

本次改短的译文（只改七个新目录；宽度为真实元素里的 canvas 量值或探针读数，改后整套重跑确认对应结果消失）：

| 语言 | 消息 | 原译 → 新译 | 改前读数 |
| --- | --- | --- | --- |
| vi | `Margin Canceled` | Hủy do thiếu ký quỹ → Hủy do ký quỹ | 桌面溢出 10px；手机 106/98 |
| vi | `Original Size` | Số lượng ban đầu → Số lượng gốc | 桌面表头 88/84 并被裁切 4px |
| vi | `Highest / Lowest Price` | Giá cao nhất / thấp nhất → Giá cao / thấp nhất | 手机 107/104 ×6 |
| id | `Margin Canceled` | Dibatalkan karena margin → Batal (margin) | 桌面溢出 36px；手机 136/98 |
| id | `Protection price` | Harga perlindungan → Harga proteksi | 桌面溢出 10px ×2 |
| id | `Highest / Lowest Price` | Harga tertinggi / terendah → Harga maks / min | 手机 115/104 ×6 |
| pt | `Margin Canceled` | Cancelada por margem → Cancel. (margem) | 桌面溢出 21px；手机 122/98 |
| pt | `Total Run Time` | Tempo total de execução → Duração total | 手机 112/104 ×6 |
| tr | `Margin Canceled` | Marjin nedeniyle iptal → Marjin iptali | 桌面溢出 17px；手机 116/98 |
| tr | `Reverse` [Position action]、`Reverse Position` | Tersine çevir → Ters çevir；Pozisyonu tersine çevir → Pozisyonu ters çevir | 持仓操作组溢出 3px ×5 |
| tr | `Highest / Lowest Price` | En yüksek / En düşük fiyat → En yüksek/düşük fiyat | 手机 117/104 ×6 |
| ru | `Margin Canceled` | Отменен по марже → Отмена: маржа | 桌面溢出 7px；手机 106/98 |
| ru | `Reverse` [Position action]、`Reverse Position` | Развернуть → Разворот；Развернуть позицию → Разворот позиции | 持仓操作组溢出 9px ×5 |
| ru | `Pause` 与其不可用说明 | Приостановить → Пауза；说明改为「Пауза недоступна: …」 | TWAP 操作列溢出 48px ×2 |
| ru | `Total Run Time` | Общее время выполнения → Время выполнения | 手机 124/104 ×6 |
| ru | `Closed PNL` | Зафиксированный PnL → Закрытый PnL | 手机 107/104 ×3 |
| ru | `Distance to mark` | Расстояние до маркировки → До цены марк. | 手机 128/117 ×8 |
| ru | `Spot Dust Conversion` | Конвертация мелких остатков (спот) → Конвертация остатков (спот) | 1100 宽溢出 33px；手机超出卡片 84px（改后 38px，与英文同栏仍截断） |

取舍：按钮与其可访问名称一起改，保持可见文字包含在名称里（ru 的 `Pause` 名称、ru/tr 的 `Reverse Position`）。ru「Развернуть」在界面里也读作「展开」，「Разворот」同时消除了这个歧义；「До цены марк.」沿用本目录 `Mark Price` 的「Цена марк.」。pt 的「Cancel. (margem)」在手机上剩约 1px 余量（82.8 + 14 / 98px），是这一批最紧的一条。

改完后七种新语言剩下的语言独有问题都要改布局或日期格式，只记录，待决定：

1. **ko、zh-TW 委托历史时间**（日期格式，不在目录里）：手机 107px 时间栏，ko「26. 11. 19. 오전 9:59」111px、zh-TW「2026/11/19 上午9:59」120px，每一行都截断（11 行）；桌面 zh-TW「2026/11/19 中午12:59」溢出 2px ×6。英文两位数小时同样截断（113/107），ar 也截断（118/107）。改法是放宽时间栏或调整短日期选项（`lib/format.ts`），会影响所有语言。ko、zh-TW 除此之外与英文一致。
2. **vi 持仓行操作组**：「Giới hạn / Thị trường / Đảo chiều」在 184px 操作列里共超出 28px（×5 行）。唯一放得下的改法是把「Đảo chiều」缩成「Đảo」，读起来像名词「岛」或不完整，未采用。fr「Limite / Au marché / Inverser」同样超出 7px。需要加宽操作列或改成图标。
3. **vi TWAP 操作列**：禁用的「Tạm dừng」（Pause）加「Chấm dứt」（Terminate）超出 12px。把 Terminate 改成「Dừng」会与 TWAP 状态「Đã chấm dứt」和被停止价终止的状态用语冲突，也让可见文字与名称「Chấm dứt lệnh TWAP」不一致，未采用。可加宽操作列，或在不支持暂停时不显示该按钮。
4. **pt 委托历史「Preço de proteção」**桌面溢出 3px ×2：去掉「de」不合语法，没有自然的更短写法；es（14px）、fr（1px）也溢出。价格列加宽几像素即可。
5. **手机委托历史「类型」栏（89px）**：英文的 Take Profit 两种与「Spot Dust Conversion」已截断（既有限制）。新语言独有：vi「Phân lệnh TWAP」92、「Đóng vị thế Vault」94、「Quy đổi số dư lẻ giao ngay」超出卡片 14px；id「Penutupan posisi Vault」128、「Konversi saldo kecil spot」超出卡片 8px；pt「Fechamento de cofre」117、「Conversão de poeira spot」超出卡片 11px；tr「Spot küçük bakiye dönüşümü」超出卡片 34px；ru「Фрагмент TWAP」95、「Закрытие хранилищем」135 并超出卡片 6px、「Конвертация остатков (спот)」超出卡片 38px、两种 Take Profit 超出卡片 9/10px。「超出卡片」说明这一栏的值没有被自己的格子裁住，而是被卡片边缘裁掉。改法是让类型换行或加宽，属于共享组件。
6. **手机当前委托类型（107px）**：ru「Тейк-профит рыночный」140、「Тейк-профит лимитный」138，pt「Take profit a mercado」121（英文「Take Profit Market」101 放得下）。缩短要改订单类型术语（例如 ru 仿「Стоп-маркет」写成「Тейк-маркет / Тейк-лимит」，pt 仿已有的「Stop Market」保留英文），会改变下单、确认与历史里所有订单类型的显示，需要运营方或母语审校决定，未改。

### 原有语言（只记录，未改）

`LOCALE_ONLY_PENDING` 也登记了原有语言的独有结果：ja（`Margin Canceled`「証拠金不足キャンセル」桌面溢出 14px、手机 114/98，「ボールトのポジション決済」144/89 并超出卡片，「ショートを新規建て」108/98）；hi（类型栏 2 条）；es（34 条手机结果，集中在触发条件、到标记价距离、TWAP 历史标签，以及桌面强平价表头、「Stop a mercado」、保证金取消、保护价）；fr（同类 30 条，另有持仓操作组 7px）；ar（时间栏 11 行与类型栏）。zh 与英文完全一致或更少。

## 验证与限制

- 基线 `5a0a345b`（PR #22 头）加本任务改动；本机 macOS 26.6.2，Google Chrome 158.0.8127.37（Playwright `channel: "chrome"`），Node 22.15.0。
- `pnpm --dir apps/terminal test:browser:account-tables`：首轮（改译文前、本机时区）与改后两轮读取结果；填入清单后再跑一轮确认，3 个用例全部通过（3.1 分钟），每个用例对照 14 种语言 × 8 个视图，非回环请求 0。变异核对：把 ru `Pause` 临时改回「Приостановить」，1440 用例只在 ru 上失败，已还原。
- 全量 `pnpm --filter @sairn/terminal test`（沙盒内）：778 个文件中 2 个失败。`hyperliquid-order-label-catalogs` 钉住了 ru `Spot Dust Conversion` 的旧译文，已把期望改成新译文；`vite-development-cache` 需要监听本地端口，沙盒内失败。两个文件在沙盒外重跑 37 项全部通过，其余 12,216 项通过、1 项跳过。
- 探针自测 `layout-integrity.pw.ts`（共用配置，`CI=1`，Playwright 自带 Chromium）2 项通过。目录契约测试（`catalog-completeness-contract`、`catalog-literal-number-contract`、`brand-catalog-contract`、`locale-font-subset-contract` 等 17 个文件，866 项）通过。`pnpm --filter @sairn/terminal typecheck` 只剩 113 个图表库类型错误：TradingView 类型文件在私有仓库（ADR 0054），本工作树没有，与本任务的文件无关；本任务文件 0 个错误。
- 结论只来自脚本读取的几何（`scrollWidth`/`clientWidth`、文字范围矩形），指针点击由 Playwright 注入，不是人眼或像素比对，也不是真机。中、日、韩、印地与阿拉伯文落到 macOS 系统字体，Linux CI 的 Chromium 读数可能不同；该测试尚未加入 CI 浏览器分片。
- 夹具的数据 hook 是桩，不覆盖加载、过期、出错和空状态，也不覆盖弹窗、下拉菜单、悬停提示与余额页签。
- 改短的译文没有母语审校。

## 后续与替代关系

- 上面「七种新语言」的 6 项和原有语言的登记项待运营方决定；改布局时先跑本测试，再按新读数更新清单。
- 账户表格测试与手机历史卡片测试都未进 CI 浏览器分片；进 CI 前需要先在 Linux Chromium 上重新读取一次清单。
- 本记录不替代七语言记录的默认页面截断结论，只补上有数据状态。
