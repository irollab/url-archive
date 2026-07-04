import { describe, test, expect } from 'vitest';
import { canonicalizeUrl, serializeNote, slugify, generateFilename } from './markdown';
import type { ClippedNote } from './types';

const baseNote: ClippedNote = {
  url: 'https://example.com/article',
  canonicalUrl: 'https://example.com/article',
  title: '一篇关于动画库的文章',
  clipped: '2026-06-23T14:30:00',
  domain: 'example.com',
  summary: 'AI 生成的一句话摘要',
  tags: ['前端', '动画库'],
  keywords: ['动效选型', '前端组件'],
  aliases: ['动画方案', '落地页动效'],
  intent: '做落地页技术选型时回看',
  why: '做落地页选型用',
  status: 'unread',
  revived: 0,
  lastVisited: '',
  aiPending: false,
  highlights: ['要点一', '要点二'],
  contentMarkdown: '# 正文标题\n\n正文内容',
};

describe('serializeNote', () => {
  test('包含 frontmatter、速览、备注、正文快照四块', () => {
    const md = serializeNote(baseNote);
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('url: https://example.com/article');
    expect(md).toContain('canonical_url: https://example.com/article');
    expect(md).toContain('summary: AI 生成的一句话摘要');
    expect(md).toContain('keywords:');
    expect(md).toContain('aliases:');
    expect(md).toContain('intent: 做落地页技术选型时回看');
    expect(md).toContain('last_visited: null');
    expect(md).toContain('ai_pending: false');
    expect(md).toContain('> [!summary] 速览');
    expect(md).toContain('> 要点一');
    expect(md).toContain('## 我的备注');
    expect(md).toContain('做落地页选型用');
    expect(md).toContain('## 正文快照');
    expect(md).toContain('正文内容');
  });

  test('highlights 为空时给占位文案', () => {
    const md = serializeNote({ ...baseNote, highlights: [] });
    expect(md).toContain('AI 摘要待补');
  });
});

describe('slugify', () => {
  test('保留中英文数字，其余转连字符', () => {
    expect(slugify('Hello World! 动画库')).toBe('hello-world-动画库');
  });

  test('纯符号返回空串', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('generateFilename', () => {
  test('文件名包含规范化 URL 的稳定哈希，不随剪藏日期变化', () => {
    expect(generateFilename(baseNote)).toBe(generateFilename({
      ...baseNote,
      clipped: '2026-07-03T14:30:00',
    }));
  });

  test('文件名不依赖标题变化', () => {
    expect(generateFilename({ ...baseNote, title: '' })).toBe(generateFilename({
      ...baseNote,
      title: '另一个标题',
    }));
    expect(generateFilename(baseNote)).toMatch(/^example\.com-article-[a-f0-9]+\.md$/);
  });
});

describe('canonicalizeUrl', () => {
  test('去掉 hash、追踪参数并排序查询参数', () => {
    expect(canonicalizeUrl('HTTPS://Example.com/a/?b=2&utm_source=x&a=1#top')).toBe(
      'https://example.com/a?a=1&b=2',
    );
  });
});
