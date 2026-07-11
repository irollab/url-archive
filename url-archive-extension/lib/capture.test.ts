import { describe, test, expect, vi } from 'vitest';
import { captureClipFast, enrichAndRewrite } from './capture';
import type { ClipData, Settings, AIResult, QueueItem } from './types';
import { VaultWriteError, type VaultWriter } from './vault';

const settings: Settings = {
  llmBaseUrl: 'x', llmApiKey: 'x', llmModel: 'x',
  vaultTarget: 'restApi',
  restApiUrl: 'x', restApiToken: 'x',
  officialApiUrl: 'x', officialApiToken: 'x',
  vaultFolder: 'URL Archive',
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

describe('captureClipFast（Phase A：秒级写入，不调 AI）', () => {
  test('写入占位笔记：ai_pending=true、summary 为空、不调 enrich', async () => {
    const writer = fakeWriter();
    const queue = fakeQueue();

    const result = await captureClipFast(clip, '我的意图', settings, { writer, queue });

    expect(result.written).toBe(true);
    expect(writer.written).toHaveLength(1);
    expect(writer.written[0].path).toMatch(/^URL Archive\/example\.com-a-[a-f0-9]+\.md$/);
    expect(writer.written[0].content).toContain('ai_pending: true');
    expect(writer.written[0].content).toContain('AI 摘要待补');
    expect(writer.written[0].content).toContain('我的意图');
    expect(writer.written[0].content).toContain('canonical_url: https://example.com/a');
    expect(result.savedClip).toMatchObject({
      url: clip.url,
      canonicalUrl: 'https://example.com/a',
      title: clip.title,
      queued: false,
      revived: 0,
      summary: '',
    });
    expect(queue.items).toHaveLength(0);
  });

  test('可重试写入失败：入队，written=false、savedClip.queued=true', async () => {
    const writer = fakeWriter(async () => { throw new Error('offline'); });
    const queue = fakeQueue();

    const result = await captureClipFast(clip, '', settings, { writer, queue });

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

    await expect(captureClipFast(clip, '', settings, { writer, queue })).rejects.toThrow('401');
    expect(queue.items).toHaveLength(0);
  });
});

describe('enrichAndRewrite（Phase B：后台补 AI 覆盖写）', () => {
  test('成功：调 AI、覆盖写 ai_pending=false 且含摘要，savedClip 带 AI 字段', async () => {
    const writer = fakeWriter();
    const queue = fakeQueue();
    const enrich = vi.fn().mockResolvedValue(aiOk);

    const result = await enrichAndRewrite(clip, '我的意图', settings, { enrich, writer, queue });

    expect(enrich).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.written).toBe(true);
    expect(writer.written[0].content).toContain('ai_pending: false');
    expect(writer.written[0].content).toContain('summary: 摘要');
    expect(writer.written[0].content).toContain('财务自动化');
    expect(result!.savedClip).toMatchObject({
      summary: '摘要',
      keywords: ['财务自动化'],
      aliases: ['智能记账工具'],
      intent: '寻找财务 SaaS 时回看',
      queued: false,
    });
  });

  test('覆盖写命中同一路径（与 Phase A 一致），不产生重复文件', async () => {
    const writer = fakeWriter();
    const queue = fakeQueue();
    const fast = await captureClipFast(clip, '', settings, { writer, queue });
    const enrich = vi.fn().mockResolvedValue(aiOk);

    const enriched = await enrichAndRewrite(clip, '', settings, { enrich, writer, queue });

    expect(enriched!.path).toBe(fast.path);
    expect(writer.written[0].path).toBe(writer.written[1].path);
  });

  test('enrich 失败：抛出真实错误，不重写（保留占位笔记）', async () => {
    const writer = fakeWriter();
    const queue = fakeQueue();
    const enrich = vi.fn().mockRejectedValue(new Error('LLM timeout'));

    await expect(enrichAndRewrite(clip, '', settings, { enrich, writer, queue }))
      .rejects.toThrow('LLM timeout');
    expect(writer.written).toHaveLength(0);
    expect(queue.items).toHaveLength(0);
  });
});
