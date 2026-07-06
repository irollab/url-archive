import type { SemanticSearchHit, SemanticVector } from './semantic-index';
import { searchSemanticIndex } from './semantic-index';
import type { UrlArchiveEntry } from './archive-index';

export function buildCurrentNoteQuery(path: string, content: string): string {
  return [
    `当前笔记: ${path}`,
    content.replace(/\s+/g, ' ').trim().slice(0, 4000),
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
