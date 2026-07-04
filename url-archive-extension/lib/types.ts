/** 从页面抓取的原始剪藏数据 */
export interface ClipData {
  url: string;
  title: string;
  selection: string;          // 用户选中文本，无则空串
  contentMarkdown: string;    // Readability 提取并转成的正文 markdown
  clippedAt: string;          // ISO 时间字符串
}

/** LLM 返回的理解结果 */
export interface AIResult {
  summary: string;
  highlights: string[];
  tags: string[];
  keywords: string[];
  aliases: string[];
  intent: string;
}

/** 组装后准备写入 vault 的完整笔记 */
export interface ClippedNote {
  url: string;
  canonicalUrl: string;
  title: string;
  clipped: string;            // ISO
  domain: string;
  summary: string;
  tags: string[];
  keywords: string[];
  aliases: string[];
  intent: string;
  why: string;
  status: 'unread' | 'read' | 'archived';
  revived: number;
  lastVisited: string;        // 空串表示从未访问；序列化为 last_visited
  aiPending: boolean;         // 序列化为 ai_pending
  highlights: string[];
  contentMarkdown: string;
}

/** 扩展配置 */
export interface Settings {
  llmBaseUrl: string;         // 如 https://api.openai.com/v1
  llmApiKey: string;
  llmModel: string;           // 如 gpt-4o-mini
  restApiUrl: string;         // 如 http://127.0.0.1:27123
  restApiToken: string;
  vaultFolder: string;        // 如 "URL Archive"
}

/** 离线队列中的待写入项 */
export interface QueueItem {
  id?: number;                // IndexedDB 自增主键
  path: string;               // vault 内目标路径
  content: string;            // 完整 markdown
  enqueuedAt: string;         // ISO
}

/** 扩展本地维护的回访索引，不替代 Obsidian 正文 */
export interface SavedClip {
  url: string;
  canonicalUrl?: string;
  title: string;
  domain: string;
  path: string;
  source?: 'clip' | 'bookmark';
  folder?: string;
  faviconUrl?: string;
  summary: string;
  tags: string[];
  keywords: string[];
  aliases: string[];
  intent: string;
  why: string;
  clipped: string;
  queued: boolean;
  revived: number;
  lastVisited: string;
}
