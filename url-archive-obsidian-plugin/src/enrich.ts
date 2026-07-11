// 仅类型导入，避免在单测中经 chat-provider 间接引入 obsidian 运行时
import type { ChatSettings } from './chat-provider';

/** 补 AI 富集结果，与扩展端 AIResult 对齐 */
export interface AiEnrichResult {
  summary: string;
  highlights: string[];
  tags: string[];
  keywords: string[];
  aliases: string[];
  intent: string;
}

export interface EnrichNoteInput {
  title: string;
  url: string;
  body: string;
}

/** 补 AI 用的 chat 调用签名（由 main.ts 注入 createChatAnswer，测试可注入 mock） */
export type ChatFn = (
  prompt: string,
  settings: ChatSettings,
  opts?: { jsonMode?: boolean; system?: string },
) => Promise<string>;

const ENRICH_SYSTEM =
  '你是收藏助手。根据网页内容，用简体中文返回严格 JSON：' +
  '{"summary":"一句话摘要","highlights":["要点1","要点2","要点3"],"tags":["标签1","标签2"],"keywords":["关键词1","关键词2"],"aliases":["用户可能搜索的别名1","别名2"],"intent":"什么场景下应该重新打开这条收藏"}。' +
  '不要输出 JSON 以外的任何内容。';

const MAX_BODY_CHARS = 6000;

export function buildEnrichPrompt(note: EnrichNoteInput): string {
  return `标题：${note.title}\nURL：${note.url}\n正文：${note.body.slice(0, MAX_BODY_CHARS)}`;
}

export async function enrichNoteContent(
  note: EnrichNoteInput,
  settings: ChatSettings,
  chat: ChatFn,
): Promise<AiEnrichResult> {
  const content = await chat(buildEnrichPrompt(note), settings, { jsonMode: true, system: ENRICH_SYSTEM });
  const result = parseEnrichResult(content);
  if (!hasUsableResult(result)) {
    throw new Error(`AI 返回为空或格式不符合要求：${content.trim().slice(0, 200)}`);
  }
  return result;
}

// —— 解析（逻辑移植自扩展 lib/llm.ts；两包独立发布无法共享） ——

type AiEnrichLike = Partial<AiEnrichResult> & {
  摘要?: unknown; 要点?: unknown; 重点?: unknown; 标签?: unknown;
  关键词?: unknown; 别名?: unknown; 搜索别名?: unknown; 回访场景?: unknown; 使用场景?: unknown;
};

export function parseEnrichResult(content: string): AiEnrichResult {
  return normalize(parseJsonLoose(content));
}

function parseJsonLoose(content: string): AiEnrichLike {
  const trimmed = content.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function normalize(parsed: AiEnrichLike): AiEnrichResult {
  return {
    summary: pickString(parsed.summary, parsed.摘要),
    highlights: toStringArray(parsed.highlights ?? parsed.要点 ?? parsed.重点),
    tags: toStringArray(parsed.tags ?? parsed.标签),
    keywords: toStringArray(parsed.keywords ?? parsed.关键词),
    aliases: toStringArray(parsed.aliases ?? parsed.别名 ?? parsed.搜索别名),
    intent: pickString(parsed.intent, parsed.回访场景, parsed.使用场景),
  };
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return '';
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function hasUsableResult(result: AiEnrichResult): boolean {
  return Boolean(
    result.summary.trim()
      || result.highlights.length
      || result.tags.length
      || result.keywords.length
      || result.aliases.length
      || result.intent.trim(),
  );
}
