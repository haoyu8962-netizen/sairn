<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-21-layout-integrity-pilot",
  "date": "2026-11-21",
  "title": "布局完整性探针试点：逐元素检测截断与裁切",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "docs-governance"],
  "summary": "运营方让参考大淘宝技术的设计稿到三端真机验收实践，选出可用于本项目的做法并做试点。选的是「局部缺陷不被整体结果掩盖」：新增 findLayoutIntegrityIssues，在浏览器里逐元素报告被截断的文字和被 overflow 祖先裁切的文字、徽标与图标，并为它写了八种情形的自测。接入金库列表与详情（12 个组合无发现），并新建交易页手机历史卡片夹具（成交、委托、资金费，320/375/393px，en 与 zh）。在新夹具上第一次运行就发现强平方向文字、订单状态、触发价和大额金额被截断或裁切，按待处理清单登记，测试通过，修复另行决定。新夹具没有加入 CI。",
  "thread": null,
  "baseCommit": "dbe65bce",
  "commits": [],
  "sources": [
    { "path": "docs/layout-integrity.md" },
    { "path": "apps/terminal/tests/browser/layout-integrity.ts" },
    { "path": "apps/terminal/tests/browser/layout-integrity.pw.ts" },
    { "path": "apps/terminal/tests/browser/mobile-history-cards.pw.ts" },
    { "path": "apps/terminal/tests/browser/vaults-list.pw.ts" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "url": "https://mp.weixin.qq.com/s/Q-7Qek7YgAfccxzynSUfAA" }
  ],
  "supersedes": []
}
-->
# 布局完整性探针试点

## 背景与范围

同步记录，2026-11-21，未取得任务标识。运营方提供了一篇整理稿（大淘宝技术 2026-11-02，设计稿到三端真机的验收实践），要求判断哪些方法能用到本项目。整理后的建议依次是：逐元素的截断与裁切检测、按平台带构建号记录验收证据（缺一端标待验）、以 main 截图为基线的外观对比、iOS 与 Android 模拟器的固定流程、带反证要求的看图模型审查；设计稿生码、三层组件生成、像素评分门槛与云真机投屏不适用（没有设计稿，ADR 0056 禁止 CI 请求第三方）。运营方选择先做第一项试点。

工作树 `.claude/worktrees/layout-integrity-pilot`，分支 `claude/layout-integrity-pilot`，基于 PR #15 的分支头 `dbe65bce`（试点要覆盖 #15 新加的 HIP-3 标记与卡片改动）。

## 结论与依据

- 探针只看浏览器实际渲染的几何，判定规则、例外与待处理清单的用法写在 `docs/layout-integrity.md`，`.claude/rules/style-ui-guide.md`（Checking a visual rule）补了一条，要求逐元素检查。
- 探针自测用 `page.setContent` 构造八种情形，第一次运行即全部符合预期。字段标签的取法第一版会越过所在区块取到前一张卡片的文字，已改为只在区块内、只取可见的兄弟元素。
- 金库列表与详情接入后 12 个组合无发现。把这两个文件换回修复前（`ba78481a`，带 `truncate`）也无发现：这组夹具数据在这些宽度下本来就没有被截断，所以这个变异说明不了探针是否灵敏，探针的灵敏度由自测证明；这也说明 PR #15 对金库卡片去掉 `truncate` 只是按规则字面成立。
- 新的手机历史卡片夹具渲染真实的三个页签，只替换取数 hook、市场目录与钱包会话。第一次运行发现：强平成交的方向文字在三个宽度都被截断；320px 下订单状态被截断，触发价旁的价格被裁掉约 3px；大额的资金费金额、已实现盈亏、手续费与数量在较窄宽度被截断。按待处理清单（`mobile-history-cards.pw.ts` 的 `PENDING`）登记，测试通过；修法涉及卡片头部的固定高度与三列明细的排版，需要运营方决定。
- HIP-3 市场名旁的 DEX 标记在 320px 下完整显示（夹具用 `xyz:SMALL2000`），可访问名称为「SMALL2000 (xyz)」。

## 验证与限制

本机 Chrome（Playwright `channel: chrome`）读数：探针自测 2 项、金库 12 项、手机历史卡片 7 项通过；共用配置用 `--list` 确认没有拾取新夹具。终端类型检查无错误；Biome 按仓库配置不检查 `tests/browser`。

没有在 iOS Safari、Android Chrome 或真机上运行；新夹具没有加入 CI 的浏览器分片。

## 后续与替代关系

- 修复手机历史卡片的待处理清单（运营方决定排版：头部固定高度、明细换行或两列）。
- 决定是否把新夹具加入 CI 的浏览器分片。
- 把探针接入其他手机表面（持仓卡片、委托卡片、仪表盘的交易与资金费历史页），以及按平台记录验收证据的脚本。
