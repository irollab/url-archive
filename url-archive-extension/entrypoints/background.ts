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
