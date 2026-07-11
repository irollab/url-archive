import { loadSettings } from '@/lib/settings';
import { enrichClip, recallQuery } from '@/lib/llm';
import { createVaultWriter, resolveVaultEndpoint } from '@/lib/vault';
import { ClipQueue } from '@/lib/queue';
import { captureClipFast, enrichAndRewrite } from '@/lib/capture';
import { clipsFromBookmarkTree } from '@/lib/bookmarks';
import { buildDashboardData } from '@/lib/dashboard';
import { loadNewTabPrefs, saveNewTabPrefs } from '@/lib/preferences';
import {
  getSavedClipStats,
  getBookmarkFolders,
  loadSavedClips,
  pickRevisitClips,
  recordRevisit,
  deleteSavedClip,
  saveClipForRevisit,
  saveClipsForRevisit,
  searchSavedClips,
  type ClipFilter,
  updateSavedClip,
} from '@/lib/revisit';
import type { ClipData } from '@/lib/types';
import type { NewTabPrefs } from '@/lib/preferences';
import type { EnrichStatus } from '@/lib/enrich-status';

type ExtractResult = {
  title: string;
  contentMarkdown: string;
  selection: string;
};

const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';
let newTabPrefsSaveQueue: Promise<unknown> = Promise.resolve();

export default defineBackground(() => {
  const queue = new ClipQueue();

  // 启动时尝试把离线队列写回 vault
  flushQueue(queue);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'CAPTURE') {
      handleCapture(msg.why ?? '', queue)
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true; // 异步
    }
    if (msg?.type === 'CAPTURE_LAST_ACTIVE') {
      handleCaptureLastActive(msg.why ?? '', queue)
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'SUGGEST_REVISIT') {
      handleSuggestRevisit()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'OPEN_REVISIT') {
      handleOpenRevisit(String(msg.url ?? ''))
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'SEARCH_CLIPS') {
      handleSearchClips(
        String(msg.query ?? ''),
        String(msg.filter ?? 'all') as ClipFilter,
        String(msg.folder ?? ''),
        Number(msg.limit ?? 20),
      )
        .then((clips) => sendResponse({ ok: true, clips }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'GET_DASHBOARD_DATA') {
      handleDashboardData(String(msg.query ?? ''), String(msg.folder ?? ''))
        .then((data) => sendResponse({ ok: true, data }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'AI_RECALL') {
      handleAIRecall(String(msg.query ?? ''), String(msg.folder ?? ''))
        .then((result) => sendResponse({ ok: true, ...result }))
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
      handleSaveNewTabPrefs(msg.update ?? msg.prefs ?? {})
        .then((prefs) => sendResponse({ ok: true, prefs }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'BOOKMARK_FOLDERS') {
      handleBookmarkFolders()
        .then((folders) => sendResponse({ ok: true, folders }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'SAVED_CLIP_STATS') {
      handleSavedClipStats()
        .then((stats) => sendResponse({ ok: true, stats }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'IMPORT_BROWSER_BOOKMARKS') {
      handleImportBrowserBookmarks()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'UPDATE_SAVED_CLIP') {
      updateSavedClip(msg.update ?? {})
        .then((clip) => sendResponse({ ok: Boolean(clip), clip, error: clip ? undefined : '未找到要编辑的收藏' }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'DELETE_SAVED_CLIP') {
      deleteSavedClip(msg.target ?? {})
        .then((deleted) => sendResponse({ ok: deleted, deleted, error: deleted ? undefined : '未找到要删除的收藏' }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
  });
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingContentScriptError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes('Could not establish connection')
    || message.includes('Receiving end does not exist');
}

function canInjectIntoTab(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function requestExtract(tab: chrome.tabs.Tab): Promise<ExtractResult> {
  if (!tab.id) throw new Error('无法获取当前标签页');

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT' }) as ExtractResult;
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }

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
}

async function handleCapture(why: string, queue: ClipQueue) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return handleCaptureFromTab(tab, why, queue, '无法获取当前标签页');
}

async function handleCaptureLastActive(why: string, queue: ClipQueue) {
  const tab = await findMostRecentCapturableTab();
  return handleCaptureFromTab(
    tab,
    why,
    queue,
    '没有找到可剪藏的最近网页：请先打开一个普通 http/https 页面',
  );
}

async function handleCaptureFromTab(
  tab: chrome.tabs.Tab | undefined,
  why: string,
  queue: ClipQueue,
  missingMessage: string,
) {
  const settings = await loadSettings();
  if (!tab?.id) throw new Error(missingMessage);
  const extract = await requestExtract(tab);

  const clip: ClipData = {
    url: tab.url ?? '',
    title: extract.title || tab.title || '',
    selection: extract.selection,
    contentMarkdown: extract.contentMarkdown,
    clippedAt: new Date().toISOString(),
  };

  const writer = createVaultWriter(settings);

  // Phase A：秒级写入占位笔记，立即返回给弹出页
  const result = await captureClipFast(clip, why, settings, { writer, queue });
  await saveClipForRevisit(result.savedClip);

  // Phase B：后台补 AI 覆盖写（不 await，in-flight fetch 保活 SW；best-effort）
  void enrichInBackground(clip, why, settings, writer, queue, result.savedClip.canonicalUrl ?? result.savedClip.url);

  return result;
}

// 后台补 AI：成功则覆盖写回并更新索引；失败/中断则保留占位笔记（Phase A 已落盘，不丢失）。
// 完成后向弹出页广播状态，若弹出页已关闭则忽略。
async function enrichInBackground(
  clip: ClipData,
  why: string,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  writer: ReturnType<typeof createVaultWriter>,
  queue: ClipQueue,
  canonicalUrl: string,
) {
  let status: EnrichStatus = 'skipped';
  let error: string | undefined;

  if (hasLlmConfig(settings)) {
    try {
      const enriched = await enrichAndRewrite(clip, why, settings, { enrich: enrichClip, writer, queue });
      await saveClipForRevisit(enriched.savedClip);
      status = 'done';
    } catch (e) {
      status = 'failed';
      error = describeEnrichError(e);
    }
  }

  notifyEnriched(canonicalUrl, status, error);
}

// 把补 AI 的失败原因转成可读文案；超时（AbortError）单独提示，便于用户判断是否需要更快的模型
function describeEnrichError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'AI 请求超时';
    return error.message;
  }
  return String(error);
}

function hasLlmConfig(settings: Awaited<ReturnType<typeof loadSettings>>): boolean {
  return Boolean(settings.llmBaseUrl.trim() && settings.llmApiKey.trim() && settings.llmModel.trim());
}

function notifyEnriched(canonicalUrl: string, status: EnrichStatus, error?: string) {
  // 弹出页已关闭时无接收者，sendMessage 会 reject，忽略即可
  chrome.runtime.sendMessage({ type: 'CAPTURE_ENRICHED', canonicalUrl, status, error }).catch(() => undefined);
}

async function findMostRecentCapturableTab() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .filter((tab) => tab.id != null && canInjectIntoTab(tab.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
}

async function handleSaveNewTabPrefs(update: Partial<NewTabPrefs>) {
  const save = newTabPrefsSaveQueue.then(() => saveNewTabPrefs(update));
  newTabPrefsSaveQueue = save.catch(() => undefined);
  return save;
}

async function handleSuggestRevisit() {
  const clips = pickRevisitClips(await loadSavedClips(), 20);
  return { clip: clips[0] ?? null, clips };
}

async function handleOpenRevisit(url: string) {
  if (!url) throw new Error('缺少要打开的 URL');
  await recordRevisit(url);
  await chrome.tabs.create({ url });
}

async function handleSearchClips(query: string, filter: ClipFilter, folder: string, limit: number) {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 1000) : 20;
  return searchSavedClips(await loadSavedClips(), query, { filter, folder, limit: safeLimit });
}

async function handleDashboardData(query: string, folder: string) {
  const clips = await loadSavedClips();
  return buildDashboardData(clips, { query, folder });
}

async function handleAIRecall(query: string, folder: string) {
  const settings = await loadSettings();
  const recall = await recallQuery(query, settings);
  const clips = await loadSavedClips();
  let data = buildDashboardData(clips, { query: recall.query, folder });
  if (data.cards.length === 0 && recall.query !== query.trim()) {
    data = buildDashboardData(clips, { query, folder });
  }
  return { data, recall };
}

async function handleSavedClipStats() {
  return getSavedClipStats(await loadSavedClips());
}

async function handleBookmarkFolders() {
  return getBookmarkFolders(await loadSavedClips());
}

async function handleImportBrowserBookmarks() {
  if (!chrome.bookmarks?.getTree) {
    throw new Error('当前浏览器不支持读取书签');
  }

  const tree = await chrome.bookmarks.getTree();
  const clips = clipsFromBookmarkTree(tree);
  const imported = await saveClipsForRevisit(clips);
  return { imported, total: clips.length };
}

async function flushQueue(queue: ClipQueue) {
  try {
    const settings = await loadSettings();
    if (!resolveVaultEndpoint(settings).token.trim()) return;
    const writer = createVaultWriter(settings);
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
