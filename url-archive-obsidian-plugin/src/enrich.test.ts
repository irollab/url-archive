import { describe, expect, test, vi } from 'vitest';
import { buildEnrichPrompt, enrichNoteContent, parseEnrichResult } from './enrich';

const note = { title: '标题', url: 'https://example.com/a', body: '正文快照内容' };
const settings = { chatBaseUrl: 'https://api.example.com/v1', chatApiKey: 'sk-test', chatModel: 'glm-5.2' };

describe('buildEnrichPrompt', () => {
  test('包含标题、URL 和正文', () => {
    const prompt = buildEnrichPrompt(note);
    expect(prompt).toContain('标题');
    expect(prompt).toContain('https://example.com/a');
    expect(prompt).toContain('正文快照内容');
  });

  test('正文超长时截断', () => {
    const prompt = buildEnrichPrompt({ ...note, body: 'x'.repeat(10000) });
    expect(prompt.length).toBeLessThan(10000);
  });
});

describe('parseEnrichResult', () => {
  test('解析标准 JSON', () => {
    const result = parseEnrichResult(JSON.stringify({
      summary: '摘要', highlights: ['h1', 'h2'], tags: ['t1'], keywords: ['k1'], aliases: ['a1'], intent: '场景',
    }));
    expect(result).toEqual({
      summary: '摘要', highlights: ['h1', 'h2'], tags: ['t1'], keywords: ['k1'], aliases: ['a1'], intent: '场景',
    });
  });

  test('解析包在 markdown 代码块里的 JSON', () => {
    const result = parseEnrichResult('```json\n{"summary":"摘要","tags":["t"]}\n```');
    expect(result.summary).toBe('摘要');
    expect(result.tags).toEqual(['t']);
  });

  test('支持中文键名和字符串标签', () => {
    const result = parseEnrichResult(JSON.stringify({
      摘要: '摘要', 要点: '要点一，要点二', 标签: 'AI、收藏', 关键词: '剪藏、知识管理',
      搜索别名: '稍后读', 回访场景: '整理收藏时回看',
    }));
    expect(result).toEqual({
      summary: '摘要', highlights: ['要点一', '要点二'], tags: ['AI', '收藏'],
      keywords: ['剪藏', '知识管理'], aliases: ['稍后读'], intent: '整理收藏时回看',
    });
  });

  test('无法解析时返回全空结果', () => {
    expect(parseEnrichResult('这不是 JSON')).toEqual({
      summary: '', highlights: [], tags: [], keywords: [], aliases: [], intent: '',
    });
  });
});

describe('enrichNoteContent', () => {
  test('用 jsonMode 调 chat 并返回解析结果', async () => {
    const chat = vi.fn().mockResolvedValue(JSON.stringify({ summary: '摘要', tags: ['t'] }));
    const result = await enrichNoteContent(note, settings, chat);
    expect(result.summary).toBe('摘要');
    const [, , opts] = chat.mock.calls[0];
    expect(opts).toMatchObject({ jsonMode: true });
    expect(opts.system).toContain('JSON');
  });

  test('AI 返回无有效内容时抛出可读错误', async () => {
    const chat = vi.fn().mockResolvedValue('{}');
    await expect(enrichNoteContent(note, settings, chat)).rejects.toThrow(/为空|格式/);
  });
});
