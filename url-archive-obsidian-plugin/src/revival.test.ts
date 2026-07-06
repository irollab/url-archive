import { describe, expect, test } from 'vitest';
import { getDormantEntries, renderDormantReviewMarkdown } from './revival';
import type { UrlArchiveEntry } from './archive-index';

function entry(overrides: Partial<UrlArchiveEntry>): UrlArchiveEntry {
  return {
    path: 'URL Archive/a.md',
    url: 'https://example.com',
    title: 'Example',
    domain: 'example.com',
    clipped: '2026-06-01T00:00:00.000Z',
    summary: '摘要',
    tags: ['标签'],
    keywords: [],
    aliases: [],
    intent: '回访场景',
    why: '',
    status: 'unread',
    revived: 0,
    lastVisited: '',
    ...overrides,
  };
}

describe('revival', () => {
  test('picks entries older than dormant threshold', () => {
    const now = new Date('2026-07-02T00:00:00.000Z');
    const dormant = getDormantEntries([
      entry({ path: 'old.md', clipped: '2026-06-01T00:00:00.000Z' }),
      entry({ path: 'new.md', clipped: '2026-06-25T00:00:00.000Z' }),
      entry({ path: 'archived.md', status: 'archived', clipped: '2026-05-01T00:00:00.000Z' }),
    ], now, 14);

    expect(dormant.map((item) => item.path)).toEqual(['old.md']);
  });

  test('renders review markdown with wiki links and context', () => {
    const md = renderDormantReviewMarkdown([entry({ path: 'URL Archive/a.md', title: 'A' })], new Date('2026-07-02T00:00:00.000Z'));

    expect(md).toContain('# URL Archive 回顾 - 2026-07-02');
    expect(md).toContain('[[URL Archive/a.md|A]]');
    expect(md).toContain('回访场景');
  });
});
