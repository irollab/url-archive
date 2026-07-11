import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  outDir: process.env.URL_ARCHIVE_WXT_OUT_DIR ?? '.output',
  vite: () => ({
    build: {
      modulePreload: false,
    },
  }),
  hooks: {
    // content.ts 使用 registration: 'runtime'，没有任何 manifest 注册的内容脚本；
    // 但 WXT 仍会在 manifest 中留一个空的 content_scripts: []（无内容脚本注册时的占位符，
    // 对浏览器无实际影响）。这里在生成后剔除该空数组，使 manifest 不含 content_scripts 段。
    'build:manifestGenerated': (_wxt, manifest) => {
      if (Array.isArray(manifest.content_scripts) && manifest.content_scripts.length === 0) {
        delete manifest.content_scripts;
      }
    },
  },
  manifest: {
    name: 'URL Archive',
    description: '一键把网页剪藏进 Obsidian，AI 自动摘要与标签。',
    permissions: ['activeTab', 'scripting', 'storage', 'bookmarks', 'favicon'],
    // 广域 host 改为运行时按需申请：默认不授予，向用户自配的 Obsidian/LLM 端点或后台标签页剪藏时再申请
    host_permissions: [],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: '剪藏到 Obsidian' },
    chrome_url_overrides: {
      newtab: 'newtab.html',
    },
  },
});
