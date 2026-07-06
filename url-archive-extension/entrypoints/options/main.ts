import { loadSettings, saveSettings } from '@/lib/settings';
import { enrichClip } from '@/lib/llm';
import type { Settings } from '@/lib/types';

const fields: (keyof Settings)[] = [
  'llmBaseUrl', 'llmApiKey', 'llmModel',
  'vaultTarget', 'restApiUrl', 'restApiToken', 'officialApiUrl', 'officialApiToken', 'vaultFolder',
];

/** 根据当前写入通道显示对应端点配置，隐藏另一套 */
function syncTargetVisibility() {
  const target = (document.getElementById('vaultTarget') as HTMLSelectElement).value;
  (document.getElementById('officialFields') as HTMLElement).hidden = target !== 'official';
  (document.getElementById('restApiFields') as HTMLElement).hidden = target !== 'restApi';
}

async function init() {
  const s = await loadSettings();
  for (const f of fields) {
    (document.getElementById(f) as HTMLInputElement).value = String(s[f] ?? '');
  }
  (document.getElementById('vaultTarget') as HTMLSelectElement)
    .addEventListener('change', syncTargetVisibility);
  syncTargetVisibility();
}

function collectSettings(): Settings {
  const partial: Partial<Settings> = {};
  for (const f of fields) {
    partial[f] = (document.getElementById(f) as HTMLInputElement).value as never;
  }
  return partial as Settings;
}

document.getElementById('save')!.addEventListener('click', async () => {
  await saveSettings(collectSettings());
  document.getElementById('saved')!.textContent = ' 已保存';
});

document.getElementById('testAi')!.addEventListener('click', async () => {
  const status = document.getElementById('aiStatus')!;
  status.textContent = '测试中...';
  try {
    const result = await enrichClip({
      url: 'https://example.com/test',
      title: 'URL Archive AI 配置测试',
      selection: '',
      contentMarkdown: '这是一段用于测试 AI 摘要和标签生成的内容。浏览器收藏太多时，需要自动摘要、标签和搜索能力帮助找回有价值的网页。',
      clippedAt: new Date().toISOString(),
    }, collectSettings());
    status.textContent = `测试成功：${result.summary || '已返回结果'}${result.tags.length ? `；标签：${result.tags.join('、')}` : ''}`;
  } catch (error) {
    status.textContent = `测试失败：${error instanceof Error ? error.message : String(error)}`;
  }
});

init();
