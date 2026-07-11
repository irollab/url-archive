import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  originPattern,
  hasOriginAccess,
  requestOriginAccess,
  MissingHostPermissionError,
  configuredOrigins,
  missingConfiguredOrigins,
} from './permissions';
import type { Settings } from './types';

function stubPermissions(overrides: Partial<{ contains: unknown; request: unknown }>) {
  (globalThis as any).chrome = {
    permissions: {
      contains: overrides.contains ?? vi.fn(),
      request: overrides.request ?? vi.fn(),
    },
  };
}

const baseSettings: Settings = {
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: 'k',
  llmModel: 'm',
  vaultTarget: 'restApi',
  restApiUrl: 'http://127.0.0.1:27123',
  restApiToken: 't',
  officialApiUrl: 'http://127.0.0.1:27125',
  officialApiToken: '',
  vaultFolder: 'URL Archive',
};

afterEach(() => {
  delete (globalThis as any).chrome;
  vi.restoreAllMocks();
});

describe('originPattern', () => {
  test('带端口的本地地址去掉端口', () => {
    expect(originPattern('http://127.0.0.1:27123')).toBe('http://127.0.0.1/*');
  });
  test('https 远程端点', () => {
    expect(originPattern('https://api.openai.com/v1')).toBe('https://api.openai.com/*');
  });
  test('末尾斜杠与路径被忽略', () => {
    expect(originPattern('https://x.example.com/v1/chat/')).toBe('https://x.example.com/*');
  });
  test('空或非法返回 null', () => {
    expect(originPattern('')).toBeNull();
    expect(originPattern('   ')).toBeNull();
    expect(originPattern('not a url')).toBeNull();
  });
});

describe('hasOriginAccess', () => {
  test('空数组直接 true，不调用 chrome', async () => {
    const contains = vi.fn();
    stubPermissions({ contains });
    await expect(hasOriginAccess([])).resolves.toBe(true);
    expect(contains).not.toHaveBeenCalled();
  });
  test('转发 chrome.permissions.contains 结果', async () => {
    const contains = vi.fn().mockResolvedValue(false);
    stubPermissions({ contains });
    await expect(hasOriginAccess(['https://a.com/*'])).resolves.toBe(false);
    expect(contains).toHaveBeenCalledWith({ origins: ['https://a.com/*'] });
  });
});

describe('requestOriginAccess', () => {
  test('空数组直接 true，不调用 chrome', async () => {
    const request = vi.fn();
    stubPermissions({ request });
    await expect(requestOriginAccess([])).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  test('转发 chrome.permissions.request 结果', async () => {
    const request = vi.fn().mockResolvedValue(true);
    stubPermissions({ request });
    await expect(requestOriginAccess(['https://a.com/*'])).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ['https://a.com/*'] });
  });
});

describe('MissingHostPermissionError', () => {
  test('携带 origin 与 name', () => {
    const err = new MissingHostPermissionError('https://a.com/*');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MissingHostPermissionError');
    expect(err.origin).toBe('https://a.com/*');
  });
});

describe('configuredOrigins', () => {
  test('含 vault(restApi) 与 llm origin，去重去端口', () => {
    expect(configuredOrigins(baseSettings).sort()).toEqual(
      ['http://127.0.0.1/*', 'https://api.openai.com/*'].sort(),
    );
  });
  test('空 baseUrl 端点被跳过', () => {
    const s = { ...baseSettings, llmBaseUrl: '', restApiUrl: '' };
    expect(configuredOrigins(s)).toEqual([]);
  });
  test('official 通道用 officialApiUrl', () => {
    const s = { ...baseSettings, vaultTarget: 'official' as const, llmBaseUrl: '' };
    expect(configuredOrigins(s)).toEqual(['http://127.0.0.1/*']);
  });
});

describe('missingConfiguredOrigins', () => {
  test('仅返回未授权的 origin', async () => {
    (globalThis as any).chrome = {
      permissions: {
        contains: vi.fn(({ origins }: { origins: string[] }) =>
          Promise.resolve(origins[0] === 'http://127.0.0.1/*')),
      },
    };
    const missing = await missingConfiguredOrigins(baseSettings);
    expect(missing).toEqual(['https://api.openai.com/*']);
  });
});
