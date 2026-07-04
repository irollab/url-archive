import { loadSettings } from '@/lib/settings';
import { enrichClip } from '@/lib/llm';
import { RestApiWriter } from '@/lib/vault';
import { ClipQueue } from '@/lib/queue';
import { captureClip } from '@/lib/capture';
import { clipsFromBookmarkTree } from '@/lib/bookmarks';
import { buildDashboardData } from '@/lib/dashboard';
import { loadNewTabPrefs, replaceNewTabPrefs } from '@/lib/preferences';
import {
  getSavedClipStats,
  getBookmarkFolders,
  loadSavedClips,
  pickRevisitClip,
  recordRevisit,
  saveClipForRevisit,
  saveClipsForRevisit,
  searchSavedClips,
  type ClipFilter,
  updateSavedClip,
} from '@/lib/revisit';
import type { ClipData } from '@/lib/types';
import type { NewTabPrefs } from '@/lib/preferences';

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
        .then((clip) => sendResponse({ ok: true, clip }))
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
    if (msg?.type === 'LOAD_NEW_TAB_PREFS') {
      loadNewTabPrefs()
        .then((prefs) => sendResponse({ ok: true, prefs }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    }
    if (msg?.type === 'SAVE_NEW_TAB_PREFS') {
      handleSaveNewTabPrefs(msg.prefs ?? msg.update ?? {})
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

  const writer = new RestApiWriter(settings);
  const result = await captureClip(clip, why, settings, {
    enrich: enrichClip,
    writer,
    queue,
  });
  await saveClipForRevisit(result.savedClip);
  return result;
}

async function findMostRecentCapturableTab() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .filter((tab) => tab.id != null && canInjectIntoTab(tab.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
}

async function handleSaveNewTabPrefs(prefs: NewTabPrefs) {
  const save = newTabPrefsSaveQueue.then(() => replaceNewTabPrefs(prefs));
  newTabPrefsSaveQueue = save.catch(() => undefined);
  return save;
}

async function handleSuggestRevisit() {
  return pickRevisitClip(await loadSavedClips()) ?? null;
}

async function handleOpenRevisit(url: string) {
  if (!url) throw new Error('缺少要打开的 URL');
  await recordRevisit(url);
  await chrome.tabs.create({ url });
}

async function handleSearchClips(query: string, filter: ClipFilter, folder: string) {
  return searchSavedClips(await loadSavedClips(), query, { filter, folder });
}

async function handleDashboardData(query: string, folder: string) {
  const clips = await loadSavedClips();
  return buildDashboardData(clips, { query, folder, limit: 80 });
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
