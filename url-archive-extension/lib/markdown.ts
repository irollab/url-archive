import { stringify } from 'yaml';
import type { ClippedNote } from './types';

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')  // 非字母数字（含中文）转连字符
    .replace(/^-+|-+$/g, '');
}

export function generateFilename(note: ClippedNote): string {
  const slug = slugify(new URL(note.canonicalUrl).pathname) || 'home';
  return `${note.domain}-${slug}-${hashText(note.canonicalUrl).slice(0, 10)}.md`;
}

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParam(key)) url.searchParams.delete(key);
  }

  const sortedParams = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => {
    return aKey.localeCompare(bKey) || aValue.localeCompare(bValue);
  });
  url.search = '';
  for (const [key, value] of sortedParams) {
    url.searchParams.append(key, value);
  }

  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}

function isTrackingParam(key: string): boolean {
  return /^utm_/i.test(key)
    || ['fbclid', 'gclid', 'msclkid', 'yclid', 'igshid'].includes(key.toLowerCase());
}

function hashText(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function serializeNote(note: ClippedNote): string {
  const frontmatter = {
    url: note.url,
    canonical_url: note.canonicalUrl,
    title: note.title,
    clipped: note.clipped,
    domain: note.domain,
    summary: note.summary,
    tags: note.tags,
    keywords: note.keywords,
    aliases: note.aliases,
    intent: note.intent,
    why: note.why,
    status: note.status,
    revived: note.revived,
    last_visited: note.lastVisited || null,
    ai_pending: note.aiPending,
  };
  const fm = stringify(frontmatter).trimEnd();

  const highlightsBlock = note.highlights.length
    ? note.highlights.map((h) => `> ${h}`).join('\n')
    : '> _（AI 摘要待补）_';

  return `---
${fm}
---

> [!summary] 速览
${highlightsBlock}

## 我的备注
${note.why}

## 正文快照
${note.contentMarkdown}
`;
}
