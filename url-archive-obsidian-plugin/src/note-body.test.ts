import { describe, expect, test } from 'vitest';
import { applySummaryHighlights, extractBodySnapshot } from './note-body';

const NOTE = `---
url: https://example.com/a
title: Example
ai_pending: true
---

> [!summary] 速览
> _（AI 摘要待补）_

## 我的备注
我的理由

## 正文快照
这是正文快照的内容。
第二段。
`;

describe('extractBodySnapshot', () => {
  test('提取「正文快照」小节内容', () => {
    const body = extractBodySnapshot(NOTE);
    expect(body).toContain('这是正文快照的内容。');
    expect(body).toContain('第二段。');
    expect(body).not.toContain('ai_pending');
    expect(body).not.toContain('[!summary]');
  });

  test('无正文快照小节时回退为去掉 frontmatter 的正文', () => {
    const md = '---\nurl: https://x.com\n---\n\n只有一段正文';
    expect(extractBodySnapshot(md)).toContain('只有一段正文');
    expect(extractBodySnapshot(md)).not.toContain('url:');
  });
});

describe('applySummaryHighlights', () => {
  test('把占位速览替换为要点', () => {
    const out = applySummaryHighlights(NOTE, ['要点一', '要点二']);
    expect(out).toContain('> [!summary] 速览\n> 要点一\n> 要点二');
    expect(out).not.toContain('AI 摘要待补');
    // 不破坏后续小节
    expect(out).toContain('## 我的备注');
    expect(out).toContain('## 正文快照');
  });

  test('替换已存在的要点', () => {
    const withHighlights = NOTE.replace('> _（AI 摘要待补）_', '> 旧要点一\n> 旧要点二');
    const out = applySummaryHighlights(withHighlights, ['新要点']);
    expect(out).toContain('> [!summary] 速览\n> 新要点\n');
    expect(out).not.toContain('旧要点');
  });

  test('空要点时保留占位', () => {
    const out = applySummaryHighlights(NOTE, []);
    expect(out).toContain('AI 摘要待补');
  });
});
