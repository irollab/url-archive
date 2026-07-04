import type { Settings } from './types';

export class VaultWriteError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'VaultWriteError';
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const defaultFetch: typeof fetch = (...args) => fetch(...args);

function normalizeBearerToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '').trim();
}

/** vault 写入抽象，便于未来替换为自建插件接口或 URI 方案 */
export interface VaultWriter {
  write(path: string, content: string): Promise<void>;
}

export class RestApiWriter implements VaultWriter {
  constructor(
    private settings: Settings,
    private fetchFn: typeof fetch = defaultFetch,
  ) {}

  async write(path: string, content: string): Promise<void> {
    const token = normalizeBearerToken(this.settings.restApiToken);
    if (!token) {
      throw new VaultWriteError('未配置 Obsidian Local REST API Token', false);
    }

    const baseUrl = this.settings.restApiUrl.trim().replace(/\/+$/, '');
    if (!baseUrl) {
      throw new VaultWriteError('未配置 Obsidian Local REST API 地址', false);
    }

    const normalizedPath = path.split('/').filter(Boolean).join('/');
    const encodedPath = normalizedPath.split('/').map(encodeURIComponent).join('/');
    const url = `${baseUrl}/vault/${encodedPath}`;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/markdown',
          Authorization: `Bearer ${token}`,
        },
        body: content,
      });
    } catch (error) {
      throw new VaultWriteError(
        `Obsidian Local REST API 连接失败：${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }

    if (!res.ok) {
      throw new VaultWriteError(`写入 vault 失败: ${res.status}`, isRetryableStatus(res.status));
    }
  }
}
