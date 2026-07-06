import {
  getBookmarkFolders,
  getSavedClipStats,
  pickRevisitClip,
  pickRevisitClips,
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
  revisits: DashboardCard[];
}

export function buildDashboardData(clips: SavedClip[], options: DashboardOptions = {}): DashboardData {
  const { query = '', folder = '' } = options;
  const limit = options.limit ?? clips.length;
  const cards = searchSavedClips(clips, query, { filter: 'all', folder, limit }).map(toDashboardCard);
  const recent = [...clips]
    .filter((clip) => (clip.source ?? 'clip') === 'clip')
    .sort((a, b) => b.clipped.localeCompare(a.clipped))
    .slice(0, 5)
    .map(toDashboardCard);
  const revisitClips = pickRevisitClips(clips, 20);
  const revisitClip = revisitClips[0] ?? pickRevisitClip(clips);

  return {
    stats: getSavedClipStats(clips),
    folders: getBookmarkFolders(clips),
    cards,
    recent,
    revisit: revisitClip ? toDashboardCard(revisitClip) : undefined,
    revisits: revisitClips.map(toDashboardCard),
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
    initial: cardInitial(clip.title, clip.domain),
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

// 只透传真实捕获/自定义的图标；缺失时留空，由新标签页按站点 URL 取浏览器缓存图标
function resolveFaviconUrl(clip: SavedClip): string {
  return clip.faviconUrl ?? '';
}
