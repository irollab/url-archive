// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { extractArticle } from './extract';

describe('extractArticle', () => {
  test('从文档提取标题与正文 markdown', () => {
    document.body.innerHTML = `
      <article>
        <h1>测试标题</h1>
        <p>这是第一段正文，需要足够长才能被 Readability 当成正文识别出来，所以多写一些内容凑够长度阈值。</p>
        <p>这是第二段正文，同样需要足够的字数来保证算法不会把它当作噪音过滤掉，继续补充文字。</p>
      </article>`;
    document.title = '页面标题';

    const result = extractArticle(document);
    expect(result.contentMarkdown).toContain('第一段正文');
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.selection).toBe('');
  });
});
