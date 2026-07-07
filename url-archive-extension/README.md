# URL Archive 浏览器扩展（阶段 1：地基）

一键把网页剪藏进 Obsidian vault，生成结构化 markdown（YAML frontmatter + AI 摘要/标签 + 你的"为什么收藏" + 正文快照）。AI 处理走 BYOK（自带 API Key），Obsidian 不可用时进本地离线队列、恢复后自动补写——**绝不丢收藏**。

> 设计文档：`../docs/superpowers/specs/2026-06-23-url-archive-design.md`
> 实施计划：`../docs/superpowers/plans/2026-06-23-url-archive-phase-1-capture.md`

## 技术栈

- **WXT** — MV3 扩展框架（vanilla 模板，无前端框架）
- **TypeScript** + **vitest**（jsdom / fake-indexeddb）
- `@mozilla/readability` + `turndown` — 正文提取转 markdown
- `yaml` — frontmatter 序列化
- `idb` — IndexedDB 离线队列封装

## 架构

业务逻辑全部在与框架无关的 `lib/` 纯模块中，入口只做接线：

| 文件 | 职责 |
|------|------|
| `lib/types.ts` | 共享类型 |
| `lib/markdown.ts` | `serializeNote` / `generateFilename` / `slugify` |
| `lib/llm.ts` | `enrichClip` — BYOK OpenAI 兼容适配 |
| `lib/vault.ts` | `VaultWriter` 接口 + `RestApiWriter` + `createVaultWriter`（按写入通道选端点） |
| `lib/queue.ts` | `ClipQueue` — IndexedDB 离线队列 |
| `lib/capture.ts` | `captureClip` — 编排 enrich → serialize → write/queue |
| `lib/extract.ts` | `extractArticle` — Readability + Turndown |
| `lib/settings.ts` | 读写 `chrome.storage.local` 配置 |
| `entrypoints/background.ts` | 处理 CAPTURE 消息、启动时重试离线队列 |
| `entrypoints/content.ts` | 页面内提取正文，响应 background |
| `entrypoints/popup/` | 剪藏浮层（why 输入、状态） |
| `entrypoints/options/` | 设置页（LLM / 写入通道 / 官方插件 / REST API / vault） |

## 开发

```bash
npm install
npm test         # 全量单测（vitest）
npm run compile  # 类型检查（tsc --noEmit）
npm run build    # 生产构建 → .output/chrome-mv3/
npm run dev      # 开发模式（热重载）
```

## 端到端手动验证（阶段 1 验收）

> 此步骤需真实环境，无法在 CI/自动化中完成。

### 1. 准备 Obsidian（二选一写入通道）

剪藏落盘支持两条通道，扩展设置里可切换：

**通道 A：URL Archive 官方插件（推荐，无需额外安装）**
1. 在 Obsidian 安装并启用 **URL Archive** 插件（`../url-archive-obsidian-plugin`，`npm run build` 后把 `main.js` / `manifest.json` 放入 vault 的 `.obsidian/plugins/url-archive/`）。
2. 插件设置 → 「浏览器剪藏服务」→ 开启「启用剪藏服务」（端口默认 `27125`，仅监听 `127.0.0.1`）。
3. 复制「访问 Token」。
> 仅桌面端可用；移动端 Obsidian 无法运行本地服务。

**通道 B：Local REST API（沿用旧方案）**
1. 安装并启用 **Local REST API**（coddingtonbear）社区插件。
2. 插件设置中开启 **Enable Non-encrypted (HTTP) Server**（端口默认 `27123`），复制 **API Key**。

### 2. 加载扩展
```bash
npm run build
```
Chrome 打开 `chrome://extensions` → 开启开发者模式 → 「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3/`。

### 3. 填写设置
打开扩展的 options 页，填入：
- **AI（BYOK）**：API 端点（如 `https://api.openai.com/v1`）、API Key、模型（如 `gpt-4o-mini`）
- **Obsidian 写入方式**：选择「写入通道」
  - 选 **URL Archive 官方插件**：地址 `http://127.0.0.1:27125`、Token（通道 A 第 3 步复制的）
  - 选 **Obsidian Local REST API**：地址 `http://127.0.0.1:27123`、Token（通道 B 的 API Key）
- **通用**：vault 文件夹 `URL Archive`
- 保存。

> 新装用户默认走「官方插件」通道；已配置过 Local REST API 的老用户升级后自动保持「REST API」通道，不受影响。

#### 智谱 GLM-5.2 配置示例

URL Archive 的 AI（BYOK）兼容 OpenAI Chat Completions 格式。设置里的 **API 端点**填写 base URL 即可，扩展会自动拼接 `/chat/completions`。

| 字段 | 填写值 |
|------|--------|
| API 端点 | `https://api.z.ai/api/paas/v4` |
| API Key | 填写你的智谱 / Z.AI API Key |
| 模型 | `glm-5.2` |

最终请求地址会是：

```text
https://api.z.ai/api/paas/v4/chat/completions
```

如果使用旧版智谱开放平台 Key，可尝试旧端点：

```text
https://open.bigmodel.cn/api/paas/v4
```

### 4. 真机剪藏
打开任意文章页 → 点扩展图标 → 填一句"为什么留它" → 点「剪藏到 Obsidian」。

**预期**：提示「✓ 已剪藏到 Obsidian」；vault 的 `URL Archive/` 下出现新 `.md`，含 frontmatter（summary / tags / why / 正文快照）。

### 5. 验证离线兜底
关闭 Obsidian（或停掉 REST API）→ 再剪藏一篇。

**预期**：提示「已暂存」。重新打开 Obsidian 后重载扩展（或重启浏览器触发 background 启动）→ 队列中的笔记自动写入 vault。

### 验证结果记录

| 项 | 状态 | 备注 |
|----|------|------|
| 在线剪藏写入 vault | ⬜ 待验证 | |
| frontmatter / 快照正确 | ⬜ 待验证 | |
| 离线暂存 | ⬜ 待验证 | |
| 恢复后自动补写 | ⬜ 待验证 | |

> 自动化层面：11 个测试文件 / 55 个用例全绿，`tsc --noEmit` 无错，生产构建通过（约 171 kB）。

## 新标签页工作台

扩展会通过 `chrome_url_overrides.newtab` 接管浏览器新标签页，显示 URL Archive 工作台：

- 视觉书签墙
- 浏览器书签分类
- 本地搜索
- 剪藏最近浏览网页、导入浏览器书签和设置入口
- 今日回访和最近剪藏

如果新标签页没有变化，请在 `chrome://extensions` 或 `edge://extensions` 重新加载 URL Archive 扩展。

## ☕ 打赏支持

URL Archive 是我利用业余时间独立开发、并且**完全免费、开源**的项目——没有会员墙，没有广告，也不会把你的任何收藏上传到我的服务器（AI 用你自己的 API Key，笔记只落进你自己的 Obsidian）。

做它的初衷很朴素：我自己也常年苦于"**收藏 = 永久失踪**"，想做一个真正能让收藏"活过来"的工具。于是有了正文快照防止链接失效、AI 摘要与标签帮你回忆、语义搜索让你"记得个大概就能找回"、沉睡回访把落灰的收藏重新端到你面前……每一个功能背后，都是一个个深夜的调试、推倒和重来。

如果它帮你留住了哪怕**一条差点被遗忘的好内容**，或在你需要时**一秒找回了某个网页**，那它就已经值回了你安装它的那几分钟。

维护一个开源项目是一件"用爱发电"的事：持续的迭代、API 调用测试、issue 排查，都在悄悄消耗着本可以用来睡觉的时间 😴。如果你觉得它对你有用，愿意**请我喝一杯咖啡**，那会是对我继续投入最实在的鼓励——它不会让任何功能变成收费，但会让深夜敲键盘的声音更有底气一点。

<table>
  <tr>
    <td align="center">
      <img src="../docs/donate/weixin.jpg" width="230" alt="微信收款码"><br/>
      <b>微信</b>
    </td>
    <td align="center">
      <img src="../docs/donate/zhifubao.png" width="230" alt="支付宝收款码"><br/>
      <b>支付宝</b>
    </td>
  </tr>
</table>

当然，打赏全凭自愿，绝无道德绑架。给项目点一个 **⭐ Star**、提一个 issue、或把它推荐给同样"收藏成瘾"的朋友，对我而言都是同样珍贵的支持。❤️

> 每一分心意我都会认真收下，并把它变成下一个更顺手的功能。谢谢你，让"独立开发"这件事变得值得。
