import { describe, expect, test } from 'vitest';
import { buildCurrentNoteQuery, relatedHitsForCurrentNote } from './related';
import type { UrlArchiveEntry } from './archive-index';

function entry(path: string): UrlArchiveEntry {
  return {
    path,
    url: `https://example.com/${path}`,
    title: path,
    domain: 'example.com',
    clipped: '2026-07-02',
    summary: '',
    tags: [],
    keywords: [],
    aliases: [],
    intent: '',
    why: '',
    status: 'unread',
    revived: 0,
    lastVisited: '',
  };
}

describe('related', () => {
  test('builds a bounded query from current note content', () => {
    const query = buildCurrentNoteQuery('Notes/a.md', 'hello\n\nworld');
    expect(query).toContain('当前笔记: Notes/a.md');
    expect(query).toContain('hello world');
  });

  test('filters out the current file from related hits', () => {
    const hits = relatedHitsForCurrentNote([
      entry('current.md'),
      entry('related.md'),
    ], [
      { path: 'current.md', embedding: [1, 0], indexedAt: 'now' },
      { path: 'related.md', embedding: [0.9, 0.1], indexedAt: 'now' },
    ], [1, 0], 'current.md');

    expect(hits.map((hit) => hit.entry.path)).toEqual(['related.md']);
  });
});
