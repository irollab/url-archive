import { loadSettings } from './settings';
import { missingConfiguredOrigins, requestOriginAccess } from './permissions';

/** 缺权限提示文案（纯函数，便于单测） */
export function reauthMessage(origins: string[]): string {
  return `检测到 ${origins.length} 个已配置端点尚未授权访问，点击重新授权以恢复剪藏与 AI 功能。`;
}

/**
 * 若存在「已配置但未授权」的端点，在 container 顶部渲染重新授权横幅。
 * 「重新授权」按钮在用户手势内申请全部缺失 origin，成功后移除横幅并回调。
 */
export async function mountReauthBanner(container: HTMLElement, onDone?: () => void): Promise<void> {
  const settings = await loadSettings();
  const missing = await missingConfiguredOrigins(settings);
  if (missing.length === 0) return;

  const banner = document.createElement('div');
  banner.className = 'reauth-banner';
  const text = document.createElement('span');
  text.textContent = reauthMessage(missing);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reauth-btn';
  btn.textContent = '重新授权';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const granted = await requestOriginAccess(missing);
    if (granted) {
      banner.remove();
      onDone?.();
    } else {
      btn.disabled = false;
    }
  });
  banner.append(text, btn);
  container.prepend(banner);
}
