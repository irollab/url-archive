/** 网络请求默认超时（毫秒）：LLM 处理长正文可能较慢（后台异步，放宽余量）；vault 走本地回环应很快 */
export const LLM_TIMEOUT_MS = 60000;
export const VAULT_TIMEOUT_MS = 10000;

/**
 * 给注入的 fetch 包一层超时控制：超时后 abort 底层请求，避免慢/挂起的端点
 * 无限期阻塞剪藏流程（MV3 后台 service worker 会因此被终止，导致剪藏丢失）。
 */
export function withTimeout(baseFetch: typeof fetch, timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
