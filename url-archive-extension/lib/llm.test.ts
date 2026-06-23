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

describe('enrichClip', () => {
  test('解析 LLM 返回的 JSON 为 AIResult', async () => {
    const fetchFn = mockFetchReturning(
      JSON.stringify({ summary: '摘要', highlights: ['h1'], tags: ['t1'] }),
    );
    const result = await enrichClip(clip, settings, fetchFn);
    expect(result).toEqual({ summary: '摘要', highlights: ['h1'], tags: ['t1'] });
  });

  test('用正确的 URL、Bearer 头和模型发请求', async () => {
    const fetchFn = mockFetchReturning('{}');
    await enrichClip(clip, settings, fetchFn);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string).model).toBe('test-model');
  });

  test('字段缺失时给安全默认值', async () => {
    const fetchFn = mockFetchReturning('{}');
    const result = await enrichClip(clip, settings, fetchFn);
    expect(result).toEqual({ summary: '', highlights: [], tags: [] });
  });

  test('HTTP 非 2xx 抛错', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(enrichClip(clip, settings, fetchFn)).rejects.toThrow('LLM 请求失败');
  });
});
