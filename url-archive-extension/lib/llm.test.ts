import { describe, test, expect, vi } from 'vitest';
import { enrichClip } from './llm';
import type { ClipData, Settings } from './types';

const settings: Settings = {
  llmBaseUrl: 'https://api.example.com/v1',
  llmApiKey: 'sk-test',
  llmModel: 'test-model',
  restApiUrl: '',
  restApiToken: '',
  vaultFolder: '',
};

const clip: ClipData = {
  url: 'https://example.com/a',
  title: '标题',
  selection: '',
  contentMarkdown: '正文',
  clippedAt: '2026-06-23T00:00:00',
};

function mockFetchReturning(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response);
}

function mockFetchReturningData(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  } as Response);
}

describe('enrichClip', () => {
  test('解析 LLM 返回的 JSON 为 AIResult', async () => {
    const fetchFn = mockFetchReturning(
      JSON.stringify({ summary: '摘要', highlights: ['h1'], tags: ['t1'] }),
    );
    const result = await enrichClip(clip, settings, fetchFn);
    expect(result).toEqual({
      summary: '摘要',
      highlights: ['h1'],
      tags: ['t1'],
      keywords: [],
      aliases: [],
      intent: '',
    });
  });

  test('用正确的 URL、Bearer 头和模型发请求', async () => {
    const fetchFn = mockFetchReturning(JSON.stringify({ summary: '摘要', highlights: [], tags: [] }));
    await enrichClip({
      ...clip,
    }, { ...settings, llmBaseUrl: 'https://api.example.com/v1/chat/completions', llmApiKey: ' Bearer sk-test ' }, fetchFn);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string).model).toBe('test-model');
  });

  test('缺少 AI 配置时直接抛出可读错误', async () => {
    await expect(enrichClip(clip, { ...settings, llmApiKey: '' })).rejects.toThrow('未配置 AI API Key');
  });

  test('支持解析包在 markdown 代码块里的 JSON', async () => {
    const fetchFn = mockFetchReturning('```json\n{"summary":"摘要","highlights":["h"],"tags":["t"]}\n```');
    const result = await enrichClip(clip, settings, fetchFn);
    expect(result).toEqual({
      summary: '摘要',
      highlights: ['h'],
      tags: ['t'],
      keywords: [],
      aliases: [],
      intent: '',
    });
  });

  test('支持中文键名和字符串标签', async () => {
    const fetchFn = mockFetchReturning(JSON.stringify({
      摘要: '摘要',
      要点: '要点一，要点二',
      标签: 'AI、收藏',
      关键词: '网页剪藏、知识管理',
      搜索别名: '稍后读、浏览器收藏',
      回访场景: '查找收藏管理方案时回看',
    }));
    const result = await enrichClip(clip, settings, fetchFn);
    expect(result).toEqual({
      summary: '摘要',
      highlights: ['要点一', '要点二'],
      tags: ['AI', '收藏'],
      keywords: ['网页剪藏', '知识管理'],
      aliases: ['稍后读', '浏览器收藏'],
      intent: '查找收藏管理方案时回看',
    });
  });

  test('支持 Responses API 风格 output_text', async () => {
    const fetchFn = mockFetchReturningData({
      output_text: JSON.stringify({ summary: '摘要', highlights: ['h'], tags: ['t'] }),
    });
    const result = await enrichClip(clip, settings, fetchFn);
    expect(result.summary).toBe('摘要');
  });

  test('字段缺失时抛出可读错误', async () => {
    const fetchFn = mockFetchReturning('{}');
    await expect(enrichClip(clip, settings, fetchFn)).rejects.toThrow('LLM 返回为空或格式不符合要求');
  });

  test('识别供应商包在 200 响应里的业务错误', async () => {
    const fetchFn = mockFetchReturningData({ code: 500, msg: '404 NOT_FOUND', success: false });
    await expect(enrichClip(clip, settings, fetchFn)).rejects.toThrow('LLM 服务返回错误：500: 404 NOT_FOUND');
  });

  test('HTTP 非 2xx 抛错', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(enrichClip(clip, settings, fetchFn)).rejects.toThrow('LLM 请求失败');
  });
});
