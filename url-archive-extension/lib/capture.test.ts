import { describe, test, expect, vi } from 'vitest';
import { captureClip } from './capture';
import type { ClipData, Settings, AIResult, QueueItem } from './types';
import { VaultWriteError, type VaultWriter } from './vault';

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

const aiOk: AIResult = {
  summary: '摘要',
  highlights: ['h'],
  tags: ['t'],
  keywords: ['财务自动化'],
  aliases: ['智能记账工具'],
  intent: '寻找财务 SaaS 时回看',
};

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
    expect(result.savedClip).toMatchObject({
      url: clip.url,
      canonicalUrl: 'https://example.com/a',
      title: clip.title,
      queued: false,
      revived: 0,
      keywords: ['财务自动化'],
      aliases: ['智能记账工具'],
      intent: '寻找财务 SaaS 时回看',
    });
    expect(writer.written[0].path).toMatch(/^URL Archive\/example\.com-a-[a-f0-9]+\.md$/);
    expect(writer.written[0].content).toContain('canonical_url: https://example.com/a');
    expect(writer.written[0].content).toContain('summary: 摘要');
    expect(writer.written[0].content).toContain('财务自动化');
    expect(writer.written[0].content).toContain('智能记账工具');
    expect(writer.written[0].content).toContain('寻找财务 SaaS 时回看');
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

  test('可重试写入失败：入队，written=false', async () => {
    const writer = fakeWriter(async () => { throw new Error('offline'); });
    const queue = fakeQueue();
    const enrich = vi.fn().mockResolvedValue(aiOk);

    const result = await captureClip(clip, '', settings, { enrich, writer, queue });

    expect(result.written).toBe(false);
    expect(result.queuedReason).toBe('offline');
    expect(result.savedClip.queued).toBe(true);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].path).toMatch(/^URL Archive\/example\.com-a-[a-f0-9]+\.md$/);
  });

  test('不可重试写入失败：抛出错误且不入队', async () => {
    const writer = fakeWriter(async () => {
      throw new VaultWriteError('写入 vault 失败: 401', false);
    });
    const queue = fakeQueue();
    const enrich = vi.fn().mockResolvedValue(aiOk);

    await expect(captureClip(clip, '', settings, { enrich, writer, queue })).rejects.toThrow('401');
    expect(queue.items).toHaveLength(0);
  });
});
