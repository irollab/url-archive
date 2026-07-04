# 新标签页「画廊模式」设计方案

日期：2026-07-04
状态：已确认，待实现

## 背景与目标

当前浏览器扩展新标签页（`entrypoints/newtab/`）以分页平铺网格展示书签收藏图标。本次为其新增一种「画廊模式」视图：借鉴 [React Bits DomeGallery](https://reactbits.dev/components/dome-gallery) 的球面画廊效果，把全部书签图标铺在一个可拖拽旋转的 3D 球面上。

技术前提：

- 项目为 **WXT + 原生 TypeScript**，无 React、无组件框架。`main.ts` 为约 1200 行命令式代码。
- 书签数据（`DashboardCard`）中可用的图像只有 `faviconUrl`（favicon 图标），无站点大图。
- DomeGallery 原组件为 React + `@use-gesture/react`，但其内部几乎全为命令式 DOM 操作（无 `useState`，状态存于 `useRef`，渲染直接操作 `style`/`createElement`），仅拖拽依赖 `@use-gesture`。

## 关键决策

1. **不引入 React**：将 DomeGallery 移植为原生 TS 模块，用 Pointer Events 替代 `@use-gesture/react`。理由：原组件本质是命令式 DOM 组件，React 能力（声明式状态、重渲染 diff）在此用不上；高频拖拽动画本就必须走命令式；引入 React 会带来构建链改造、包体积、风格割裂等成本而收益近零。
2. **瓦片内容**：favicon + 品牌底色瓦片（域名 hash → 稳定 HSL 底色，居中放大 favicon，底部可选标题）。
3. **点击行为**：先放大预览再打开——点击瓦片放大为居中大卡，点击放大卡再打开书签 URL。
4. **呈现方式**：整体替换书签网格——开启画廊模式后主区域用球面画廊替换原分页网格，关闭则回到网格。

## 架构与模块边界

### 新增模块 `entrypoints/newtab/dome-gallery.ts`

导出一个自包含的 `DomeGallery` 类，只负责球面渲染、拖拽旋转、放大动画，不感知「书签」概念。

```ts
export type DomeItem = {
  src: string;      // favicon 图像地址（已解析）
  title: string;    // 书签标题
  url: string;      // 书签 URL（打开用）
  initial: string;  // favicon 加载失败时的回退首字母
};

export type DomeGalleryOptions = {
  onOpen: (url: string) => void;   // 打开书签意图回调
  segments?: number;               // 球面分段，默认沿用原组件策略
  grayscale?: boolean;             // 默认 false
  // 其余外观参数（fit/minRadius/overlayBlurColor 等）保留默认值，暂不外露到设置
};

export class DomeGallery {
  constructor(root: HTMLElement, options: DomeGalleryOptions);
  setItems(items: DomeItem[]): void;  // 更新瓦片数据并重建球面
  destroy(): void;                    // 断开 ResizeObserver、移除监听、清理 DOM
}
```

移植对照：

- `@use-gesture/react` 拖拽 → 原生 `pointerdown/pointermove/pointerup` + 惯性 `requestAnimationFrame`。
- React `useRef` → 类的私有字段 / 局部 DOM 引用。
- `useEffect(ResizeObserver)` → 构造函数内建立 observer，`destroy()` 内 `disconnect()`。
- `useMemo(buildItems)` → `setItems` 内直接计算。
- 保留原组件的核心几何：`buildItems`、`computeItemBaseRotation`、`applyTransform`、放大/收起动画序列。

### `main.ts` 职责

- 判断是否画廊模式，把当前筛选后的 `DashboardCard[]` 映射为 `DomeItem[]`。
- 懒创建并持有单个 `DomeGallery` 实例；提供 `onOpen(url)` → 复用现有 `openTab(url)`。
- 切换视图时的显隐控制。

## 偏好设置（Prefs）

新增布尔字段 `galleryMode: boolean`，默认 `false`。需在两处同步维护：

1. `entrypoints/newtab/main.ts`：`Prefs` 类型、`DEFAULT_PREFS`、`normalizePrefs`。
2. `lib/preferences.ts`：`NewTabPrefs` 接口、`DEFAULT_PREFS`、`normalizePrefs`（`typeof raw.galleryMode === 'boolean' ? ... : 默认`）。

## 设置 UI

在 `index.html` 「布局」分组内、`隐藏图标名称` 开关上方，新增一个开关（复用现有 `.toggle-field` 结构与样式）：

```html
<label class="toggle-field">
  <span>画廊模式</span>
  <input id="galleryModeInput" type="checkbox" />
  <span class="toggle-switch" aria-hidden="true"></span>
</label>
```

- `main.ts` 中获取该元素，`change` 时 `savePrefs({ galleryMode })` 并触发重渲染。
- `applyPrefs` 中同步复选框状态。
- 网格相关滑块在画廊模式下对画廊无效，保持可见、不置灰（YAGNI，避免额外禁用状态）。

## 渲染与数据流

1. `index.html`：在 `#cardsViewport` 同级新增容器 `<div id="domeGallery" class="dome-gallery" hidden></div>`。
2. `applyPrefs()`：根据 `galleryMode` 在 `#app` 上切换 `gallery-mode` class。CSS 据此隐藏 `.bookmark-grid-viewport` 与 `.page-indicator`、显示 `#domeGallery`（反之亦然）。
3. `renderDashboard()`：
   - 画廊模式：调用 `renderDome(cards)` —— 懒创建 `DomeGallery` 实例（首次），随后 `setItems(mapToDomeItems(cards))`。
   - 网格模式：走原有 `renderCards(cards, query)`。
   - 搜索、分类筛选后的 `cards` 已在上游算好，两种视图共用同一份数据，无需重复过滤逻辑。
4. `mapToDomeItems`：由 `DashboardCard` 取 `faviconUrl` / `title` / `url` / `initial`。
5. 瓦片数少于球面槽位时，沿用原组件「循环复用 pool 填满」策略。

## 瓦片外观（favicon + 品牌底色）

每个 `.item__image` 内部：

- 品牌底色块：由域名 hash 生成稳定 HSL（如 `hue = hash(domain) % 360`，固定饱和度/亮度），保证同站点颜色一致。
- 居中放大的 favicon `<img>`；`error` 时回退为首字母色块（复用现有 fallback 思路）。
- 底部可选标题（受 `showLabels` 影响，与网格模式一致）。
- `grayscale` 关闭。`--overlay-blur-color` 设为透明或跟随主题，让新标签页壁纸透出。

## 交互（先放大预览再打开）

- 拖拽球面旋转，释放后惯性滑动（移植原惯性算法）。
- 点击瓦片 → 放大为居中大卡（大 favicon + 标题 + 域名），保留原放大动画。
- 放大卡可点击 → `onOpen(url)` 打开书签（新标签）。
- 点击遮罩或按 Esc → 收起放大卡。

## 样式

- 将 `DomeGallery.css` 移植进 `entrypoints/newtab/style.css`，所有选择器收敛在 `.dome-gallery` 根下，避免与现有类名（如 `.item`）冲突。
- 原组件的 `.dg-scroll-lock` 作用于 `body`；改为作用于 `#app`（或画廊容器），不锁 `body`，以适配新标签页整体布局。
- 暗色主题下校准底色亮度与遮罩色。

## 测试与验证

- `lib/preferences.test.ts`：补 `galleryMode` 的规范化用例（缺省 → `false`；非法值 → 默认；合法布尔透传）。
- 手动验证清单：
  - 开关切换网格 ↔ 画廊，偏好持久化。
  - 拖拽旋转、惯性、点击放大、放大卡打开 URL、Esc/遮罩收起。
  - 搜索与分类筛选下画廊内容随之更新。
  - favicon 加载失败回退首字母。
  - 亮/暗主题表现。
- 收尾运行 `npm run compile`（`tsc --noEmit`）与 `npm run build`，确保零 TS 错误、构建通过。

## 范围之外（YAGNI）

- 不引入 React 及相关构建链。
- 不抓取站点截图 / OG 大图。
- 不为画廊做专属分页控件或额外外观设置项（复用默认参数）。
- 不置灰网格相关滑块。
