import { describe, expect, test } from 'vitest';
import { reauthMessage } from './reauth-banner';

describe('reauthMessage', () => {
  test('单个端点', () => {
    expect(reauthMessage(['https://api.openai.com/*']))
      .toBe('检测到 1 个已配置端点尚未授权访问，点击重新授权以恢复剪藏与 AI 功能。');
  });
  test('多个端点', () => {
    expect(reauthMessage(['https://a/*', 'http://b/*']))
      .toBe('检测到 2 个已配置端点尚未授权访问，点击重新授权以恢复剪藏与 AI 功能。');
  });
});
