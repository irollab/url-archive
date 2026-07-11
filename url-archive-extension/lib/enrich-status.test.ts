import { describe, test, expect } from 'vitest';
import { enrichStatusText } from './enrich-status';

describe('enrichStatusText', () => {
  test('done 显示已补充', () => {
    expect(enrichStatusText('done')).toBe('AI 摘要已补充');
  });

  test('skipped 提示未配置', () => {
    expect(enrichStatusText('skipped')).toContain('未配置');
  });

  test('failed 带错误信息', () => {
    expect(enrichStatusText('failed', 'LLM 请求失败: 401')).toBe('AI 补充失败：LLM 请求失败: 401');
  });

  test('failed 无错误信息时回退', () => {
    expect(enrichStatusText('failed')).toBe('AI 补充失败：未知错误');
  });
});
