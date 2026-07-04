import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface ExtractResult {
  title: string;
  contentMarkdown: string;
  selection: string;
}

export function extractArticle(doc: Document): ExtractResult {
  const selection = doc.getSelection?.()?.toString() ?? '';

  // Readability 会修改传入的 DOM，故克隆后解析
  const clone = doc.cloneNode(true) as Document;
  const article = new Readability(clone).parse();

  const turndown = new TurndownService({ headingStyle: 'atx' });
  const contentMarkdown = article?.content ? turndown.turndown(article.content) : '';

  return {
    title: article?.title || doc.title,
    contentMarkdown,
    selection,
  };
}
