import type { ClipData, AIResult, ClippedNote, Settings, QueueItem, SavedClip } from './types';
import { VaultWriteError, type VaultWriter } from './vault';
import { canonicalizeUrl, serializeNote, generateFilename } from './markdown';

/** 写入相关协作者，注入便于测试与替换 */
export interface WriteDeps {
  writer: VaultWriter;
  queue: { enqueue: (item: QueueItem) => Promise<void> };
}

/** 补 AI 阶段的协作者 */
export interface EnrichDeps extends WriteDeps {
  enrich: (clip: ClipData, settings: Settings) => Promise<AIResult>;
}

const EMPTY_AI: AIResult = { summary: '', highlights: [], tags: [], keywords: [], aliases: [], intent: '' };

export interface CaptureResult {
  written: boolean;
  path: string;
  savedClip: SavedClip;
  queuedReason?: string;
}

/** 纯函数：把原始剪藏数据组装成完整笔记 */
export function buildNote(clip: ClipData, why: string, ai: AIResult, aiPending: boolean): ClippedNote {
  const canonicalUrl = canonicalizeUrl(clip.url);
  return {
    url: clip.url,
    canonicalUrl,
    title: clip.title,
    clipped: clip.clippedAt,
    domain: new URL(canonicalUrl).hostname,
    summary: ai.summary,
    tags: ai.tags,
    keywords: ai.keywords,
    aliases: ai.aliases,
    intent: ai.intent,
    why,
    status: 'unread',
    revived: 0,
    lastVisited: '',
    aiPending,
    highlights: ai.highlights,
    contentMarkdown: clip.contentMarkdown,
  };
}

/** 纯函数：拼接 vault 内笔记路径（仅依赖 canonicalUrl/domain，先写与补写命中同一路径） */
export function noteFilePath(note: ClippedNote, vaultFolder: string): string {
  return `${vaultFolder}/${generateFilename(note)}`;
}

/** 纯函数：笔记 → 本地回访索引项 */
export function noteToSavedClip(note: ClippedNote, path: string, queued: boolean): SavedClip {
  return {
    url: note.url,
    canonicalUrl: note.canonicalUrl,
    title: note.title,
    domain: note.domain,
    path,
    summary: note.summary,
    tags: note.tags,
    keywords: note.keywords,
    aliases: note.aliases,
    intent: note.intent,
    why: note.why,
    clipped: note.clipped,
    queued,
    revived: note.revived,
    lastVisited: note.lastVisited,
  };
}

/** 写 vault：可重试失败入队，不可重试失败抛出 */
async function writeNote(
  path: string,
  content: string,
  deps: WriteDeps,
): Promise<{ written: boolean; queuedReason?: string }> {
  try {
    await deps.writer.write(path, content);
    return { written: true };
  } catch (error) {
    if (error instanceof VaultWriteError && !error.retryable) {
      throw error;
    }
    await deps.queue.enqueue({ path, content, enqueuedAt: new Date().toISOString() });
    return { written: false, queuedReason: error instanceof Error ? error.message : String(error) };
  }
}

/** Phase A：秒级写入占位笔记（不调 AI），供剪藏点击后立即返回 */
export async function captureClipFast(
  clip: ClipData,
  why: string,
  settings: Settings,
  deps: WriteDeps,
): Promise<CaptureResult> {
  const note = buildNote(clip, why, EMPTY_AI, true);
  const path = noteFilePath(note, settings.vaultFolder);
  const { written, queuedReason } = await writeNote(path, serializeNote(note), deps);
  return { written, path, savedClip: noteToSavedClip(note, path, !written), queuedReason };
}

/**
 * Phase B：后台补 AI 并覆盖写回同一路径。
 * enrich 失败时**抛出真实错误**（保留占位笔记，不重写）——由调用方决定如何提示，便于诊断超时/鉴权等原因。
 */
export async function enrichAndRewrite(
  clip: ClipData,
  why: string,
  settings: Settings,
  deps: EnrichDeps,
): Promise<CaptureResult> {
  const ai = await deps.enrich(clip, settings);

  const note = buildNote(clip, why, ai, false);
  const path = noteFilePath(note, settings.vaultFolder);
  const { written, queuedReason } = await writeNote(path, serializeNote(note), deps);
  return { written, path, savedClip: noteToSavedClip(note, path, !written), queuedReason };
}
