import { describe, test, expect } from 'vitest';
import { serializeNote, slugify, generateFilename } from './markdown';
import type { ClippedNote } from './types';

const baseNote: ClippedNote = {
  url: 'https://example.com/article',
  title: '一篇关于动画库的文章',
  clipped: '2026-06-23T14:30:00',
  domain: 'example.com',
  summary: 'AI 生成的一句话摘要',
  tags: ['前端', '动画库'],
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
    expect(md).toContain('summary: AI 生成的一句话摘要');
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
});

describe('generateFilename', () => {
  test('格式为 domain-slug-日期.md', () => {
    expect(generateFilename(baseNote)).toBe(
      'example.com-一篇关于动画库的文章-2026-06-23.md',
    );
  });
});
