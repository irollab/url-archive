import type { ClipData, AIResult, Settings } from './types';

const SYSTEM_PROMPT =
  '你是收藏助手。根据网页内容，用简体中文返回严格 JSON：' +
  '{"summary":"一句话摘要","highlights":["要点1","要点2","要点3"],"tags":["标签1","标签2"],"keywords":["关键词1","关键词2"],"aliases":["用户可能搜索的别名1","别名2"],"intent":"什么场景下应该重新打开这条收藏"}。' +
  '不要输出 JSON 以外的任何内容。';

const RECALL_PROMPT =
  '你是收藏检索助手。把用户想找回的内容改写成适合本地收藏搜索的严格 JSON：' +
  '{"query":"3到8个用空格分隔的搜索词","keywords":["关键词1","关键词2"],"aliases":["同义词1","别名2"],"intent":"用户可能想重新打开的内容类型"}。' +
  '优先保留产品名、平台名、技术名、中文关键词和英文关键词；不要输出 JSON 以外的任何内容。';

const defaultFetch: typeof fetch = (...args) => fetch(...args);

function normalizeBearerToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '').trim();
}

function normalizeBaseUrl(url: string): string {
  return url.trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '');
}

type AIResultLike = Partial<AIResult> & {
  摘要?: unknown;
  要点?: unknown;
  重点?: unknown;
  标签?: unknown;
  关键词?: unknown;
  别名?: unknown;
  搜索别名?: unknown;
  回访场景?: unknown;
  使用场景?: unknown;
};

export interface AIRecallQuery {
  query: string;
  keywords: string[];
  aliases: string[];
  intent: string;
}

type AIRecallQueryLike = Partial<AIRecallQuery> & {
  查询?: unknown;
  关键词?: unknown;
  别名?: unknown;
  搜索别名?: unknown;
  意图?: unknown;
  回访场景?: unknown;
};

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('\n');
  }
  return content == null ? '' : String(content);
}

function extractResponseText(data: unknown): string {
  const obj = data as {
    output_text?: unknown;
    choices?: { text?: unknown; message?: { content?: unknown } }[];
    output?: { content?: { text?: unknown }[] }[];
  };
  return stringifyContent(
    obj.output_text
      ?? obj.choices?.[0]?.message?.content
      ?? obj.choices?.[0]?.text
      ?? obj.output?.[0]?.content?.[0]?.text
      ?? '',
  );
}

function throwIfProviderError(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const obj = data as { success?: unknown; code?: unknown; msg?: unknown; message?: unknown; error?: unknown };
  if (obj.success === false || obj.error) {
    const message = stringifyContent(obj.msg ?? obj.message ?? obj.error ?? '未知错误');
    const code = obj.code == null ? '' : `${obj.code}: `;
    throw new Error(`LLM 服务返回错误：${code}${message}`);
  }
}

function parseAIContent(content: string): AIResultLike {
  const trimmed = content.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!objectMatch) return {};
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return {};
    }
  }
}

function hasUsableAIResult(result: AIResult): boolean {
  return Boolean(
    result.summary.trim()
      || result.highlights.length
      || result.tags.length
      || result.keywords.length
      || result.aliases.length
      || result.intent.trim(),
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeAIResult(parsed: AIResultLike): AIResult {
  return {
    summary: typeof parsed.summary === 'string'
      ? parsed.summary
      : typeof parsed.摘要 === 'string'
        ? parsed.摘要
        : '',
    highlights: normalizeStringArray(parsed.highlights ?? parsed.要点 ?? parsed.重点),
    tags: normalizeStringArray(parsed.tags ?? parsed.标签),
    keywords: normalizeStringArray(parsed.keywords ?? parsed.关键词),
    aliases: normalizeStringArray(parsed.aliases ?? parsed.别名 ?? parsed.搜索别名),
    intent: typeof parsed.intent === 'string'
      ? parsed.intent
      : typeof parsed.回访场景 === 'string'
        ? parsed.回访场景
        : typeof parsed.使用场景 === 'string'
          ? parsed.使用场景
          : '',
  };
}

function normalizeRecallQuery(parsed: AIRecallQueryLike, fallback: string): AIRecallQuery {
  const keywords = normalizeStringArray(parsed.keywords ?? parsed.关键词);
  const aliases = normalizeStringArray(parsed.aliases ?? parsed.别名 ?? parsed.搜索别名);
  const intent = typeof parsed.intent === 'string'
    ? parsed.intent
    : typeof parsed.意图 === 'string'
      ? parsed.意图
      : typeof parsed.回访场景 === 'string'
        ? parsed.回访场景
        : '';
  const rawQuery = typeof parsed.query === 'string'
    ? parsed.query
    : typeof parsed.查询 === 'string'
      ? parsed.查询
      : '';
  const query = uniqueTerms([fallback, rawQuery, ...keywords, ...aliases, intent]).join(' ') || fallback.trim();
  return { query, keywords, aliases, intent };
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    for (const term of value.split(/[\s,，、\n]+/).map((item) => item.trim()).filter(Boolean)) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(term);
    }
  }
  return terms;
}

export async function enrichClip(
  clip: ClipData,
  settings: Settings,
  fetchFn: typeof fetch = defaultFetch,
): Promise<AIResult> {
  const baseUrl = normalizeBaseUrl(settings.llmBaseUrl);
  const apiKey = normalizeBearerToken(settings.llmApiKey);
  if (!baseUrl) throw new Error('未配置 AI API 端点');
  if (!apiKey) throw new Error('未配置 AI API Key');
  if (!settings.llmModel.trim()) throw new Error('未配置 AI 模型');

  const res = await fetchFn(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
  throwIfProviderError(data);
  const content = extractResponseText(data);
  const parsed = parseAIContent(content);
  const result = normalizeAIResult(parsed);
  if (!hasUsableAIResult(result)) {
    const snippet = content.trim().slice(0, 240) || JSON.stringify(data).slice(0, 240);
    throw new Error(`LLM 返回为空或格式不符合要求：${snippet}`);
  }
  return result;
}

export async function recallQuery(
  query: string,
  settings: Settings,
  fetchFn: typeof fetch = defaultFetch,
): Promise<AIRecallQuery> {
  const baseUrl = normalizeBaseUrl(settings.llmBaseUrl);
  const apiKey = normalizeBearerToken(settings.llmApiKey);
  const trimmed = query.trim();
  if (!trimmed) throw new Error('请输入要找回的内容');
  if (!baseUrl) throw new Error('未配置 AI API 端点');
  if (!apiKey) throw new Error('未配置 AI API Key');
  if (!settings.llmModel.trim()) throw new Error('未配置 AI 模型');

  const res = await fetchFn(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: settings.llmModel,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RECALL_PROMPT },
        { role: 'user', content: `用户想找：${trimmed}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM 请求失败: ${res.status}`);
  }

  const data = await res.json();
  throwIfProviderError(data);
  const content = extractResponseText(data);
  const parsed = parseAIContent(content);
  const result = normalizeRecallQuery(parsed, trimmed);
  if (!result.query.trim()) {
    const snippet = content.trim().slice(0, 240) || JSON.stringify(data).slice(0, 240);
    throw new Error(`AI 找回返回为空或格式不符合要求：${snippet}`);
  }
  return result;
}
