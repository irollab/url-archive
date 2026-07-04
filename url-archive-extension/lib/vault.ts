import type { Settings } from './types';

/** vault 写入抽象，便于未来替换为自建插件接口或 URI 方案 */
export interface VaultWriter {
  write(path: string, content: string): Promise<void>;
}

export class RestApiWriter implements VaultWriter {
  constructor(
    private settings: Settings,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async write(path: string, content: string): Promise<void> {
    // 仅对路径分段编码，保留 "/" 层级
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `${this.settings.restApiUrl}/vault/${encodedPath}`;
    const res = await this.fetchFn(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/markdown',
        Authorization: `Bearer ${this.settings.restApiToken}`,
      },
      body: content,
    });
    if (!res.ok) {
      throw new Error(`写入 vault 失败: ${res.status}`);
    }
  }
}
