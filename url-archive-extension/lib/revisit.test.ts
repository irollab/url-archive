import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  deleteSavedClip,
  getSavedClipStats,
  getBookmarkFolders,
  loadSavedClips,
  pickRevisitClip,
  recordRevisit,
  saveClipForRevisit,
  saveClipsForRevisit,
  searchSavedClips,
  updateSavedClip,
} from './revisit';
import type { SavedClip } from './types';

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(store, obj); }),
      },
    },
  };
});

function clip(overrides: Partial<SavedClip>): SavedClip {
  return {
    url: 'https://example.com/a',
    title: 'A',
    domain: 'example.com',
    path: 'URL Archive/a.md',
    summary: '摘要',
    tags: ['tag'],
    keywords: [],
    aliases: [],
    intent: '',
    why: '',
    clipped: '2026-06-01T00:00:00.000Z',
    queued: false,
    revived: 0,
    lastVisited: '',
    ...overrides,
  };
}

describe('revisit', () => {
  test('保存收藏索引并按 URL 去重', async () => {
    await saveClipForRevisit(clip({ title: 'A' }));
    await saveClipForRevisit(clip({ title: 'A updated', queued: true }));

    const clips = await loadSavedClips();
    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe('A updated');
    expect(clips[0].queued).toBe(true);
  });

  test('保存收藏索引会按 canonicalUrl 去重', async () => {
    await saveClipForRevisit(clip({
      url: 'https://example.com/a?utm_source=x#top',
      canonicalUrl: 'https://example.com/a',
      title: 'Chrome 保存',
    }));
    await saveClipForRevisit(clip({
      url: 'https://example.com/a',
      canonicalUrl: 'https://example.com/a',
      title: 'Edge 保存',
    }));

    const clips = await loadSavedClips();
    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe('Edge 保存');
  });

  test('优先挑回访次数少且更久未访问的收藏', () => {
    const picked = pickRevisitClip([
      clip({ url: 'https://example.com/revived', revived: 1 }),
      clip({ url: 'https://example.com/old', clipped: '2026-05-01T00:00:00.000Z' }),
      clip({ url: 'https://example.com/new', clipped: '2026-06-01T00:00:00.000Z' }),
    ]);

    expect(picked?.url).toBe('https://example.com/old');
  });

  test('记录回访会增加 revived 并写入 lastVisited', async () => {
    await saveClipForRevisit(clip({ url: 'https://example.com/a' }));
    await recordRevisit('https://example.com/a', '2026-07-02T10:00:00.000Z');

    const clips = await loadSavedClips();
    expect(clips[0].revived).toBe(1);
    expect(clips[0].lastVisited).toBe('2026-07-02T10:00:00.000Z');
  });

  test('按标题、标签、摘要、备注、域名和 URL 搜索收藏', () => {
    const clips = [
      clip({ url: 'https://frontend.example.com/a', title: 'React 动画库', tags: ['前端'], summary: '组件动效选型' }),
      clip({ url: 'https://db.example.com/b', title: 'Postgres 索引', tags: ['数据库'], why: '排查慢查询' }),
      clip({ url: 'https://ai.example.com/c', title: 'Embedding Search', summary: '语义搜索方案' }),
    ];

    expect(searchSavedClips(clips, '慢查询')[0].title).toBe('Postgres 索引');
    expect(searchSavedClips(clips, '语义')[0].title).toBe('Embedding Search');
    expect(searchSavedClips(clips, 'frontend')[0].title).toBe('React 动画库');
  });

  test('可按 AI 生成的别名、关键词和回访场景搜索', () => {
    const clips = [
      clip({
        title: '纷析云',
        aliases: ['财务自动化工具', '智能记账'],
        keywords: ['财税 SaaS'],
        intent: '寻找企业财务软件时回看',
      }),
      clip({ title: 'React 动画库' }),
    ];

    expect(searchSavedClips(clips, '财务自动化')[0].title).toBe('纷析云');
    expect(searchSavedClips(clips, '企业财务软件')[0].title).toBe('纷析云');
  });

  test('可按来源筛选搜索结果', () => {
    const clips = [
      clip({ title: '剪藏文章', source: 'clip' }),
      clip({ url: 'https://example.com/bookmark', title: '浏览器书签', source: 'bookmark', tags: ['浏览器书签'] }),
    ];

    expect(searchSavedClips(clips, '', { filter: 'bookmark' })).toHaveLength(1);
    expect(searchSavedClips(clips, '', { filter: 'bookmark' })[0].title).toBe('浏览器书签');
    expect(searchSavedClips(clips, '', { filter: 'clip' })[0].title).toBe('剪藏文章');
  });

  test('可按浏览器书签原文件夹分类筛选', () => {
    const clips = [
      clip({ url: 'https://example.com/a', title: 'AI 工具', source: 'bookmark', folder: '书签栏 / 工作 / AI' }),
      clip({ url: 'https://example.com/b', title: '财务工具', source: 'bookmark', folder: '书签栏 / 工作 / 财务' }),
      clip({ url: 'https://example.com/c', title: '娱乐', source: 'bookmark', folder: '书签栏 / 生活' }),
    ];

    expect(searchSavedClips(clips, '', { filter: 'bookmark', folder: '书签栏 / 工作' }).map((item) => item.title)).toEqual([
      'AI 工具',
      '财务工具',
    ]);
    expect(searchSavedClips(clips, '', { filter: 'bookmark', folder: '书签栏 / 工作 / AI' })[0].title).toBe('AI 工具');
  });

  test('生成浏览器书签分类列表和数量', () => {
    const folders = getBookmarkFolders([
      clip({ source: 'bookmark', folder: '书签栏 / 工作 / AI' }),
      clip({ url: 'https://example.com/b', source: 'bookmark', folder: '书签栏 / 工作 / AI' }),
      clip({ url: 'https://example.com/c', source: 'bookmark', folder: '书签栏 / 生活' }),
      clip({ url: 'https://example.com/d', source: 'clip', folder: '书签栏 / 工作 / AI' }),
    ]);

    expect(folders).toEqual([
      { path: '书签栏', count: 3 },
      { path: '书签栏 / 工作', count: 2 },
      { path: '书签栏 / 工作 / AI', count: 2 },
      { path: '书签栏 / 生活', count: 1 },
    ]);
  });

  test('批量导入会去重并保留回访记录', async () => {
    await saveClipForRevisit(clip({ url: 'https://example.com/a', revived: 2, lastVisited: '2026-07-01T00:00:00.000Z' }));
    await saveClipsForRevisit([
      clip({ url: 'https://example.com/a', title: 'A imported', source: 'bookmark' }),
      clip({ url: 'https://example.com/b', title: 'B imported', source: 'bookmark' }),
    ]);

    const clips = await loadSavedClips();
    expect(clips).toHaveLength(2);
    expect(clips.find((item) => item.url === 'https://example.com/a')?.revived).toBe(2);
    expect(clips.find((item) => item.url === 'https://example.com/a')?.title).toBe('A imported');
  });

  test('可编辑收藏标题、分类、标签和备注', async () => {
    await saveClipForRevisit(clip({
      url: 'https://example.com/a',
      source: 'bookmark',
      folder: '书签栏 / 旧分类',
      tags: ['浏览器书签'],
    }));

    const updated = await updateSavedClip({
      url: 'https://example.com/a',
      title: '新标题',
      folder: '书签栏 / 工作 / AI',
      tags: ['浏览器书签', 'AI', 'AI'],
      why: '常用工具',
    });

    expect(updated).toMatchObject({
      title: '新标题',
      folder: '书签栏 / 工作 / AI',
      tags: ['浏览器书签', 'AI'],
      why: '常用工具',
    });
    expect(getBookmarkFolders(await loadSavedClips()).map((folder) => folder.path)).toContain('书签栏 / 工作 / AI');
  });

  test('可删除保存的收藏', async () => {
    await saveClipForRevisit(clip({ url: 'https://example.com/a', title: 'A' }));
    await saveClipForRevisit(clip({ url: 'https://example.com/b', title: 'B' }));

    await expect(deleteSavedClip({ url: 'https://example.com/a' })).resolves.toBe(true);
    await expect(loadSavedClips()).resolves.toMatchObject([
      { url: 'https://example.com/b', title: 'B' },
    ]);
    await expect(deleteSavedClip({ url: 'https://example.com/missing' })).resolves.toBe(false);
  });

  test('统计剪藏、书签、暂存和回访数量', () => {
    const stats = getSavedClipStats([
      clip({ source: 'clip', queued: true }),
      clip({ url: 'https://example.com/b', source: 'bookmark' }),
      clip({ url: 'https://example.com/c', source: 'bookmark', lastVisited: '2026-07-02T00:00:00.000Z' }),
    ]);

    expect(stats.total).toBe(3);
    expect(stats.clips).toBe(1);
    expect(stats.bookmarks).toBe(2);
    expect(stats.queued).toBe(1);
    expect(stats.unvisited).toBe(2);
    expect(stats.visited).toBe(1);
  });
});
