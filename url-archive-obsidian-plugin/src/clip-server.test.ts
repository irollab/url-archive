import { EventEmitter } from 'events';
import { describe, test, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { ClipServer, decodeVaultPath } from './clip-server';

describe('decodeVaultPath', () => {
  test('解码并规范化路径', () => {
    expect(decodeVaultPath('/vault/URL%20Archive/note.md')).toBe('URL Archive/note.md');
  });

  test('去掉查询串', () => {
    expect(decodeVaultPath('/vault/a/b.md?x=1')).toBe('a/b.md');
  });

  test('剔除 . 与 .. 目录穿越片段', () => {
    expect(decodeVaultPath('/vault/../../etc/x.md')).toBe('etc/x.md');
  });
});

/** 构造一个可控的 http server 桩，暴露捕获到的请求处理函数 */
function makeHarness(server: ClipServer) {
  let handler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
  const fakeServer = {
    listen: (_port: number, _host: string, cb: () => void) => cb(),
    close: (cb: () => void) => cb(),
    once: () => fakeServer,
    off: () => fakeServer,
  };
  // @ts-expect-error 覆写私有 createServer 供测试注入
  server.options.createServer = (h: never) => {
    handler = h;
    return fakeServer as never;
  };
  return {
    async dispatch(req: Partial<IncomingMessage>) {
      const res = new FakeRes();
      handler!(req as IncomingMessage, res as unknown as ServerResponse);
      await res.done;
      return res;
    },
    start: () => server.start(),
  };
}

class FakeRes {
  statusCode = 0;
  body = '';
  headers: Record<string, string> = {};
  private resolve!: () => void;
  done = new Promise<void>((r) => { this.resolve = r; });
  setHeader(k: string, v: string) { this.headers[k] = v; }
  writeHead(status: number, _headers?: Record<string, string>) { this.statusCode = status; }
  end(chunk?: string) { if (chunk) this.body = chunk; this.resolve(); }
}

function putReq(url: string, token: string, body: string): Partial<IncomingMessage> {
  const req = new EventEmitter() as EventEmitter & Partial<IncomingMessage>;
  req.method = 'PUT';
  req.url = url;
  req.headers = { authorization: `Bearer ${token}` };
  queueMicrotask(() => {
    req.emit('data', Buffer.from(body, 'utf8'));
    req.emit('end');
  });
  return req;
}

describe('ClipServer 请求处理', () => {
  test('正确 Token 的 PUT 写入 vault 并返回 204', async () => {
    const writeNote = vi.fn().mockResolvedValue(undefined);
    const server = new ClipServer({ port: 27125, token: 'secret', writeNote });
    const h = makeHarness(server);
    await h.start();

    const res = await h.dispatch(putReq('/vault/URL%20Archive/n.md', 'secret', '# hi'));
    expect(res.statusCode).toBe(204);
    expect(writeNote).toHaveBeenCalledWith('URL Archive/n.md', '# hi');
  });

  test('Token 不匹配返回 401 且不写入', async () => {
    const writeNote = vi.fn().mockResolvedValue(undefined);
    const server = new ClipServer({ port: 27125, token: 'secret', writeNote });
    const h = makeHarness(server);
    await h.start();

    const res = await h.dispatch(putReq('/vault/n.md', 'wrong', 'x'));
    expect(res.statusCode).toBe(401);
    expect(writeNote).not.toHaveBeenCalled();
  });

  test('健康检查无需鉴权返回 200', async () => {
    const server = new ClipServer({ port: 27125, token: 'secret', writeNote: vi.fn() });
    const h = makeHarness(server);
    await h.start();

    const res = await h.dispatch({ method: 'GET', url: '/health', headers: {} });
    expect(res.statusCode).toBe(200);
  });

  test('OPTIONS 预检返回 204 且带 CORS 头', async () => {
    const server = new ClipServer({ port: 27125, token: 'secret', writeNote: vi.fn() });
    const h = makeHarness(server);
    await h.start();

    const res = await h.dispatch({ method: 'OPTIONS', url: '/vault/n.md', headers: {} });
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  test('写入失败返回 500', async () => {
    const writeNote = vi.fn().mockRejectedValue(new Error('disk full'));
    const server = new ClipServer({ port: 27125, token: 'secret', writeNote });
    const h = makeHarness(server);
    await h.start();

    const res = await h.dispatch(putReq('/vault/n.md', 'secret', 'x'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain('disk full');
  });
});
