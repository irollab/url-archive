# 批量补 AI 回填 + 弹出页 AI 状态追踪

日期：2026-07-10

## 背景

剪藏两阶段化后，Phase A 秒级写入 `ai_pending: true` 占位笔记，Phase B 后台补 AI。
按「失败不重试」设计，Phase B 只在剪藏时跑一次：

- 历史上 `ai_pending: true` 的空笔记不会自动回填（配好 LLM 也不会）。
- 用户看不到 Phase B 结果，容易「以为剪藏失败」。

本设计新增两项独立改进（分属插件端 / 扩展端）。

## A · 插件「批量补 AI 摘要」（回填历史）

AI 富集在扩展端；插件独立运行时用插件自己的 **chat 模型**（`chatModel`）回填。

### 新增可测纯模块
- `src/enrich.ts`
  - `buildEnrichPrompt({title,url,body}): string` — 纯函数，生成要求严格 JSON 的提示。
  - `parseEnrichResult(content): AiEnrichResult` — 纯函数，去 ```json 代码围栏、支持中文键、字符串数组归一（逻辑移植自扩展 `llm.ts`；两包独立发布无法共享，属可接受的跨包重复）。
  - `enrichNoteContent(note, settings, chat=createChatAnswer): Promise<AiEnrichResult>` — 调 chat（JSON 模式）→ parse。
- `src/note-body.ts`
  - `extractBodySnapshot(md): string` — 取「## 正文快照」正文喂 LLM（截断上限）。
  - `applySummaryHighlights(md, highlights): string` — 重写「> [!summary] 速览」下的要点行。

### 改动
- `chat-provider.ts`：`createChatAnswer(prompt, settings, opts?)` 增加可选 `{ jsonMode?, system? }`（默认维持现状，RAG 不受影响）；补 AI 走 `jsonMode`。
- `main.ts`：命令 +「索引」区按钮「补全待处理的 AI 摘要」→ `backfillPendingAi()`：
  1. 扫描 `archiveFolder` 下 `frontmatter.ai_pending === true` 的笔记。
  2. 逐条：`vault.read` → `extractBodySnapshot` → `enrichNoteContent` → `processFrontMatter` 写回 summary/tags/keywords/aliases/intent + `ai_pending=false` → `vault.modify` 应用 `applySummaryHighlights` → `rebuildIndex()` + `embedClipEntry()`。
  3. 进度 Notice；单条失败计数、`console.error`、继续、保留原样。
  4. 未配置 chat（baseUrl/apiKey/model 任一为空）→ 开头即 Notice 提示去设置，不执行。

## B · 扩展弹出页 AI 状态追踪

- `background.ts` `enrichInBackground`：结束时 `chrome.runtime.sendMessage({type:'CAPTURE_ENRICHED', canonicalUrl, status, error?})`。
  - 扩展未配置 LLM（`llmBaseUrl`/`llmApiKey`/`llmModel` 任一空）→ `status:'skipped'`（不发起请求）。
  - `enrichAndRewrite` 有结果 → `'done'`；否则 → `'failed'`（带 error 文本）。
- `popup/main.ts`：
  - 剪藏成功后显示「✓ 已剪藏，AI 摘要补充中…」，记 `pendingCanonicalUrl`，**不自动关闭**，设 25s 兜底（回落到「AI 补充可能仍在进行」并允许关闭）。
  - 监听 `CAPTURE_ENRICHED`，`canonicalUrl` 匹配 `pendingCanonicalUrl` 才更新：
    - done → 「✓ AI 摘要已补充」，1s 后 `window.close()`。
    - skipped → 「○ 未补充 AI（扩展未配置 AI 模型）」。
    - failed → 「○ AI 补充失败：<msg>」。
  - 抽纯函数 `enrichStatusText(status, error): string` 便于测试。
  - queued（Obsidian 离线）成功路径同样进入 AI 追踪。

## 测试
- A：`parseEnrichResult`（含代码围栏/中文键/空返回）、`extractBodySnapshot`、`applySummaryHighlights`。
- B：`enrichStatusText`（done/skipped/failed 文案）。
- 两端 `vitest` + `tsc --noEmit` + `build`；插件 build 后部署 `main.js` 到 `.obsidian/plugins/url-archive/`。

## 取舍
- 判据用 `ai_pending===true`（比「summary 为空」更准）。
- 补 AI 用插件 chat 模型（扩展独立运行时不参与）。
- B 把「秒关」改为「等待追踪」（用户已确认）；25s 兜底避免卡死。
