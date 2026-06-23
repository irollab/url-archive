# URL Archive 阶段 1（地基 · 剪藏）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个浏览器扩展，一键把当前网页剪藏成结构化 markdown（含 AI 摘要/标签、用户意图、正文快照），通过 Obsidian Local REST API 写入 vault；AI 或 Obsidian 不可用时先入本地队列，绝不丢收藏。

**Architecture:** 业务逻辑全部放在与框架无关的 `lib/` 纯模块中（markdown 序列化、BYOK LLM 适配、vault 写入、离线队列、剪藏编排），用 vitest 做 TDD。WXT 入口（background / content / popup / options）只负责把这些模块接起来。所有外部依赖（LLM、vault）通过接口注入，便于 mock 测试与未来替换（依赖倒置）。

**Tech Stack:** TypeScript、WXT（MV3 扩展框架）、vitest（+ jsdom、fake-indexeddb）、`@mozilla/readability` + `turndown`（正文提取转 markdown）、`yaml`（frontmatter 序列化）、`idb`（IndexedDB 封装）。LLM 走 OpenAI 兼容 `/chat/completions`；vault 走 Local REST API `PUT /vault/`。

参考设计文档：`docs/superpowers/specs/2026-06-23-url-archive-design.md`

---

## 文件结构

```
url-archive-extension/
├── package.json
├── wxt.config.ts                 # MV3 manifest、权限配置
├── vitest.config.ts              # 测试环境（node + jsdom）
├── lib/
│   ├── types.ts                  # 共享类型：ClipData / AIResult / ClippedNote / Settings / QueueItem
│   ├── markdown.ts               # serializeNote()、generateFilename()、slugify()
│   ├── llm.ts                    # enrichClip()：BYOK OpenAI 兼容适配
│   ├── vault.ts                  # VaultWriter 接口 + RestApiWriter
│   ├── queue.ts                  # ClipQueue：IndexedDB 离线队列
│   ├── capture.ts                # captureClip()：编排 enrich → serialize → write/queue
│   ├── extract.ts                # extractArticle()：Readability + Turndown
│   └── settings.ts              # 读写扩展配置（chrome.storage.local）
├── lib/*.test.ts                 # 各模块单测
└── entrypoints/
    ├── background.ts             # 消息处理、驱动剪藏、启动时重试队列
    ├── content.ts                # 页面内提取正文，响应 background
    ├── popup/                    # 剪藏浮层 UI（why 输入、标签、状态）
    └── options/                  # 设置页（LLM key/端点、REST API、vault 文件夹）
```

每个 `lib/` 模块单一职责、可独立测试；入口文件只做接线。

---

## Task 1：项目脚手架

**Files:**
- Create: `url-archive-extension/`（WXT 项目）
- Create: `vitest.config.ts`

- [ ] **Step 1: 用 WXT 初始化项目**

在 `F:/Code/github/irollab/URL Archive/` 下运行：

```bash
cd "F:/Code/github/irollab/URL Archive"
npx wxt@latest init url-archive-extension
```
模板选择 **vanilla**（不引入前端框架，popup/options 用原生 TS + HTML，保持 KISS）。包管理器选 **npm**。

- [ ] **Step 2: 安装依赖**

```bash
cd "F:/Code/github/irollab/URL Archive/url-archive-extension"
npm install @mozilla/readability turndown yaml idb
npm install -D vitest jsdom fake-indexeddb @types/turndown
```

- [ ] **Step 3: 配置 vitest**

Create `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',           // 默认 node；需要 DOM 的测试用 // @vitest-environment jsdom 注释切换
    include: ['lib/**/*.test.ts'],
  },
});
```

在 `package.json` 的 `scripts` 中加入：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 验证脚手架可构建**

Run: `npm run build`
Expected: 构建成功，生成 `.output/chrome-mv3/` 目录，无报错。

- [ ] **Step 5: 验证测试可运行**

Run: `npm test`
Expected: vitest 启动并报告 "No test files found"（此时还没有测试），退出码 0。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold WXT extension with vitest"
```

---

## Task 2：共享类型定义

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: 写类型**

Create `lib/types.ts`：

```ts
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
}

/** 组装后准备写入 vault 的完整笔记 */
export interface ClippedNote {
  url: string;
  title: string;
  clipped: string;            // ISO
  domain: string;
  summary: string;
  tags: string[];
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
```

- [ ] **Step 2: 验证类型编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared types"
```

---

## Task 3：markdown 序列化

**Files:**
- Create: `lib/markdown.ts`
- Test: `lib/markdown.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/markdown.test.ts`：

```ts
import { describe, test, expect } from 'vitest';
import { serializeNote, slugify, generateFilename } from './markdown';
import type { ClippedNote } from './types';

const baseNote: ClippedNote = {
  url: 'https://example.com/article',
  title: '一篇关于动画库的文章',
  clipped: '2026-06-23T14:30:00',
  domain: 'example.com',
  summary: 'AI 生成的一句话摘要',
  tags: ['前端', '动画库'],
  why: '做落地页选型用',
  status: 'unread',
  revived: 0,
  lastVisited: '',
  aiPending: false,
  highlights: ['要点一', '要点二'],
  contentMarkdown: '# 正文标题\n\n正文内容',
};

describe('serializeNote', () => {
  test('包含 frontmatter、速览、备注、正文快照四块', () => {
    const md = serializeNote(baseNote);
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('url: https://example.com/article');
    expect(md).toContain('summary: AI 生成的一句话摘要');
    expect(md).toContain('last_visited: null');
    expect(md).toContain('ai_pending: false');
    expect(md).toContain('> [!summary] 速览');
    expect(md).toContain('> 要点一');
    expect(md).toContain('## 我的备注');
    expect(md).toContain('做落地页选型用');
    expect(md).toContain('## 正文快照');
    expect(md).toContain('正文内容');
  });

  test('highlights 为空时给占位文案', () => {
    const md = serializeNote({ ...baseNote, highlights: [] });
    expect(md).toContain('AI 摘要待补');
  });
});

describe('slugify', () => {
  test('保留中英文数字，其余转连字符', () => {
    expect(slugify('Hello World! 动画库')).toBe('hello-world-动画库');
  });
});

describe('generateFilename', () => {
  test('格式为 domain-slug-日期.md', () => {
    expect(generateFilename(baseNote)).toBe(
      'example.com-一篇关于动画库的文章-2026-06-23.md',
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- markdown`
Expected: FAIL，提示 `serializeNote` 等未定义。

- [ ] **Step 3: 实现**

Create `lib/markdown.ts`：

```ts
import { stringify } from 'yaml';
import type { ClippedNote } from './types';

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')  // 非字母数字（含中文）转连字符
    .replace(/^-+|-+$/g, '');
}

export function generateFilename(note: ClippedNote): string {
  const date = note.clipped.slice(0, 10);  // YYYY-MM-DD
  return `${note.domain}-${slugify(note.title)}-${date}.md`;
}

export function serializeNote(note: ClippedNote): string {
  const frontmatter = {
    url: note.url,
    title: note.title,
    clipped: note.clipped,
    domain: note.domain,
    summary: note.summary,
    tags: note.tags,
    why: note.why,
    status: note.status,
    revived: note.revived,
    last_visited: note.lastVisited || null,
    ai_pending: note.aiPending,
  };
  const fm = stringify(frontmatter).trimEnd();

  const highlightsBlock = note.highlights.length
    ? note.highlights.map((h) => `> ${h}`).join('\n')
    : '> _（AI 摘要待补）_';

  return `---
${fm}
---

> [!summary] 速览
${highlightsBlock}

## 我的备注
${note.why}

## 正文快照
${note.contentMarkdown}
`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- markdown`
Expected: PASS，全部用例通过。

- [ ] **Step 5: Commit**

```bash
git add lib/markdown.ts lib/markdown.test.ts
git commit -m "feat: add markdown serializer and filename helper"
```

---

## Task 4：BYOK LLM 适配（enrichClip）

**Files:**
- Create: `lib/llm.ts`
- Test: `lib/llm.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/llm.test.ts`：

```ts
import { describe, test, expect, vi } from 'vitest';
import { enrichClip } from './llm';
import type { ClipData, Settings } from './types';

const settings: Settings = {
  llmBaseUrl: 'https://api.example.com/v1',
  llmApiKey: 'sk-test',
  llmModel: 'test-model',
  restApiUrl: '',
  restApiToken: '',
  vaultFolder: '',
};

const clip: ClipData = {
  url: 'https://example.com/a',
  title: '标题',
  selection: '',
  contentMarkdown: '正文',
  clippedAt: '2026-06-23T00:00:00',
};

function mockFetchReturning(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response);
}

describe('enrichClip', () => {
  test('解析 LLM 返回的 JSON 为 AIResult', async () => {
    const fetchFn = mockFetchReturning(
      JSON.stringify({ summary: '摘要', highlights: ['h1'], tags: ['t1'] }),
    );
    const result = await enrichClip(clip, settings, fetchFn);
    expect(result).toEqual({ summary: '摘要', highlights: ['h1'], tags: ['t1'] });
  });

  test('用正确的 URL、Bearer 头和模型发请求', async () => {
    const fetchFn = mockFetchReturning('{}');
    await enrichClip(clip, settings, fetchFn);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string).model).toBe('test-model');
  });

  test('字段缺失时给安全默认值', async () => {
    const fetchFn = mockFetchReturning('{}');
    const result = await enrichClip(clip, settings, fetchFn);
    expect(result).toEqual({ summary: '', highlights: [], tags: [] });
  });

  test('HTTP 非 2xx 抛错', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(enrichClip(clip, settings, fetchFn)).rejects.toThrow('LLM 请求失败');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- llm`
Expected: FAIL，`enrichClip` 未定义。

- [ ] **Step 3: 实现**

Create `lib/llm.ts`：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- llm`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/llm.ts lib/llm.test.ts
git commit -m "feat: add BYOK OpenAI-compatible LLM adapter"
```

---

## Task 5：vault 写入（RestApiWriter）

**Files:**
- Create: `lib/vault.ts`
- Test: `lib/vault.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/vault.test.ts`：

```ts
import { describe, test, expect, vi } from 'vitest';
import { RestApiWriter } from './vault';
import type { Settings } from './types';

const settings: Settings = {
  llmBaseUrl: '', llmApiKey: '', llmModel: '',
  restApiUrl: 'http://127.0.0.1:27123',
  restApiToken: 'tok-123',
  vaultFolder: 'URL Archive',
};

describe('RestApiWriter', () => {
  test('用 PUT、Bearer、text/markdown 写入正确 URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response);
    const writer = new RestApiWriter(settings, fetchFn);
    await writer.write('URL Archive/note.md', '# hi');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:27123/vault/URL%20Archive/note.md');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/markdown');
    expect(init.body).toBe('# hi');
  });

  test('非 2xx 抛错', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    const writer = new RestApiWriter(settings, fetchFn);
    await expect(writer.write('p.md', 'x')).rejects.toThrow('写入 vault 失败');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- vault`
Expected: FAIL，`RestApiWriter` 未定义。

- [ ] **Step 3: 实现**

Create `lib/vault.ts`：

```ts
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
```

注：`encodeURIComponent` 会把空格编码为 `%20`，与测试期望一致。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- vault`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/vault.ts lib/vault.test.ts
git commit -m "feat: add RestApiWriter for Obsidian Local REST API"
```

---

## Task 6：离线队列（ClipQueue）

**Files:**
- Create: `lib/queue.ts`
- Test: `lib/queue.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/queue.test.ts`：

```ts
// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, test, expect, beforeEach } from 'vitest';
import { ClipQueue } from './queue';

describe('ClipQueue', () => {
  let queue: ClipQueue;

  beforeEach(async () => {
    queue = new ClipQueue('test-db-' + Math.random());
  });

  test('入队后能取出全部', async () => {
    await queue.enqueue({ path: 'a.md', content: 'A', enqueuedAt: '2026-06-23T00:00:00' });
    await queue.enqueue({ path: 'b.md', content: 'B', enqueuedAt: '2026-06-23T00:00:01' });
    const all = await queue.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].path).toBe('a.md');
    expect(all[0].id).toBeTypeOf('number');
  });

  test('按 id 移除', async () => {
    await queue.enqueue({ path: 'a.md', content: 'A', enqueuedAt: '2026-06-23T00:00:00' });
    const [item] = await queue.getAll();
    await queue.remove(item.id!);
    expect(await queue.getAll()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- queue`
Expected: FAIL，`ClipQueue` 未定义。

- [ ] **Step 3: 实现**

Create `lib/queue.ts`：

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { QueueItem } from './types';

const STORE = 'clips';

export class ClipQueue {
  private dbPromise: Promise<IDBPDatabase>;

  constructor(dbName = 'url-archive-queue') {
    this.dbPromise = openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      },
    });
  }

  async enqueue(item: QueueItem): Promise<void> {
    const db = await this.dbPromise;
    await db.add(STORE, item);
  }

  async getAll(): Promise<QueueItem[]> {
    const db = await this.dbPromise;
    return db.getAll(STORE);
  }

  async remove(id: number): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(STORE, id);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- queue`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/queue.ts lib/queue.test.ts
git commit -m "feat: add IndexedDB offline clip queue"
```

---

## Task 7：剪藏编排（captureClip）

**Files:**
- Create: `lib/capture.ts`
- Test: `lib/capture.test.ts`

这是地基的核心：组装笔记、调 AI（失败则标记 `ai_pending`）、写 vault（失败则入队）。全部依赖通过参数注入，便于测试。

- [ ] **Step 1: 写失败测试**

Create `lib/capture.test.ts`：

```ts
import { describe, test, expect, vi } from 'vitest';
import { captureClip } from './capture';
import type { ClipData, Settings, AIResult, QueueItem } from './types';
import type { VaultWriter } from './vault';

const settings: Settings = {
  llmBaseUrl: 'x', llmApiKey: 'x', llmModel: 'x',
  restApiUrl: 'x', restApiToken: 'x', vaultFolder: 'URL Archive',
};

const clip: ClipData = {
  url: 'https://example.com/a',
  title: '标题',
  selection: '',
  contentMarkdown: '正文',
  clippedAt: '2026-06-23T14:30:00',
};

const aiOk: AIResult = { summary: '摘要', highlights: ['h'], tags: ['t'] };

function fakeWriter(impl?: () => Promise<void>): VaultWriter & { written: { path: string; content: string }[] } {
  const written: { path: string; content: string }[] = [];
  return {
    written,
    async write(path, content) {
      if (impl) await impl();
      written.push({ path, content });
    },
  };
}

function fakeQueue() {
  const items: QueueItem[] = [];
  return {
    items,
    enqueue: async (i: QueueItem) => { items.push(i); },
    getAll: async () => items,
    remove: async () => {},
  };
}

describe('captureClip', () => {
  test('成功路径：调 AI、写入 vault、written=true', async () => {
    const writer = fakeWriter();
    const queue = fakeQueue();
    const enrich = vi.fn().mockResolvedValue(aiOk);

    const result = await captureClip(clip, '我的意图', settings, { enrich, writer, queue });

    expect(result.written).toBe(true);
    expect(writer.written).toHaveLength(1);
    expect(writer.written[0].path).toBe('URL Archive/example.com-标题-2026-06-23.md');
    expect(writer.written[0].content).toContain('summary: 摘要');
    expect(writer.written[0].content).toContain('我的意图');
    expect(writer.written[0].content).toContain('ai_pending: false');
    expect(queue.items).toHaveLength(0);
  });

  test('AI 失败：仍写入，标记 ai_pending=true，summary 为空', async () => {
    const writer = fakeWriter();
    const queue = fakeQueue();
    const enrich = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await captureClip(clip, '', settings, { enrich, writer, queue });

    expect(result.written).toBe(true);
    expect(writer.written[0].content).toContain('ai_pending: true');
    expect(writer.written[0].content).toContain('AI 摘要待补');
  });

  test('写入失败：入队，written=false', async () => {
    const writer = fakeWriter(async () => { throw new Error('offline'); });
    const queue = fakeQueue();
    const enrich = vi.fn().mockResolvedValue(aiOk);

    const result = await captureClip(clip, '', settings, { enrich, writer, queue });

    expect(result.written).toBe(false);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].path).toBe('URL Archive/example.com-标题-2026-06-23.md');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- capture`
Expected: FAIL，`captureClip` 未定义。

- [ ] **Step 3: 实现**

Create `lib/capture.ts`：

```ts
import type { ClipData, AIResult, ClippedNote, Settings, QueueItem } from './types';
import type { VaultWriter } from './vault';
import { serializeNote, generateFilename } from './markdown';

/** captureClip 依赖的协作者，全部注入便于测试与替换 */
export interface CaptureDeps {
  enrich: (clip: ClipData, settings: Settings) => Promise<AIResult>;
  writer: VaultWriter;
  queue: { enqueue: (item: QueueItem) => Promise<void> };
}

export async function captureClip(
  clip: ClipData,
  why: string,
  settings: Settings,
  deps: CaptureDeps,
): Promise<{ written: boolean; path: string }> {
  let ai: AIResult = { summary: '', highlights: [], tags: [] };
  let aiPending = false;
  try {
    ai = await deps.enrich(clip, settings);
  } catch {
    aiPending = true;
  }

  const note: ClippedNote = {
    url: clip.url,
    title: clip.title,
    clipped: clip.clippedAt,
    domain: new URL(clip.url).hostname,
    summary: ai.summary,
    tags: ai.tags,
    why,
    status: 'unread',
    revived: 0,
    lastVisited: '',
    aiPending,
    highlights: ai.highlights,
    contentMarkdown: clip.contentMarkdown,
  };

  const path = `${settings.vaultFolder}/${generateFilename(note)}`;
  const content = serializeNote(note);

  try {
    await deps.writer.write(path, content);
    return { written: true, path };
  } catch {
    await deps.queue.enqueue({ path, content, enqueuedAt: new Date().toISOString() });
    return { written: false, path };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- capture`
Expected: PASS，三条路径全过。

- [ ] **Step 5: Commit**

```bash
git add lib/capture.ts lib/capture.test.ts
git commit -m "feat: add captureClip orchestrator with AI/vault fallbacks"
```

---

## Task 8：正文提取（extractArticle）

**Files:**
- Create: `lib/extract.ts`
- Test: `lib/extract.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/extract.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { extractArticle } from './extract';

describe('extractArticle', () => {
  test('从文档提取标题与正文 markdown', () => {
    document.body.innerHTML = `
      <article>
        <h1>测试标题</h1>
        <p>这是第一段正文，需要足够长才能被 Readability 当成正文识别出来，所以多写一些内容凑够长度阈值。</p>
        <p>这是第二段正文，同样需要足够的字数来保证算法不会把它当作噪音过滤掉，继续补充文字。</p>
      </article>`;
    document.title = '页面标题';

    const result = extractArticle(document);
    expect(result.contentMarkdown).toContain('第一段正文');
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.selection).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- extract`
Expected: FAIL，`extractArticle` 未定义。

- [ ] **Step 3: 实现**

Create `lib/extract.ts`：

```ts
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface ExtractResult {
  title: string;
  contentMarkdown: string;
  selection: string;
}

export function extractArticle(doc: Document): ExtractResult {
  const selection = doc.getSelection?.()?.toString() ?? '';

  // Readability 会修改传入的 DOM，故克隆后解析
  const clone = doc.cloneNode(true) as Document;
  const article = new Readability(clone).parse();

  const turndown = new TurndownService({ headingStyle: 'atx' });
  const contentMarkdown = article?.content ? turndown.turndown(article.content) : '';

  return {
    title: article?.title || doc.title,
    contentMarkdown,
    selection,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- extract`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/extract.ts lib/extract.test.ts
git commit -m "feat: add article extraction via Readability + Turndown"
```

---

## Task 9：设置存取（settings）

**Files:**
- Create: `lib/settings.ts`
- Test: `lib/settings.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/settings.test.ts`：

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';

beforeEach(() => {
  const store: Record<string, unknown> = {};
  // 模拟 chrome.storage.local
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(store, obj); }),
      },
    },
  };
});

describe('settings', () => {
  test('未保存时返回默认值', async () => {
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  test('保存后能读回，且与默认值合并', async () => {
    await saveSettings({ llmApiKey: 'sk-1', vaultFolder: 'Notes' });
    const s = await loadSettings();
    expect(s.llmApiKey).toBe('sk-1');
    expect(s.vaultFolder).toBe('Notes');
    expect(s.restApiUrl).toBe(DEFAULT_SETTINGS.restApiUrl);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- settings`
Expected: FAIL，`loadSettings` 未定义。

- [ ] **Step 3: 实现**

Create `lib/settings.ts`：

```ts
import type { Settings } from './types';

const KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
  restApiUrl: 'http://127.0.0.1:27123',
  restApiToken: '',
  vaultFolder: 'URL Archive',
};

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(got[KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.local.set({ [KEY]: { ...current, ...partial } });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- settings`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts lib/settings.test.ts
git commit -m "feat: add settings load/save over chrome.storage.local"
```

---

## Task 10：manifest 与权限配置

**Files:**
- Modify: `wxt.config.ts`

- [ ] **Step 1: 配置 manifest**

替换 `wxt.config.ts` 内容为：

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'URL Archive',
    description: '一键把网页剪藏进 Obsidian，AI 自动摘要与标签。',
    permissions: ['activeTab', 'scripting', 'storage'],
    // 允许扩展请求本地 Obsidian REST API 与用户配置的 LLM 端点
    host_permissions: ['http://127.0.0.1/*', 'https://*/*'],
    action: { default_title: '剪藏到 Obsidian' },
  },
});
```

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: 构建成功，`.output/chrome-mv3/manifest.json` 中含上述 name、permissions、host_permissions。

- [ ] **Step 3: Commit**

```bash
git add wxt.config.ts
git commit -m "chore: configure MV3 manifest and permissions"
```

---

## Task 11：content script（页面内提取）

**Files:**
- Create: `entrypoints/content.ts`

content script 监听来自 background 的消息，调用 `extractArticle` 返回结果。

- [ ] **Step 1: 实现**

Create `entrypoints/content.ts`：

```ts
import { extractArticle } from '@/lib/extract';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'EXTRACT') {
        const result = extractArticle(document);
        sendResponse(result);
      }
      return true; // 异步响应保活
    });
  },
});
```

> 注：WXT 会自动注入 `defineContentScript` 等全局 API，无需手动 import。`@/` 别名指向项目根，由 WXT 默认配置提供。

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: 构建成功，`.output/chrome-mv3/` 下生成 content script。

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat: add content script for article extraction"
```

---

## Task 12：background（驱动剪藏 + 启动重试队列）

**Files:**
- Create: `entrypoints/background.ts`

background 提供两个消息处理：`CAPTURE`（执行一次剪藏）与启动时 `flushQueue`（重试离线队列）。

- [ ] **Step 1: 实现**

Create `entrypoints/background.ts`：

```ts
import { loadSettings } from '@/lib/settings';
import { enrichClip } from '@/lib/llm';
import { RestApiWriter } from '@/lib/vault';
import { ClipQueue } from '@/lib/queue';
import { captureClip } from '@/lib/capture';
import type { ClipData } from '@/lib/types';

export default defineBackground(() => {
  const queue = new ClipQueue();

  // 启动时尝试把离线队列写回 vault
  flushQueue(queue);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'CAPTURE') {
      handleCapture(msg.why ?? '', queue)
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true; // 异步
    }
  });
});

async function handleCapture(why: string, queue: ClipQueue) {
  const settings = await loadSettings();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('无法获取当前标签页');

  const extract = (await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT' })) as {
    title: string; contentMarkdown: string; selection: string;
  };

  const clip: ClipData = {
    url: tab.url ?? '',
    title: extract.title || tab.title || '',
    selection: extract.selection,
    contentMarkdown: extract.contentMarkdown,
    clippedAt: new Date().toISOString(),
  };

  const writer = new RestApiWriter(settings);
  return captureClip(clip, why, settings, {
    enrich: enrichClip,
    writer,
    queue,
  });
}

async function flushQueue(queue: ClipQueue) {
  try {
    const settings = await loadSettings();
    if (!settings.restApiToken) return;
    const writer = new RestApiWriter(settings);
    const items = await queue.getAll();
    for (const item of items) {
      try {
        await writer.write(item.path, item.content);
        if (item.id != null) await queue.remove(item.id);
      } catch {
        // 仍不可用，留待下次启动
        break;
      }
    }
  } catch {
    // 忽略：下次启动再试
  }
}
```

- [ ] **Step 2: 验证类型**

Run: `npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 3: 验证构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: add background capture driver and offline queue flush"
```

---

## Task 13：popup UI（剪藏浮层）

**Files:**
- Create/Modify: `entrypoints/popup/index.html`、`entrypoints/popup/main.ts`、`entrypoints/popup/style.css`

popup 提供：一个"剪藏"按钮 + `why` 输入框 + 状态提示。点击后向 background 发 `CAPTURE`。

- [ ] **Step 1: 写 HTML**

Replace `entrypoints/popup/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div class="card">
      <textarea id="why" placeholder="为什么留它？（可选）" rows="2"></textarea>
      <button id="clip">剪藏到 Obsidian</button>
      <p id="status" class="status"></p>
    </div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 写交互逻辑**

Create/Replace `entrypoints/popup/main.ts`：

```ts
const whyEl = document.getElementById('why') as HTMLTextAreaElement;
const btn = document.getElementById('clip') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

whyEl.focus();

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = '剪藏中…';
  const res = await chrome.runtime.sendMessage({ type: 'CAPTURE', why: whyEl.value });
  if (res?.ok && res.written) {
    statusEl.textContent = '✓ 已剪藏到 Obsidian';
    setTimeout(() => window.close(), 800);
  } else if (res?.ok && !res.written) {
    statusEl.textContent = '✓ 已暂存（Obsidian 不可用，恢复后自动写入）';
  } else {
    statusEl.textContent = `✗ 失败：${res?.error ?? '未知错误'}`;
    btn.disabled = false;
  }
});
```

- [ ] **Step 3: 写样式**

Create/Replace `entrypoints/popup/style.css`：

```css
body { margin: 0; font-family: system-ui, sans-serif; }
.card { width: 280px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
textarea { width: 100%; box-sizing: border-box; resize: none; padding: 6px; font: inherit; }
button { padding: 8px; border: none; border-radius: 6px; background: #6c5ce7; color: #fff; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
.status { margin: 0; font-size: 12px; color: #555; min-height: 16px; }
```

- [ ] **Step 4: 验证构建**

Run: `npm run build`
Expected: 构建成功，popup 资源生成。

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/
git commit -m "feat: add capture popup UI"
```

---

## Task 14：options UI（设置页）

**Files:**
- Create: `entrypoints/options/index.html`、`entrypoints/options/main.ts`

设置页让用户填 LLM 端点/key/模型、REST API 地址/token、vault 文件夹。

- [ ] **Step 1: 写 HTML**

Create `entrypoints/options/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>URL Archive 设置</title></head>
  <body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 24px auto;">
    <h2>URL Archive 设置</h2>
    <fieldset>
      <legend>AI（BYOK）</legend>
      <label>API 端点 <input id="llmBaseUrl" style="width:100%" /></label>
      <label>API Key <input id="llmApiKey" type="password" style="width:100%" /></label>
      <label>模型 <input id="llmModel" style="width:100%" /></label>
    </fieldset>
    <fieldset>
      <legend>Obsidian Local REST API</legend>
      <label>地址 <input id="restApiUrl" style="width:100%" /></label>
      <label>Token <input id="restApiToken" type="password" style="width:100%" /></label>
      <label>vault 文件夹 <input id="vaultFolder" style="width:100%" /></label>
    </fieldset>
    <button id="save">保存</button>
    <span id="saved"></span>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 写逻辑**

Create `entrypoints/options/main.ts`：

```ts
import { loadSettings, saveSettings } from '@/lib/settings';
import type { Settings } from '@/lib/types';

const fields: (keyof Settings)[] = [
  'llmBaseUrl', 'llmApiKey', 'llmModel', 'restApiUrl', 'restApiToken', 'vaultFolder',
];

async function init() {
  const s = await loadSettings();
  for (const f of fields) {
    (document.getElementById(f) as HTMLInputElement).value = String(s[f] ?? '');
  }
}

document.getElementById('save')!.addEventListener('click', async () => {
  const partial: Partial<Settings> = {};
  for (const f of fields) {
    partial[f] = (document.getElementById(f) as HTMLInputElement).value as never;
  }
  await saveSettings(partial);
  document.getElementById('saved')!.textContent = ' 已保存';
});

init();
```

- [ ] **Step 3: 验证构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/
git commit -m "feat: add options settings page"
```

---

## Task 15：端到端手动验证

**Files:** 无（手动验证 + 文档）

- [ ] **Step 1: 准备 Obsidian**

1. 在 Obsidian 安装并启用 **Local REST API** 插件（coddingtonbear）。
2. 在插件设置中开启 **Enable Non-encrypted (HTTP) Server**（端口默认 `27123`），复制 **API Key**。

- [ ] **Step 2: 加载扩展**

```bash
npm run build
```
在 Chrome `chrome://extensions` → 打开开发者模式 → 加载已解压的扩展 → 选 `.output/chrome-mv3/`。

- [ ] **Step 3: 填写设置**

打开扩展 options 页，填入：
- API 端点 / Key / 模型（如 OpenAI 兼容服务）
- REST API 地址 `http://127.0.0.1:27123`、Token（上一步的 API Key）、vault 文件夹 `URL Archive`
- 保存。

- [ ] **Step 4: 真机剪藏**

打开任意文章页 → 点扩展图标 → 填一句"为什么留它" → 点"剪藏到 Obsidian"。
Expected: 弹出"✓ 已剪藏到 Obsidian"；Obsidian 的 `URL Archive/` 下出现新 `.md`，含 frontmatter（summary/tags/why/正文快照）。

- [ ] **Step 5: 验证离线兜底**

关闭 Obsidian（或停掉 REST API）→ 再剪藏一篇。
Expected: 提示"已暂存"。重新打开 Obsidian 后，重载扩展（或重启浏览器触发 background 启动）→ 队列中的笔记自动写入 vault。

- [ ] **Step 6: 记录验证结果并 Commit**

把验证结论追加到设计文档或 README，然后：

```bash
git add -A
git commit -m "docs: record phase-1 manual verification results"
```

---

## 自检：spec 覆盖核对

- **数据模型（spec §3）** → Task 2（类型）+ Task 3（序列化，含 `last_visited`/`ai_pending`/速览/备注/快照）✅
- **剪藏流程·先存后理解（spec §4.1）** → Task 13 popup 立即反馈 + Task 7 AI 异步失败不阻塞 ✅
- **极低摩擦 why（spec §4.1）** → Task 13 默认 focus、可空 ✅
- **失败兜底·绝不丢收藏（spec §4.1/§9）** → Task 7（AI 失败标记 `ai_pending`）+ Task 6/12（写入失败入队、启动重试）✅
- **BYOK + OpenAI 兼容适配（spec §4.2）** → Task 4 ✅
- **Key 不进 vault/不上传（spec §4.2）** → Task 9 仅存 `chrome.storage.local` ✅
- **桥 RestApiWriter + 可插拔（spec §4.3）** → Task 5（`VaultWriter` 接口 + 实现）✅
- **配置项：文件夹/命名/端点/token（spec §4.3）** → Task 3 命名 + Task 14 设置页 ✅
- **正文快照（spec §3/§4.1）** → Task 8 提取 + Task 3 写入 ✅

阶段 2~4（取回/RAG/复活）不在本计划范围，将各自单独成计划。

**类型一致性核对**：`captureClip` 注入的 `enrich`/`writer`/`queue` 签名与 `enrichClip`（Task 4）、`RestApiWriter`（Task 5）、`ClipQueue`（Task 6）一致；`ClippedNote` 字段在 Task 2 定义、Task 3 序列化、Task 7 组装三处保持同名。✅
