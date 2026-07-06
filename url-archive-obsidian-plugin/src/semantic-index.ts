import type { UrlArchiveEntry } from './archive-index';

export interface SemanticVector {
  path: string;
  embedding: number[];
  indexedAt: string;
}

export interface SemanticSearchHit {
  entry: UrlArchiveEntry;
  score: number;
}

export function buildEmbeddingText(entry: UrlArchiveEntry): string {
  return [
    entry.title,
    entry.summary,
    entry.tags.join(' '),
    entry.keywords.join(' '),
    entry.aliases.join(' '),
    entry.intent,
    entry.why,
    entry.domain,
    entry.url,
  ].filter(Boolean).join('\n');
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function searchSemanticIndex(
  entries: UrlArchiveEntry[],
  vectors: SemanticVector[],
  queryEmbedding: number[],
  limit = 10,
): SemanticSearchHit[] {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  return vectors
    .map((vector) => {
      const entry = byPath.get(vector.path);
      if (!entry) return null;
      return { entry, score: cosineSimilarity(queryEmbedding, vector.embedding) };
    })
    .filter((hit): hit is SemanticSearchHit => hit !== null && hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
