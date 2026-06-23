import type { ClipData, AIResult, Settings } from './types';

const SYSTEM_PROMPT =
  '你是收藏助手。根据网页内容，用简体中文返回严格 JSON：' +
  '{"summary":"一句话摘要","highlights":["要点1","要点2","要点3"],"tags":["标签1","标签2"]}。' +
  '不要输出 JSON 以外的任何内容。';

export async function enrichClip(
  clip: ClipData,
  settings: Settings,
  fetchFn: typeof fetch = fetch,
): Promise<AIResult> {
  const res = await fetchFn(`${settings.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.llmApiKey}`,
    },
    body: JSON.stringify({
      model: settings.llmModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `标题：${clip.title}\nURL：${clip.url}\n` +
            `正文：${clip.contentMarkdown.slice(0, 6000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM 请求失败: ${res.status}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '{}';
  let parsed: Partial<AIResult> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}
