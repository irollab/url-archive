// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, test, expect, beforeEach } from 'vitest';
import { ClipQueue } from './queue';

describe('ClipQueue', () => {
  let queue: ClipQueue;

  beforeEach(async () => {
    queue = new ClipQueue('test-db-' + Math.random());
  });

  test('入队后能取出全部', async () => {
    await queue.enqueue({ path: 'a.md', content: 'A', enqueuedAt: '2026-06-23T00:00:00' });
    await queue.enqueue({ path: 'b.md', content: 'B', enqueuedAt: '2026-06-23T00:00:01' });
    const all = await queue.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].path).toBe('a.md');
    expect(all[0].id).toBeTypeOf('number');
  });

  test('按 id 移除', async () => {
    await queue.enqueue({ path: 'a.md', content: 'A', enqueuedAt: '2026-06-23T00:00:00' });
    const [item] = await queue.getAll();
    await queue.remove(item.id!);
    expect(await queue.getAll()).toHaveLength(0);
  });

  test('同 path 去重：新入队项覆盖旧项', async () => {
    await queue.enqueue({ path: 'a.md', content: 'A1', enqueuedAt: '2026-06-23T00:00:00' });
    await queue.enqueue({ path: 'a.md', content: 'A2', enqueuedAt: '2026-06-23T00:00:01' });
    const all = await queue.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].content).toBe('A2');
  });
});
