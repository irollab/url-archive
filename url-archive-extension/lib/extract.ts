import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

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
  // GFM 插件补齐表格、删除线、任务列表（Turndown 默认不支持）
  turndown.use(gfm);
  // 丢弃无文字内容且不含图片的空锚点（如 GitHub 标题旁的永久链接图标），
  // 否则会被转成 `[](url)` 污染正文
  turndown.addRule('stripEmptyAnchor', {
    filter: (node) =>
      node.nodeName === 'A' &&
      !!node.getAttribute('href') &&
      node.textContent?.trim() === '' &&
      !node.querySelector('img'),
    replacement: () => '',
  });
  const contentMarkdown = article?.content ? turndown.turndown(article.content) : '';

  return {
    title: article?.title || doc.title,
    contentMarkdown,
    selection,
  };
}
