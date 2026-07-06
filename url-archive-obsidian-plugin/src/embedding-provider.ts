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
    // 关闭 requestUrl 默认的 4xx/5xx 抛错，改由下方读出响应体给出可诊断的错误
    throw: false,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Embedding 请求失败 ${response.status}：${describeResponseError(response)}`);
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

/** 从错误响应中提取服务端返回的可读信息：优先解析 JSON 错误体，回退到原始文本 */
function describeResponseError(response: { text?: string; json?: unknown }): string {
  try {
    const body = response.json as
      | { error?: { message?: unknown } | unknown; msg?: unknown; message?: unknown }
      | undefined;
    const message = (body?.error as { message?: unknown } | undefined)?.message
      ?? body?.msg
      ?? body?.message
      ?? body?.error;
    if (message) return String(message);
  } catch {
    // 非 JSON 响应，回退到原始文本
  }
  return (response.text ?? '').slice(0, 400) || '无响应内容';
}

function normalizeBearerToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '').trim();
}

function normalizeBaseUrl(url: string): string {
  return url.trim()
    .replace(/\/+$/, '')
    .replace(/\/embeddings$/i, '');
}
