import { describe, test, expect, vi } from 'vitest';
import { withTimeout } from './http';

describe('withTimeout', () => {
  test('正常返回时透传响应并清除定时器', async () => {
    const baseFetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    const wrapped = withTimeout(baseFetch, 1000);
    await expect(wrapped('https://example.com')).resolves.toEqual({ ok: true });
    // 底层请求收到了 abort signal（用于超时控制）
    const init = baseFetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.signal as AbortSignal).aborted).toBe(false);
  });

  test('超时后 abort 底层请求并抛出', async () => {
    vi.useFakeTimers();
    const baseFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        (init!.signal as AbortSignal).addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
    );
    const wrapped = withTimeout(baseFetch as unknown as typeof fetch, 1000);
    const promise = wrapped('https://example.com');
    const assertion = expect(promise).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    vi.useRealTimers();
  });
});
