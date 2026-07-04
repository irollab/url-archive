import type { SavedClip } from './types';
import { canonicalizeUrl } from './markdown';

interface BookmarkNode {
  title?: string;
  url?: string;
  dateAdded?: number;
  children?: BookmarkNode[];
}

export function clipsFromBookmarkTree(nodes: BookmarkNode[], importedAt = new Date().toISOString()): SavedClip[] {
  const clips: SavedClip[] = [];
  walkBookmarkNodes(nodes, [], clips, importedAt);
  return clips;
}

function walkBookmarkNodes(nodes: BookmarkNode[], folders: string[], clips: SavedClip[], importedAt: string) {
  for (const node of nodes) {
    const title = node.title?.trim() ?? '';

    if (node.url) {
      const normalizedUrl = normalizeBookmarkUrl(node.url);
      if (!normalizedUrl) continue;

      const canonicalUrl = canonicalizeUrl(normalizedUrl);
      const parsed = new URL(canonicalUrl);
      const folder = folders.filter(Boolean).join(' / ');
      const folderTags = folders
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(-3);
      const clipped = node.dateAdded ? new Date(node.dateAdded).toISOString() : importedAt;

      clips.push({
        url: normalizedUrl,
        canonicalUrl,
        title: title || parsed.hostname,
        domain: parsed.hostname,
        path: `browser-bookmarks/${slugify(`${parsed.hostname}-${title || parsed.pathname || 'bookmark'}`)}.md`,
        source: 'bookmark',
        folder,
        faviconUrl: faviconUrlFor(parsed),
        summary: folder ? `浏览器书签，位于：${folder}` : '浏览器书签',
        tags: unique(['浏览器书签', ...folderTags]),
        keywords: folderTags,
        aliases: title ? [title] : [],
        intent: folder ? `从浏览器书签文件夹「${folder}」找回` : '从浏览器书签找回',
        why: folder ? `导入自浏览器书签：${folder}` : '导入自浏览器书签',
        clipped,
        queued: false,
        revived: 0,
        lastVisited: '',
      });
      continue;
    }

    if (node.children?.length) {
      walkBookmarkNodes(node.children, [...folders, title], clips, importedAt);
    }
  }
}

function faviconUrlFor(url: URL): string {
  return `${url.origin}/favicon.ico`;
}

function normalizeBookmarkUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  return slug || 'bookmark';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
