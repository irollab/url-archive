# URL Archive New Tab Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a URL Archive new-tab workspace that replaces the browser new tab with visual bookmark cards, category navigation, search, density/theme controls, edit actions, and plugin feature panels.

**Architecture:** Keep the existing WXT + vanilla TypeScript structure. Add focused pure modules under `lib/` for dashboard view models and user preferences, expose one `GET_DASHBOARD_DATA` background message, and add `entrypoints/newtab/` for the UI. Reuse the existing `SavedClip`, search, folder, import, update, and open messages instead of creating a parallel data store.

**Tech Stack:** WXT MV3, TypeScript, vanilla DOM, `chrome.storage.local`, `chrome.bookmarks`, Vitest.

---

## File Structure

- Create `url-archive-extension/lib/dashboard.ts`
  - Converts raw `SavedClip[]` into dashboard data: visual cards, folders, stats, recent clips, revisit suggestions, virtual category counts.
- Create `url-archive-extension/lib/dashboard.test.ts`
  - Unit tests for card mapping, source labels, favicon fallback metadata, category filtering, recent clips, and revisit recommendations.
- Create `url-archive-extension/lib/preferences.ts`
  - Stores and loads new-tab UI preferences: density, theme, and right-panel collapsed state.
- Create `url-archive-extension/lib/preferences.test.ts`
  - Unit tests for defaults, valid updates, and invalid value fallback.
- Modify `url-archive-extension/lib/revisit.ts`
  - Export dashboard helpers if needed and keep existing search/folder functions as source of truth.
- Modify `url-archive-extension/entrypoints/background.ts`
  - Add `GET_DASHBOARD_DATA`, `LOAD_NEW_TAB_PREFS`, and `SAVE_NEW_TAB_PREFS` messages.
- Modify `url-archive-extension/wxt.config.ts`
  - Add `chrome_url_overrides.newtab` to manifest.
- Create `url-archive-extension/entrypoints/newtab/index.html`
  - New-tab document shell.
- Create `url-archive-extension/entrypoints/newtab/main.ts`
  - New-tab state, actions, event wiring, rendering orchestration.
- Create `url-archive-extension/entrypoints/newtab/style.css`
  - Responsive layout, light theme, dark theme, compact/standard/large density.
- Optional after implementation: update `url-archive-extension/README.md`
  - Add a short note about new-tab override and reloading the extension.

---

### Task 1: Dashboard View Model

**Files:**
- Create: `url-archive-extension/lib/dashboard.ts`
- Create: `url-archive-extension/lib/dashboard.test.ts`

- [ ] **Step 1: Write failing dashboard tests**

Create `url-archive-extension/lib/dashboard.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { buildDashboardData, cardInitial, type DashboardOptions } from './dashboard';
import type { SavedClip } from './types';

function clip(overrides: Partial<SavedClip>): SavedClip {
  return {
    url: 'https://example.com/a',
    canonicalUrl: 'https://example.com/a',
    title: 'Example',
    domain: 'example.com',
    path: 'URL Archive/example.md',
    source: 'bookmark',
    folder: '书签栏 / 工作 / AI',
    faviconUrl: 'https://example.com/favicon.ico',
    summary: '摘要',
    tags: ['浏览器书签', 'AI'],
    keywords: [],
    aliases: [],
    intent: '',
    why: '常用工具',
    clipped: '2026-07-01T00:00:00.000Z',
    queued: false,
    revived: 0,
    lastVisited: '',
    ...overrides,
  };
}

describe('dashboard view model', () => {
  test('maps saved clips to visual cards with source labels', () => {
    const data = buildDashboardData([
      clip({ title: '书签 A', source: 'bookmark' }),
      clip({ url: 'https://clip.example.com', title: '剪藏 B', source: 'clip', domain: 'clip.example.com' }),
    ]);

    expect(data.cards).toHaveLength(2);
    expect(data.cards[0]).toMatchObject({
      title: '书签 A',
      sourceLabel: '书签',
      faviconUrl: 'https://example.com/favicon.ico',
      initial: 'E',
    });
    expect(data.cards[1].sourceLabel).toBe('剪藏');
  });

  test('filters cards by selected bookmark folder including children', () => {
    const options: DashboardOptions = { folder: '书签栏 / 工作' };
    const data = buildDashboardData([
      clip({ title: 'AI', folder: '书签栏 / 工作 / AI' }),
      clip({ url: 'https://finance.example.com', title: '财务', folder: '书签栏 / 工作 / 财务' }),
      clip({ url: 'https://life.example.com', title: '生活', folder: '书签栏 / 生活' }),
    ], options);

    expect(data.cards.map((card) => card.title)).toEqual(['AI', '财务']);
  });

  test('builds right panel data for revisit and recent clips', () => {
    const data = buildDashboardData([
      clip({ title: '旧书签', clipped: '2026-06-01T00:00:00.000Z', revived: 0 }),
      clip({ url: 'https://new.example.com', title: '最近剪藏', source: 'clip', clipped: '2026-07-03T00:00:00.000Z' }),
    ]);

    expect(data.revisit?.title).toBe('旧书签');
    expect(data.recent[0].title).toBe('最近剪藏');
  });

  test('uses domain initial when title is empty', () => {
    expect(cardInitial('', 'f3.fenxi365.com')).toBe('F');
    expect(cardInitial('纷析云', 'f3.fenxi365.com')).toBe('纷');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd "F:\Code\github\irollab\URL Archive\url-archive-extension"
npm test -- lib/dashboard.test.ts
```

Expected: FAIL because `./dashboard` does not exist.

- [ ] **Step 3: Implement dashboard view model**

Create `url-archive-extension/lib/dashboard.ts`:

```ts
import type { SavedClip } from './types';
import { getBookmarkFolders, getSavedClipStats, pickRevisitClip, searchSavedClips, type BookmarkFolderOption, type SavedClipStats } from './revisit';

export interface DashboardOptions {
  query?: string;
  folder?: string;
  limit?: number;
}

export interface DashboardCard {
  url: string;
  canonicalUrl?: string;
  title: string;
  domain: string;
  folder: string;
  faviconUrl: string;
  initial: string;
  source: 'bookmark' | 'clip';
  sourceLabel: string;
  summary: string;
  tags: string[];
  why: string;
  queued: boolean;
  revived: number;
  lastVisited: string;
}

export interface DashboardData {
  stats: SavedClipStats;
  folders: BookmarkFolderOption[];
  cards: DashboardCard[];
  recent: DashboardCard[];
  revisit: DashboardCard | null;
}

export function buildDashboardData(clips: SavedClip[], options: DashboardOptions = {}): DashboardData {
  const filtered = searchSavedClips(clips, options.query ?? '', {
    filter: 'all',
    folder: options.folder ?? '',
    limit: options.limit ?? 80,
  });

  const recentClips = [...clips]
    .filter((clip) => (clip.source ?? 'clip') === 'clip')
    .sort((a, b) => b.clipped.localeCompare(a.clipped))
    .slice(0, 5);

  const revisit = pickRevisitClip(clips);

  return {
    stats: getSavedClipStats(clips),
    folders: getBookmarkFolders(clips),
    cards: filtered.map(toDashboardCard),
    recent: recentClips.map(toDashboardCard),
    revisit: revisit ? toDashboardCard(revisit) : null,
  };
}

export function toDashboardCard(clip: SavedClip): DashboardCard {
  return {
    url: clip.url,
    canonicalUrl: clip.canonicalUrl,
    title: clip.title || clip.url,
    domain: clip.domain,
    folder: clip.folder ?? '',
    faviconUrl: clip.faviconUrl || faviconForUrl(clip.url),
    initial: cardInitial(clip.title, clip.domain),
    source: clip.source === 'bookmark' ? 'bookmark' : 'clip',
    sourceLabel: clip.source === 'bookmark' ? '书签' : (clip.queued ? '暂存' : '剪藏'),
    summary: clip.summary,
    tags: clip.tags,
    why: clip.why,
    queued: clip.queued,
    revived: clip.revived,
    lastVisited: clip.lastVisited,
  };
}

export function cardInitial(title: string, domain: string): string {
  const raw = (title || domain || '?').trim();
  return raw.slice(0, 1).toUpperCase();
}

function faviconForUrl(rawUrl: string): string {
  try {
    return `${new URL(rawUrl).origin}/favicon.ico`;
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run dashboard tests**

Run:

```powershell
npm test -- lib/dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add url-archive-extension/lib/dashboard.ts url-archive-extension/lib/dashboard.test.ts
git commit -m "feat: add new tab dashboard view model"
```

---

### Task 2: New Tab Preferences

**Files:**
- Create: `url-archive-extension/lib/preferences.ts`
- Create: `url-archive-extension/lib/preferences.test.ts`

- [ ] **Step 1: Write failing preference tests**

Create `url-archive-extension/lib/preferences.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { loadNewTabPrefs, saveNewTabPrefs } from './preferences';

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(store, obj); }),
      },
    },
  };
});

describe('new tab preferences', () => {
  test('loads defaults when no preferences are saved', async () => {
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'standard',
      theme: 'light',
      rightPanelCollapsed: false,
    });
  });

  test('saves valid preferences', async () => {
    await saveNewTabPrefs({ density: 'compact', theme: 'dark', rightPanelCollapsed: true });
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'compact',
      theme: 'dark',
      rightPanelCollapsed: true,
    });
  });

  test('falls back from invalid stored values', async () => {
    store.new_tab_prefs = { density: 'tiny', theme: 'neon', rightPanelCollapsed: 'yes' };
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'standard',
      theme: 'light',
      rightPanelCollapsed: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- lib/preferences.test.ts
```

Expected: FAIL because `./preferences` does not exist.

- [ ] **Step 3: Implement preferences module**

Create `url-archive-extension/lib/preferences.ts`:

```ts
const KEY = 'new_tab_prefs';

export type NewTabDensity = 'compact' | 'standard' | 'large';
export type NewTabTheme = 'light' | 'dark';

export interface NewTabPrefs {
  density: NewTabDensity;
  theme: NewTabTheme;
  rightPanelCollapsed: boolean;
}

const DEFAULT_PREFS: NewTabPrefs = {
  density: 'standard',
  theme: 'light',
  rightPanelCollapsed: false,
};

export async function loadNewTabPrefs(): Promise<NewTabPrefs> {
  const got = await chrome.storage.local.get(KEY);
  return normalizePrefs(got[KEY]);
}

export async function saveNewTabPrefs(update: Partial<NewTabPrefs>): Promise<NewTabPrefs> {
  const current = await loadNewTabPrefs();
  const next = normalizePrefs({ ...current, ...update });
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function normalizePrefs(value: unknown): NewTabPrefs {
  const raw = isRecord(value) ? value : {};
  return {
    density: isDensity(raw.density) ? raw.density : DEFAULT_PREFS.density,
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_PREFS.theme,
    rightPanelCollapsed: typeof raw.rightPanelCollapsed === 'boolean'
      ? raw.rightPanelCollapsed
      : DEFAULT_PREFS.rightPanelCollapsed,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDensity(value: unknown): value is NewTabDensity {
  return value === 'compact' || value === 'standard' || value === 'large';
}

function isTheme(value: unknown): value is NewTabTheme {
  return value === 'light' || value === 'dark';
}
```

- [ ] **Step 4: Run preference tests**

Run:

```powershell
npm test -- lib/preferences.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run compile**

Run:

```powershell
npm run compile
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add url-archive-extension/lib/preferences.ts url-archive-extension/lib/preferences.test.ts
git commit -m "feat: add new tab preferences"
```

---

### Task 3: Background Dashboard Messages

**Files:**
- Modify: `url-archive-extension/entrypoints/background.ts`

- [ ] **Step 1: Add imports**

Modify imports in `url-archive-extension/entrypoints/background.ts`:

```ts
import { buildDashboardData } from '@/lib/dashboard';
import { loadNewTabPrefs, saveNewTabPrefs } from '@/lib/preferences';
```

- [ ] **Step 2: Add message handlers**

Inside `chrome.runtime.onMessage.addListener`, after the existing `UPDATE_SAVED_CLIP` handler, add:

```ts
    if (msg?.type === 'GET_DASHBOARD_DATA') {
      handleDashboardData(String(msg.query ?? ''), String(msg.folder ?? ''))
        .then((data) => sendResponse({ ok: true, data }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'LOAD_NEW_TAB_PREFS') {
      loadNewTabPrefs()
        .then((prefs) => sendResponse({ ok: true, prefs }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'SAVE_NEW_TAB_PREFS') {
      saveNewTabPrefs(msg.update ?? {})
        .then((prefs) => sendResponse({ ok: true, prefs }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
```

- [ ] **Step 3: Add handler function**

Below `handleBookmarkFolders`, add:

```ts
async function handleDashboardData(query: string, folder: string) {
  const clips = await loadSavedClips();
  return buildDashboardData(clips, { query, folder, limit: 80 });
}
```

- [ ] **Step 4: Run compile**

Run:

```powershell
npm run compile
```

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add url-archive-extension/entrypoints/background.ts
git commit -m "feat: expose new tab dashboard data"
```

---

### Task 4: New Tab Manifest and HTML Shell

**Files:**
- Modify: `url-archive-extension/wxt.config.ts`
- Create: `url-archive-extension/entrypoints/newtab/index.html`
- Create: `url-archive-extension/entrypoints/newtab/style.css`
- Create: `url-archive-extension/entrypoints/newtab/main.ts`

- [ ] **Step 1: Add manifest override**

Modify `url-archive-extension/wxt.config.ts` manifest:

```ts
    chrome_url_overrides: {
      newtab: 'newtab.html',
    },
```

The manifest block should include:

```ts
  manifest: {
    name: 'URL Archive',
    description: '一键把网页剪藏进 Obsidian，AI 自动摘要与标签。',
    permissions: ['activeTab', 'scripting', 'storage', 'bookmarks'],
    host_permissions: ['http://127.0.0.1/*', 'http://*/*', 'https://*/*'],
    action: { default_title: '剪藏到 Obsidian' },
    chrome_url_overrides: {
      newtab: 'newtab.html',
    },
  },
```

- [ ] **Step 2: Create HTML shell**

Create `url-archive-extension/entrypoints/newtab/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>URL Archive</title>
    <meta name="manifest.type" content="newtab" />
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main id="app" class="newtab density-standard theme-light">
      <header class="topbar">
        <div class="brand">URL Archive</div>
        <input id="searchInput" class="search" type="search" placeholder="搜索书签、剪藏、分类、备注、语义线索" autocomplete="off" />
        <div class="toolbar">
          <button class="tool density-button" type="button" data-density="compact">紧凑</button>
          <button class="tool density-button active" type="button" data-density="standard">标准</button>
          <button class="tool density-button" type="button" data-density="large">大图标</button>
          <button id="themeToggle" class="tool" type="button">深色</button>
          <button id="clipCurrent" class="tool primary" type="button">剪藏</button>
          <button id="importBookmarks" class="tool" type="button">导入</button>
          <button id="openSettings" class="tool" type="button">设置</button>
        </div>
      </header>

      <section id="status" class="status" aria-live="polite"></section>

      <div class="layout">
        <aside class="sidebar">
          <div class="panel-title">分类</div>
          <div id="categoryList" class="category-list"></div>
        </aside>

        <section class="content">
          <div class="content-head">
            <div id="contentTitle" class="content-title">全部收藏</div>
            <button id="aiRecall" class="ai-recall" type="button">AI 找回</button>
            <button id="rightDrawerToggle" class="drawer-toggle" type="button">功能</button>
          </div>
          <div id="cards" class="bookmark-grid"></div>
        </section>

        <aside id="rightPanel" class="right-panel">
          <section class="widget">
            <h2>今日回访</h2>
            <div id="revisitWidget" class="widget-body"></div>
          </section>
          <section class="widget">
            <h2>最近剪藏</h2>
            <div id="recentWidget" class="widget-body"></div>
          </section>
          <section class="widget">
            <h2>插件操作</h2>
            <button id="rightImport" class="wide-action" type="button">导入浏览器书签</button>
            <button id="rightSettings" class="wide-action" type="button">打开设置</button>
          </section>
        </aside>
      </div>

      <section id="editPanel" class="edit-panel" hidden>
        <div class="edit-head">
          <strong>编辑收藏</strong>
          <button id="editClose" class="icon-button" type="button" aria-label="关闭编辑">×</button>
        </div>
        <input id="editTitle" type="text" placeholder="标题" />
        <input id="editFolder" type="text" placeholder="分类，例如：书签栏 / 工作 / AI" />
        <input id="editTags" type="text" placeholder="标签，用逗号分隔" />
        <textarea id="editWhy" rows="3" placeholder="备注"></textarea>
        <div class="edit-actions">
          <button id="editSave" class="tool primary" type="button">保存</button>
          <button id="editCancel" class="tool" type="button">取消</button>
        </div>
      </section>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Create minimal CSS**

Create `url-archive-extension/entrypoints/newtab/style.css`:

```css
body { margin: 0; font-family: system-ui, sans-serif; color: #17212f; background: #f4f7f8; }
.newtab { min-height: 100vh; }
.topbar { height: 72px; display: grid; grid-template-columns: 180px minmax(260px, 1fr) auto; gap: 14px; align-items: center; padding: 0 22px; background: #fff; border-bottom: 1px solid #e1e7ef; }
.brand { font-weight: 850; font-size: 18px; }
.search { height: 42px; border: 1px solid #d6dee8; border-radius: 12px; padding: 0 14px; font: inherit; background: #f8fafc; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.tool { border: 1px solid #d6dee8; background: #fff; border-radius: 10px; padding: 9px 11px; color: #344054; cursor: pointer; }
.tool.primary, .tool.active { background: #17212f; color: #fff; border-color: #17212f; }
.status { min-height: 24px; padding: 6px 22px; color: #667085; font-size: 13px; }
.layout { display: grid; grid-template-columns: 220px minmax(0, 1fr) 300px; gap: 18px; padding: 18px 22px 28px; }
.sidebar, .right-panel, .bookmark-card, .widget { background: #fff; border: 1px solid #dbe3ec; border-radius: 12px; }
.sidebar { padding: 12px; }
.panel-title, .content-title { font-weight: 750; }
.category-list { display: grid; gap: 6px; margin-top: 10px; }
.category-button { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; border: 0; border-radius: 9px; background: transparent; padding: 9px 10px; text-align: left; cursor: pointer; color: #344054; }
.category-button.active { background: #eaf2ff; color: #1d4ed8; font-weight: 750; }
.content-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.content-title { margin-right: auto; }
.ai-recall, .drawer-toggle { border: 1px solid #d6dee8; border-radius: 10px; background: #fff; padding: 8px 10px; }
.drawer-toggle { display: none; }
.bookmark-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.bookmark-card { min-height: 116px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer; }
.card-top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
.favicon, .favicon-fallback { width: 38px; height: 38px; border-radius: 10px; border: 1px solid #d6dee8; background: #eef4f8; object-fit: contain; display: grid; place-items: center; font-weight: 850; }
.card-title { font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-meta, .card-tags { color: #667085; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-badge { border-radius: 999px; padding: 4px 7px; font-size: 11px; background: #eef2f6; color: #344054; }
.edit-card { border: 0; background: transparent; color: #1d4ed8; cursor: pointer; padding: 0; }
.right-panel { display: grid; gap: 12px; align-content: start; border: 0; background: transparent; }
.widget { padding: 12px; }
.widget h2 { margin: 0 0 10px; font-size: 14px; }
.widget-body { color: #667085; font-size: 13px; line-height: 1.5; }
.wide-action { width: 100%; margin-top: 8px; border: 1px solid #d6dee8; border-radius: 10px; background: #fff; padding: 9px 10px; text-align: left; }
.edit-panel { position: fixed; right: 22px; bottom: 22px; width: min(420px, calc(100vw - 44px)); background: #fff; border: 1px solid #d6dee8; border-radius: 12px; padding: 14px; box-shadow: 0 20px 45px rgba(15, 23, 42, .18); display: grid; gap: 10px; }
.edit-panel[hidden] { display: none; }
.edit-head, .edit-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.edit-panel input, .edit-panel textarea { width: 100%; border: 1px solid #d6dee8; border-radius: 10px; padding: 9px 10px; font: inherit; }
.icon-button { width: 30px; height: 30px; border: 1px solid #d6dee8; border-radius: 8px; background: #fff; }
.density-compact .bookmark-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.density-compact .bookmark-card { min-height: 90px; }
.density-large .bookmark-grid { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.density-large .bookmark-card { min-height: 148px; }
.theme-dark { background: #141821; color: #eef4ff; }
.theme-dark .topbar, .theme-dark .sidebar, .theme-dark .bookmark-card, .theme-dark .widget, .theme-dark .edit-panel { background: #1a2230; border-color: #334155; }
.theme-dark .search, .theme-dark .tool, .theme-dark .wide-action, .theme-dark .ai-recall, .theme-dark .drawer-toggle { background: #202837; border-color: #334155; color: #eef4ff; }
@media (max-width: 1100px) {
  .layout { grid-template-columns: 210px minmax(0, 1fr); }
  .right-panel { display: none; position: fixed; right: 18px; top: 88px; width: 300px; z-index: 3; }
  .right-panel.open { display: grid; }
  .drawer-toggle { display: inline-block; }
}
@media (max-width: 760px) {
  .topbar { height: auto; grid-template-columns: 1fr; padding: 14px; }
  .layout { grid-template-columns: 1fr; padding: 14px; }
}
```

- [ ] **Step 4: Create placeholder TypeScript**

Create `url-archive-extension/entrypoints/newtab/main.ts`:

```ts
const statusEl = document.getElementById('status') as HTMLElement;
statusEl.textContent = 'URL Archive 新标签页加载中...';
```

- [ ] **Step 5: Build and inspect manifest**

Run:

```powershell
npm run build
Select-String -Path .output\chrome-mv3\manifest.json -Pattern "chrome_url_overrides|newtab"
```

Expected: build succeeds and manifest contains `chrome_url_overrides`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add url-archive-extension/wxt.config.ts url-archive-extension/entrypoints/newtab/
git commit -m "feat: add URL Archive new tab shell"
```

---

### Task 5: New Tab Data Loading and Rendering

**Files:**
- Modify: `url-archive-extension/entrypoints/newtab/main.ts`

- [ ] **Step 1: Replace placeholder with state and actions**

Replace `url-archive-extension/entrypoints/newtab/main.ts` with:

```ts
type Density = 'compact' | 'standard' | 'large';
type Theme = 'light' | 'dark';

type DashboardCard = {
  url: string;
  canonicalUrl?: string;
  title: string;
  domain: string;
  folder: string;
  faviconUrl: string;
  initial: string;
  source: 'bookmark' | 'clip';
  sourceLabel: string;
  summary: string;
  tags: string[];
  why: string;
  queued: boolean;
  revived: number;
  lastVisited: string;
};

type BookmarkFolderOption = { path: string; count: number };
type DashboardData = {
  folders: BookmarkFolderOption[];
  cards: DashboardCard[];
  recent: DashboardCard[];
  revisit: DashboardCard | null;
  stats: { total: number; clips: number; bookmarks: number; queued: number; unvisited: number; visited: number };
};

type Prefs = { density: Density; theme: Theme; rightPanelCollapsed: boolean };

const appEl = document.getElementById('app') as HTMLElement;
const searchInputEl = document.getElementById('searchInput') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLElement;
const categoryListEl = document.getElementById('categoryList') as HTMLElement;
const cardsEl = document.getElementById('cards') as HTMLElement;
const contentTitleEl = document.getElementById('contentTitle') as HTMLElement;
const revisitWidgetEl = document.getElementById('revisitWidget') as HTMLElement;
const recentWidgetEl = document.getElementById('recentWidget') as HTMLElement;
const rightPanelEl = document.getElementById('rightPanel') as HTMLElement;

let currentFolder = '';
let currentData: DashboardData | null = null;
let prefs: Prefs = { density: 'standard', theme: 'light', rightPanelCollapsed: false };

init();

async function init() {
  await loadPrefs();
  await refreshDashboard();
  bindEvents();
  searchInputEl.focus();
}

async function loadPrefs() {
  const res = await chrome.runtime.sendMessage({ type: 'LOAD_NEW_TAB_PREFS' });
  if (res?.ok) prefs = res.prefs as Prefs;
  applyPrefs();
}

async function refreshDashboard() {
  const res = await chrome.runtime.sendMessage({
    type: 'GET_DASHBOARD_DATA',
    query: searchInputEl.value,
    folder: currentFolder,
  });

  if (!res?.ok) {
    statusEl.textContent = `加载失败：${res?.error ?? '未知错误'}`;
    return;
  }

  currentData = res.data as DashboardData;
  statusEl.textContent = `${currentData.stats.total} 条收藏 · ${currentData.stats.bookmarks} 个书签 · ${currentData.stats.clips} 条剪藏`;
  renderDashboard(currentData);
}

function renderDashboard(data: DashboardData) {
  renderCategories(data.folders);
  renderCards(data.cards);
  renderRightPanel(data);
}

function renderCategories(folders: BookmarkFolderOption[]) {
  categoryListEl.replaceChildren();
  categoryListEl.append(categoryButton('全部收藏', '', currentData?.stats.total ?? 0));
  for (const folder of topLevelFolders(folders)) {
    categoryListEl.append(categoryButton(folderName(folder.path), folder.path, folder.count));
  }
}

function categoryButton(label: string, folder: string, count: number): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `category-button${folder === currentFolder ? ' active' : ''}`;
  btn.innerHTML = `<span>${escapeHtml(label)}</span><b>${count}</b>`;
  btn.addEventListener('click', () => {
    currentFolder = folder;
    contentTitleEl.textContent = folder || '全部收藏';
    refreshDashboard();
  });
  return btn;
}

function renderCards(cards: DashboardCard[]) {
  cardsEl.replaceChildren();
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = searchInputEl.value ? '没有匹配的收藏' : '暂无收藏，先导入浏览器书签或剪藏当前网页';
    cardsEl.append(empty);
    return;
  }

  for (const card of cards) {
    cardsEl.append(cardElement(card));
  }
}

function cardElement(card: DashboardCard): HTMLElement {
  const article = document.createElement('article');
  article.className = 'bookmark-card';
  article.tabIndex = 0;
  article.innerHTML = `
    <div class="card-top">
      <img class="favicon" alt="" src="${escapeAttr(card.faviconUrl)}" />
      <span class="source-badge">${escapeHtml(card.sourceLabel)}</span>
    </div>
    <div>
      <div class="card-title">${escapeHtml(card.title)}</div>
      <div class="card-meta">${escapeHtml(card.domain)}${card.folder ? ` · ${escapeHtml(card.folder)}` : ''}</div>
      <div class="card-tags">${escapeHtml(card.tags.slice(0, 3).join(' / '))}</div>
    </div>
  `;

  const img = article.querySelector('img') as HTMLImageElement;
  img.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'favicon-fallback';
    fallback.textContent = card.initial;
    img.replaceWith(fallback);
  }, { once: true });

  article.addEventListener('click', async (event) => {
    if ((event.target as HTMLElement).closest('.edit-card')) return;
    await chrome.runtime.sendMessage({ type: 'OPEN_REVISIT', url: card.url });
  });

  return article;
}

function renderRightPanel(data: DashboardData) {
  revisitWidgetEl.textContent = data.revisit
    ? `${data.revisit.title} · ${data.revisit.domain}`
    : '暂无可回访收藏';

  recentWidgetEl.replaceChildren();
  for (const item of data.recent) {
    const row = document.createElement('div');
    row.className = 'recent-row';
    row.textContent = `${item.title} · ${item.domain}`;
    recentWidgetEl.append(row);
  }
}

function bindEvents() {
  searchInputEl.addEventListener('input', debounce(refreshDashboard, 160));
}

function applyPrefs() {
  appEl.classList.remove('density-compact', 'density-standard', 'density-large', 'theme-light', 'theme-dark');
  appEl.classList.add(`density-${prefs.density}`, `theme-${prefs.theme}`);
  rightPanelEl.classList.toggle('open', !prefs.rightPanelCollapsed);
}

function topLevelFolders(folders: BookmarkFolderOption[]): BookmarkFolderOption[] {
  return folders.filter((folder) => !folder.path.includes(' / '));
}

function folderName(path: string): string {
  const parts = path.split(' / ');
  return parts[parts.length - 1] || path;
}

function debounce(fn: () => void, wait: number) {
  let timer: number | undefined;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, wait);
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

```

- [ ] **Step 2: Run compile**

Run:

```powershell
npm run compile
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: PASS and `newtab.html` is emitted under `.output/chrome-mv3/`.

- [ ] **Step 4: Commit**

Run:

```powershell
git add url-archive-extension/entrypoints/newtab/main.ts
git commit -m "feat: render new tab dashboard"
```

---

### Task 6: New Tab Controls and Import Actions

**Files:**
- Modify: `url-archive-extension/entrypoints/newtab/main.ts`
- Modify: `url-archive-extension/entrypoints/newtab/style.css`

- [ ] **Step 1: Wire density, theme, drawer, import, and settings events**

Add DOM constants in `main.ts`:

```ts
const densityButtons = [...document.querySelectorAll<HTMLButtonElement>('.density-button')];
const themeToggleEl = document.getElementById('themeToggle') as HTMLButtonElement;
const drawerToggleEl = document.getElementById('rightDrawerToggle') as HTMLButtonElement;
const importButtons = [
  document.getElementById('importBookmarks') as HTMLButtonElement,
  document.getElementById('rightImport') as HTMLButtonElement,
];
const settingsButtons = [
  document.getElementById('openSettings') as HTMLButtonElement,
  document.getElementById('rightSettings') as HTMLButtonElement,
];
const clipCurrentEl = document.getElementById('clipCurrent') as HTMLButtonElement;
const aiRecallEl = document.getElementById('aiRecall') as HTMLButtonElement;
```

Extend `bindEvents()`:

```ts
  for (const button of densityButtons) {
    button.addEventListener('click', async () => {
      prefs.density = (button.dataset.density ?? 'standard') as Density;
      await savePrefs();
    });
  }

  themeToggleEl.addEventListener('click', async () => {
    prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
    await savePrefs();
  });

  drawerToggleEl.addEventListener('click', async () => {
    prefs.rightPanelCollapsed = !prefs.rightPanelCollapsed;
    await savePrefs();
  });

  for (const button of importButtons) {
    button.addEventListener('click', importBookmarks);
  }

  for (const button of settingsButtons) {
    button.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  clipCurrentEl.addEventListener('click', async () => {
    statusEl.textContent = '请使用扩展按钮在当前网页剪藏；新标签页没有可剪藏正文。';
  });

  aiRecallEl.addEventListener('click', () => {
    statusEl.textContent = 'AI 找回入口已预留；未配置或请求失败时，本地搜索继续可用。';
  });
```

Add helper functions:

```ts
async function savePrefs() {
  const res = await chrome.runtime.sendMessage({ type: 'SAVE_NEW_TAB_PREFS', update: prefs });
  if (res?.ok) prefs = res.prefs as Prefs;
  applyPrefs();
}

async function importBookmarks() {
  statusEl.textContent = '正在导入浏览器书签...';
  const res = await chrome.runtime.sendMessage({ type: 'IMPORT_BROWSER_BOOKMARKS' });
  if (res?.ok) {
    statusEl.textContent = `已导入 ${res.imported ?? 0} 个浏览器书签`;
    await refreshDashboard();
  } else {
    statusEl.textContent = `导入失败：${res?.error ?? '未知错误'}`;
  }
}
```

Update `applyPrefs()`:

```ts
  for (const button of densityButtons) {
    button.classList.toggle('active', button.dataset.density === prefs.density);
  }
  themeToggleEl.textContent = prefs.theme === 'dark' ? '浅色' : '深色';
```

- [ ] **Step 2: Add empty-state CSS**

Append to `style.css`:

```css
.empty-state {
  grid-column: 1 / -1;
  min-height: 220px;
  display: grid;
  place-items: center;
  color: #667085;
  background: #fff;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
}
.recent-row {
  padding: 7px 0;
  border-bottom: 1px solid #eef2f6;
}
.recent-row:last-child { border-bottom: 0; }
```

- [ ] **Step 3: Run compile and build**

Run:

```powershell
npm run compile
npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add url-archive-extension/entrypoints/newtab/main.ts url-archive-extension/entrypoints/newtab/style.css
git commit -m "feat: wire new tab controls"
```

---

### Task 7: New Tab Edit Panel

**Files:**
- Modify: `url-archive-extension/entrypoints/newtab/main.ts`

- [ ] **Step 1: Add edit DOM constants and state**

Add near the other constants:

```ts
const editPanelEl = document.getElementById('editPanel') as HTMLElement;
const editCloseEl = document.getElementById('editClose') as HTMLButtonElement;
const editTitleEl = document.getElementById('editTitle') as HTMLInputElement;
const editFolderEl = document.getElementById('editFolder') as HTMLInputElement;
const editTagsEl = document.getElementById('editTags') as HTMLInputElement;
const editWhyEl = document.getElementById('editWhy') as HTMLTextAreaElement;
const editSaveEl = document.getElementById('editSave') as HTMLButtonElement;
const editCancelEl = document.getElementById('editCancel') as HTMLButtonElement;
let editingCard: DashboardCard | null = null;
```

- [ ] **Step 2: Replace edit placeholder**

Add these functions below `parentFolder()`:

```ts
function openEditPanel(card: DashboardCard) {
  editingCard = card;
  editTitleEl.value = card.title;
  editFolderEl.value = card.folder;
  editTagsEl.value = card.tags.join(', ');
  editWhyEl.value = card.why;
  editPanelEl.hidden = false;
  editTitleEl.focus();
}

function closeEditPanel() {
  editingCard = null;
  editPanelEl.hidden = true;
}

async function saveEdit() {
  if (!editingCard) return;
  editSaveEl.disabled = true;
  const res = await chrome.runtime.sendMessage({
    type: 'UPDATE_SAVED_CLIP',
    update: {
      url: editingCard.url,
      canonicalUrl: editingCard.canonicalUrl,
      title: editTitleEl.value,
      folder: editFolderEl.value,
      tags: editTagsEl.value.split(/[,，]/),
      why: editWhyEl.value,
    },
  });

  if (res?.ok) {
    statusEl.textContent = '已保存收藏信息';
    closeEditPanel();
    await refreshDashboard();
  } else {
    statusEl.textContent = `保存失败：${res?.error ?? '未知错误'}`;
  }
  editSaveEl.disabled = false;
}
```

- [ ] **Step 3: Add edit button to cards**

In `cardElement(card: DashboardCard)`, add this button before the closing template backtick:

```ts
    <button class="edit-card" type="button">编辑</button>
```

Then add this event binding before `return article;`:

```ts
  article.querySelector('.edit-card')?.addEventListener('click', () => openEditPanel(card));
```

- [ ] **Step 4: Bind edit events**

Add to `bindEvents()`:

```ts
  editSaveEl.addEventListener('click', saveEdit);
  editCancelEl.addEventListener('click', closeEditPanel);
  editCloseEl.addEventListener('click', closeEditPanel);
```

- [ ] **Step 5: Run compile and build**

Run:

```powershell
npm run compile
npm run build
```

Expected: both pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add url-archive-extension/entrypoints/newtab/main.ts
git commit -m "feat: edit saved clips from new tab"
```

---

### Task 8: Category Hierarchy Navigation

**Files:**
- Modify: `url-archive-extension/entrypoints/newtab/main.ts`
- Modify: `url-archive-extension/entrypoints/newtab/style.css`

- [ ] **Step 1: Render current folder and children**

Replace `renderCategories()` and supporting helpers in `main.ts` with:

```ts
function renderCategories(folders: BookmarkFolderOption[]) {
  categoryListEl.replaceChildren();
  categoryListEl.append(categoryButton('全部收藏', '', currentData?.stats.total ?? 0));
  if (currentFolder) {
    categoryListEl.append(categoryButton('上级', parentFolder(currentFolder), 0, 'category-back'));
  }
  for (const folder of childFolders(folders, currentFolder)) {
    categoryListEl.append(categoryButton(folderName(folder.path), folder.path, folder.count));
  }
}

function categoryButton(label: string, folder: string, count: number, extraClass = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `category-button${folder === currentFolder ? ' active' : ''}${extraClass ? ` ${extraClass}` : ''}`;
  btn.innerHTML = `<span>${escapeHtml(label)}</span>${count ? `<b>${count}</b>` : '<b></b>'}`;
  btn.addEventListener('click', () => {
    currentFolder = folder;
    contentTitleEl.textContent = folder || '全部收藏';
    refreshDashboard();
  });
  return btn;
}

function childFolders(folders: BookmarkFolderOption[], parent: string): BookmarkFolderOption[] {
  const prefix = parent ? `${parent} / ` : '';
  const depth = parent ? parent.split(' / ').length + 1 : 1;
  return folders
    .filter((folder) => folder.path.startsWith(prefix) && folder.path.split(' / ').length === depth)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path, 'zh-CN'));
}

function parentFolder(path: string): string {
  const parts = path.split(' / ').filter(Boolean);
  return parts.slice(0, -1).join(' / ');
}
```

- [ ] **Step 2: Add category back styling**

Append to `style.css`:

```css
.category-button.category-back {
  color: #667085;
  background: #f8fafc;
}
```

- [ ] **Step 3: Run compile**

Run:

```powershell
npm run compile
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
git add url-archive-extension/entrypoints/newtab/main.ts url-archive-extension/entrypoints/newtab/style.css
git commit -m "feat: browse bookmark categories in new tab"
```

---

### Task 9: Final Verification and README Note

**Files:**
- Modify: `url-archive-extension/README.md`

- [ ] **Step 1: Add README section**

Append to `url-archive-extension/README.md`:

```md
## 新标签页工作台

扩展会通过 `chrome_url_overrides.newtab` 接管浏览器新标签页，显示 URL Archive 工作台：

- 视觉书签墙
- 浏览器书签分类
- 本地搜索
- 剪藏/导入/设置入口
- 今日回访和最近剪藏

如果新标签页没有变化，请在 `chrome://extensions` 或 `edge://extensions` 重新加载 URL Archive 扩展。
```

- [ ] **Step 2: Run all verification commands**

Run:

```powershell
cd "F:\Code\github\irollab\URL Archive\url-archive-extension"
npm run compile
npm test
npm run build
Select-String -Path .output\chrome-mv3\manifest.json -Pattern "chrome_url_overrides|newtab"
```

Expected:

- `npm run compile` PASS.
- `npm test` PASS.
- `npm run build` PASS.
- manifest output contains `chrome_url_overrides` and `newtab.html`.

- [ ] **Step 3: Inspect generated files**

Run:

```powershell
Get-ChildItem .output\chrome-mv3 | Where-Object { $_.Name -match 'newtab|manifest' } | Select-Object Name,Length
```

Expected: includes `newtab.html` and `manifest.json`.

- [ ] **Step 4: Commit**

Run:

```powershell
git add url-archive-extension/README.md
git commit -m "docs: document new tab workspace"
```

- [ ] **Step 5: Manual browser verification**

Manual steps:

1. Open `chrome://extensions` or `edge://extensions`.
2. Reload URL Archive unpacked extension from `url-archive-extension/.output/chrome-mv3`.
3. Open a new tab.
4. Expected: URL Archive new-tab workspace appears.
5. Click “导入”.
6. Expected: bookmark cards and categories appear.
7. Search a known bookmark title.
8. Expected: grid filters to matching cards.
9. Change density to “紧凑” and “大图标”.
10. Expected: card size and grid density change.
11. Edit a card category.
12. Expected: category navigation refreshes after saving.
