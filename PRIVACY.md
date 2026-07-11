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
