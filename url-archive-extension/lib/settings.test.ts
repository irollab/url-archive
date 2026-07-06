import { describe, test, expect, vi, beforeEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  // 模拟 chrome.storage.local
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(store, obj); }),
      },
    },
  };
});

describe('settings', () => {
  test('未保存时返回默认值', async () => {
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  test('保存后能读回，且与默认值合并', async () => {
    await saveSettings({ llmApiKey: 'sk-1', vaultFolder: 'Notes' });
    const s = await loadSettings();
    expect(s.llmApiKey).toBe('sk-1');
    expect(s.vaultFolder).toBe('Notes');
    expect(s.restApiUrl).toBe(DEFAULT_SETTINGS.restApiUrl);
  });

  test('新装用户默认走官方插件通道', async () => {
    const s = await loadSettings();
    expect(s.vaultTarget).toBe('official');
  });

  test('迁移：老用户已配 REST API token 且无 vaultTarget，保持 restApi 通道', async () => {
    store.settings = { restApiToken: 'legacy-tok' };
    const s = await loadSettings();
    expect(s.vaultTarget).toBe('restApi');
  });

  test('用户显式设置的 vaultTarget 不被迁移覆盖', async () => {
    store.settings = { restApiToken: 'legacy-tok', vaultTarget: 'official' };
    const s = await loadSettings();
    expect(s.vaultTarget).toBe('official');
  });
});
