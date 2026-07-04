import type { ClipData, AIResult, ClippedNote, Settings, QueueItem, SavedClip } from './types';
import { VaultWriteError, type VaultWriter } from './vault';
import { canonicalizeUrl, serializeNote, generateFilename } from './markdown';

/** captureClip 依赖的协作者，全部注入便于测试与替换 */
export interface CaptureDeps {
  enrich: (clip: ClipData, settings: Settings) => Promise<AIResult>;
  writer: VaultWriter;
  queue: { enqueue: (item: QueueItem) => Promise<void> };
}

export async function captureClip(
  clip: ClipData,
  why: string,
  settings: Settings,
  deps: CaptureDeps,
): Promise<{ written: boolean; path: string; savedClip: SavedClip; queuedReason?: string }> {
  let ai: AIResult = { summary: '', highlights: [], tags: [], keywords: [], aliases: [], intent: '' };
  let aiPending = false;
  try {
    ai = await deps.enrich(clip, settings);
  } catch {
    aiPending = true;
  }

  const canonicalUrl = canonicalizeUrl(clip.url);
  const note: ClippedNote = {
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

  const path = `${settings.vaultFolder}/${generateFilename(note)}`;
  const content = serializeNote(note);
  const savedClip: SavedClip = {
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
    queued: false,
    revived: note.revived,
    lastVisited: note.lastVisited,
  };

  try {
    await deps.writer.write(path, content);
    return { written: true, path, savedClip };
  } catch (error) {
    if (error instanceof VaultWriteError && !error.retryable) {
      throw error;
    }
    await deps.queue.enqueue({ path, content, enqueuedAt: new Date().toISOString() });
    return {
      written: false,
      path,
      savedClip: { ...savedClip, queued: true },
      queuedReason: error instanceof Error ? error.message : String(error),
    };
  }
}
