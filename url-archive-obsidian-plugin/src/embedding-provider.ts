import { requestUrl } from 'obsidian';

export interface EmbeddingSettings {
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
}

export async function createEmbedding(input: string, settings: EmbeddingSettings): Promise<number[]> {
  const baseUrl = normalizeBaseUrl(settings.embeddingBaseUrl);
  const apiKey = normalizeBearerToken(settings.embeddingApiKey);
  const model = settings.embeddingModel.trim();
  if (!baseUrl) throw new Error('未配置 Embedding API 端点');
  if (!apiKey) throw new Error('未配置 Embedding API Key');
  if (!model) throw new Error('未配置 Embedding 模型');

  const response = await requestUrl({
    url: `${baseUrl}/embeddings`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Embedding 请求失败: ${response.status}`);
  }

  const data = response.json as {
    data?: { embedding?: unknown }[];
    success?: unknown;
    code?: unknown;
    msg?: unknown;
    message?: unknown;
    error?: unknown;
  };
  if (data.success === false || data.error) {
    const code = data.code == null ? '' : `${data.code}: `;
    throw new Error(`Embedding 服务返回错误：${code}${String(data.msg ?? data.message ?? data.error ?? '未知错误')}`);
  }

  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding 返回为空或格式不符合要求');
  }
  return embedding.map(Number).filter((value) => Number.isFinite(value));
}

function normalizeBearerToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '').trim();
}

function normalizeBaseUrl(url: string): string {
  return url.trim()
    .replace(/\/+$/, '')
    .replace(/\/embeddings$/i, '');
}
