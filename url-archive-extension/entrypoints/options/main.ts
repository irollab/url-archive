import { loadSettings, saveSettings } from '@/lib/settings';
import { enrichClip } from '@/lib/llm';
import { attachImageLightbox } from '@/lib/lightbox';
import { originPattern, requestOriginAccess } from '@/lib/permissions';
import type { Settings, VaultTarget } from '@/lib/types';

const fields: (keyof Settings)[] = [
  'llmBaseUrl', 'llmApiKey', 'llmModel',
  'vaultTarget', 'restApiUrl', 'restApiToken', 'officialApiUrl', 'officialApiToken', 'vaultFolder',
];

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 13 1 13a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></svg>';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const vaultTargetEl = el<HTMLInputElement>('vaultTarget');

/** 依据隐藏字段的写入通道，联动分段控件选中态与端点分组显隐 */
function syncTarget() {
  const target = vaultTargetEl.value || 'official';
  document.querySelectorAll<HTMLButtonElement>('.segmented button').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.target === target));
  });
  el('officialFields').hidden = target !== 'official';
  el('restApiFields').hidden = target !== 'restApi';
}

function bindSegmented() {
  document.querySelectorAll<HTMLButtonElement>('.segmented button').forEach((btn) => {
    btn.addEventListener('click', () => {
      vaultTargetEl.value = btn.dataset.target as VaultTarget;
      syncTarget();
    });
  });
}

/** 密钥字段的明文切换 */
function bindReveals() {
  document.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((btn) => {
    const input = el<HTMLInputElement>(btn.dataset.reveal!);
    btn.innerHTML = EYE;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OFF : EYE;
    });
  });
}

function setStatus(node: HTMLElement, text: string, kind: '' | 'ok' | 'err' | 'busy') {
  node.textContent = text;
  node.className = `status${kind ? ` ${kind}` : ''}`;
}

async function init() {
  const s = await loadSettings();
  for (const f of fields) {
    el<HTMLInputElement>(f).value = String(s[f] ?? '');
  }
  bindSegmented();
  bindReveals();
  syncTarget();
}

function collectSettings(): Settings {
  const partial: Partial<Settings> = {};
  for (const f of fields) {
    partial[f] = el<HTMLInputElement>(f).value as never;
  }
  return partial as Settings;
}

/** 在用户手势内申请一组端点 URL 对应的 host 权限；返回是否全部获批 */
async function ensureEndpointAccess(urls: string[]): Promise<boolean> {
  const origins = [...new Set(urls.map(originPattern).filter((o): o is string => o !== null))];
  return requestOriginAccess(origins);
}

function resolveVaultUrl(s: Settings): string {
  return (s.vaultTarget || 'official') === 'official' ? s.officialApiUrl : s.restApiUrl;
}

el('save').addEventListener('click', async () => {
  const btn = el<HTMLButtonElement>('save');
  const saved = el('saved');
  btn.disabled = true;
  try {
    const s = collectSettings();
    const granted = await ensureEndpointAccess([resolveVaultUrl(s), s.llmBaseUrl]);
    await saveSettings(s);
    setStatus(saved, granted ? '✓ 设置已保存' : '✓ 已保存（部分端点未授权，剪藏时会提示重新授权）', granted ? 'ok' : 'err');
  } catch (error) {
    setStatus(saved, `保存失败：${error instanceof Error ? error.message : String(error)}`, 'err');
  } finally {
    btn.disabled = false;
    window.setTimeout(() => { if (saved.classList.contains('ok')) setStatus(saved, '', ''); }, 2400);
  }
});

el('testAi').addEventListener('click', async () => {
  const status = el('aiStatus');
  setStatus(status, '测试中…', 'busy');
  try {
    await ensureEndpointAccess([collectSettings().llmBaseUrl]);
    const result = await enrichClip({
      url: 'https://example.com/test',
      title: 'URL Archive AI 配置测试',
      selection: '',
      contentMarkdown: '这是一段用于测试 AI 摘要和标签生成的内容。浏览器收藏太多时，需要自动摘要、标签和搜索能力帮助找回有价值的网页。',
      clippedAt: new Date().toISOString(),
    }, collectSettings());
    const tags = result.tags.length ? `；标签：${result.tags.join('、')}` : '';
    setStatus(status, `✓ 测试成功：${result.summary || '已返回结果'}${tags}`, 'ok');
  } catch (error) {
    setStatus(status, `测试失败：${error instanceof Error ? error.message : String(error)}`, 'err');
  }
});

/** 测试指定写入通道的服务连通性：能收到任意 HTTP 响应即视为可达 */
async function testVault(target: VaultTarget) {
  const urlId = target === 'official' ? 'officialApiUrl' : 'restApiUrl';
  const tokenId = target === 'official' ? 'officialApiToken' : 'restApiToken';
  const status = document.querySelector<HTMLElement>(`[data-vault-status="${target}"]`)!;
  const base = el<HTMLInputElement>(urlId).value.trim().replace(/\/+$/, '');
  const token = el<HTMLInputElement>(tokenId).value.trim().replace(/^Bearer\s+/i, '');

  if (!base) {
    setStatus(status, '请先填写服务地址', 'err');
    return;
  }

  setStatus(status, '连接中…', 'busy');
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 4000);
  try {
    await ensureEndpointAccess([base]);
    const res = await fetch(`${base}/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: ctrl.signal,
    });
    setStatus(status, `✓ 服务可达（HTTP ${res.status}）`, 'ok');
  } catch (error) {
    const msg = ctrl.signal.aborted ? '超时（4s）' : error instanceof Error ? error.message : String(error);
    setStatus(status, `无法连接：${msg}`, 'err');
  } finally {
    window.clearTimeout(timer);
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-test-vault]').forEach((btn) => {
  btn.addEventListener('click', () => testVault(btn.dataset.testVault as VaultTarget));
});

attachImageLightbox('.donate-codes img');

init();
