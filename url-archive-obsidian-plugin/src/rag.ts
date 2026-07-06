import type { SemanticSearchHit } from './semantic-index';

export interface RagSource {
  path: string;
  title: string;
  url: string;
  summary: string;
  score: number;
}

export interface RagContext {
  prompt: string;
  sources: RagSource[];
}

export function buildRagContext(question: string, hits: SemanticSearchHit[], limit = 5): RagContext {
  const sources = hits.slice(0, limit).map((hit) => ({
    path: hit.entry.path,
    title: hit.entry.title,
    url: hit.entry.url,
    summary: hit.entry.summary,
    score: hit.score,
  }));

  const context = hits.slice(0, limit).map((hit, index) => {
    const entry = hit.entry;
    return [
      `来源 ${index + 1}: [[${entry.path}]]`,
      `标题: ${entry.title}`,
      `URL: ${entry.url}`,
      `摘要: ${entry.summary}`,
      `标签: ${entry.tags.join(', ')}`,
      `关键词: ${entry.keywords.join(', ')}`,
      `别名: ${entry.aliases.join(', ')}`,
      `回访场景: ${entry.intent}`,
      `备注: ${entry.why}`,
    ].join('\n');
  }).join('\n\n');

  return {
    sources,
    prompt: [
      '你是 URL Archive 私人收藏助手。只根据给定收藏来源回答用户问题。',
      '回答必须使用简体中文，并在相关句子后引用来源，格式为 [[URL Archive/xxx.md]]。',
      '如果来源不足以回答，直接说明没有足够依据，并列出最相关来源。',
      '',
      `用户问题: ${question}`,
      '',
      '可用来源:',
      context || '无',
    ].join('\n'),
  };
}
