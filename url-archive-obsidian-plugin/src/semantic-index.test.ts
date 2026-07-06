import { describe, expect, test } from 'vitest';
import { buildEmbeddingText, cosineSimilarity, searchSemanticIndex } from './semantic-index';
import type { UrlArchiveEntry } from './archive-index';

function entry(path: string, title: string): UrlArchiveEntry {
  return {
    path,
    title,
    url: `https://example.com/${path}`,
    domain: 'example.com',
    clipped: '2026-07-02',
    summary: '摘要',
    tags: ['标签'],
    keywords: ['关键词'],
    aliases: ['别名'],
    intent: '回访场景',
    why: '备注',
    status: 'unread',
    revived: 0,
    lastVisited: '',
  };
}

describe('semantic index', () => {
  test('builds rich embedding text from recall fields', () => {
    const text = buildEmbeddingText(entry('a.md', '标题'));
    expect(text).toContain('标题');
    expect(text).toContain('关键词');
    expect(text).toContain('回访场景');
  });

  test('computes cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test('searches by vector similarity', () => {
    const entries = [entry('a.md', 'A'), entry('b.md', 'B')];
    const hits = searchSemanticIndex(entries, [
      { path: 'a.md', embedding: [1, 0], indexedAt: 'now' },
      { path: 'b.md', embedding: [0, 1], indexedAt: 'now' },
    ], [0.9, 0.1]);

    expect(hits[0].entry.path).toBe('a.md');
  });
});
