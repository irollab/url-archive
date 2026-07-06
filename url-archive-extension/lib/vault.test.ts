import { describe, test, expect, vi } from 'vitest';
import { RestApiWriter, VaultWriteError, createVaultWriter, resolveVaultEndpoint, type VaultEndpoint } from './vault';
import type { Settings } from './types';

const endpoint: VaultEndpoint = {
  baseUrl: 'http://127.0.0.1:27123/',
  token: ' tok-123 ',
};

describe('RestApiWriter', () => {
  test('用 PUT、Bearer、text/markdown 写入正确 URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response);
    const writer = new RestApiWriter(endpoint, fetchFn);
    await writer.write('URL Archive/note.md', '# hi');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:27123/vault/URL%20Archive/note.md');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/markdown');
    expect(init.body).toBe('# hi');
  });

  test('Token 字段可兼容带 Bearer 前缀的输入', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response);
    const writer = new RestApiWriter({ ...endpoint, token: ' Bearer tok-123 ' }, fetchFn);
    await writer.write('URL Archive/note.md', '# hi');

    const [, init] = fetchFn.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  test('非 2xx 抛出带重试标记的错误', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    const writer = new RestApiWriter(endpoint, fetchFn);

    await expect(writer.write('p.md', 'x')).rejects.toMatchObject({
      message: '写入 vault 失败: 401',
      retryable: false,
    });
  });

  test('网络连接失败是可重试错误', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const writer = new RestApiWriter(endpoint, fetchFn);

    await expect(writer.write('p.md', 'x')).rejects.toMatchObject({ retryable: true });
  });

  test('缺少 token 是不可重试配置错误', async () => {
    const writer = new RestApiWriter({ ...endpoint, token: '' });

    await expect(writer.write('p.md', 'x')).rejects.toBeInstanceOf(VaultWriteError);
    await expect(writer.write('p.md', 'x')).rejects.toMatchObject({ retryable: false });
  });
});

describe('resolveVaultEndpoint / createVaultWriter', () => {
  const base: Settings = {
    llmBaseUrl: '', llmApiKey: '', llmModel: '',
    vaultTarget: 'restApi',
    restApiUrl: 'http://127.0.0.1:27123',
    restApiToken: 'rest-tok',
    officialApiUrl: 'http://127.0.0.1:27125',
    officialApiToken: 'official-tok',
    vaultFolder: 'URL Archive',
  };

  test('restApi 目标解析出 Local REST API 端点', () => {
    expect(resolveVaultEndpoint(base)).toEqual({ baseUrl: 'http://127.0.0.1:27123', token: 'rest-tok' });
  });

  test('official 目标解析出官方插件端点', () => {
    expect(resolveVaultEndpoint({ ...base, vaultTarget: 'official' }))
      .toEqual({ baseUrl: 'http://127.0.0.1:27125', token: 'official-tok' });
  });

  test('createVaultWriter 按目标写入对应地址', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response);
    const writer = createVaultWriter({ ...base, vaultTarget: 'official' }, fetchFn);
    await writer.write('URL Archive/n.md', '# hi');
    expect(fetchFn.mock.calls[0][0]).toBe('http://127.0.0.1:27125/vault/URL%20Archive/n.md');
  });
});
