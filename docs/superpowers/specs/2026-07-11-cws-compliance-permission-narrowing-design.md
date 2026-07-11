# CWS 合规收窄 + 隐私政策 — 设计文档

- 日期：2026-07-11
- 范围：`url-archive-extension`（浏览器扩展）+ 仓库根隐私政策
- 目标：让扩展满足 Chrome Web Store 上架要求，收窄权限、补齐隐私政策，且**不伤害用户体验**。

## 背景与问题

当前 manifest 声明了广域 host 权限并常驻 `<all_urls>` 内容脚本：

```
"host_permissions": ["http://127.0.0.1/*", "http://*/*", "https://*/*"],
"content_scripts": [{ "matches": ["<all_urls>"], "js": [...] }]
```

广域 host（`http://*/*` + `https://*/*`）实际是为**两类用户自配的任意主机**放开的：

- **Obsidian 写入端点**：`settings.restApiUrl` / `settings.officialApiUrl`（可为 127.0.0.1，也可为远程）。
- **LLM 端点**：`settings.llmBaseUrl`（任意 https 主机）。

favicon 与壁纸是 `<img>` 加载，**不需要** host 权限。

CWS 审查后果：广域 host + `<all_urls>` 内容脚本触发深度审查、易拒；同时扩展处理个人/敏感数据（书签、页面正文并外发到第三方 LLM）却无隐私政策，无法完成提交。

## 决策摘要（已与用户确认）

1. **权限模型**：全部运行时申请。manifest 不声明任何广域 host，改用 `optional_host_permissions` 作申请池，按实际 origin 运行时 `chrome.permissions.request`。
2. **隐私政策**：仓库根 `PRIVACY.md`（中英双语），CWS 后台填 `https://github.com/irollab/url-archive/blob/main/PRIVACY.md`。
3. **后台标签页剪藏**（新标签页「剪藏最近页」）：保留，首次使用时在用户手势内申请广域 host；拒绝则提示改用弹出页剪藏。
4. **重新授权引导 UX**：新增，用于消除既有用户升级后的「悄悄失灵」回归。

## 非目标

- 不改动剪藏两阶段协议、AI 补全逻辑、语义索引、新标签页视觉与性能。
- 不实现 CWS 后台文案的自动填写（仅在实现阶段附文案草稿）。
- 不改 favicon/壁纸的加载方式（本节仅确认它们无需 host 权限）。

---

## 第 1 节 · 权限模型（manifest 变更）

```jsonc
// 变更后
"permissions": ["activeTab", "scripting", "storage", "bookmarks", "favicon"],
"host_permissions": [],                                   // 清空
"optional_host_permissions": ["http://*/*", "https://*/*"] // 仅作运行时申请池
// 删除 content_scripts 声明块
```

- `permissions` 五项不变，各有明确用途（见「CWS 权限理由草稿」）。
- 广域 host 由「安装即授予」变为「运行时按需申请」。
- `optional_host_permissions` 用 `http://*/*` + `https://*/*`（不用 `<all_urls>`，避免涵盖 file/ftp）。运行时既可申请**具体端点 origin**，也可申请**广域对**（后台页剪藏）。

## 第 2 节 · 内容抽取与剪藏路径

- 删除声明式 `<all_urls>` 内容脚本；`requestExtract` 一律走**按需** `chrome.scripting.executeScript` 注入。现有代码已有此 fallback（`background.ts` 的 `isMissingContentScriptError` 分支），改造为唯一路径，删除先 `sendMessage` 再回退的双路径。
- **弹出页「剪藏本页」**（`CAPTURE`，目标=激活标签页）：`activeTab` 在用户点击扩展 action 后授予当前标签页访问权 → `executeScript` 注入 → `EXTRACT`。**全程零 host 权限**。
- **新标签页「剪藏最近页」**（`CAPTURE_LAST_ACTIVE`，目标=另一后台标签页）：`activeTab` 不覆盖该标签页，需广域 host。流程：
  1. `permissions.contains({origins:['http://*/*','https://*/*']})`；
  2. 缺失 → 在点击手势内 `permissions.request(同上)`；
  3. 同意 → `executeScript` 注入目标标签页并抽取；
  4. 拒绝 → 抛可读错误「已跳过：可在目标页用扩展图标『剪藏本页』」。

> 约束：`permissions.request` 必须由用户手势触发。`CAPTURE_LAST_ACTIVE` 由新标签页按钮点击发起，手势可透传到 background 的请求调用（经由内容页/弹出页发起 request 更稳妥，见实现计划）。

## 第 3 节 · 端点授权（Obsidian + LLM）+ 重新授权引导

### 3.1 授权时机

- **设置页保存时申请**：用户在 options 页填好 Obsidian/LLM `baseUrl` 点「保存」（用户手势）→ 解析 origin（`new URL(baseUrl).origin + '/*'`）→ `permissions.request({origins:[origin]})`。授权持久保存，多次保存幂等（先 `contains` 再按需 `request`）。
- 端点为空或非法 URL：跳过申请，保存其余设置。

### 3.2 调用前校验

Phase A 写 Obsidian、Phase B 补 AI、AI 找回，各自 fetch 前 `permissions.contains(endpointOrigin)`：

- 有权限 → 正常 fetch。
- 无权限 → 抛结构化错误 `MissingHostPermissionError(origin)`（后台无手势，不能静默 request）。上层据此走「失败即引导」。

### 3.3 重新授权引导 UX（新增，消除升级回归）

既有用户升级后旧端点缺 optional 权限，且无法自动补授权。为避免「更新后突然坏了」：

1. **主动检测横幅**：弹出页 / 新标签页 / 设置页加载时，检查「已配置端点 ∧ 缺对应 host 权限」。命中则在顶部显示一条**重新授权横幅**：一句话说明 + 「重新授权」按钮（点击=用户手势→逐个 `permissions.request` 已配置端点 origin）。授权齐备后横幅消失。
2. **失败即引导**：剪藏/补全/找回因 `MissingHostPermissionError` 失败时，状态文案附「点此重新授权」动作，而非纯报错。
3. **兜底不变**：Obsidian 写失败仍进离线队列（`ClipQueue`），授权补齐后 `flushQueue` 自动回写，**不丢数据**；LLM 补全仍是 best-effort，失败保留 Phase A 占位笔记。

### 3.4 新增内部单元（隔离与可测）

- `lib/permissions.ts`：
  - `originPattern(url: string): string | null` — 端点 URL → `origin + '/*'` 模式，非法返回 null。
  - `hasOriginAccess(origins: string[]): Promise<boolean>` — 包 `chrome.permissions.contains`。
  - `requestOriginAccess(origins: string[]): Promise<boolean>` — 包 `chrome.permissions.request`（须手势内调用）。
  - `missingConfiguredOrigins(settings): Promise<string[]>` — 返回「已配置但未授权」的 origin 列表，供横幅检测。
  - `MissingHostPermissionError` 错误类型。
  - 依赖：`chrome.permissions`、`settings`。对外仅暴露上述纯函数式接口，便于 mock。

## 第 4 节 · 隐私政策 `PRIVACY.md`（中英双语）

结构（中英各一份，中文在前）：

1. **收集/处理的数据**：页面标题·URL·正文（≤6000 字符，仅剪藏时）、浏览器书签、剪藏元数据、用户填写的 API 端点与密钥。
2. **数据流向**：正文+URL → **用户自配的 LLM 端点**（用于生成摘要/标签，可关闭）；剪藏内容 → **用户自配的 Obsidian 端点**；页面域名 → Google favicon 服务（图标兜底）；默认壁纸 → Unsplash。**无自有服务器、无遥测/分析、不出售或共享数据**；数据仅在用户浏览器与用户自己配置的服务之间流动。
3. **本地存储**：设置（含 API 密钥）存 `chrome.storage.local`；剪藏与图片存 IndexedDB；均驻留本机，不上传。
4. **用户控制**：可清空设置/收藏、可在 chrome://extensions 撤销 host 权限、可更换/停用 LLM、可清除本地数据。
5. **数据留存与安全**：数据留存于本机直至用户删除；密钥仅用于向用户自配端点鉴权。
6. **联系方式**：仓库 Issues + 维护者邮箱。
7. **变更**：政策更新将更新本文件与生效日期。

> 壁纸决策：默认壁纸暂保留 Unsplash（在隐私政策中披露）；是否改内置留作后续独立优化，不阻塞本次。

## 第 5 节 · 测试策略

- **单测（vitest）**：
  - `lib/permissions.ts`：`originPattern` 合法/非法/末斜杠；`hasOriginAccess`/`requestOriginAccess` 用 mock `chrome.permissions` 覆盖 contains/request/deny；`missingConfiguredOrigins` 覆盖「全授权 / 部分缺失 / 端点未配置」。
  - LLM/vault 调用层：注入缺权限时抛 `MissingHostPermissionError`。
- **回归**：`requestExtract` 改造后，现有 capture/queue 测试保持绿色。
- **手动验证清单**：
  1. 全新安装 → 安装弹窗**无**「所有网站」警告；
  2. 弹出页剪藏本页 → 无授权弹窗、正常写入；
  3. 设置页保存端点 → 弹一次主机授权框，同意后剪藏/补全正常；
  4. 新标签页剪藏最近页 → 首次弹广域授权框；拒绝 → 提示文案正确；
  5. 模拟老用户（有端点、无 optional 权限）→ 顶部出现重新授权横幅，一键授权后恢复；
  6. 撤销端点权限 → 剪藏进离线队列、补全静默降级、横幅重现。

## 范围外（实现阶段附草稿，非代码改动）

CWS 后台需人工填写，实现阶段随附文案草稿：

- **权限逐条理由**：`activeTab`（点击时剪藏当前页）、`scripting`（注入抽取脚本）、`storage`（本地保存设置与收藏）、`bookmarks`（导入书签生成收藏网格）、`favicon`（显示站点图标）、`optional_host_permissions`（向用户自配的 Obsidian/LLM 端点发送数据，运行时申请）。
- 隐私政策 URL、数据用途披露勾选、单一用途叙述（「把 URL 存进 Obsidian 并在新标签页复现/找回」为一条主线）、上架截图。

## 影响面

- 改动文件（预估）：`wxt.config.ts`（manifest）、`entrypoints/background.ts`（抽取路径 + 授权校验）、`entrypoints/content.ts`（不再声明式注入，保留可被 executeScript 加载）、`entrypoints/options/*`（保存时申请 + 横幅）、`entrypoints/popup/*` 与 `entrypoints/newtab/*`（横幅 + 失败引导）、新增 `lib/permissions.ts` 及测试、新增 `PRIVACY.md`。
- 用户体感：新用户几乎无损（一两次一次性授权框）；老用户升级后由横幅清晰引导重新授权一次；不丢数据。
