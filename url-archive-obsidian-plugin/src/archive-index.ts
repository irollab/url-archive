export interface UrlArchiveEntry {
  path: string;
  url: string;
  title: string;
  domain: string;
  clipped: string;
  summary: string;
  tags: string[];
  keywords: string[];
  aliases: string[];
  intent: string;
  why: string;
  status: string;
  revived: number;
  lastVisited: string;
}

export interface ArchiveFrontmatter {
  url?: unknown;
  title?: unknown;
  domain?: unknown;
  clipped?: unknown;
  summary?: unknown;
  tags?: unknown;
  keywords?: unknown;
  aliases?: unknown;
  intent?: unknown;
  why?: unknown;
  status?: unknown;
  revived?: unknown;
  last_visited?: unknown;
}

/**
 * 从完整 markdown 中截取开头的 YAML frontmatter 文本块（--- ... ---），无则返回 null。
 * 用于写入剪藏后直接解析 frontmatter，不依赖 Obsidian 异步的 metadataCache。
 */
export function extractFrontmatterBlock(markdown: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  return match ? match[1] : null;
}

export function entryFromFrontmatter(path: string, fm: ArchiveFrontmatter): UrlArchiveEntry | null {
  const url = toStringValue(fm.url);
  if (!url) return null;

  return {
    path,
    url,
    title: toStringValue(fm.title) || url,
    domain: toStringValue(fm.domain) || safeDomain(url),
    clipped: toStringValue(fm.clipped),
    summary: toStringValue(fm.summary),
    tags: toStringArray(fm.tags),
    keywords: toStringArray(fm.keywords),
    aliases: toStringArray(fm.aliases),
    intent: toStringValue(fm.intent),
    why: toStringValue(fm.why),
    status: toStringValue(fm.status) || 'unread',
    revived: toNumberValue(fm.revived),
    lastVisited: toStringValue(fm.last_visited),
  };
}

export function searchArchive(entries: UrlArchiveEntry[], query: string, limit = 20): UrlArchiveEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries.slice(0, limit);

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.clipped.localeCompare(a.entry.clipped))
    .slice(0, limit)
    .map((item) => item.entry);
}

export function pickDormantEntry(entries: UrlArchiveEntry[]): UrlArchiveEntry | null {
  return [...entries]
    .filter((entry) => entry.status !== 'archived')
    .sort((a, b) => {
      if (a.revived !== b.revived) return a.revived - b.revived;
      const aVisited = a.lastVisited || a.clipped;
      const bVisited = b.lastVisited || b.clipped;
      return aVisited.localeCompare(bVisited);
    })[0] ?? null;
}

function scoreEntry(entry: UrlArchiveEntry, terms: string[]): number {
  const fields = [
    { value: entry.title, weight: 10 },
    { value: entry.aliases.join(' '), weight: 9 },
    { value: entry.keywords.join(' '), weight: 8 },
    { value: entry.tags.join(' '), weight: 7 },
    { value: entry.domain, weight: 6 },
    { value: entry.intent, weight: 5 },
    { value: entry.summary, weight: 4 },
    { value: entry.why, weight: 4 },
    { value: entry.url, weight: 2 },
  ];

  return terms.reduce((total, term) => {
    const termScore = fields.reduce((sum, field) => {
      return field.value.toLowerCase().includes(term) ? sum + field.weight : sum;
    }, 0);
    return termScore ? total + termScore : 0;
  }, 0);
}

function toStringValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function toNumberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
