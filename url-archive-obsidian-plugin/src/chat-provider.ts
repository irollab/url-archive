import { requestUrl } from 'obsidian';

export interface ChatSettings {
  chatBaseUrl: string;
  chatApiKey: string;
  chatModel: string;
}

export interface ChatOptions {
  /** 要求返回严格 JSON（用于补 AI 富集） */
  jsonMode?: boolean;
  /** 覆盖默认 system 提示 */
  system?: string;
}

export async function createChatAnswer(
  prompt: string,
  settings: ChatSettings,
  opts: ChatOptions = {},
): Promise<string> {
  const baseUrl = normalizeBaseUrl(settings.chatBaseUrl);
  const apiKey = normalizeBearerToken(settings.chatApiKey);
  const model = settings.chatModel.trim();
  if (!baseUrl) throw new Error('未配置 Chat API 端点');
  if (!apiKey) throw new Error('未配置 Chat API Key');
  if (!model) throw new Error('未配置 Chat 模型');

  const response = await requestUrl({
    url: `${baseUrl}/chat/completions`,
    method: 'POST',
    // 关闭 requestUrl 默认的 4xx/5xx 抛错，改由下方读出响应体给出可诊断的错误
    throw: false,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: opts.system ?? '你是严谨的私人知识库问答助手。' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Chat 请求失败 ${response.status}：${describeResponseError(response)}`);
  }

  const data = response.json as {
    choices?: { message?: { content?: unknown }; text?: unknown }[];
    output_text?: unknown;
    success?: unknown;
    code?: unknown;
    msg?: unknown;
    message?: unknown;
    error?: unknown;
  };
  if (data.success === false || data.error) {
    const code = data.code == null ? '' : `${data.code}: `;
    throw new Error(`Chat 服务返回错误：${code}${String(data.msg ?? data.message ?? data.error ?? '未知错误')}`);
  }

  const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? data.output_text;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Chat 返回为空或格式不符合要求');
  }
  return content.trim();
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
    .replace(/\/chat\/completions$/i, '');
}
