import {
  getBookmarkFolders,
  getSavedClipStats,
  pickRevisitClip,
  searchSavedClips,
  type BookmarkFolderOption,
  type SavedClipStats,
} from './revisit';
import type { SavedClip } from './types';

export interface DashboardOptions {
  query?: string;
  folder?: string;
  limit?: number;
}

export interface DashboardCard {
  url: string;
  canonicalUrl?: string;
  title: string;
  domain: string;
  path: string;
  source: 'clip' | 'bookmark';
  sourceLabel: string;
  folder?: string;
  faviconUrl: string;
  summary: string;
  tags: string[];
  keywords: string[];
  aliases: string[];
  intent: string;
  why: string;
  clipped: string;
  queued: boolean;
  revived: number;
  lastVisited: string;
  initial: string;
}

export interface DashboardData {
  stats: SavedClipStats;
  folders: BookmarkFolderOption[];
  cards: DashboardCard[];
  recent: DashboardCard[];
  revisit?: DashboardCard;
}

export function buildDashboardData(clips: SavedClip[], options: DashboardOptions = {}): DashboardData {
  const { query = '', folder = '', limit = 50 } = options;
  const cards = searchSavedClips(clips, query, { filter: 'all', folder, limit }).map(toDashboardCard);
  const recent = [...clips]
    .filter((clip) => (clip.source ?? 'clip') === 'clip')
    .sort((a, b) => b.clipped.localeCompare(a.clipped))
    .slice(0, 5)
    .map(toDashboardCard);
  const revisitClip = pickRevisitClip(clips);

  return {
    stats: getSavedClipStats(clips),
    folders: getBookmarkFolders(clips),
    cards,
    recent,
    revisit: revisitClip ? toDashboardCard(revisitClip) : undefined,
  };
}

export function toDashboardCard(clip: SavedClip): DashboardCard {
  const source = clip.source ?? 'clip';

  return {
    url: clip.url,
    canonicalUrl: clip.canonicalUrl,
    title: clip.title,
    domain: clip.domain,
    path: clip.path,
    source,
    sourceLabel: sourceLabelFor(clip),
    folder: clip.folder,
    faviconUrl: resolveFaviconUrl(clip),
    summary: clip.summary,
    tags: clip.tags,
    keywords: clip.keywords,
    aliases: clip.aliases,
    intent: clip.intent,
    why: clip.why,
    clipped: clip.clipped,
    queued: clip.queued,
    revived: clip.revived,
    lastVisited: clip.lastVisited,
    initial: cardInitial('', clip.domain),
  };
}

export function cardInitial(title: string, domain: string): string {
  const value = title.trim() || domain.trim();
  return value ? value[0].toUpperCase() : '?';
}

function sourceLabelFor(clip: SavedClip): string {
  if (clip.source === 'bookmark') return '书签';
  if (clip.queued) return '暂存';
  return '剪藏';
}

function resolveFaviconUrl(clip: SavedClip): string {
  if (clip.faviconUrl) return clip.faviconUrl;

  try {
    return `${new URL(clip.url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}
