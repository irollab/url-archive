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
  const date = note.clipped.slice(0, 10);  // YYYY-MM-DD
  const slug = slugify(note.title) || 'untitled';  // 空/纯符号标题回退
  return `${note.domain}-${slug}-${date}.md`;
}

export function serializeNote(note: ClippedNote): string {
  const frontmatter = {
    url: note.url,
    title: note.title,
    clipped: note.clipped,
    domain: note.domain,
    summary: note.summary,
    tags: note.tags,
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
