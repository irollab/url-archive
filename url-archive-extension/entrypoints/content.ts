import { extractArticle } from '@/lib/extract';

export default defineContentScript({
  // registration: 'runtime' → 不写入 manifest content_scripts，仅经 chrome.scripting.executeScript 按需注入
  // 不声明 matches：注入按 tabId 精确定向（见 background.ts requestExtract），声明 matches 会被 WXT
  // 自动写回 host_permissions（即便 registration: 'runtime'），与本任务收窄默认权限的目标冲突。
  registration: 'runtime',
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
