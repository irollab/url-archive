import type { ClipData, AIResult, ClippedNote, Settings, QueueItem } from './types';
import type { VaultWriter } from './vault';
import { serializeNote, generateFilename } from './markdown';

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
): Promise<{ written: boolean; path: string }> {
  let ai: AIResult = { summary: '', highlights: [], tags: [] };
  let aiPending = false;
  try {
    ai = await deps.enrich(clip, settings);
  } catch {
    aiPending = true;
  }

  const note: ClippedNote = {
    url: clip.url,
    title: clip.title,
    clipped: clip.clippedAt,
    domain: new URL(clip.url).hostname,
    summary: ai.summary,
    tags: ai.tags,
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

  try {
    await deps.writer.write(path, content);
    return { written: true, path };
  } catch {
    await deps.queue.enqueue({ path, content, enqueuedAt: new Date().toISOString() });
    return { written: false, path };
  }
}
