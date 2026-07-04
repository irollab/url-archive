import type { SavedClip } from './types';

const KEY = 'saved_clips';
const MAX_SAVED_CLIPS = 1000;

export type ClipFilter = 'all' | 'clip' | 'bookmark' | 'queued' | 'unvisited' | 'visited';

export interface SearchSavedClipsOptions {
  limit?: number;
  filter?: ClipFilter;
  folder?: string;
}

export interface SavedClipStats {
  total: number;
  clips: number;
  bookmarks: number;
  queued: number;
  unvisited: number;
  visited: number;
}

export interface BookmarkFolderOption {
  path: string;
  count: number;
}

export interface SavedClipUpdate {
  url: string;
  canonicalUrl?: string;
  title?: string;
  folder?: string;
  faviconUrl?: string;
  tags?: string[];
  why?: string;
  summary?: string;
}

export interface SavedClipDelete {
  url: string;
  canonicalUrl?: string;
}

export async function loadSavedClips(): Promise<SavedClip[]> {
  const got = await chrome.storage.local.get(KEY);
  return Array.isArray(got[KEY]) ? got[KEY] as SavedClip[] : [];
}

export async function saveClipForRevisit(clip: SavedClip): Promise<void> {
  const clips = await loadSavedClips();
  const existing = clips.find((item) => isSameClip(item, clip));
  const merged: SavedClip = {
    ...existing,
    ...clip,
    revived: existing?.revived ?? clip.revived,
    lastVisited: existing?.lastVisited ?? clip.lastVisited,
  };
  const next = [
    merged,
    ...clips.filter((item) => !isSameClip(item, clip)),
  ].slice(0, MAX_SAVED_CLIPS);
  await chrome.storage.local.set({ [KEY]: next });
}

export async function saveClipsForRevisit(imported: SavedClip[]): Promise<number> {
  const clips = await loadSavedClips();
  const byUrl = new Map<string, SavedClip>();

  for (const clip of clips) {
    if (clip.url) byUrl.set(clipKey(clip), clip);
  }

  let changed = 0;
  for (const clip of imported) {
    if (!clip.url) continue;
    const key = clipKey(clip);
    const existing = byUrl.get(key);
    byUrl.set(key, {
      ...existing,
      ...clip,
      revived: existing?.revived ?? clip.revived,
      lastVisited: existing?.lastVisited ?? clip.lastVisited,
    });
    changed += 1;
  }

  const next = [...byUrl.values()]
    .sort((a, b) => b.clipped.localeCompare(a.clipped))
    .slice(0, MAX_SAVED_CLIPS);
  await chrome.storage.local.set({ [KEY]: next });
  return changed;
}

export async function updateSavedClip(update: SavedClipUpdate): Promise<SavedClip | undefined> {
  const clips = await loadSavedClips();
  const index = clips.findIndex((clip) => clipKey(clip) === (update.canonicalUrl || update.url));
  if (index < 0) return undefined;

  const current = clips[index];
  const nextClip: SavedClip = {
    ...current,
    title: cleanOptional(update.title) ?? current.title,
    folder: cleanOptional(update.folder) ?? current.folder,
    faviconUrl: cleanOptional(update.faviconUrl) ?? current.faviconUrl,
    tags: update.tags ? uniqueTags(update.tags) : current.tags,
    why: cleanOptional(update.why) ?? current.why,
    summary: cleanOptional(update.summary) ?? current.summary,
  };
  const next = [...clips];
  next[index] = nextClip;
  await chrome.storage.local.set({ [KEY]: next });
  return nextClip;
}

export async function deleteSavedClip(target: SavedClipDelete): Promise<boolean> {
  const clips = await loadSavedClips();
  const targetKey = target.canonicalUrl || target.url;
  const next = clips.filter((clip) => clipKey(clip) !== targetKey);
  if (next.length === clips.length) return false;
  await chrome.storage.local.set({ [KEY]: next });
  return true;
}

function isSameClip(a: SavedClip, b: SavedClip): boolean {
  return clipKey(a) === clipKey(b);
}

function clipKey(clip: SavedClip): string {
  return clip.canonicalUrl || clip.url;
}

function cleanOptional(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  return value.trim();
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function pickRevisitClip(clips: SavedClip[]): SavedClip | undefined {
  return [...clips]
    .filter((clip) => clip.url)
    .sort((a, b) => {
      if (a.revived !== b.revived) return a.revived - b.revived;
      const aVisited = a.lastVisited || a.clipped;
      const bVisited = b.lastVisited || b.clipped;
      return aVisited.localeCompare(bVisited);
    })[0];
}

export function searchSavedClips(
  clips: SavedClip[],
  query: string,
  optionsOrLimit: SearchSavedClipsOptions | number = {},
): SavedClip[] {
  const options = typeof optionsOrLimit === 'number' ? { limit: optionsOrLimit } : optionsOrLimit;
  const limit = options.limit ?? 20;
  const pool = filterSavedClipsByFolder(
    filterSavedClips(clips, options.filter ?? 'all'),
    options.folder ?? '',
  );
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return pool.slice(0, limit);

  return pool
    .map((clip) => ({ clip, score: scoreClip(clip, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.clip.clipped.localeCompare(a.clip.clipped))
    .slice(0, limit)
    .map((item) => item.clip);
}

export function getBookmarkFolders(clips: SavedClip[]): BookmarkFolderOption[] {
  const counts = new Map<string, number>();
  for (const clip of clips) {
    if (clip.source !== 'bookmark' || !clip.folder) continue;
    const parts = clip.folder.split(' / ').map((part) => part.trim()).filter(Boolean);
    for (let index = 1; index <= parts.length; index += 1) {
      const path = parts.slice(0, index).join(' / ');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}

function filterSavedClipsByFolder(clips: SavedClip[], folder: string): SavedClip[] {
  if (!folder) return clips;
  return clips.filter((clip) => clip.folder === folder || clip.folder?.startsWith(`${folder} / `));
}

export function filterSavedClips(clips: SavedClip[], filter: ClipFilter): SavedClip[] {
  switch (filter) {
    case 'clip':
      return clips.filter((clip) => (clip.source ?? 'clip') === 'clip');
    case 'bookmark':
      return clips.filter((clip) => clip.source === 'bookmark');
    case 'queued':
      return clips.filter((clip) => clip.queued);
    case 'unvisited':
      return clips.filter((clip) => !clip.lastVisited);
    case 'visited':
      return clips.filter((clip) => Boolean(clip.lastVisited));
    case 'all':
    default:
      return clips;
  }
}

export function getSavedClipStats(clips: SavedClip[]): SavedClipStats {
  return {
    total: clips.length,
    clips: clips.filter((clip) => (clip.source ?? 'clip') === 'clip').length,
    bookmarks: clips.filter((clip) => clip.source === 'bookmark').length,
    queued: clips.filter((clip) => clip.queued).length,
    unvisited: clips.filter((clip) => !clip.lastVisited).length,
    visited: clips.filter((clip) => Boolean(clip.lastVisited)).length,
  };
}

function scoreClip(clip: SavedClip, terms: string[]): number {
  const fields = [
    { value: clip.title, weight: 8 },
    { value: clip.tags.join(' '), weight: 6 },
    { value: clip.aliases.join(' '), weight: 7 },
    { value: clip.keywords.join(' '), weight: 6 },
    { value: clip.domain, weight: 5 },
    { value: clip.summary, weight: 3 },
    { value: clip.intent, weight: 4 },
    { value: clip.why, weight: 3 },
    { value: clip.folder ?? '', weight: 5 },
    { value: clip.url, weight: 2 },
  ];

  return terms.reduce((total, term) => {
    const termScore = fields.reduce((sum, field) => {
      return field.value.toLowerCase().includes(term) ? sum + field.weight : sum;
    }, 0);
    return termScore ? total + termScore : 0;
  }, 0);
}

export async function recordRevisit(url: string, visitedAt = new Date().toISOString()): Promise<void> {
  const clips = await loadSavedClips();
  const next = clips.map((clip) => {
    if (clip.url !== url) return clip;
    return {
      ...clip,
      revived: clip.revived + 1,
      lastVisited: visitedAt,
    };
  });
  await chrome.storage.local.set({ [KEY]: next });
}
