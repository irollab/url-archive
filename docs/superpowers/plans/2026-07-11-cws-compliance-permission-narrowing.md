# CWS 合规收窄 + 隐私政策 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收窄浏览器扩展权限（去掉默认广域 host 与常驻内容脚本，改运行时按需申请），补齐隐私政策，满足 Chrome Web Store 上架要求且不伤用户体验。

**Architecture:** 所有 `chrome.permissions.request` 只在**页面上下文（用户手势内）**发起（options 保存/测试、newtab 剪藏按钮、重新授权横幅）；background service worker 只做 `chrome.permissions.contains` 校验，缺权限时抛 `MissingHostPermissionError`，由页面侧转成「重新授权」引导。纯逻辑（origin 解析、缺权限检测、错误类型）集中在可单测的 `lib/permissions.ts`；chrome 绑定的接线走手动验证（与现有 background/options 未单测的模式一致）。

**Tech Stack:** WXT 0.20 + TypeScript + Vitest（jsdom 环境）；MV3；无新增依赖。

## Global Constraints

- Manifest V3；不新增第三方依赖（YAGNI）。
- Match pattern **不含端口**：`originPattern` 必须产出 `scheme://hostname/*`（Chrome 匹配模式忽略端口）。
- 所有 `permissions.request` 必须在页面用户手势内调用；background 只允许 `permissions.contains`。
- `optional_host_permissions` 申请池固定为 `["http://*/*","https://*/*"]`；任何运行时申请的 origin 必须是其子集。
- 内容脚本构建产物路径保持 `content-scripts/content.js`（`background.ts` 常量 `CONTENT_SCRIPT_FILE` 依赖它）。
- 注释语言与现有代码一致（简体中文）。
- 隐私政策规范 URL：`https://github.com/irollab/url-archive/blob/main/PRIVACY.md`。
- 每个测试步骤运行命令：`npx vitest run <file>`；类型检查 `npx tsc --noEmit`。

---

## 文件结构

- 新增 `lib/permissions.ts` — origin 解析 + `contains`/`request` 包装 + `missingConfiguredOrigins` + `MissingHostPermissionError`。
- 新增 `lib/permissions.test.ts` — 上述纯逻辑单测。
- 改 `wxt.config.ts` — manifest 权限收窄。
- 改 `entrypoints/content.ts` — `registration: 'runtime'`。
- 改 `entrypoints/background.ts` — `requestExtract` 单路径注入；vault/LLM fetch 前 `contains` 守卫。
- 改 `entrypoints/options/main.ts` — 保存/测试时页面侧申请端点 origin 权限。
- 改 `entrypoints/newtab/main.ts` — 剪藏最近页前申请广域权限；重新授权横幅 + 失败引导。
- 改 `entrypoints/popup/main.ts` — 重新授权横幅 + 失败引导。
- 新增 `PRIVACY.md` — 中英双语隐私政策。
- 新增 `docs/cws-listing-notes.md` — CWS 后台文案草稿（权限理由/披露/单一用途）。

---

## Task 1: permissions.ts 核心（origin 解析 + 权限包装 + 错误类型）

**Files:**
- Create: `url-archive-extension/lib/permissions.ts`
- Test: `url-archive-extension/lib/permissions.test.ts`

**Interfaces:**
- Produces:
  - `originPattern(url: string): string | null` — 端点 URL → `scheme://hostname/*`；非法/空 URL 返回 `null`（忽略端口）。
  - `hasOriginAccess(origins: string[]): Promise<boolean>` — 包 `chrome.permissions.contains({origins})`；空数组返回 `true`。
  - `requestOriginAccess(origins: string[]): Promise<boolean>` — 包 `chrome.permissions.request({origins})`；空数组返回 `true`（须在用户手势内调用）。
  - `class MissingHostPermissionError extends Error` — 带 `origin: string` 字段，`name = 'MissingHostPermissionError'`。

- [ ] **Step 1: 写失败测试**

`url-archive-extension/lib/permissions.test.ts`：
```ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  originPattern,
  hasOriginAccess,
  requestOriginAccess,
  MissingHostPermissionError,
} from './permissions';

function stubPermissions(overrides: Partial<{ contains: unknown; request: unknown }>) {
  (globalThis as any).chrome = {
    permissions: {
      contains: overrides.contains ?? vi.fn(),
      request: overrides.request ?? vi.fn(),
    },
  };
}

afterEach(() => {
  delete (globalThis as any).chrome;
  vi.restoreAllMocks();
});

describe('originPattern', () => {
  test('带端口的本地地址去掉端口', () => {
    expect(originPattern('http://127.0.0.1:27123')).toBe('http://127.0.0.1/*');
  });
  test('https 远程端点', () => {
    expect(originPattern('https://api.openai.com/v1')).toBe('https://api.openai.com/*');
  });
  test('末尾斜杠与路径被忽略', () => {
    expect(originPattern('https://x.example.com/v1/chat/')).toBe('https://x.example.com/*');
  });
  test('空或非法返回 null', () => {
    expect(originPattern('')).toBeNull();
    expect(originPattern('   ')).toBeNull();
    expect(originPattern('not a url')).toBeNull();
  });
});

describe('hasOriginAccess', () => {
  test('空数组直接 true，不调用 chrome', async () => {
    const contains = vi.fn();
    stubPermissions({ contains });
    await expect(hasOriginAccess([])).resolves.toBe(true);
    expect(contains).not.toHaveBeenCalled();
  });
  test('转发 chrome.permissions.contains 结果', async () => {
    const contains = vi.fn().mockResolvedValue(false);
    stubPermissions({ contains });
    await expect(hasOriginAccess(['https://a.com/*'])).resolves.toBe(false);
    expect(contains).toHaveBeenCalledWith({ origins: ['https://a.com/*'] });
  });
});

describe('requestOriginAccess', () => {
  test('空数组直接 true，不调用 chrome', async () => {
    const request = vi.fn();
    stubPermissions({ request });
    await expect(requestOriginAccess([])).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  test('转发 chrome.permissions.request 结果', async () => {
    const request = vi.fn().mockResolvedValue(true);
    stubPermissions({ request });
    await expect(requestOriginAccess(['https://a.com/*'])).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ['https://a.com/*'] });
  });
});

describe('MissingHostPermissionError', () => {
  test('携带 origin 与 name', () => {
    const err = new MissingHostPermissionError('https://a.com/*');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MissingHostPermissionError');
    expect(err.origin).toBe('https://a.com/*');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd url-archive-extension && npx vitest run lib/permissions.test.ts`
Expected: FAIL（`Cannot find module './permissions'`）。

- [ ] **Step 3: 写最小实现**

`url-archive-extension/lib/permissions.ts`：
```ts
/** 端点 URL → chrome 匹配模式 `scheme://hostname/*`（匹配模式不含端口）；非法/空返回 null */
export function originPattern(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

/** 是否已获得指定 origin 的访问权；空数组视为已具备 */
export async function hasOriginAccess(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return true;
  return chrome.permissions.contains({ origins });
}

/** 申请指定 origin 访问权（必须在用户手势内调用）；空数组视为成功 */
export async function requestOriginAccess(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return true;
  return chrome.permissions.request({ origins });
}

/** 后台调用端点前缺少对应 host 权限时抛出，供页面侧转成重新授权引导 */
export class MissingHostPermissionError extends Error {
  constructor(readonly origin: string) {
    super(`缺少访问 ${origin} 的权限，请在设置中重新授权`);
    this.name = 'MissingHostPermissionError';
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd url-archive-extension && npx vitest run lib/permissions.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

```bash
git add url-archive-extension/lib/permissions.ts url-archive-extension/lib/permissions.test.ts
git commit -m "feat(ext): add permissions helpers for runtime host access"
```

---

## Task 2: missingConfiguredOrigins（已配置但未授权的端点检测）

**Files:**
- Modify: `url-archive-extension/lib/permissions.ts`
- Test: `url-archive-extension/lib/permissions.test.ts`

**Interfaces:**
- Consumes: `originPattern`、`hasOriginAccess`（Task 1）；`resolveVaultEndpoint(settings)`（`lib/vault.ts`，返回 `{baseUrl, token}`）；`Settings`（`lib/types.ts`，字段含 `llmBaseUrl`、`restApiUrl`、`officialApiUrl`、`vaultTarget`）。
- Produces:
  - `configuredOrigins(settings: Settings): string[]` — 返回已配置端点（vault 写入端点 + LLM 端点，baseUrl 非空者）去重后的 origin 模式列表。
  - `missingConfiguredOrigins(settings: Settings): Promise<string[]>` — `configuredOrigins` 中当前**未授权**的子集。

- [ ] **Step 1: 写失败测试**

在 `lib/permissions.test.ts` 顶部 import 追加 `configuredOrigins, missingConfiguredOrigins`，并追加：
```ts
import type { Settings } from './types';

const baseSettings: Settings = {
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: 'k',
  llmModel: 'm',
  vaultTarget: 'restApi',
  restApiUrl: 'http://127.0.0.1:27123',
  restApiToken: 't',
  officialApiUrl: 'http://127.0.0.1:27125',
  officialApiToken: '',
  vaultFolder: 'URL Archive',
};

describe('configuredOrigins', () => {
  test('含 vault(restApi) 与 llm origin，去重去端口', () => {
    expect(configuredOrigins(baseSettings).sort()).toEqual(
      ['http://127.0.0.1/*', 'https://api.openai.com/*'].sort(),
    );
  });
  test('空 baseUrl 端点被跳过', () => {
    const s = { ...baseSettings, llmBaseUrl: '', restApiUrl: '' };
    expect(configuredOrigins(s)).toEqual([]);
  });
  test('official 通道用 officialApiUrl', () => {
    const s = { ...baseSettings, vaultTarget: 'official' as const, llmBaseUrl: '' };
    expect(configuredOrigins(s)).toEqual(['http://127.0.0.1/*']);
  });
});

describe('missingConfiguredOrigins', () => {
  test('仅返回未授权的 origin', async () => {
    (globalThis as any).chrome = {
      permissions: {
        contains: vi.fn(({ origins }: { origins: string[] }) =>
          Promise.resolve(origins[0] === 'http://127.0.0.1/*')),
      },
    };
    const missing = await missingConfiguredOrigins(baseSettings);
    expect(missing).toEqual(['https://api.openai.com/*']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd url-archive-extension && npx vitest run lib/permissions.test.ts`
Expected: FAIL（`configuredOrigins` / `missingConfiguredOrigins` 未导出）。

- [ ] **Step 3: 写实现**

在 `lib/permissions.ts` 追加（顶部加 import）：
```ts
import type { Settings } from './types';
import { resolveVaultEndpoint } from './vault';

/** 已配置端点（vault 写入 + LLM，baseUrl 非空）去重后的 origin 模式列表 */
export function configuredOrigins(settings: Settings): string[] {
  const urls = [resolveVaultEndpoint(settings).baseUrl, settings.llmBaseUrl];
  const patterns = urls
    .map((u) => originPattern(u))
    .filter((p): p is string => p !== null);
  return [...new Set(patterns)];
}

/** configuredOrigins 中当前未授权的子集，供重新授权横幅检测 */
export async function missingConfiguredOrigins(settings: Settings): Promise<string[]> {
  const origins = configuredOrigins(settings);
  const checks = await Promise.all(
    origins.map(async (origin) => ({ origin, ok: await hasOriginAccess([origin]) })),
  );
  return checks.filter((c) => !c.ok).map((c) => c.origin);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd url-archive-extension && npx vitest run lib/permissions.test.ts`
Expected: PASS。

- [ ] **Step 5: 类型检查 + 提交**

```bash
cd url-archive-extension && npx tsc --noEmit
git add lib/permissions.ts lib/permissions.test.ts
git commit -m "feat(ext): detect configured endpoints missing host access"
```

---

## Task 3: manifest 收窄 + 内容脚本改运行时注册

**Files:**
- Modify: `url-archive-extension/wxt.config.ts`
- Modify: `url-archive-extension/entrypoints/content.ts`

**Interfaces:**
- Produces: 构建后 `manifest.json` 满足 `host_permissions: []`、`optional_host_permissions: ["http://*/*","https://*/*"]`、无 `content_scripts` 段；产物仍含 `content-scripts/content.js`。

- [ ] **Step 1: 改 manifest（wxt.config.ts）**

把 `manifest` 中的 `host_permissions` 改为空并新增 `optional_host_permissions`：
```ts
    permissions: ['activeTab', 'scripting', 'storage', 'bookmarks', 'favicon'],
    // 广域 host 改为运行时按需申请：默认不授予，向用户自配的 Obsidian/LLM 端点或后台标签页剪藏时再申请
    host_permissions: [],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
```

- [ ] **Step 2: 内容脚本改运行时注册（content.ts）**

```ts
import { extractArticle } from '@/lib/extract';

export default defineContentScript({
  // registration: 'runtime' → 不写入 manifest content_scripts，仅经 chrome.scripting.executeScript 按需注入
  registration: 'runtime',
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

- [ ] **Step 3: 构建并断言 manifest**

Run:
```bash
cd url-archive-extension && URL_ARCHIVE_WXT_OUT_DIR=.output-check npm run build >/dev/null 2>&1 && node -e "const m=require('./.output-check/chrome-mv3/manifest.json'); const a=require('assert'); a.deepStrictEqual(m.host_permissions, []); a.deepStrictEqual(m.optional_host_permissions, ['http://*/*','https://*/*']); a.ok(!m.content_scripts, 'content_scripts 应不存在'); console.log('manifest OK');" && ls .output-check/chrome-mv3/content-scripts/content.js
```
Expected: 打印 `manifest OK` 且列出 `content.js`（产物仍在）。
> 若 `.output` 被 Chrome 锁定，本步已用 `.output-check` 隔离目录，无需处理锁。

- [ ] **Step 4: 提交**

```bash
git add url-archive-extension/wxt.config.ts url-archive-extension/entrypoints/content.ts
git commit -m "feat(ext): drop default broad host + declarative content script"
```

---

## Task 4: background — 单路径注入 + 端点权限守卫

**Files:**
- Modify: `url-archive-extension/entrypoints/background.ts`

**Interfaces:**
- Consumes: `hasOriginAccess`、`originPattern`、`MissingHostPermissionError`（Task 1）；`resolveVaultEndpoint`（`lib/vault.ts`）。
- Produces: 剪藏/补全/找回在向 vault 或 LLM 发请求前校验 host 权限，缺失抛 `MissingHostPermissionError(origin)`；`requestExtract` 不再先 `sendMessage` 而直接 `executeScript` 后通信。

- [ ] **Step 1: 顶部新增 import**

在现有 import 区追加：
```ts
import { hasOriginAccess, originPattern, MissingHostPermissionError } from '@/lib/permissions';
```

- [ ] **Step 2: `requestExtract` 改为单路径注入**

将 `requestExtract` 函数体替换为（去掉「先 sendMessage 再回退」，改为先注入再通信；保留不可注入页的友好报错）：
```ts
async function requestExtract(tab: chrome.tabs.Tab): Promise<ExtractResult> {
  if (!tab.id) throw new Error('无法获取当前标签页');
  if (!canInjectIntoTab(tab.url)) {
    throw new Error('当前页面不支持剪藏：请在普通 http/https 网页中使用');
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch (injectError) {
    throw new Error(`无法在当前页面注入剪藏脚本：${getErrorMessage(injectError)}`);
  }
  return await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT' }) as ExtractResult;
}
```
> `isMissingContentScriptError` 若因此不再被引用，一并删除该函数以免 tsc 报未使用。

- [ ] **Step 3: 新增 vault 权限守卫并在 Phase A 前调用**

在 `handleCaptureFromTab` 中，`const writer = createVaultWriter(settings);` 之前插入守卫：
```ts
  await ensureVaultAccess(settings);
```
并在文件内新增函数：
```ts
// 写 vault 前确认已授权对应 host；缺失则抛 MissingHostPermissionError（后台无手势，不能静默申请）
async function ensureVaultAccess(settings: Awaited<ReturnType<typeof loadSettings>>): Promise<void> {
  const origin = originPattern(resolveVaultEndpoint(settings).baseUrl);
  if (origin && !(await hasOriginAccess([origin]))) {
    throw new MissingHostPermissionError(origin);
  }
}
```

- [ ] **Step 4: LLM 守卫用于补全与找回**

在 `enrichInBackground` 内 `if (hasLlmConfig(settings)) {` 之后、`enrichAndRewrite` 之前插入：
```ts
      const llmOrigin = originPattern(settings.llmBaseUrl);
      if (llmOrigin && !(await hasOriginAccess([llmOrigin]))) {
        throw new MissingHostPermissionError(llmOrigin);
      }
```
在 `handleAIRecall` 内 `const settings = await loadSettings();` 之后插入：
```ts
  const llmOrigin = originPattern(settings.llmBaseUrl);
  if (llmOrigin && !(await hasOriginAccess([llmOrigin]))) {
    throw new MissingHostPermissionError(llmOrigin);
  }
```

- [ ] **Step 5: 类型检查 + 构建**

Run:
```bash
cd url-archive-extension && npx tsc --noEmit && URL_ARCHIVE_WXT_OUT_DIR=.output-check npm run build >/dev/null 2>&1 && echo BUILD_OK
```
Expected: 打印 `BUILD_OK`，无 TS 错误（若 `isMissingContentScriptError` 残留未使用会报错 → 删除它）。

- [ ] **Step 6: 手动验证**

1. `chrome://extensions` 重新加载 `.output-check/chrome-mv3`；
2. 普通网页点扩展图标 → 弹出页剪藏本页：应正常（activeTab，无授权弹窗）；
3. 若未授权 Obsidian 端点：剪藏应返回 `MissingHostPermissionError` 文案（下一任务接线为可点重新授权）。

- [ ] **Step 7: 提交**

```bash
git add url-archive-extension/entrypoints/background.ts
git commit -m "feat(ext): guard vault/llm fetches with host-permission checks"
```

---

## Task 5: options — 保存/测试时页面侧申请端点权限

**Files:**
- Modify: `url-archive-extension/entrypoints/options/main.ts`

**Interfaces:**
- Consumes: `originPattern`、`requestOriginAccess`（Task 1）。
- Produces: 保存设置、测试 AI、测试 vault 前在用户手势内申请对应端点 origin 权限；被拒时给出可读提示。

- [ ] **Step 1: 顶部新增 import**

```ts
import { originPattern, requestOriginAccess } from '@/lib/permissions';
```

- [ ] **Step 2: 新增申请辅助并在保存时调用**

在文件内新增：
```ts
// 在用户手势内申请一组端点 URL 对应的 host 权限；返回是否全部获批
async function ensureEndpointAccess(urls: string[]): Promise<boolean> {
  const origins = [...new Set(urls.map(originPattern).filter((o): o is string => o !== null))];
  return requestOriginAccess(origins);
}
```
把「保存」按钮回调改为先申请再保存：
```ts
el('save').addEventListener('click', async () => {
  const btn = el<HTMLButtonElement>('save');
  const saved = el('saved');
  btn.disabled = true;
  try {
    const s = collectSettings();
    const granted = await ensureEndpointAccess([resolveVaultUrl(s), s.llmBaseUrl]);
    await saveSettings(s);
    setStatus(saved, granted ? '✓ 设置已保存' : '✓ 已保存（部分端点未授权，剪藏时会提示重新授权）', granted ? 'ok' : 'err');
  } catch (error) {
    setStatus(saved, `保存失败：${error instanceof Error ? error.message : String(error)}`, 'err');
  } finally {
    btn.disabled = false;
    window.setTimeout(() => { if (saved.classList.contains('ok')) setStatus(saved, '', ''); }, 2400);
  }
});
```
并新增按当前通道解析 vault URL 的小工具（避免引入 vault.ts）：
```ts
function resolveVaultUrl(s: Settings): string {
  return (s.vaultTarget || 'official') === 'official' ? s.officialApiUrl : s.restApiUrl;
}
```

- [ ] **Step 3: 测试按钮先申请权限**

在 `testAi` 回调 `setStatus(status, '测试中…', 'busy');` 之后插入：
```ts
  await ensureEndpointAccess([collectSettings().llmBaseUrl]);
```
在 `testVault` 内 `setStatus(status, '连接中…', 'busy');` 之前插入：
```ts
  await ensureEndpointAccess([base]);
```
（`base` 已是该通道 URL；重复申请幂等。）

- [ ] **Step 4: 类型检查 + 构建**

Run: `cd url-archive-extension && npx tsc --noEmit && URL_ARCHIVE_WXT_OUT_DIR=.output-check npm run build >/dev/null 2>&1 && echo OK`
Expected: `OK`。

- [ ] **Step 5: 手动验证**

1. 打开设置页，填写 LLM/Obsidian 端点，点保存 → Chrome 弹出「允许访问 `主机`？」；同意后剪藏正常；
2. 点「测试 AI」/「测试连接」→ 首次同样弹授权框，通过后可达。

- [ ] **Step 6: 提交**

```bash
git add url-archive-extension/entrypoints/options/main.ts
git commit -m "feat(ext): request endpoint host access on settings save/test"
```

---

## Task 6: 重新授权引导（共享 UI 辅助）

**Files:**
- Create: `url-archive-extension/lib/reauth-banner.ts`
- Test: `url-archive-extension/lib/reauth-banner.test.ts`

**Interfaces:**
- Consumes: `missingConfiguredOrigins`、`requestOriginAccess`（Task 1/2）；`loadSettings`（`lib/settings.ts`）。
- Produces:
  - `reauthMessage(origins: string[]): string` — 缺权限提示文案（纯函数，可测）。
  - `mountReauthBanner(container: HTMLElement, onDone?: () => void): Promise<void>` — 若存在缺权限端点，则在 `container` 内渲染横幅与「重新授权」按钮（点击=手势→`requestOriginAccess`），全部获批后移除横幅并调用 `onDone`。

- [ ] **Step 1: 写失败测试（纯函数部分）**

`url-archive-extension/lib/reauth-banner.test.ts`：
```ts
import { describe, expect, test } from 'vitest';
import { reauthMessage } from './reauth-banner';

describe('reauthMessage', () => {
  test('单个端点', () => {
    expect(reauthMessage(['https://api.openai.com/*']))
      .toBe('检测到 1 个已配置端点尚未授权访问，点击重新授权以恢复剪藏与 AI 功能。');
  });
  test('多个端点', () => {
    expect(reauthMessage(['https://a/*', 'http://b/*']))
      .toBe('检测到 2 个已配置端点尚未授权访问，点击重新授权以恢复剪藏与 AI 功能。');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd url-archive-extension && npx vitest run lib/reauth-banner.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现**

`url-archive-extension/lib/reauth-banner.ts`：
```ts
import { loadSettings } from './settings';
import { missingConfiguredOrigins, requestOriginAccess } from './permissions';

/** 缺权限提示文案（纯函数，便于单测） */
export function reauthMessage(origins: string[]): string {
  return `检测到 ${origins.length} 个已配置端点尚未授权访问，点击重新授权以恢复剪藏与 AI 功能。`;
}

/**
 * 若存在「已配置但未授权」的端点，在 container 顶部渲染重新授权横幅。
 * 「重新授权」按钮在用户手势内申请全部缺失 origin，成功后移除横幅并回调。
 */
export async function mountReauthBanner(container: HTMLElement, onDone?: () => void): Promise<void> {
  const settings = await loadSettings();
  const missing = await missingConfiguredOrigins(settings);
  if (missing.length === 0) return;

  const banner = document.createElement('div');
  banner.className = 'reauth-banner';
  const text = document.createElement('span');
  text.textContent = reauthMessage(missing);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reauth-btn';
  btn.textContent = '重新授权';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const granted = await requestOriginAccess(missing);
    if (granted) {
      banner.remove();
      onDone?.();
    } else {
      btn.disabled = false;
    }
  });
  banner.append(text, btn);
  container.prepend(banner);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd url-archive-extension && npx vitest run lib/reauth-banner.test.ts`
Expected: PASS。

- [ ] **Step 5: 类型检查 + 提交**

```bash
cd url-archive-extension && npx tsc --noEmit
git add lib/reauth-banner.ts lib/reauth-banner.test.ts
git commit -m "feat(ext): add reauthorization banner helper"
```

---

## Task 7: 接线 popup 与 newtab（横幅 + 后台页剪藏申请）

**Files:**
- Modify: `url-archive-extension/entrypoints/popup/main.ts`
- Modify: `url-archive-extension/entrypoints/newtab/main.ts`
- Modify: `url-archive-extension/entrypoints/popup/style.css`
- Modify: `url-archive-extension/entrypoints/newtab/style.css`

**Interfaces:**
- Consumes: `mountReauthBanner`（Task 6）；`requestOriginAccess`（Task 1）。

- [ ] **Step 1: popup 挂载横幅**

在 `entrypoints/popup/main.ts` 顶部 import：
```ts
import { mountReauthBanner } from '@/lib/reauth-banner';
```
在 popup 初始化处（DOM 就绪后）调用（容器用 popup 根元素，例如 `document.body` 或主容器；按现有结构选最外层容器）：
```ts
void mountReauthBanner(document.body);
```

- [ ] **Step 2: newtab 挂载横幅**

在 `entrypoints/newtab/main.ts` 顶部 import：
```ts
import { mountReauthBanner } from '@/lib/reauth-banner';
import { requestOriginAccess } from '@/lib/permissions';
```
在 `init()` 内 `bindEvents();` 之后追加：
```ts
  void mountReauthBanner(appEl);
```

- [ ] **Step 3: newtab 剪藏最近页前申请广域权限**

定位 `clipCurrentEl.addEventListener('click', () => { captureRecentPage(); });`，改为在点击手势内先申请广域权限：
```ts
  clipCurrentEl.addEventListener('click', async () => {
    const granted = await requestOriginAccess(['http://*/*', 'https://*/*']);
    if (!granted) {
      setStatus('已跳过：可在目标网页用扩展图标「剪藏本页」。');
      return;
    }
    captureRecentPage();
  });
```

- [ ] **Step 4: 样式（两处 style.css 追加相同规则）**

在 `popup/style.css` 与 `newtab/style.css` 末尾各追加：
```css
.reauth-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin: 0 0 10px;
  border-radius: 10px;
  background: rgba(255, 193, 7, .16);
  border: 1px solid rgba(255, 193, 7, .5);
  font-size: 13px;
  color: inherit;
}
.reauth-banner .reauth-btn {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: #ffc107;
  color: #1a1a1a;
  font-weight: 600;
}
.reauth-banner .reauth-btn:disabled { opacity: .6; cursor: default; }
```

- [ ] **Step 5: 类型检查 + 构建**

Run: `cd url-archive-extension && npx tsc --noEmit && URL_ARCHIVE_WXT_OUT_DIR=.output-check npm run build >/dev/null 2>&1 && echo OK`
Expected: `OK`。

- [ ] **Step 6: 手动验证（模拟老用户回归）**

1. 设置页配置好端点并授权；在 `chrome://extensions` 详情页手动移除该扩展的站点访问权限（模拟升级后缺权限）；
2. 打开新标签页/弹出页 → 顶部出现黄色重新授权横幅；点「重新授权」→ 弹授权框，同意后横幅消失；
3. 新标签页点「剪藏最近页」→ 首次弹广域授权框；拒绝 → 显示「已跳过…」提示。

- [ ] **Step 7: 提交**

```bash
git add url-archive-extension/entrypoints/popup/main.ts url-archive-extension/entrypoints/newtab/main.ts url-archive-extension/entrypoints/popup/style.css url-archive-extension/entrypoints/newtab/style.css
git commit -m "feat(ext): wire reauth banner and on-demand host request into UI"
```

---

## Task 8: 失败即引导（剪藏/补全缺权限时的可点重新授权）

**Files:**
- Modify: `url-archive-extension/entrypoints/popup/main.ts`

**Interfaces:**
- Consumes: `requestOriginAccess`（Task 1）。
- Produces: 弹出页收到剪藏/补全的 `MissingHostPermissionError` 文案时，展示「重新授权」动作。

- [ ] **Step 1: 识别缺权限错误并给动作**

在 popup 处理剪藏返回 `{ok:false, error}` 的分支中，若 `error` 含「重新授权」关键字，则在状态区追加一个按钮：
```ts
// 缺 host 权限的错误（来自 background 的 MissingHostPermissionError.message）→ 提供一键重新授权
function maybeOfferReauth(statusEl: HTMLElement, error: string) {
  if (!error.includes('重新授权')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reauth-btn';
  btn.textContent = '重新授权';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const ok = await requestOriginAccess(['http://*/*', 'https://*/*']);
    btn.textContent = ok ? '已授权，请重试剪藏' : '授权被拒绝';
  });
  statusEl.appendChild(btn);
}
```
在剪藏失败处调用 `maybeOfferReauth(<状态元素>, res.error)`（按现有变量名接入）。

> 说明：此处申请广域对以覆盖任意端点；页面手势内申请，符合约束。

- [ ] **Step 2: 类型检查 + 构建**

Run: `cd url-archive-extension && npx tsc --noEmit && URL_ARCHIVE_WXT_OUT_DIR=.output-check npm run build >/dev/null 2>&1 && echo OK`
Expected: `OK`。

- [ ] **Step 3: 手动验证**

1. 移除站点权限后，弹出页剪藏 → 状态显示缺权限文案 + 「重新授权」按钮；
2. 点按钮授权后重试剪藏 → 成功写入。

- [ ] **Step 4: 提交**

```bash
git add url-archive-extension/entrypoints/popup/main.ts
git commit -m "feat(ext): offer one-click reauth on missing-permission clip failures"
```

---

## Task 9: PRIVACY.md（中英双语隐私政策）

**Files:**
- Create: `PRIVACY.md`（仓库根）

**Interfaces:** 无代码接口；产出符合 CWS 要求的隐私政策文本。

- [ ] **Step 1: 写 PRIVACY.md**

内容（中文在前，英文在后），涵盖：收集数据、数据流向、本地存储、用户控制、留存与安全、联系方式、变更与生效日期。要点必须包含：
- 页面标题/URL/正文（≤6000 字符，仅剪藏时）→ 用户自配 LLM 端点（可关闭）；
- 剪藏内容 → 用户自配 Obsidian 端点；
- 页面域名 → Google favicon 服务；默认壁纸 → Unsplash；
- 设置（含 API 密钥）存 `chrome.storage.local`、剪藏与图片存 IndexedDB，均本机；
- 无自有服务器、无遥测/分析、不出售或共享数据；
- 生效日期：2026-07-11；联系方式：仓库 Issues。

```markdown
# 隐私政策 / Privacy Policy

_最后更新 / Last updated: 2026-07-11_

## 简体中文

**URL Archive** 是一款把网页剪藏进 Obsidian 的浏览器扩展。我们不运营任何服务器，也不收集、上传或出售你的数据。所有数据只在你的浏览器与**你自己配置的服务**之间流动。

### 我们处理的数据
- 剪藏时的页面标题、URL 与正文（最多约 6000 字符）。
- 你导入的浏览器书签、剪藏的元数据。
- 你在设置中填写的 API 端点地址与密钥。

### 数据流向
- 页面标题/URL/正文 → **你配置的 LLM 端点**，用于生成摘要与标签（未配置或关闭时不发送）。
- 剪藏内容 → **你配置的 Obsidian 端点**（本地或你指定的地址）。
- 页面域名 → Google favicon 服务，仅用于显示站点图标。
- 默认壁纸来自 Unsplash（可在设置中更换或使用自有图片）。
- **没有自有服务器、没有遥测或分析、不出售或共享你的数据。**

### 本地存储
- 设置（含 API 密钥）保存在 `chrome.storage.local`；剪藏与图片保存在浏览器 IndexedDB。二者都只保存在本机，不会上传。

### 你的控制权
- 可随时在设置中修改/清空端点与密钥、更换或停用 LLM。
- 可在 `chrome://extensions` 撤销扩展的网站访问权限。
- 可删除本地收藏与缓存图片。

### 数据留存与安全
- 数据留存在本机直到你删除。API 密钥仅用于向你配置的端点鉴权。

### 联系方式
- 通过项目仓库 Issues 反馈：https://github.com/irollab/url-archive/issues

### 变更
- 政策更新会同步更新本文件与上方生效日期。

---

## English

**URL Archive** is a browser extension that clips web pages into Obsidian. We run no servers and do not collect, upload, or sell your data. All data flows only between your browser and the services **you configure**.

### Data we process
- Page title, URL, and body text (up to ~6000 characters) when you clip.
- Browser bookmarks you import and clip metadata.
- The API endpoint addresses and keys you enter in settings.

### Where data goes
- Page title/URL/body → **your configured LLM endpoint**, to generate summaries and tags (not sent if unconfigured or disabled).
- Clipped content → **your configured Obsidian endpoint** (local or an address you specify).
- Page domain → Google's favicon service, solely to display site icons.
- The default wallpaper is served by Unsplash (you may change it or use your own image).
- **No proprietary servers, no telemetry or analytics, and no selling or sharing of your data.**

### Local storage
- Settings (including API keys) are stored in `chrome.storage.local`; clips and images are stored in the browser's IndexedDB. Both remain on your device and are never uploaded.

### Your controls
- Change or clear endpoints and keys, switch or disable the LLM at any time in settings.
- Revoke the extension's website access from `chrome://extensions`.
- Delete local clips and cached images.

### Retention & security
- Data stays on your device until you delete it. API keys are used only to authenticate to endpoints you configure.

### Contact
- File issues at https://github.com/irollab/url-archive/issues

### Changes
- Updates to this policy will be reflected in this file and the date above.
```

- [ ] **Step 2: 提交**

```bash
git add PRIVACY.md
git commit -m "docs: add bilingual privacy policy for Chrome Web Store"
```

---

## Task 10: 版本号、CWS 文案草稿与最终打包

**Files:**
- Modify: `url-archive-extension/package.json`
- Create: `docs/cws-listing-notes.md`

- [ ] **Step 1: bump 扩展版本 0.1.1 → 0.1.2**

`url-archive-extension/package.json`：`"version": "0.1.2",`

- [ ] **Step 2: 写 CWS 后台文案草稿**

`docs/cws-listing-notes.md`，含：
```markdown
# Chrome Web Store 上架填写草稿

## 隐私政策 URL
https://github.com/irollab/url-archive/blob/main/PRIVACY.md

## 单一用途
把网页 URL 与内容存入用户的 Obsidian，并在新标签页复现/找回这些收藏。

## 权限理由
- activeTab：用户点击扩展图标时，剪藏当前标签页。
- scripting：向当前页按需注入抽取脚本以提取正文。
- storage：在本机保存用户设置与收藏数据。
- bookmarks：一键导入浏览器书签生成收藏网格。
- favicon：显示收藏站点的图标。
- optional host（http/https，运行时申请）：向用户自行配置的 Obsidian 与 LLM 端点发送数据；以及用户主动从新标签页剪藏后台标签页时访问该页面。默认不申请，仅在相关操作时按需请求。

## 数据用途披露
- 收集/使用：网页内容（仅剪藏时，发往用户自配 LLM）、用户配置（本机存储）。
- 不出售/不共享给第三方；无遥测。
```

- [ ] **Step 3: 全量测试 + 类型检查 + 构建 + 打包**

Run:
```bash
cd url-archive-extension && npx vitest run && npx tsc --noEmit && URL_ARCHIVE_WXT_OUT_DIR=.output-check npm run zip >/dev/null 2>&1 && ls .output-check/*.zip
```
Expected: 测试全绿、无 TS 错误、列出 `url-archive-extension-0.1.2-chrome.zip`。

- [ ] **Step 4: 手动全流程回归**

按 spec 第 5 节「手动验证清单」6 项逐条走查通过。

- [ ] **Step 5: 提交**

```bash
git add url-archive-extension/package.json docs/cws-listing-notes.md
git commit -m "chore(ext): bump to 0.1.2 and add CWS listing notes"
```

---

## Self-Review（作者自检）

**1. Spec 覆盖**
- 权限模型（spec 第 1 节）→ Task 3。✓
- 内容抽取双路径（第 2 节）→ Task 4（弹出页 activeTab）、Task 7 Step 3（后台页申请）。✓
- 端点授权 + 调用前校验（第 3.1/3.2）→ Task 5（申请）、Task 4（校验）。✓
- 重新授权引导 UX（第 3.3）→ Task 6（辅助）+ Task 7（横幅接线）+ Task 8（失败即引导）。✓
- `lib/permissions.ts` 单元（第 3.4）→ Task 1/2。✓
- 隐私政策（第 4 节）→ Task 9。✓
- 测试策略（第 5 节）→ 各任务 TDD + 手动清单；Task 10 Step 4 汇总走查。✓
- CWS 文案（范围外）→ Task 10 Step 2。✓

**2. 占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。UI 接线处「按现有变量名接入」为必要的适配说明，已给出完整函数体与插入锚点。

**3. 类型一致性**：`originPattern`/`hasOriginAccess`/`requestOriginAccess`/`MissingHostPermissionError`/`configuredOrigins`/`missingConfiguredOrigins`/`reauthMessage`/`mountReauthBanner` 在定义（Task 1/2/6）与消费（Task 4/5/7/8）处签名一致；`resolveVaultEndpoint` 用法与 `lib/vault.ts` 现有导出一致。

**4. 已知风险**：Task 7/8 需按弹出页/新标签页现有 DOM 变量名接入（横幅容器、状态元素）；实现时以就近最外层容器与现有状态节点为准，不改变对外行为。
