<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-27-account-tables-layout-integrity",
  "date": "2026-11-27",
  "title": "有数据的账户表格：14 种语言的截断与溢出检查",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime", "vite-cache"],
  "summary": "新增账户表格浏览器夹具（端口 4192）：用固定假数据和固定时钟渲染真实的桌面账户面板（1440/1100）与手机账户视图（390），14 种语言逐元素与英文对照截断、裁切和表格单元格溢出。七种新语言里 ko、zh-TW 只差日期格式；vi、id、pt、tr、ru 改短 22 条译文后，剩余语言独有问题都要改布局或日期格式，记为待决定。Gemini 审查后探针不再用元素自己隐藏的文字对祖先报裁切。合并含 PR #21 的 main 后重读：390 宽 14 种语言全部零发现，手机相关的待决项随之解决，剩桌面 4 项与英文盈亏数字换行。读数为 macOS Chrome 的脚本读取，CJK、印地、阿拉伯文依赖系统字体。",
  "thread": null,
  "baseCommit": "5a0a345b",
  "commits": ["d1ab868d", "b7472699", "ac9db012", "bc913d0b", "78bd36e1", "5a814c7d"],
  "sources": [
    { "path": "apps/terminal/tests/browser/account-tables.pw.ts" },
    { "path": "apps/terminal/tests/browser/account-tables.browser.tsx" },
    { "path": "apps/terminal/tests/browser/layout-integrity.ts" },
    { "path": "apps/terminal/tests/browser/layout-integrity.pw.ts" },
    { "path": "apps/terminal/tests/browser/mobile-history-cards.pw.ts" },
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

本分支基于 #22 的头 `5a0a345b`（本工作树原来停在旧仓库的历史上，与新仓库无共同祖先，先重置到该提交）。范围：新增夹具与测试、探针的改进与自测、文档；译文只改七个新目录，原有目录与共享源码的问题只记录。首版提交为 `d1ab868d`（译文）与 `b7472699`（夹具、测试、文档），经运营方授权推送并开 PR haoyu8962-netizen/sairn#25。之后编排会话转来 Gemini 4 Neon 的只读审查（7.5/10，P2 四项、P3 两项），运营方要求修复，修订见「审查后的修订」。

## 结论与依据

### 夹具与对照方法

- `tests/browser/account-tables.*`（独立 Vite 配置与缓存 `node_modules/.vite-account-tables`，端口 4192，`pnpm --dir apps/terminal test:browser:account-tables`）。1440、1100 宽在真实 `react-grid-layout` 桌面网格里渲染真实的 `PositionsPanel`；390 宽渲染真实的 `MobilePositionsView`，每张卡片展开。6 个页签共 8 个视图（持仓、当前委托、TWAP 当前 / 历史 / 成交、成交历史、资金费、委托历史），不含余额页签。
- 数据全部本地：市场目录用真实的 `createMarkets` 处理合成元数据（含 HIP-3 的 `xyz:SMALL2000`、`flx:TSLA`、现货 `@107`），持仓 5 个，含逐仓、全仓、无强平价、TP/SL；当前委托 8 条，含 Stop/Take Profit 的市价与限价、只减仓、Post Only、IOC、带子单的 TP/SL；TWAP 当前 2 笔与历史 6 种状态；历史委托 17 条，覆盖较长的状态与类型（`marginCanceled`、`positionIncreaseAtOpenInterestCapRejected`、`Spot Dust Conversion`、`Vault Close`、`Twap Slice` 等）；成交 8 条，含强平与反手。数据 hook、钱包会话、地域判定为桩。币种图标 URL 在浏览器内用本地 SVG 应答，其余非回环请求记录并使测试失败（ADR 0056），各轮运行都为 0。数据以 `ACCOUNT_TABLES_NOW`（`account-tables-clock.ts`）为时刻，测试用 `page.clock.setFixedTime` 把浏览器的 `Date` 固定在这一刻，时区固定为 UTC。
- 逐元素对照：`findLayoutIntegrityIssues` 的结果新增 `anchor`（从根起的子元素序号路径）。同样的数据在各语言下 DOM 结构相同，所以同一 `anchor` 就是同一元素。每个宽度先读英文，再读其余 13 种语言：英文在同一元素上也有的结果算既有限制（`EN_PENDING`），只有该语言有的算新问题（`LOCALE_ONLY_PENDING`）。
- 表格溢出：桌面表格是 `table-fixed`，数值不换行，超宽内容盖到相邻一栏而不是被隐藏，探针不报；截图里英文持仓表的「1,234.567 SMALL2000」压在仓位价值上。`findTableCellSpill`（`layout-integrity.ts`）补上这一类 `spilled`：单元格内的文字超出所在 `td`/`th` 超过 1px，且路上没有隐藏溢出的祖先。
- 防空跑断言：每种语言的页签文字必须与英文不同（译文目录生效）；每个视图的表格行数或手机卡片数必须等于数据条数，带详情的手机卡片（持仓、当前委托、成交、资金费、委托历史）必须全部展开；被测区域里每个字符所在的 Inter / IBM Plex 字体子集必须已加载，不许有加载失败的字体。

### 英文也有的既有限制（`EN_PENDING`，各语言不重复登记）

- 桌面：英文在 1440 与 1100 的结果相同。持仓表数量列「1,234.567 SMALL2000」溢出 43px、「1,234,567.8 FARTCOIN」42px、「98,765,432 kPEPE」13px；仓位价值列 2px ×4；市场列 HIP-3 标记「xyz」10px；资金费列「+1,234.57 USDT」26px。当前委托表：「Reduce Only」标签 64/52px，方向「Close Long」65/60、「Close Short」69/60，类型「Take Profit Market」106/84、「Take Profit Limit」94/84，市场按钮「SMALL2000」73/70，价格列溢出 5px ×2，TP/SL 列「$400.00 / $300.00」溢出 36px。成交历史方向「Market Order Liquidation: Open Long」溢出 44px。委托历史表在 1100 宽会收窄类型列，所以 es、fr 在 1100 比 1440 多一条类型溢出。
- 手机 390：持仓卡片展开后，TP/SL 旁的编辑图标被卡片右缘裁掉 5px（截图核对，vi 同样）；同一卡片的未实现盈亏在数字中间换行（「-$12,345.6」与「8」分两行），探针不判断换行，只是截图所见。当前委托卡片市场按钮「内容高 31px、盒子 17px」（×8）是误报：按钮的 44px `::after` 触控区计入了 `scrollHeight`，截图里市场名完整；时间「11/20/26, 9:30 AM」106/98。TWAP 历史与成交的数量、手续费、盈亏 109–127/104；成交与资金费卡片的数量、金额、方向（与 2026-11-21 手机历史卡片清单同类）；委托历史共 17 行，其中两位数小时的 6 行时间 113/107，类型「Take Profit Limit」91/89、「Take Profit Market」101/89、「Spot Dust Conversion」119/89，价格「$97,654.3」被卡片裁掉 4px（×2）。

### 七种新语言

改短的译文共 22 条，只改七个新目录。宽度为真实元素里的 canvas 量值或探针读数；改完整套重跑，确认对应结果消失：

| 语言 | 消息 | 原译 → 新译 | 改前读数 |
| --- | --- | --- | --- |
| vi | `Margin Canceled` | Hủy do thiếu ký quỹ → Hủy do ký quỹ | 桌面溢出 10px；手机 106/98 |
| vi | `Original Size` | Số lượng ban đầu → Số lượng gốc | 桌面表头 88/84 |
| vi | `Highest / Lowest Price` | Giá cao nhất / thấp nhất → Giá cao / thấp nhất | 手机 107/104 ×6 |
| vi | `Limit Close`、`Market Close` | Đóng theo giá giới hạn → Đóng theo giới hạn；Đóng theo giá thị trường → Đóng theo thị trường | 手机持仓卡片的「Đảo chiều」被挤出卡片 22px ×5 |
| id | `Margin Canceled` | Dibatalkan karena margin → Batal (margin) | 桌面溢出 36px；手机 136/98 |
| id | `Protection price` | Harga perlindungan → Harga proteksi | 桌面溢出 10px ×2 |
| id | `Highest / Lowest Price` | Harga tertinggi / terendah → Harga maks / min | 手机 115/104 ×6 |
| pt | `Margin Canceled` | Cancelada por margem → Cancel. (margem) | 桌面溢出 21px；手机 122/98 |
| pt | `Total Run Time` | Tempo total de execução → Duração total | 手机 112/104 ×6 |
| tr | `Margin Canceled` | Marjin nedeniyle iptal → İptal (marjin) | 桌面溢出 17px；手机 116/98 |
| tr | `Highest / Lowest Price` | En yüksek / En düşük fiyat → En yüksek/düşük fiyat | 手机 117/104 ×6 |
| ru | `Margin Canceled` | Отменен по марже → Отмена: маржа | 桌面溢出 7px；手机 106/98 |
| ru | `Reverse` [Position action]、`Reverse Position` | Развернуть → Разворот；Развернуть позицию → Разворот позиции | 桌面持仓操作组溢出 9px ×5 |
| ru | `Pause` 与其不可用说明 | Приостановить → Пауза；说明改为「Пауза недоступна: …」 | TWAP 操作列溢出 48px ×2 |
| ru | `Total Run Time` | Общее время выполнения → Время выполнения | 手机 124/104 ×6 |
| ru | `Closed PNL` | Зафиксированный PnL → Закрытый PnL | 手机 107/104 ×3 |
| ru | `Distance to mark`、`Distance to mark {markDistanceLabel}` | Расстояние до маркировки → До цены маркировки（两处一致） | 手机 128/117 ×8 |
| ru | `Spot Dust Conversion` | Конвертация мелких остатков (спот) → Конвертация мелких остатков | 1100 宽溢出 33px |

取舍：

- 按钮与其可访问名称一起改，可见文字保持包含在名称里（ru 的 `Pause` 名称、ru 的 `Reverse Position`；vi 桌面按钮「Giới hạn / Thị trường」的名称「Đóng theo giới hạn / Đóng theo thị trường」仍包含可见文字）。
- ru「Развернуть」在界面里也读作「展开」。桌面行内三个按钮里另两个是名词「Лимит / Рынок」，所以用名词「Разворот」；确认弹窗标题「Разворот позиции」与弹窗里的「Размер разворота」同词。手机持仓卡片的三个按钮是动词组「Закрыть по лимиту / Закрыть по рынку / Развернуть」，无上下文的 `Reverse` 保留「Развернуть」，各组内部形式一致。
- ru `Pause` 用名词「Пауза」，与旁边的动词「Прервать」形式不同；没有放得下的不定式（要从 92.7px 降到约 44px），「Пауза」是俄语界面暂停控件的通行写法，而且这个按钮恒为禁用并附说明。
- pt「Cancel. (margem)」在手机上剩约 1px 余量（82.8 + 14 / 98px），是这一批最紧的一条。拉丁字母由 IBM Plex 网页字体绘制，字宽取自字体文件，Chrome 在各平台都用 HarfBuzz 排版，平台差异在亚像素级；进 CI 前仍要在 Linux 上读一次。

改完后七种新语言剩下的语言独有问题都要改布局或日期格式，只记录，待决定：

1. **ko、zh-TW 委托历史时间**（日期格式，不在目录里）：手机 107px 时间栏共 17 行，ko「26. 11. 19. 오전 9:59」111px、zh-TW「2026/11/19 上午9:59」120px 全部截断，其中 6 行英文也截断（两位数小时 113/107），ko、zh-TW 各独有 11 行；ar 独有 10 行（118/107）。桌面 zh-TW 两位数小时（如「2026/11/19 中午12:59」）溢出 2px ×6。改法是放宽时间栏或调整短日期选项（`lib/format.ts`），会影响所有语言。ko、zh-TW 除此之外与英文一致。
2. **持仓行操作组（184px 操作列）**：vi「Giới hạn / Thị trường / Đảo chiều」超出 28px，fr「Limite / Au marché / Inverser」7px，tr「Limit / Piyasa / Tersine çevir」3px（各 ×5 行）。vi 只有把「Đảo chiều」缩成「Đảo」才放得下，读起来不完整，未采用；tr 曾改成「Ters çevir」，因与手机卡片和反手弹窗里的「tersine çevir」不一致而撤回（见「审查后的修订」）。需要加宽操作列或改成图标。
3. **vi TWAP 操作列**：禁用的「Tạm dừng」（Pause）加「Chấm dứt」（Terminate）超出 12px。把 Terminate 改成「Dừng」会与 TWAP 状态「Đã chấm dứt」和被停止价终止的状态用语冲突，也让可见文字与名称「Chấm dứt lệnh TWAP」不一致，未采用。可加宽操作列，或在不支持暂停时不显示该按钮。
4. **pt 委托历史「Preço de proteção」**桌面溢出 3px ×2：去掉「de」不合语法，没有自然的更短写法；es（14px）、fr（1px）也溢出。价格列加宽几像素即可。
5. **手机委托历史「类型」栏（89px）**：英文的两种 Take Profit 与「Spot Dust Conversion」已截断（既有限制）。新语言独有的截断：vi「Phân lệnh TWAP」92、「Đóng vị thế Vault」94；id「Penutupan posisi Vault」128；pt「Fechamento de cofre」117；ru「Фрагмент TWAP」95、「Закрытие хранилищем」135（单位 px）。根因是栏宽，改法是让类型换行或加宽，属于共享组件。
6. **手机当前委托类型（107px）**：ru「Тейк-профит рыночный」140、「Тейк-профит лимитный」138，pt「Take profit a mercado」121（英文「Take Profit Market」101 放得下）。缩短要改订单类型术语（例如 ru 仿「Стоп-маркет」写成「Тейк-маркет / Тейк-лимит」，pt 仿已有的「Stop Market」保留英文），会改变下单、确认与历史里所有订单类型的显示，需要运营方或母语审校决定，未改。

### 原有语言（只记录，未改）

`LOCALE_ONLY_PENDING` 也登记了原有语言的独有结果：ja（`Margin Canceled`「証拠金不足キャンセル」桌面溢出 14px、手机 114/98，「ボールトのポジション決済」144/89，「ショートを新規建て」108/98）；hi（类型栏 2 条）；es（32 条手机结果，集中在触发条件、到标记价距离、TWAP 历史标签，以及桌面强平价表头、「Stop a mercado」、保证金取消、保护价）；fr（同类 28 条，另有持仓操作组 7px）；ar（时间栏 10 行与类型栏 1 条）。zh 没有独有结果。

### 审查后的修订（Gemini 4 Neon，7.5/10）

1. P2 确定性，成立：TWAP 当前状态的时间戳、行情与持仓的接收时间原来取 `Date.now()`，`twapStates()` 每次渲染重新生成。现在全部取 `ACCOUNT_TABLES_NOW`，TWAP 当前状态为模块常量，测试用 `page.clock.setFixedTime` 固定浏览器时钟。同一提交上连续两轮完整运行结果相同。
2. P2 空跑，成立：
   - 手机持仓卡片是 `div[data-account-card]` 而不是 `article`，原来的展开选择器一张也没展开，持仓视图在 390 宽实际上没有检查展开后的内容。改为同时匹配两者并断言卡片数与展开数后，新查出英文 TP/SL 编辑图标被裁和 vi 持仓卡片按钮被挤出卡片（上表 vi `Limit Close` 一行）。
   - 新增译文生效、行数 / 卡片数、字体子集三项断言，见「夹具与对照方法」。
   - `anchor` 与 `findTableCellSpill` 搬进探针模块，并在 `layout-integrity.pw.ts` 加了自测。
3. P2 「超出卡片」归因，成立：探针用 `Range` 量文字，元素自己 `overflow: hidden` 时仍按完整文字宽度去比祖先，于是对已截断的值再报一条 `clipped`。修订前记录写「这一栏的值没有被自己的格子裁住，而是被卡片边缘裁掉」，这个结论是错的。现在元素在自己隐藏溢出的轴上，文字只量到它自己的内边距盒为止。自测把这个裁剪拿掉后测试变红（变异核对）。影响：账户表格清单里这类 `clipped` 都没了（手机类型栏的「超出卡片」、桌面「Reduce Only」被表头裁 12px）；手机历史卡片清单去掉数量与仓位的 `clipped`，触发价旁的价格裁切仍在。
4. P2 两条语义，成立：tr「Marjin iptali」读作「取消保证金」，改为「İptal (marjin)」（桌面 67.4px）；ru 去掉「мелких」丢了「小额」，改为「Конвертация мелких остатков」，保留通行术语，去掉的「(спот)」由市场栏的现货交易对体现（1100 宽 185.5 + 12.5 / 204px）。
5. P3 数字，成立：「七个页签」改为六个页签、八个视图；ko、zh-TW 时间 17 行（独有 11 行）；ar 独有 10 行；「1440 与 1100 结果相同、列宽固定」改为只说英文相同，并写明 1100 的类型列变窄。
6. P3 用词一致，部分成立：tr 撤回「Ters çevir」，原因见待决第 2 项；ru 的处理见「取舍」；ru 桌面 `Distance to mark {markDistanceLabel}` 与手机统一为「До цены маркировки」，沿用本目录 `Mark price`「Цена маркировки」，不再用含义偏「贴标」的「маркировки」单用。pt 余量问题见「取舍」，保留。

### 合并 main 后的重读（2026-11-27，PR #22 合入之后）

编排会话告知 #22 已合入 main（`7474813c`），要求把新 main 用合并提交并入本分支后推送，PR #25 先合并。新 main 比本分支的基线 `5a0a345b` 多了 PR #21（多代理 UI 审查第一阶段：手机账户卡片两列展开、表头双行、TWAP 子页签改用 `@sairn/ui` 的 `Tabs` 等）、七个新目录补译 #21 的 25 条消息，以及第二次包体重定基线。

- 合并提交 `78bd36e1`（不变基、不压缩）。两处冲突：`mobile-history-cards.pw.ts` 取 main 版本（#21 已清掉手机历史卡片的待处理清单，改为直接断言零发现，本分支 2026-11-27 对该清单的删减随之作废）；`docs/layout-integrity.md` 两边都保留（main 的「首次接入过渡规则」与手机历史卡片现状，本分支的账户表格一行与说明）。`.po` 自动合并，以 main 为底、保留本分支对 id/pt/ru/tr/vi 的 22 条改动；`pnpm i18n:extract` 后新目录 Missing 均为 0，`git diff 7474813c -- apps/terminal/src/locales/{en,zh,ja,hi,es,fr,ar}` 为空，`pnpm i18n:compile` 通过。
- `5a814c7d`：#21 给手机持仓卡片按钮新加的可访问名称 vi「Limit Close {displayName}」「Market Close {displayName}」沿用了改短前的「Đóng theo giá …」，不再包含可见文字，改为「Đóng theo giới hạn / thị trường {displayName}」；vi 的「Reopen Market Close to review the new size.」里的按钮名同步改为「Đóng theo thị trường」。
- 测试适配 #21：TWAP 子页签的元素 id 改为自动生成，测试改按位置找子页签、按 `aria-controls` 找面板；手机卡片的展开按钮只在展开时才有 `aria-controls`，改为按 `aria-expanded` 计数，并要求展开后每个按钮的 `aria-controls` 指向可见的详情区。配置加 `actionTimeout: 30_000`：第一次重跑因找不到旧 id 一直等到 10 分钟的用例超时才失败。
- 读数：桌面 1440 / 1100 与合并前逐条相同，清单未改。390 宽 14 种语言全部零发现（英文原有 19 组、11 种语言的独有项都消失）；截图核对：内容为真实展开的卡片（ar 委托历史卡片表头分两行），英文 TP/SL 编辑图标完整，vi 持仓卡片三个按钮都在卡片内。`EN_PENDING[390]` 改为空，各语言的 390 项删除，ko、id、hi、ru、ar 不再有条目。
- 待决项随之变化：第 5、6 项（手机委托历史类型栏、手机当前委托类型名）由 #21 的布局解决；第 1 项只剩桌面 zh-TW 两位数小时溢出 2px ×6（ko、ar 的手机时间栏已解决）；第 2、3、4 项（持仓操作列、vi TWAP 操作列、保护价列）都在桌面，未变。英文既有限制里手机持仓卡片 TP/SL 图标被裁已解决；未实现盈亏仍在数字中间换行（英文与 vi 截图都是「-$12,345.6」与「8」分两行），探针不判断换行，仍待决定。原有语言 ja、hi、es、fr、ar 的手机条目同样消失，桌面条目不变。

## 验证与限制

- 基线 `5a0a345b`（PR #22 头）加本任务改动。本机 macOS 26.6.2，Google Chrome 158.0.8127.37（Playwright `channel: "chrome"`），Node 22.15.0。
- 首版：`test:browser:account-tables` 在填入清单后 3/3 通过（3.1 分钟）。变异核对：把 ru `Pause` 临时改回「Приостановить」，1440 用例只在 ru 上失败，已还原。全量 `pnpm --filter @sairn/terminal test`（沙盒内）778 个文件中 2 个失败：`hyperliquid-order-label-catalogs` 钉住了 ru `Spot Dust Conversion` 的旧译文，已改期望；`vite-development-cache` 需要监听本地端口，沙盒内必然失败。两个文件在沙盒外重跑 37 项通过；其余 12,216 项通过、1 项跳过。
- 审查修订后：`test:browser:account-tables` 3/3 通过（3.3 分钟），同一代码再跑一轮结果相同（见修订第 1 项）。`layout-integrity.pw.ts`（共用配置，`CI=1`，Playwright 自带 Chromium）4/4 通过。`test:browser:mobile-history-cards` 7/7 通过。修订涉及的单测与目录契约（`locale-font-subset-contract`、`hyperliquid-order-label-catalogs`、`catalog-completeness-contract`、`catalog-literal-number-contract`、`brand-catalog-contract`）全部通过。全量 `pnpm --filter @sairn/terminal test`（沙盒外，与 typecheck 同时运行）：778 个文件中 776 个通过、1 个跳过，`mobile-agent-sync-modal` 的「两秒长按后显示二维码」一项在 `vi.waitFor` 的 1 秒等待里超时（手册第 6 节列出的负载下偶发项），单独重跑 29/29 通过；共 12,217 项通过、1 项跳过。
- 合并 main（`7474813c`）后：`pnpm --filter @sairn/terminal typecheck` 0 个错误；运行时翻译组（AGENTS.md「Runtime translation contract」）加 `hyperliquid-order-label-catalogs`、`locale-font-subset-contract`、`language-switcher-font-warm` 共 14 个文件 629 项通过；Biome 检查与 main 不同的 `src` 文件通过（`tests/browser` 不在 `biome.json` 的 `files.includes` 里）；`layout-integrity.pw.ts`（共用配置）4/4、`test:browser:mobile-history-cards` 7/7（main 版本，零发现）、`test:browser:account-tables` 3/3（3.1 分钟，适配与清单更新之后）；`pnpm memory:check` 通过。截图（英文与 vi 手机持仓卡片）为本地脚本另起夹具服务器截取，未入库。
- 图表库（ADR 0054，私有仓库）不在新工作树里：首版时 `pnpm --filter @sairn/terminal typecheck` 因此报 113 个 TradingView 类型错误（本任务文件 0 个），`pnpm memory:check` 也因解析不到旧记录引用的 `public/charting_library/charting_library.js` 而停下。从主检出复制 `public/charting_library/`（Git 忽略，未提交）后，修订版的 typecheck 0 个错误，`memory:check` 通过、`memory:test` 12/12。
- 结论只来自脚本读取的几何（`scrollWidth`/`clientWidth`、文字范围矩形），指针点击由 Playwright 注入，不是人眼或像素比对，也不是真机；两张截图（英文与 vi 的手机持仓卡片、英文当前委托卡片）用于核对具体结果。中、日、韩、印地与阿拉伯文落到 macOS 系统字体，Linux CI 的 Chromium 读数可能不同；该测试尚未加入 CI 浏览器分片。
- 夹具的数据 hook 是桩，不覆盖加载、过期、出错和空状态，也不覆盖弹窗、下拉菜单、悬停提示与余额页签。
- 改短的译文没有母语审校。

## 后续与替代关系

- 上面「七种新语言」的 6 项、英文的既有限制（含手机持仓卡片 TP/SL 图标被裁、盈亏数字中间换行）和原有语言的登记项待运营方决定；改布局时先跑本测试，再按新读数更新清单。合并含 #21 的 main 后，仍待决定的是第 1 项的桌面部分（zh-TW 2px）、第 2、3、4 项、英文桌面的既有限制、手机持仓卡片盈亏数字换行，以及原有语言的桌面条目（见「合并 main 后的重读」）。
- 账户表格测试与手机历史卡片测试都未进 CI 浏览器分片；进 CI 前需要先在 Linux Chromium 上重新读取一次清单。
- 本记录不替代七语言记录的默认页面截断结论，只补上有数据状态。
- PR #25 于 2026-11-27 合入 main（合并提交 `b9f07503d`），CI 与合并核对见 [合并核对记录](2026-11-27-i18n-prs-merge.md)。
