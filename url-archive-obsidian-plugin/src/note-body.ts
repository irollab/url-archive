/**
 * 剪藏笔记正文处理（纯函数）。笔记正文结构见扩展端 serializeNote：
 *   ---frontmatter---
 *   > [!summary] 速览
 *   > 要点...
 *   ## 我的备注
 *   ## 正文快照
 */

/** 提取「## 正文快照」小节内容喂给 LLM；无此小节则回退为去掉 frontmatter 的正文 */
export function extractBodySnapshot(markdown: string): string {
  const snapshot = /##\s*正文快照\s*\n([\s\S]*)$/.exec(markdown);
  if (snapshot) return snapshot[1].trim();
  return stripFrontmatter(markdown).trim();
}

/** 重写「> [!summary] 速览」callout 下的要点行；空要点时保留占位 */
export function applySummaryHighlights(markdown: string, highlights: string[]): string {
  const block = highlights.length
    ? highlights.map((h) => `> ${h}`).join('\n')
    : '> _（AI 摘要待补）_';
  return markdown.replace(
    /(> \[!summary\][^\n]*\n)(?:>[^\n]*(?:\n|$))*/,
    `$1${block}\n`,
  );
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}
