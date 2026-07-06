import type { IncomingMessage, ServerResponse, Server } from 'http';

/** 把剪藏 markdown 写入 vault 的回调，由插件注入（内部走 Obsidian vault API） */
export type WriteNote = (path: string, content: string) => Promise<void>;

export interface ClipServerOptions {
  port: number;
  token: string;
  writeNote: WriteNote;
  /** 便于测试注入 http 模块；默认运行时 require('http') */
  createServer?: (handler: (req: IncomingMessage, res: ServerResponse) => void) => Server;
  log?: (message: string) => void;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024; // 单条剪藏正文上限，防止异常大 body

/**
 * 本地剪藏接收服务：与 Obsidian Local REST API 保持同一套最小协议
 *   PUT /vault/{encodedPath}  Authorization: Bearer <token>  body: markdown
 * 仅绑定 127.0.0.1，桌面端可用。
 */
export class ClipServer {
  private server: Server | null = null;

  constructor(private options: ClipServerOptions) {}

  get running(): boolean {
    return this.server !== null;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const factory = this.options.createServer ?? defaultCreateServer();
    const server = factory((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      // 仅监听回环地址，避免暴露到局域网
      server.listen(this.options.port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    this.log(`剪藏服务已监听 127.0.0.1:${this.options.port}`);
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.log('剪藏服务已停止');
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      sendJson(res, 200, { service: 'url-archive', status: 'ok' });
      return;
    }

    if (!this.isAuthorized(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    if (req.method !== 'PUT' || !req.url || !req.url.startsWith('/vault/')) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    const path = decodeVaultPath(req.url);
    if (!path) {
      sendJson(res, 400, { error: 'invalid path' });
      return;
    }

    this.readBody(req)
      .then((content) => this.options.writeNote(path, content))
      .then(() => {
        res.writeHead(204);
        res.end();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'body too large') {
          sendJson(res, 413, { error: message });
          return;
        }
        this.log(`写入失败：${message}`);
        sendJson(res, 500, { error: message });
      });
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return false;
    const token = value.replace(/^Bearer\s+/i, '').trim();
    return token !== '' && token === this.options.token;
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error('body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  private log(message: string): void {
    this.options.log?.(message);
  }
}

/** 把 /vault/{encodedPath} 解析成规范化的 vault 相对路径 */
export function decodeVaultPath(url: string): string {
  const raw = url.slice('/vault/'.length).split('?')[0];
  const decoded = raw
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
  return decoded;
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function defaultCreateServer(): (handler: (req: IncomingMessage, res: ServerResponse) => void) => Server {
  // 延迟到运行时再 require，避免打包/移动端加载 node 内置模块
  const http = require('http') as typeof import('http');
  return (handler) => http.createServer(handler);
}
