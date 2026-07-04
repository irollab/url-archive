import { describe, expect, test } from 'vitest';
import { clipsFromBookmarkTree } from './bookmarks';

describe('bookmarks', () => {
  test('把浏览器书签树转换为本地收藏索引', () => {
    const clips = clipsFromBookmarkTree([
      {
        title: '根',
        children: [
          {
            title: '工作',
            children: [
              {
                title: '纷析云',
                url: 'https://f3.fenxi365.com/',
                dateAdded: Date.parse('2026-07-01T00:00:00.000Z'),
              },
            ],
          },
        ],
      },
    ], '2026-07-03T00:00:00.000Z');

    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      title: '纷析云',
      domain: 'f3.fenxi365.com',
      source: 'bookmark',
      folder: '根 / 工作',
      faviconUrl: 'https://f3.fenxi365.com/favicon.ico',
      tags: ['浏览器书签', '根', '工作'],
      keywords: ['根', '工作'],
      clipped: '2026-07-01T00:00:00.000Z',
    });
  });

  test('忽略非网页协议书签', () => {
    const clips = clipsFromBookmarkTree([
      { title: 'Chrome 设置', url: 'chrome://settings' },
      { title: '本地文件', url: 'file:///tmp/a.html' },
      { title: '网页', url: 'https://example.com' },
    ]);

    expect(clips).toHaveLength(1);
    expect(clips[0].url).toBe('https://example.com/');
  });
});
