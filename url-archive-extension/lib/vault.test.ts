import { describe, test, expect, vi } from 'vitest';
import { RestApiWriter } from './vault';
import type { Settings } from './types';

const settings: Settings = {
  llmBaseUrl: '', llmApiKey: '', llmModel: '',
  restApiUrl: 'http://127.0.0.1:27123',
  restApiToken: 'tok-123',
  vaultFolder: 'URL Archive',
};

describe('RestApiWriter', () => {
  test('用 PUT、Bearer、text/markdown 写入正确 URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response);
    const writer = new RestApiWriter(settings, fetchFn);
    await writer.write('URL Archive/note.md', '# hi');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:27123/vault/URL%20Archive/note.md');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/markdown');
    expect(init.body).toBe('# hi');
  });

  test('非 2xx 抛错', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    const writer = new RestApiWriter(settings, fetchFn);
    await expect(writer.write('p.md', 'x')).rejects.toThrow('写入 vault 失败');
  });
});
