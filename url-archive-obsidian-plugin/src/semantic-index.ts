import type { UrlArchiveEntry } from './archive-index';

export interface SemanticVector {
  path: string;
  embedding: number[];
  indexedAt: string;
  /** 生成该向量时 embedding 文本的哈希，用于增量索引探测内容是否变化 */
  hash?: string;
}

export interface SemanticSearchHit {
  entry: UrlArchiveEntry;
  score: number;
}

export interface SemanticIndexTask {
  entry: UrlArchiveEntry;
  text: string;
  hash: string;
}

export interface SemanticIndexPlan {
  /** 内容未变、可直接复用的旧向量 */
  reuse: SemanticVector[];
  /** 新增或内容已变、需要（重新）嵌入的条目 */
  tasks: SemanticIndexTask[];
  /** 已删除条目对应、将被丢弃的旧向量数 */
  removed: number;
}

/** FNV-1a 32 位哈希：稳定、无需 crypto，用于探测 embedding 文本是否变化 */
export function hashEmbeddingText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * 规划一次增量语义索引：对比现有向量，决定哪些复用、哪些需重嵌、哪些是被删除的残留。
 * 纯函数，不触发任何 API，便于单测与在 UI 中预估待索引数量。
 */
export function planSemanticIndex(
  entries: UrlArchiveEntry[],
  existing: SemanticVector[],
): SemanticIndexPlan {
  const existingByPath = new Map(existing.map((vector) => [vector.path, vector]));
  const reuse: SemanticVector[] = [];
  const tasks: SemanticIndexTask[] = [];
  const livePaths = new Set<string>();

  for (const entry of entries) {
    const text = buildEmbeddingText(entry);
    if (!text.trim()) continue;
    livePaths.add(entry.path);
    const hash = hashEmbeddingText(text);
    const prev = existingByPath.get(entry.path);
    if (prev && prev.hash === hash && prev.embedding.length) {
      reuse.push(prev);
    } else {
      tasks.push({ entry, text, hash });
    }
  }

  const removed = existing.filter((vector) => !livePaths.has(vector.path)).length;
  return { reuse, tasks, removed };
}

/** 移除指定 path 的向量；无匹配时返回原数组引用（便于调用方判断是否需要持久化） */
export function removeVectorForPath(vectors: SemanticVector[], path: string): SemanticVector[] {
  if (!vectors.some((vector) => vector.path === path)) return vectors;
  return vectors.filter((vector) => vector.path !== path);
}

/** 把 oldPath 的向量改名为 newPath（保留 embedding/hash，改名无需重嵌）；无匹配返回原引用 */
export function renameVectorPath(
  vectors: SemanticVector[],
  oldPath: string,
  newPath: string,
): SemanticVector[] {
  if (!vectors.some((vector) => vector.path === oldPath)) return vectors;
  return vectors.map((vector) => (vector.path === oldPath ? { ...vector, path: newPath } : vector));
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
