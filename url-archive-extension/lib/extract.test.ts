// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { extractArticle, removeSpeculativeResourceHints } from './extract';

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

  test('将数据表格转成 GFM markdown 表格', () => {
    document.body.innerHTML = `
      <article>
        <h1>表格文章</h1>
        <p>下面是一张需要保留的数据表格，正文需要足够长才能被 Readability 识别为文章主体，所以补充一些描述性文字。</p>
        <table>
          <thead><tr><th>名称</th><th>职责</th></tr></thead>
          <tbody>
            <tr><td>extract</td><td>提取正文</td></tr>
            <tr><td>markdown</td><td>序列化笔记</td></tr>
          </tbody>
        </table>
        <p>表格上下都需要正文段落，继续补充文字以确保算法把这段内容当作真正的文章正文处理。</p>
      </article>`;
    document.title = '页面标题';

    const result = extractArticle(document);

    expect(result.contentMarkdown).toContain('| 名称 | 职责 |');
    expect(result.contentMarkdown).toContain('| --- | --- |');
    expect(result.contentMarkdown).toContain('| extract | 提取正文 |');
  });

  test('丢弃无文字内容的空锚点（如 GitHub 标题永久链接图标）', () => {
    // GitHub 新版渲染：锚点是标题的兄弟节点（包在 .markdown-heading 里），而非子节点
    document.body.innerHTML = `
      <article>
        <div class="markdown-heading">
          <h2 class="heading-element">这是什么</h2>
          <a id="user-content-sec" class="anchor" aria-label="Permalink: 这是什么" href="#sec"><svg aria-hidden="true" class="octicon octicon-link"></svg></a>
        </div>
        <p>正文需要足够长才能被 Readability 识别为文章主体，所以在这里补充一些描述性的文字内容凑够长度阈值。</p>
        <p>再补一段正文，保证算法不会把这些内容当作噪音过滤掉，从而稳定复现标题锚点的场景。</p>
      </article>`;
    document.title = '页面标题';

    const result = extractArticle(document);

    expect(result.contentMarkdown).toContain('这是什么');
    expect(result.contentMarkdown).not.toContain('[]');
    expect(result.contentMarkdown).not.toContain('](#sec)');
  });

  test('保留带文字的正常链接', () => {
    document.body.innerHTML = `
      <article>
        <h1>链接文章</h1>
        <p>这是一段足够长的正文用于让 Readability 识别为主体，其中包含一个 <a href="https://example.com/doc">正常链接</a> 需要被保留下来。</p>
        <p>后面继续补充正文以达到正文识别阈值，避免这段内容被算法当作噪音丢弃掉。</p>
      </article>`;
    document.title = '页面标题';

    const result = extractArticle(document);

    expect(result.contentMarkdown).toContain('[正常链接](https://example.com/doc)');
  });

  test('清理克隆文档中的投机资源提示链接', () => {
    document.head.innerHTML = `
      <link rel="preload" as="font" href="https://example.com/font.woff2">
      <link rel="modulepreload" href="https://example.com/app.js">
      <link rel="prefetch" href="https://example.com/next">
      <link rel="preconnect" href="https://example.com">
      <link rel="dns-prefetch" href="//example.com">
      <link rel="stylesheet" href="https://example.com/app.css">
      <link rel="canonical" href="https://example.com/article">`;

    removeSpeculativeResourceHints(document);

    expect(document.querySelectorAll('link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"], link[rel="preconnect"], link[rel="dns-prefetch"]')).toHaveLength(0);
    expect(document.querySelector('link[rel="stylesheet"]')).not.toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();
  });
});
