import { describe, expect, test } from 'vitest';
import {
  buildEmbeddingText,
  cosineSimilarity,
  hashEmbeddingText,
  planSemanticIndex,
  removeVectorForPath,
  renameVectorPath,
  searchSemanticIndex,
  type SemanticVector,
} from './semantic-index';
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

describe('incremental semantic index planning', () => {
  test('hash is stable for same text and differs on change', () => {
    expect(hashEmbeddingText('hello')).toBe(hashEmbeddingText('hello'));
    expect(hashEmbeddingText('hello')).not.toBe(hashEmbeddingText('hell0'));
  });

  test('reuses vectors whose content hash is unchanged, re-embeds changed ones', () => {
    const a = entry('a.md', 'A');
    const b = entry('b.md', 'B');
    const existing: SemanticVector[] = [
      { path: 'a.md', embedding: [1, 0], indexedAt: 'now', hash: hashEmbeddingText(buildEmbeddingText(a)) },
      { path: 'b.md', embedding: [0, 1], indexedAt: 'now', hash: 'stale-hash' },
    ];

    const plan = planSemanticIndex([a, b], existing);

    expect(plan.reuse.map((v) => v.path)).toEqual(['a.md']);
    expect(plan.tasks.map((t) => t.entry.path)).toEqual(['b.md']);
    expect(plan.removed).toBe(0);
  });

  test('treats legacy vectors without hash as needing re-embed', () => {
    const a = entry('a.md', 'A');
    const existing: SemanticVector[] = [{ path: 'a.md', embedding: [1, 0], indexedAt: 'now' }];

    const plan = planSemanticIndex([a], existing);

    expect(plan.reuse).toHaveLength(0);
    expect(plan.tasks.map((t) => t.entry.path)).toEqual(['a.md']);
  });

  test('counts vectors of deleted entries as removed', () => {
    const a = entry('a.md', 'A');
    const existing: SemanticVector[] = [
      { path: 'a.md', embedding: [1, 0], indexedAt: 'now', hash: hashEmbeddingText(buildEmbeddingText(a)) },
      { path: 'gone.md', embedding: [0, 1], indexedAt: 'now', hash: 'x' },
    ];

    const plan = planSemanticIndex([a], existing);

    expect(plan.reuse.map((v) => v.path)).toEqual(['a.md']);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.removed).toBe(1);
  });
});

describe('removeVectorForPath', () => {
  const vectors: SemanticVector[] = [
    { path: 'a.md', embedding: [1, 0], indexedAt: 'now' },
    { path: 'b.md', embedding: [0, 1], indexedAt: 'now' },
  ];

  test('移除匹配 path 的向量', () => {
    const next = removeVectorForPath(vectors, 'a.md');
    expect(next.map((v) => v.path)).toEqual(['b.md']);
  });

  test('无匹配时返回原数组引用（便于跳过写盘）', () => {
    const next = removeVectorForPath(vectors, 'missing.md');
    expect(next).toBe(vectors);
  });
});

describe('renameVectorPath', () => {
  const vectors: SemanticVector[] = [
    { path: 'old.md', embedding: [1, 0], indexedAt: 'now', hash: 'h1' },
    { path: 'b.md', embedding: [0, 1], indexedAt: 'now', hash: 'h2' },
  ];

  test('把 oldPath 向量改名为 newPath，保留 embedding/hash', () => {
    const next = renameVectorPath(vectors, 'old.md', 'new.md');
    const renamed = next.find((v) => v.path === 'new.md');
    expect(renamed).toBeDefined();
    expect(renamed?.embedding).toEqual([1, 0]);
    expect(renamed?.hash).toBe('h1');
    expect(next.some((v) => v.path === 'old.md')).toBe(false);
  });

  test('无匹配时返回原数组引用', () => {
    const next = renameVectorPath(vectors, 'missing.md', 'x.md');
    expect(next).toBe(vectors);
  });
});
