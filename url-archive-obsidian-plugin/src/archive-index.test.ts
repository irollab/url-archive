import { describe, expect, test } from 'vitest';
import { entryFromFrontmatter, pickDormantEntry, searchArchive } from './archive-index';

describe('archive index', () => {
  test('builds an entry from URL Archive frontmatter', () => {
    const entry = entryFromFrontmatter('URL Archive/a.md', {
      url: 'https://example.com/a',
      title: 'Example',
      tags: ['AI', '收藏'],
      keywords: '语义搜索、知识管理',
      revived: 2,
    });

    expect(entry).toMatchObject({
      path: 'URL Archive/a.md',
      domain: 'example.com',
      tags: ['AI', '收藏'],
      keywords: ['语义搜索', '知识管理'],
      revived: 2,
    });
  });

  test('searches aliases, keywords and intent for fuzzy recall', () => {
    const entries = [
      entryFromFrontmatter('URL Archive/finance.md', {
        url: 'https://finance.example.com',
        title: '纷析云',
        aliases: ['财务自动化工具', '智能记账'],
        keywords: ['财税 SaaS'],
        intent: '寻找企业财务软件时回看',
      })!,
      entryFromFrontmatter('URL Archive/react.md', {
        url: 'https://react.example.com',
        title: 'React 动画库',
      })!,
    ];

    expect(searchArchive(entries, '企业财务软件')[0].title).toBe('纷析云');
    expect(searchArchive(entries, '财务自动化')[0].title).toBe('纷析云');
  });

  test('picks the least revived and oldest dormant entry', () => {
    const entries = [
      entryFromFrontmatter('a.md', { url: 'https://a.com', clipped: '2026-06-01', revived: 1 })!,
      entryFromFrontmatter('b.md', { url: 'https://b.com', clipped: '2026-05-01', revived: 0 })!,
      entryFromFrontmatter('c.md', { url: 'https://c.com', clipped: '2026-06-01', revived: 0 })!,
    ];

    expect(pickDormantEntry(entries)?.url).toBe('https://b.com');
  });
});
