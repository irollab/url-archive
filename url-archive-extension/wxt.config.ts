import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  outDir: process.env.URL_ARCHIVE_WXT_OUT_DIR ?? '.output',
  vite: () => ({
    build: {
      modulePreload: false,
    },
  }),
  manifest: {
    name: 'URL Archive',
    description: '一键把网页剪藏进 Obsidian，AI 自动摘要与标签。',
    permissions: ['activeTab', 'scripting', 'storage', 'bookmarks', 'favicon'],
    // 允许扩展请求本地 Obsidian REST API 与用户配置的 LLM 端点
    host_permissions: ['http://127.0.0.1/*', 'http://*/*', 'https://*/*'],
    action: { default_title: '剪藏到 Obsidian' },
    chrome_url_overrides: {
      newtab: 'newtab.html',
    },
  },
});
