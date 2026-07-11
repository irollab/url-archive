/** 端点 URL → chrome 匹配模式 `scheme://hostname/*`（匹配模式不含端口）；非法/空返回 null */
export function originPattern(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

/** 是否已获得指定 origin 的访问权；空数组视为已具备 */
export async function hasOriginAccess(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return true;
  return chrome.permissions.contains({ origins });
}

/** 申请指定 origin 访问权（必须在用户手势内调用）；空数组视为成功 */
export async function requestOriginAccess(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return true;
  return chrome.permissions.request({ origins });
}

/** 后台调用端点前缺少对应 host 权限时抛出，供页面侧转成重新授权引导 */
export class MissingHostPermissionError extends Error {
  constructor(readonly origin: string) {
    super(`缺少访问 ${origin} 的权限，请在设置中重新授权`);
    this.name = 'MissingHostPermissionError';
  }
}
