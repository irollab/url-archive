<div align="center">
  <img src="url-archive-extension/public/icon/128.png" width="88" alt="URL Archive" />
  <h1>URL Archive</h1>
  <p><b>让浏览器收藏「活过来」的剪藏工具</b></p>
  <p>网页正文快照 · AI 摘要 / 标签 · 语义搜索 · 沉睡回访 —— 收藏了就不再永久失踪</p>
</div>

---

## 这是什么

我们都收藏过无数网页，然后**再也没打开过**。链接会失效、标题会遗忘、想找时搜不到关键词。

URL Archive 想解决的就是这件事：剪藏时把**正文快照**留在你自己的 Obsidian（链接死了内容还在），用 **AI 自动生成摘要、标签、关键词与回访场景**帮你日后回忆，再用**语义搜索**做到「记得个大概就能找回」，并主动把**落灰的收藏**重新端到你面前。

所有 AI 调用走 **BYOK（自带 API Key）**，笔记只落进**你自己的 vault**，不经过任何第三方服务器。

## 组成

| 模块 | 说明 | 文档 |
|------|------|------|
| 🧩 **浏览器扩展** `url-archive-extension` | 一键剪藏网页 → 结构化 Markdown；接管新标签页为「收藏工作台」（视觉书签墙、本地搜索、今日回访、最近剪藏） | [使用说明](url-archive-extension/README.md) |
| 🪄 **Obsidian 插件** `url-archive-obsidian-plugin` | 关键词 / 语义搜索、问答收藏库、沉睡回访与回顾、为当前笔记推荐相关收藏；内置本地剪藏服务（可替代 Local REST API） | 见插件内设置 |
| 📐 **设计文档** `docs/` | 需求规格与实施计划 | [docs/](docs/) |

## 核心特性

- **正文快照**：剪藏即保存正文 Markdown，链接失效也不怕。
- **AI 富化（BYOK）**：自动摘要、标签、关键词、回访场景，兼容 OpenAI 格式端点（OpenAI / 智谱 GLM / 任意兼容服务）。
- **绝不丢收藏**：Obsidian 不可用时进本地离线队列，恢复后自动补写。
- **双通道写入**：URL Archive 官方插件（推荐，免额外安装）或 Local REST API，设置里可切换。
- **语义搜索 + 问答**：基于向量的「模糊记忆」检索，以及对收藏库直接提问。
- **沉睡回访**：把久未访问的收藏定期重新呈现，让收藏真正被复用。
- **新标签页工作台**：视觉书签墙、搜索、回访/剪藏挂件，高度可定制。

## 快速开始

1. **浏览器扩展**：进入 [`url-archive-extension/`](url-archive-extension/README.md)，按 README 构建并在 `chrome://extensions` 加载。
2. **Obsidian 插件**：构建 `url-archive-obsidian-plugin/` 后，把 `main.js` / `manifest.json` / `styles.css` 放入 vault 的 `.obsidian/plugins/url-archive/`，启用并开启「剪藏服务」。
3. 在扩展设置里填入 AI（BYOK）端点与写入通道，即可开始剪藏。

> 详细的端到端验收步骤见[扩展 README](url-archive-extension/README.md)。

## 隐私

- **BYOK**：AI 用你自己的 Key，直连你配置的服务商。
- **本地优先**：剪藏笔记只写入你的 Obsidian vault；官方剪藏服务仅监听 `127.0.0.1`。
- 扩展不会把你的收藏上传到我们的任何服务器。

## ☕ 打赏支持

URL Archive **完全免费、开源**，没有会员墙、没有广告，也不会上传你的任何收藏。

做它的初衷很朴素：我自己也常年苦于「收藏 = 永久失踪」，想做一个真正能让收藏「活过来」的工具。每一个功能背后，都是一个个深夜的调试、推倒和重来。如果它帮你留住了哪怕**一条差点被遗忘的好内容**，那它就已经值回了你安装它的那几分钟。

如果你愿意**请我喝一杯咖啡** ☕，那会是对我继续投入最实在的鼓励——它不会让任何功能变成收费，但会让深夜敲键盘的声音更有底气一点。当然，打赏全凭自愿，给项目点一个 **⭐ Star**、提一个 issue、或推荐给朋友，同样是珍贵的支持。❤️

<table>
  <tr>
    <td align="center">
      <img src="docs/donate/weixin.jpg" width="230" alt="微信收款码" /><br/>
      <b>微信</b>
    </td>
    <td align="center">
      <img src="docs/donate/zhifubao.png" width="230" alt="支付宝收款码" /><br/>
      <b>支付宝</b>
    </td>
  </tr>
</table>

---

<div align="center">
  <sub>Powered by <a href="https://github.com/irollab">iRollab</a> · 每一分心意我都会变成下一个更顺手的功能</sub>
</div>
