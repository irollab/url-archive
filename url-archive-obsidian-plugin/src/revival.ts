import type { UrlArchiveEntry } from './archive-index';

export function getDormantEntries(
  entries: UrlArchiveEntry[],
  now: Date,
  dormantDays: number,
  limit = 5,
): UrlArchiveEntry[] {
  const cutoff = now.getTime() - dormantDays * 24 * 60 * 60 * 1000;
  return [...entries]
    .filter((entry) => entry.status !== 'archived')
    .filter((entry) => {
      const lastTouch = Date.parse(entry.lastVisited || entry.clipped);
      return Number.isFinite(lastTouch) && lastTouch <= cutoff;
    })
    .sort((a, b) => {
      if (a.revived !== b.revived) return a.revived - b.revived;
      const aTouch = a.lastVisited || a.clipped;
      const bTouch = b.lastVisited || b.clipped;
      return aTouch.localeCompare(bTouch);
    })
    .slice(0, limit);
}

export function renderDormantReviewMarkdown(entries: UrlArchiveEntry[], generatedAt: Date): string {
  const date = generatedAt.toISOString().slice(0, 10);
  const lines = [
    '---',
    'type: url-archive-review',
    `generated: ${generatedAt.toISOString()}`,
    '---',
    '',
    `# URL Archive 回顾 - ${date}`,
    '',
  ];

  if (!entries.length) {
    lines.push('没有达到沉睡阈值的收藏。');
    return `${lines.join('\n')}\n`;
  }

  lines.push('## 值得回访');
  lines.push('');
  for (const entry of entries) {
    lines.push(`- [ ] [[${entry.path}|${entry.title || entry.url}]]`);
    lines.push(`  - URL: ${entry.url}`);
    if (entry.summary) lines.push(`  - 摘要: ${entry.summary}`);
    if (entry.intent) lines.push(`  - 回访场景: ${entry.intent}`);
    if (entry.tags.length) lines.push(`  - 标签: ${entry.tags.join('、')}`);
    lines.push(`  - 已复活: ${entry.revived} 次`);
  }
  return `${lines.join('\n')}\n`;
}
