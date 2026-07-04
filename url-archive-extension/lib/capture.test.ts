import { describe, test, expect, vi } from 'vitest';
import { captureClip } from './capture';
import type { ClipData, Settings, AIResult, QueueItem } from './types';
import type { VaultWriter } from './vault';

const settings: Settings = {
  llmBaseUrl: 'x', llmApiKey: 'x', llmModel: 'x',
  restApiUrl: 'x', restApiToken: 'x', vaultFolder: 'URL Archive',
};

const clip: ClipData = {
  url: 'https://example.com/a',
  title: '标题',
  selection: '',
  contentMarkdown: '正文',
  clippedAt: '2026-06-23T14:30:00',
};

const aiOk: AIResult = { summary: '摘要', highlights: ['h'], tags: ['t'] };

function fakeWriter(impl?: () => Promise<void>): VaultWriter & { written: { path: string; content: string }[] } {
  const written: { path: string; content: string }[] = [];
  return {
    written,
    async write(path, content) {
      if (impl) await impl();
      written.push({ path, content });
    },
  };
}

function fakeQueue() {
  const items: QueueItem[] = [];
  return {
    items,
    enqueue: async (i: QueueItem) => { items.push(i); },
    getAll: async () => items,
    remove: async () => {},
  };
}

describe('captureClip', () => {
  test('成功路径：调 AI、写入 vault、written=true', async () => {
    const writer = fakeWriter();
    const queue = fakeQueue();
    const enrich = vi.fn().mockResolvedValue(aiOk);

    const result = await captureClip(clip, '我的意图', settings, { enrich, writer, queue });

    expect(result.written).toBe(true);
    expect(writer.written).toHaveLength(1);
    expect(writer.written[0].path).toBe('URL Archive/example.com-标题-2026-06-23.md');
    expect(writer.written[0].content).toContain('summary: 摘要');
    expect(writer.written[0].content).toContain('我的意图');
    expect(writer.written[0].content).toContain('ai_pending: false');
    expect(queue.items).toHaveLength(0);
  });

  test('AI 失败：仍写入，标记 ai_pending=true，summary 为空', async () => {
    const writer = fakeWriter();
    const queue = fakeQueue();
    const enrich = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await captureClip(clip, '', settings, { enrich, writer, queue });

    expect(result.written).toBe(true);
    expect(writer.written[0].content).toContain('ai_pending: true');
    expect(writer.written[0].content).toContain('AI 摘要待补');
  });

  test('写入失败：入队，written=false', async () => {
    const writer = fakeWriter(async () => { throw new Error('offline'); });
    const queue = fakeQueue();
    const enrich = vi.fn().mockResolvedValue(aiOk);

    const result = await captureClip(clip, '', settings, { enrich, writer, queue });

    expect(result.written).toBe(false);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].path).toBe('URL Archive/example.com-标题-2026-06-23.md');
  });
});
