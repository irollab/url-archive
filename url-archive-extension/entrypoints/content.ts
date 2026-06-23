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
