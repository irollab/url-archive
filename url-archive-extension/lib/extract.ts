import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface ExtractResult {
  title: string;
  contentMarkdown: string;
  selection: string;
}

const SPECULATIVE_RESOURCE_RELS = new Set([
  'preload',
  'modulepreload',
  'prefetch',
  'preconnect',
  'dns-prefetch',
]);

export function removeSpeculativeResourceHints(doc: Document): void {
  doc.querySelectorAll<HTMLLinkElement>('link[rel]').forEach((link) => {
    const relTokens = link.relList.length
      ? Array.from(link.relList)
      : link.rel.split(/\s+/).filter(Boolean);

    if (relTokens.some((rel) => SPECULATIVE_RESOURCE_RELS.has(rel.toLowerCase()))) {
      link.remove();
    }
  });
}

export function extractArticle(doc: Document): ExtractResult {
  const selection = doc.getSelection?.()?.toString() ?? '';

  // Readability 会修改传入的 DOM，故克隆后解析
  const clone = doc.cloneNode(true) as Document;
  removeSpeculativeResourceHints(clone);
  const article = new Readability(clone).parse();

  const turndown = new TurndownService({ headingStyle: 'atx' });
  const contentMarkdown = article?.content ? turndown.turndown(article.content) : '';

  return {
    title: article?.title || doc.title,
    contentMarkdown,
    selection,
  };
}
