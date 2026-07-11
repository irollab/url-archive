# 剪藏两阶段化：秒级写入 + 后台补 AI

日期：2026-07-10

## 背景

弹出页点击剪藏时，`captureClip` 串行 `await enrichClip`（LLM）→ `writer.write`（vault）。
LLM 慢/挂起会长时间阻塞：弹出页一直"剪藏中…"（慢）→ 失焦被 Chrome 自动关闭 →
MV3 后台 service worker 在长阻塞中被终止 → 剪藏未落盘丢失。

已完成的第一步修复：为 LLM/vault 的 `fetch` 加超时（`lib/http.ts`）。
本设计进一步优化体验：不让写入等待 AI。

## 目标

- 剪藏点击后**立即**写入笔记并返回弹出页（秒级）。
- LLM 摘要在**后台异步**完成后覆盖写回同一笔记并更新回访索引。
- 即使后台补 AI 中断，笔记（含正文快照 + 用户备注）已落盘，**剪藏永不丢失**。

## 关键约束（现有代码已具备）

- `generateFilename` 只依赖 `canonicalUrl` / `domain`，**不依赖 AI 字段** → 两次写命中同一文件（覆盖，无重复）。
- `saveClipForRevisit` 按 `canonicalUrl` 合并并保留 `revived/lastVisited` → 可安全调用两次。
- `serializeNote` 已支持 `aiPending`，占位显示"AI 摘要待补"。

## 方案

### `lib/capture.ts` 重构（SRP，拆成可组合单元）

| 单元 | 职责 |
|------|------|
| `buildNote(clip, why, ai, aiPending): ClippedNote` | 纯函数：组装笔记（含 canonicalize/domain） |
| `noteFilePath(note, vaultFolder): string` | 纯函数：拼接 vault 路径 |
| `noteToSavedClip(note, path, queued): SavedClip` | 纯函数：笔记 → 回访索引项 |
| `writeNote(path, content, deps): {written, queuedReason?}` | 写 vault，可重试失败入队、不可重试抛错 |
| `captureClipFast(clip, why, settings, deps)` | Phase A：不调 AI，写 `aiPending=true` 占位笔记 |
| `enrichAndRewrite(clip, why, settings, deps)` | Phase B：调 AI + 覆盖写 + 返回更新后的 savedClip；enrich 失败返回 `null`（保留占位不重写） |

移除旧的 `captureClip`（由两阶段编排取代）。

### `entrypoints/background.ts`

`handleCaptureFromTab`：
1. Phase A：`captureClipFast` → `saveClipForRevisit` → **立即返回响应**。
2. Phase B：`void enrichInBackground(...)`——不 await，in-flight fetch 保活 SW；
   `enrichAndRewrite` 成功后 `saveClipForRevisit` 更新索引；全程 try/catch 吞错（best-effort）。

### `lib/queue.ts`

`enqueue` 增加**同 path 去重**：新入队项覆盖同 path 旧项，避免离线期间同一剪藏堆积多条队列记录。

### 弹出页

无需改动——已能处理快速返回结果，AI 补充后台静默完成。

## 取舍（已与用户确认）

- **后台补 AI 失败不自动重试**（best-effort）。Phase A 已保证落盘，失败仅保留 `aiPending` 占位，用户可后续手动重剪。（YAGNI）
- **离线队列加同 path 去重**。
- 20s 窗口内用户手动编辑该剪藏，Phase B 覆盖写可能盖掉编辑——罕见竞态，v1 接受。

## 测试

- `capture.test.ts`：`captureClipFast`（aiPending=true、不调 enrich、入队/抛错分支）、
  `enrichAndRewrite`（成功覆盖写带 AI；enrich 失败返回 null 不写）。
- `queue.test.ts`：同 path 去重。
- 全量 `vitest` + `tsc --noEmit` + `wxt build`。
