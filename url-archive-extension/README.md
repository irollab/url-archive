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
| `lib/vault.ts` | `VaultWriter` 接口 + `RestApiWriter` |
| `lib/queue.ts` | `ClipQueue` — IndexedDB 离线队列 |
| `lib/capture.ts` | `captureClip` — 编排 enrich → serialize → write/queue |
| `lib/extract.ts` | `extractArticle` — Readability + Turndown |
| `lib/settings.ts` | 读写 `chrome.storage.local` 配置 |
| `entrypoints/background.ts` | 处理 CAPTURE 消息、启动时重试离线队列 |
| `entrypoints/content.ts` | 页面内提取正文，响应 background |
| `entrypoints/popup/` | 剪藏浮层（why 输入、状态） |
| `entrypoints/options/` | 设置页（LLM / REST API / vault） |

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

### 1. 准备 Obsidian
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
- **Obsidian Local REST API**：地址 `http://127.0.0.1:27123`、Token（第 1 步的 API Key）、vault 文件夹 `URL Archive`
- 保存。

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

> 自动化层面：7 个测试文件 / 20 个用例全绿，`tsc --noEmit` 无错，生产构建通过（约 121 kB）。

## 新标签页工作台

扩展会通过 `chrome_url_overrides.newtab` 接管浏览器新标签页，显示 URL Archive 工作台：

- 视觉书签墙
- 浏览器书签分类
- 本地搜索
- 导入/设置入口，以及剪藏使用提示
- 今日回访和最近剪藏

如果新标签页没有变化，请在 `chrome://extensions` 或 `edge://extensions` 重新加载 URL Archive 扩展。
