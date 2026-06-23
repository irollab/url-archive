import { loadSettings, saveSettings } from '@/lib/settings';
import type { Settings } from '@/lib/types';

const fields: (keyof Settings)[] = [
  'llmBaseUrl', 'llmApiKey', 'llmModel', 'restApiUrl', 'restApiToken', 'vaultFolder',
];

async function init() {
  const s = await loadSettings();
  for (const f of fields) {
    (document.getElementById(f) as HTMLInputElement).value = String(s[f] ?? '');
  }
}

document.getElementById('save')!.addEventListener('click', async () => {
  const partial: Partial<Settings> = {};
  for (const f of fields) {
    partial[f] = (document.getElementById(f) as HTMLInputElement).value as never;
  }
  await saveSettings(partial);
  document.getElementById('saved')!.textContent = ' 已保存';
});

init();
