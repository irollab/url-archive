import type { SemanticSearchHit, SemanticVector } from './semantic-index';
import { searchSemanticIndex } from './semantic-index';
import type { UrlArchiveEntry } from './archive-index';

// embedding 接口对单次输入有 token 上限，正文快照类笔记很长，这里截断到较安全的长度
const MAX_QUERY_CHARS = 2000;

export function buildCurrentNoteQuery(path: string, content: string): string {
  return [
    `当前笔记: ${path}`,
    content.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS),
  ].filter(Boolean).join('\n');
}

export function relatedHitsForCurrentNote(
  entries: UrlArchiveEntry[],
  vectors: SemanticVector[],
  queryEmbedding: number[],
  currentPath: string,
  limit = 5,
): SemanticSearchHit[] {
  return searchSemanticIndex(entries, vectors, queryEmbedding, limit + 3)
    .filter((hit) => hit.entry.path !== currentPath)
    .slice(0, limit);
}
