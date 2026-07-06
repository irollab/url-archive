import type { Settings } from './types';

const KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
  vaultTarget: 'official',
  restApiUrl: 'http://127.0.0.1:27123',
  restApiToken: '',
  officialApiUrl: 'http://127.0.0.1:27125',
  officialApiToken: '',
  vaultFolder: 'URL Archive',
};

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(KEY);
  const stored = got[KEY] as Partial<Settings> | undefined;
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  // 迁移：老用户已配置 Local REST API token 但没有 vaultTarget 字段，保持走 REST API 通道，避免升级后写入失效
  if (stored && stored.vaultTarget === undefined && (stored.restApiToken ?? '').trim()) {
    merged.vaultTarget = 'restApi';
  }
  return merged;
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.local.set({ [KEY]: { ...current, ...partial } });
}
