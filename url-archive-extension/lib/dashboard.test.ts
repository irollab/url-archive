import { describe, expect, test } from 'vitest';
import { buildDashboardData, cardInitial, type DashboardOptions } from './dashboard';
import type { SavedClip } from './types';

function clip(overrides: Partial<SavedClip>): SavedClip {
  return {
    url: 'https://example.com/a',
    canonicalUrl: 'https://example.com/a',
    title: 'Example',
    domain: 'example.com',
    path: 'URL Archive/example.md',
    source: 'bookmark',
    folder: '书签栏 / 工作 / AI',
    faviconUrl: 'https://example.com/favicon.ico',
    summary: '摘要',
    tags: ['浏览器书签', 'AI'],
    keywords: [],
    aliases: [],
    intent: '',
    why: '常用工具',
    clipped: '2026-07-01T00:00:00.000Z',
    queued: false,
    revived: 0,
    lastVisited: '',
    ...overrides,
  };
}

describe('dashboard view model', () => {
  test('maps saved clips to visual cards with source labels', () => {
    const data = buildDashboardData([
      clip({ title: 'Example', source: 'bookmark' }),
      clip({ url: 'https://clip.example.com', title: '剪藏 B', source: 'clip', domain: 'clip.example.com' }),
    ]);

    expect(data.cards).toHaveLength(2);
    expect(data.cards[0]).toMatchObject({
      title: 'Example',
      sourceLabel: '书签',
      faviconUrl: 'https://example.com/favicon.ico',
      initial: 'E',
    });
    expect(data.cards[1].sourceLabel).toBe('剪藏');
  });

  test('filters cards by selected bookmark folder including children', () => {
    const options: DashboardOptions = { folder: '书签栏 / 工作' };
    const data = buildDashboardData([
      clip({ title: 'AI', folder: '书签栏 / 工作 / AI' }),
      clip({ url: 'https://finance.example.com', title: '财务', folder: '书签栏 / 工作 / 财务' }),
      clip({ url: 'https://life.example.com', title: '生活', folder: '书签栏 / 生活' }),
    ], options);

    expect(data.cards.map((card) => card.title)).toEqual(['AI', '财务']);
  });

  test('returns every dashboard card by default', () => {
    const clips = Array.from({ length: 90 }, (_, index) => clip({
      url: `https://example.com/${index}`,
      canonicalUrl: `https://example.com/${index}`,
      title: `Example ${index}`,
    }));

    expect(buildDashboardData(clips).cards).toHaveLength(90);
  });

  test('builds right panel data for revisit and recent clips', () => {
    const data = buildDashboardData([
      clip({ title: '旧书签', clipped: '2026-06-01T00:00:00.000Z', revived: 0 }),
      clip({ url: 'https://new.example.com', title: '最近剪藏', source: 'clip', clipped: '2026-07-03T00:00:00.000Z' }),
    ]);

    expect(data.revisit?.title).toBe('旧书签');
    expect(data.recent[0].title).toBe('最近剪藏');
  });

  test('returns empty favicon fallback for non-web urls', () => {
    const data = buildDashboardData([
      clip({
        url: 'mailto:test@example.com',
        canonicalUrl: 'mailto:test@example.com',
        faviconUrl: '',
      }),
    ]);

    expect(data.cards[0].faviconUrl).toBe('');
  });

  test('leaves favicon empty when clip has no faviconUrl (no /favicon.ico guessing)', () => {
    const https = buildDashboardData([
      clip({ url: 'https://example.com/path', canonicalUrl: 'https://example.com/path', faviconUrl: '' }),
    ]);
    const http = buildDashboardData([
      clip({ url: 'http://example.com/path', canonicalUrl: 'http://example.com/path', faviconUrl: '' }),
    ]);

    expect(https.cards[0].faviconUrl).toBe('');
    expect(http.cards[0].faviconUrl).toBe('');
  });

  test('uses domain initial when title is empty', () => {
    expect(cardInitial('', 'f3.fenxi365.com')).toBe('F');
    expect(cardInitial('纷析云', 'f3.fenxi365.com')).toBe('纷');
  });
});
