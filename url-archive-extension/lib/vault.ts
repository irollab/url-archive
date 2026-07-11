import type { Settings } from './types';
import { withTimeout, VAULT_TIMEOUT_MS } from './http';

export class VaultWriteError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'VaultWriteError';
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

// 加超时：Obsidian 未响应时快速失败并转入离线队列，避免剪藏卡死
const defaultFetch: typeof fetch = withTimeout((...args) => fetch(...args), VAULT_TIMEOUT_MS);

function normalizeBearerToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '').trim();
}

/** vault 写入抽象，便于未来替换为自建插件接口或 URI 方案 */
export interface VaultWriter {
  write(path: string, content: string): Promise<void>;
}

/** 单条 vault 写入端点配置：官方插件与 Local REST API 共用同一套 PUT /vault/{path} 协议 */
export interface VaultEndpoint {
  baseUrl: string;
  token: string;
}

/** 按当前写入目标解析出对应端点配置 */
export function resolveVaultEndpoint(settings: Settings): VaultEndpoint {
  return settings.vaultTarget === 'official'
    ? { baseUrl: settings.officialApiUrl, token: settings.officialApiToken }
    : { baseUrl: settings.restApiUrl, token: settings.restApiToken };
}

/** 根据设置的写入目标构造 writer */
export function createVaultWriter(settings: Settings, fetchFn: typeof fetch = defaultFetch): RestApiWriter {
  return new RestApiWriter(resolveVaultEndpoint(settings), fetchFn);
}

export class RestApiWriter implements VaultWriter {
  constructor(
    private endpoint: VaultEndpoint,
    private fetchFn: typeof fetch = defaultFetch,
  ) {}

  async write(path: string, content: string): Promise<void> {
    const token = normalizeBearerToken(this.endpoint.token);
    if (!token) {
      throw new VaultWriteError('未配置 Obsidian 写入 Token', false);
    }

    const baseUrl = this.endpoint.baseUrl.trim().replace(/\/+$/, '');
    if (!baseUrl) {
      throw new VaultWriteError('未配置 Obsidian 写入地址', false);
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
