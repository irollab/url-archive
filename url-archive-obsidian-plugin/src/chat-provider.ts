import { requestUrl } from 'obsidian';

export interface ChatSettings {
  chatBaseUrl: string;
  chatApiKey: string;
  chatModel: string;
}

export async function createChatAnswer(prompt: string, settings: ChatSettings): Promise<string> {
  const baseUrl = normalizeBaseUrl(settings.chatBaseUrl);
  const apiKey = normalizeBearerToken(settings.chatApiKey);
  const model = settings.chatModel.trim();
  if (!baseUrl) throw new Error('未配置 Chat API 端点');
  if (!apiKey) throw new Error('未配置 Chat API Key');
  if (!model) throw new Error('未配置 Chat 模型');

  const response = await requestUrl({
    url: `${baseUrl}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你是严谨的私人知识库问答助手。' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Chat 请求失败: ${response.status}`);
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

function normalizeBearerToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '').trim();
}

function normalizeBaseUrl(url: string): string {
  return url.trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '');
}
