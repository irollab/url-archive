# 新标签页「画廊模式」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为浏览器扩展新标签页新增「画廊模式」——把全部书签图标铺在一个可拖拽旋转的 3D 球面（DomeGallery 风格）上，替换原分页平铺网格。

**Architecture:** 将 React 版 DomeGallery 移植为自包含的原生 TS 类 `DomeGallery`（用 Pointer Events 替代 `@use-gesture`）。`main.ts` 持有单例、把筛选后的书签映射为 `DomeItem[]` 喂入，并通过 `onOpen` 回调打开 URL。偏好新增布尔 `galleryMode` 控制视图切换。

**Tech Stack:** WXT、原生 TypeScript、Vitest（+ jsdom）、CSS。**不引入 React。**

## Global Constraints

- 语言：所有新增用户可见文案、代码注释使用简体中文（与现有代码库一致）。
- 不新增运行时重依赖（禁止引入 `react` / `react-dom` / `@use-gesture/react`）。
- `galleryMode` 偏好默认值为 `false`，须在 `lib/preferences.ts` 与 `entrypoints/newtab/main.ts` 两处保持一致。
- 所有 DomeGallery 相关 CSS 选择器收敛在 `.dome-gallery` 根下，避免与现有类名冲突。
- 收尾必须通过 `npm run compile`（`tsc --noEmit`）与 `npm run build`，零 TS 错误。
- 命令在 `url-archive-extension/` 目录下运行（`package.json` 所在处）。
- 文件路径一律用双引号包裹。

---

## File Structure

- `url-archive-extension/lib/preferences.ts` — 修改：`NewTabPrefs` 增加 `galleryMode`。
- `url-archive-extension/lib/preferences.test.ts` — 修改：更新全量快照、新增用例。
- `url-archive-extension/entrypoints/newtab/dome-gallery.ts` — 新建：DomeGallery 类 + 纯几何/配色辅助函数。
- `url-archive-extension/entrypoints/newtab/dome-gallery.test.ts` — 新建：纯辅助函数单测。
- `url-archive-extension/entrypoints/newtab/main.ts` — 修改：`Prefs`、设置开关、视图切换、`renderDome`。
- `url-archive-extension/entrypoints/newtab/index.html` — 修改：画廊容器 + 设置开关。
- `url-archive-extension/entrypoints/newtab/style.css` — 修改：移植 DomeGallery 样式 + 视图切换。

---

### Task 1: 偏好设置新增 galleryMode（lib/preferences.ts）

**Files:**
- Modify: `url-archive-extension/lib/preferences.ts`
- Test: `url-archive-extension/lib/preferences.test.ts`

**Interfaces:**
- Produces: `NewTabPrefs.galleryMode: boolean`（默认 `false`），`normalizePrefs` 对其规范化。

- [ ] **Step 1: 更新现有测试快照，新增 galleryMode 用例（先失败）**

在 `preferences.test.ts` 中，为四处 `toEqual({...})` 全量快照对象各加一行 `galleryMode: false`（第一个 defaults 用例、`saves valid preferences` 的 save 与 load 两个对象、`replaces...` 的 save/replace/load 三个对象、`falls back...` 的期望对象）。凡是显式传入 prefs 的对象也加 `galleryMode`（`saves valid preferences` 传入对象加 `galleryMode: true`，其余传入对象加 `galleryMode: false`）。

然后在 `describe('new tab preferences', ...)` 内追加新用例：

```ts
  test('normalizes galleryMode', async () => {
    store.new_tab_prefs = { galleryMode: 'yes' };
    await expect(loadNewTabPrefs()).resolves.toMatchObject({ galleryMode: false });

    store.new_tab_prefs = { galleryMode: true };
    await expect(loadNewTabPrefs()).resolves.toMatchObject({ galleryMode: true });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- preferences`
Expected: FAIL —— `galleryMode` 未定义 / 快照不匹配。

- [ ] **Step 3: 在 preferences.ts 实现 galleryMode**

在 `NewTabPrefs` 接口 `showLabels: boolean;` 下方加：
```ts
  galleryMode: boolean;
```
在 `DEFAULT_PREFS` 对象 `showLabels: true,` 下方加：
```ts
  galleryMode: false,
```
在 `normalizePrefs` 返回对象 `showLabels: ...,` 那一行下方加：
```ts
    galleryMode: typeof raw.galleryMode === 'boolean' ? raw.galleryMode : DEFAULT_PREFS.galleryMode,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- preferences`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add url-archive-extension/lib/preferences.ts url-archive-extension/lib/preferences.test.ts
git commit -m "feat: add galleryMode new tab preference"
```

---

### Task 2: DomeGallery 纯几何与配色辅助函数（dome-gallery.ts）

**Files:**
- Create: `url-archive-extension/entrypoints/newtab/dome-gallery.ts`
- Test: `url-archive-extension/entrypoints/newtab/dome-gallery.test.ts`

**Interfaces:**
- Produces:
  - `type DomeItem = { src: string; title: string; url: string; initial: string }`
  - `type DomeTile = DomeItem & { x: number; y: number; sizeX: number; sizeY: number }`
  - `buildTiles(pool: DomeItem[], seg: number): DomeTile[]` —— 生成球面槽位并循环复用 pool 填满；空 pool 返回空 `src/title/url/initial`。
  - `computeItemBaseRotation(offsetX, offsetY, sizeX, sizeY, segments): { rotateX: number; rotateY: number }`
  - `colorForSeed(seed: string): string` —— 域名/标题 hash → 稳定 `hsl(...)`。

- [ ] **Step 1: 写失败测试**

创建 `dome-gallery.test.ts`：
```ts
import { describe, expect, test } from 'vitest';
import { buildTiles, colorForSeed, computeItemBaseRotation, type DomeItem } from './dome-gallery';

const item = (n: string): DomeItem => ({ src: `${n}.ico`, title: n, url: `https://${n}`, initial: n[0].toUpperCase() });

describe('dome-gallery helpers', () => {
  test('buildTiles fills every slot by cycling the pool', () => {
    const pool = [item('a'), item('b'), item('c')];
    const tiles = buildTiles(pool, 35);
    expect(tiles.length).toBeGreaterThan(pool.length);
    expect(tiles.every((t) => t.src !== '')).toBe(true);
    expect(tiles.every((t) => t.sizeX === 2 && t.sizeY === 2)).toBe(true);
  });

  test('buildTiles returns empty tiles for an empty pool', () => {
    const tiles = buildTiles([], 35);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.src === '' && t.url === '')).toBe(true);
  });

  test('colorForSeed is stable and returns hsl', () => {
    expect(colorForSeed('github.com')).toBe(colorForSeed('github.com'));
    expect(colorForSeed('github.com')).toMatch(/^hsl\(/);
  });

  test('computeItemBaseRotation is centered at origin', () => {
    const r = computeItemBaseRotation(0, 0, 2, 2, 35);
    const unit = 360 / 35 / 2;
    expect(r.rotateY).toBeCloseTo(unit * 0.5);
    expect(r.rotateX).toBeCloseTo(unit * -0.5);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- dome-gallery`
Expected: FAIL —— 模块不存在 / 函数未定义。

- [ ] **Step 3: 创建 dome-gallery.ts，先实现纯辅助函数**

创建 `dome-gallery.ts`，写入类型与纯函数（类稍后任务补充）：
```ts
export type DomeItem = { src: string; title: string; url: string; initial: string };
export type DomeTile = DomeItem & { x: number; y: number; sizeX: number; sizeY: number };

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
export const normalizeAngle = (d: number) => ((d % 360) + 360) % 360;
export const wrapAngleSigned = (deg: number) => {
  const a = (((deg + 180) % 360) + 360) % 360;
  return a - 180;
};

const EMPTY_ITEM: DomeItem = { src: '', title: '', url: '', initial: '' };

export function buildTiles(pool: DomeItem[], seg: number): DomeTile[] {
  const xCols = Array.from({ length: seg }, (_, i) => -37 + i * 2);
  const evenYs = [-4, -2, 0, 2, 4];
  const oddYs = [-3, -1, 1, 3, 5];
  const coords = xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs;
    return ys.map((y) => ({ x, y, sizeX: 2, sizeY: 2 }));
  });
  if (pool.length === 0) {
    return coords.map((c) => ({ ...c, ...EMPTY_ITEM }));
  }
  const used = Array.from({ length: coords.length }, (_, i) => pool[i % pool.length]);
  // 尽量避免相邻槽位重复同一书签
  for (let i = 1; i < used.length; i++) {
    if (used[i].url === used[i - 1].url) {
      for (let j = i + 1; j < used.length; j++) {
        if (used[j].url !== used[i].url) {
          const tmp = used[i];
          used[i] = used[j];
          used[j] = tmp;
          break;
        }
      }
    }
  }
  return coords.map((c, i) => ({ ...c, ...used[i] }));
}

export function computeItemBaseRotation(
  offsetX: number,
  offsetY: number,
  sizeX: number,
  sizeY: number,
  segments: number,
): { rotateX: number; rotateY: number } {
  const unit = 360 / segments / 2;
  const rotateY = unit * (offsetX + (sizeX - 1) / 2);
  const rotateX = unit * (offsetY - (sizeY - 1) / 2);
  return { rotateX, rotateY };
}

export function colorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 60%, 52%)`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- dome-gallery`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add url-archive-extension/entrypoints/newtab/dome-gallery.ts url-archive-extension/entrypoints/newtab/dome-gallery.test.ts
git commit -m "feat: add dome gallery geometry helpers"
```

---

### Task 3: DomeGallery 类（渲染 + 拖拽旋转 + 惯性 + 自适应半径）

**Files:**
- Modify: `url-archive-extension/entrypoints/newtab/dome-gallery.ts`

**Interfaces:**
- Consumes: Task 2 的 `buildTiles` / `computeItemBaseRotation` / `colorForSeed` / `clamp` / `wrapAngleSigned` / `normalizeAngle` / 类型。
- Produces:
  - `type DomeGalleryOptions = { onOpen: (url: string) => void; segments?: number; overlayBlurColor?: string }`
  - `class DomeGallery { constructor(root: HTMLElement, options: DomeGalleryOptions); setItems(items: DomeItem[]): void; destroy(): void }`
  - 私有方法 `openTile(el)` / `closeEnlarged()` 由 Task 4 补充；本任务先留 `openTile` 空实现占位（`private openTile(_el: HTMLElement) {}`），Task 4 替换。

- [ ] **Step 1: 追加 DomeGallery 类骨架与渲染/拖拽/自适应逻辑**

在 `dome-gallery.ts` 末尾追加：
```ts
export type DomeGalleryOptions = {
  onOpen: (url: string) => void;
  segments?: number;
  overlayBlurColor?: string;
};

const DEFAULT_SEGMENTS = 35;
const MAX_VERTICAL_ROTATION_DEG = 5;
const DRAG_SENSITIVITY = 20;

export class DomeGallery {
  private root: HTMLElement;
  private options: Required<Pick<DomeGalleryOptions, 'onOpen'>> & DomeGalleryOptions;
  private segments: number;
  private main!: HTMLElement;
  private stage!: HTMLElement;
  private sphere!: HTMLElement;
  private viewer!: HTMLElement;
  private scrim!: HTMLElement;
  private frame!: HTMLElement;
  private ro: ResizeObserver;
  private rotation = { x: 0, y: 0 };
  private startRot = { x: 0, y: 0 };
  private startPos: { x: number; y: number } | null = null;
  private dragging = false;
  private moved = false;
  private inertiaRAF: number | null = null;
  private lastDragEndAt = 0;
  private focusedEl: HTMLElement | null = null;
  private opening = false;
  private openStartedAt = 0;

  constructor(root: HTMLElement, options: DomeGalleryOptions) {
    this.root = root;
    this.options = options;
    this.segments = options.segments ?? DEFAULT_SEGMENTS;
    this.buildScaffold();
    this.bindPointer();
    this.bindClose();
    this.ro = new ResizeObserver((entries) => this.onResize(entries[0].contentRect));
    this.ro.observe(this.root);
    this.applyTransform();
  }

  setItems(items: DomeItem[]): void {
    const tiles = buildTiles(items, this.segments);
    const rotY = 360 / this.segments / 2;
    const rotX = 360 / this.segments / 2;
    this.sphere.replaceChildren(
      ...tiles.map((t) => this.renderTile(t, rotY, rotX)),
    );
    this.applyTransform();
  }

  destroy(): void {
    this.ro.disconnect();
    if (this.inertiaRAF) cancelAnimationFrame(this.inertiaRAF);
    this.root.classList.remove('dg-scroll-lock');
    this.root.replaceChildren();
  }

  private buildScaffold() {
    this.root.classList.add('dome-gallery');
    this.root.style.setProperty('--segments-x', String(this.segments));
    this.root.style.setProperty('--segments-y', String(this.segments));
    if (this.options.overlayBlurColor) {
      this.root.style.setProperty('--overlay-blur-color', this.options.overlayBlurColor);
    }
    this.root.innerHTML = `
      <main class="dg-main">
        <div class="dg-stage"><div class="dg-sphere"></div></div>
        <div class="dg-overlay"></div>
        <div class="dg-edge dg-edge--top"></div>
        <div class="dg-edge dg-edge--bottom"></div>
        <div class="dg-viewer"><div class="dg-scrim"></div><div class="dg-frame"></div></div>
      </main>`;
    this.main = this.root.querySelector('.dg-main')!;
    this.stage = this.root.querySelector('.dg-stage')!;
    this.sphere = this.root.querySelector('.dg-sphere')!;
    this.viewer = this.root.querySelector('.dg-viewer')!;
    this.scrim = this.root.querySelector('.dg-scrim')!;
    this.frame = this.root.querySelector('.dg-frame')!;
  }

  private renderTile(t: DomeTile, rotY: number, rotX: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'dg-item';
    item.style.setProperty('--offset-x', String(t.x));
    item.style.setProperty('--offset-y', String(t.y));
    item.style.setProperty('--item-size-x', String(t.sizeX));
    item.style.setProperty('--item-size-y', String(t.sizeY));
    item.dataset.offsetX = String(t.x);
    item.dataset.offsetY = String(t.y);
    item.dataset.sizeX = String(t.sizeX);
    item.dataset.sizeY = String(t.sizeY);
    item.dataset.url = t.url;
    item.dataset.title = t.title;
    item.dataset.src = t.src;
    item.dataset.initial = t.initial;

    const tile = document.createElement('div');
    tile.className = 'dg-tile';
    tile.setAttribute('role', 'button');
    tile.tabIndex = 0;
    tile.setAttribute('aria-label', t.title || '打开书签');
    tile.style.background = t.url ? colorForSeed(t.url) : 'transparent';
    tile.innerHTML = t.src
      ? `<img class="dg-favicon" src="${escapeAttr(t.src)}" alt="" draggable="false" />`
      : (t.initial ? `<span class="dg-initial">${escapeHtml(t.initial)}</span>` : '');
    tile.querySelector<HTMLImageElement>('.dg-favicon')?.addEventListener('error', function () {
      this.replaceWith(Object.assign(document.createElement('span'), { className: 'dg-initial', textContent: t.initial || '?' }));
    }, { once: true });
    tile.addEventListener('click', () => this.onTileClick(item));
    item.appendChild(tile);
    return item;
  }

  private onTileClick(item: HTMLElement) {
    if (this.dragging || this.moved) return;
    if (performance.now() - this.lastDragEndAt < 80) return;
    if (this.opening) return;
    if (!item.dataset.url) return;
    this.openTile(item);
  }

  // Task 4 会替换此占位实现
  private openTile(_el: HTMLElement) {}

  private applyTransform() {
    this.sphere.style.transform =
      `translateZ(calc(var(--radius) * -1)) rotateX(${this.rotation.x}deg) rotateY(${this.rotation.y}deg)`;
  }

  private onResize(cr: DOMRectReadOnly) {
    const w = Math.max(1, cr.width);
    const h = Math.max(1, cr.height);
    const minDim = Math.min(w, h);
    const aspect = w / h;
    const basis = aspect >= 1.3 ? w : minDim;
    let radius = basis * 0.5;
    radius = Math.min(radius, h * 1.35);
    radius = clamp(radius, 400, Infinity);
    const viewerPad = Math.max(8, Math.round(minDim * 0.25));
    this.root.style.setProperty('--radius', `${Math.round(radius)}px`);
    this.root.style.setProperty('--viewer-pad', `${viewerPad}px`);
    this.applyTransform();
  }

  private bindPointer() {
    this.main.style.touchAction = 'none';
    this.main.addEventListener('pointerdown', (e) => {
      if (this.focusedEl) return;
      this.stopInertia();
      this.dragging = true;
      this.moved = false;
      this.startRot = { ...this.rotation };
      this.startPos = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    });
    this.main.addEventListener('pointermove', (e) => {
      if (!this.dragging || !this.startPos || this.focusedEl) return;
      const dx = e.clientX - this.startPos.x;
      const dy = e.clientY - this.startPos.y;
      if (!this.moved && dx * dx + dy * dy > 16) this.moved = true;
      this.rotation = {
        x: clamp(this.startRot.x - dy / DRAG_SENSITIVITY, -MAX_VERTICAL_ROTATION_DEG, MAX_VERTICAL_ROTATION_DEG),
        y: wrapAngleSigned(this.startRot.y + dx / DRAG_SENSITIVITY),
      };
      this.applyTransform();
    });
    const end = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.moved && this.startPos) {
        const vx = clamp(((e.clientX - this.startPos.x) / DRAG_SENSITIVITY) * 0.02, -1.2, 1.2);
        const vy = clamp(((e.clientY - this.startPos.y) / DRAG_SENSITIVITY) * 0.02, -1.2, 1.2);
        if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) this.startInertia(vx, vy);
        this.lastDragEndAt = performance.now();
      }
    };
    this.main.addEventListener('pointerup', end);
    this.main.addEventListener('pointercancel', end);
  }

  private stopInertia() {
    if (this.inertiaRAF) {
      cancelAnimationFrame(this.inertiaRAF);
      this.inertiaRAF = null;
    }
  }

  private startInertia(vx: number, vy: number) {
    let vX = clamp(vx, -1.4, 1.4) * 80;
    let vY = clamp(vy, -1.4, 1.4) * 80;
    const step = () => {
      vX *= 0.965;
      vY *= 0.965;
      if (Math.abs(vX) < 0.01 && Math.abs(vY) < 0.01) {
        this.inertiaRAF = null;
        return;
      }
      this.rotation = {
        x: clamp(this.rotation.x - vY / 200, -MAX_VERTICAL_ROTATION_DEG, MAX_VERTICAL_ROTATION_DEG),
        y: wrapAngleSigned(this.rotation.y + vX / 200),
      };
      this.applyTransform();
      this.inertiaRAF = requestAnimationFrame(step);
    };
    this.stopInertia();
    this.inertiaRAF = requestAnimationFrame(step);
  }

  private bindClose() {
    // Task 4 补充 scrim/Esc 关闭逻辑
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
```

- [ ] **Step 2: 运行编译确认无 TS 错误**

Run: `npm run compile`
Expected: 无输出（成功）。项目 `.wxt/tsconfig.json` 仅 `strict: true`，未开启 `noUnusedLocals`/`noUnusedParameters`，因此本任务中将在 Task 4 才用到的字段（`this.stage`/`this.viewer`/`this.scrim`/`this.frame`/`this.opening`/`this.openStartedAt`）与占位参数 `_el` 不会触发未使用报错。`computeItemBaseRotation`/`normalizeAngle` 为 `export`，同样不报未使用。

- [ ] **Step 3: 运行既有测试确保未破坏**

Run: `npm test -- dome-gallery`
Expected: PASS（纯函数测试仍通过）。

- [ ] **Step 4: 提交**

```bash
git add url-archive-extension/entrypoints/newtab/dome-gallery.ts
git commit -m "feat: add DomeGallery class with drag rotation and inertia"
```

---

### Task 4: 放大预览与打开交互（openTile / 关闭）

**Files:**
- Modify: `url-archive-extension/entrypoints/newtab/dome-gallery.ts`

**Interfaces:**
- Consumes: Task 3 的类字段（`viewer` / `frame` / `main` / `scrim` / `focusedEl` / `opening` / `rotation`）、`computeItemBaseRotation` / `normalizeAngle` / `colorForSeed`。
- Produces: 完整的 `openTile(el)` 与 `closeEnlarged()`；点击放大卡触发 `options.onOpen(url)`。

- [ ] **Step 1: 替换 openTile 占位实现，补齐放大逻辑**

将 Task 3 的 `private openTile(_el: HTMLElement) {}` 替换为：
```ts
  private buildCard(url: string, src: string, title: string, initial: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'dg-card';
    card.style.background = colorForSeed(url);
    card.innerHTML = `
      ${src ? `<img class="dg-card-favicon" src="${escapeAttr(src)}" alt="" draggable="false" />` : `<span class="dg-card-initial">${escapeHtml(initial || '?')}</span>`}
      <div class="dg-card-title">${escapeHtml(title || url)}</div>`;
    return card;
  }

  private openTile(el: HTMLElement) {
    if (this.opening) return;
    this.opening = true;
    this.openStartedAt = performance.now();
    this.root.classList.add('dg-scroll-lock');
    this.focusedEl = el;

    const url = el.dataset.url || '';
    const src = el.dataset.src || '';
    const title = el.dataset.title || '';
    const initial = el.dataset.initial || '';

    const frameR = this.frame.getBoundingClientRect();
    const mainR = this.main.getBoundingClientRect();
    const tileR = el.getBoundingClientRect();

    const overlay = document.createElement('div');
    overlay.className = 'dg-enlarge';
    overlay.style.left = `${frameR.left - mainR.left}px`;
    overlay.style.top = `${frameR.top - mainR.top}px`;
    overlay.style.width = `${frameR.width}px`;
    overlay.style.height = `${frameR.height}px`;
    overlay.style.transformOrigin = 'top left';
    overlay.appendChild(this.buildCard(url, src, title, initial));
    overlay.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (performance.now() - this.openStartedAt < 250) return;
      this.options.onOpen(url);
    });
    this.viewer.appendChild(overlay);

    const tx0 = tileR.left - frameR.left;
    const ty0 = tileR.top - frameR.top;
    const sx0 = frameR.width > 0 ? tileR.width / frameR.width : 1;
    const sy0 = frameR.height > 0 ? tileR.height / frameR.height : 1;
    overlay.style.transform = `translate(${tx0}px, ${ty0}px) scale(${sx0}, ${sy0})`;
    el.style.visibility = 'hidden';

    requestAnimationFrame(() => {
      overlay.style.transform = 'translate(0px, 0px) scale(1, 1)';
      this.root.setAttribute('data-enlarging', 'true');
    });
  }

  private closeEnlarged() {
    if (performance.now() - this.openStartedAt < 250) return;
    const el = this.focusedEl;
    const overlay = this.viewer.querySelector('.dg-enlarge') as HTMLElement | null;
    if (!overlay) return;
    overlay.style.opacity = '0';
    const cleanup = () => {
      overlay.remove();
      if (el) el.style.visibility = '';
      this.focusedEl = null;
      this.opening = false;
      this.root.removeAttribute('data-enlarging');
      this.root.classList.remove('dg-scroll-lock');
    };
    overlay.addEventListener('transitionend', cleanup, { once: true });
    // 兜底：若无过渡事件，300ms 后强制清理
    window.setTimeout(cleanup, 320);
  }
```

- [ ] **Step 2: 实现 bindClose（scrim 点击 + Esc）**

将 Task 3 的空 `bindClose()` 替换为：
```ts
  private bindClose() {
    this.scrim.addEventListener('click', () => this.closeEnlarged());
    this.onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closeEnlarged();
    };
    window.addEventListener('keydown', this.onKey);
  }
```
并在类中新增字段 `private onKey: (e: KeyboardEvent) => void = () => {};`，同时在 `destroy()` 中追加：
```ts
    window.removeEventListener('keydown', this.onKey);
```

- [ ] **Step 3: 编译确认**

Run: `npm run compile`
Expected: 成功，零错误。

- [ ] **Step 4: 单测回归**

Run: `npm test -- dome-gallery`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add url-archive-extension/entrypoints/newtab/dome-gallery.ts
git commit -m "feat: add dome gallery enlarge preview and open interaction"
```

---

### Task 5: 移植 DomeGallery 样式并接入视图切换（style.css + index.html 容器）

**Files:**
- Modify: `url-archive-extension/entrypoints/newtab/style.css`
- Modify: `url-archive-extension/entrypoints/newtab/index.html`

**Interfaces:**
- Consumes: Task 3/4 生成的 DOM 结构类名（`.dome-gallery` / `.dg-main` / `.dg-stage` / `.dg-sphere` / `.dg-item` / `.dg-tile` / `.dg-viewer` / `.dg-scrim` / `.dg-frame` / `.dg-enlarge` / `.dg-card` / `.dg-edge` / `.dg-overlay`）。
- Produces: `#app.gallery-mode` 下的视图切换规则；`#domeGallery` 容器。

- [ ] **Step 1: 在 index.html 增加画廊容器**

在 `index.html` 中 `<div class="bookmark-grid-viewport" id="cardsViewport">...</div>` 之后、`<div id="pageIndicator" ...>` 之前插入：
```html
          <div id="domeGallery" class="dome-gallery" hidden></div>
```

- [ ] **Step 2: 在 style.css 末尾追加画廊样式与视图切换**

在 `style.css` 末尾追加（选择器全部限定在 `.dome-gallery`）：
```css
/* ===== 画廊模式视图切换 ===== */
#app.gallery-mode .bookmark-grid-viewport,
#app.gallery-mode .page-indicator {
  display: none;
}
#app:not(.gallery-mode) .dome-gallery {
  display: none;
}
.dome-gallery {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  --radius: 520px;
  --viewer-pad: 72px;
  --overlay-blur-color: transparent;
  --circ: calc(var(--radius) * 3.14);
  --rot-y: calc((360deg / var(--segments-x, 35)) / 2);
  --rot-x: calc((360deg / var(--segments-y, 35)) / 2);
  --item-width: calc(var(--circ) / var(--segments-x, 35));
  --item-height: calc(var(--circ) / var(--segments-y, 35));
}
.dome-gallery * { box-sizing: border-box; }
.dome-gallery.dg-scroll-lock { overflow: hidden; }
.dg-sphere, .dg-item, .dg-tile { transform-style: preserve-3d; }
.dg-main {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: transparent;
}
.dg-stage {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  perspective: calc(var(--radius) * 2);
  perspective-origin: 50% 50%;
  contain: layout paint size;
}
.dg-sphere {
  transform: translateZ(calc(var(--radius) * -1));
  will-change: transform;
}
.dg-overlay {
  position: absolute;
  inset: 0;
  margin: auto;
  z-index: 3;
  pointer-events: none;
  background-image: radial-gradient(rgba(235, 235, 235, 0) 68%, var(--overlay-blur-color) 100%);
}
.dg-item {
  width: calc(var(--item-width) * var(--item-size-x));
  height: calc(var(--item-height) * var(--item-size-y));
  position: absolute;
  inset: -999px;
  margin: auto;
  transform-origin: 50% 50%;
  backface-visibility: hidden;
  transition: transform 300ms;
  transform:
    rotateY(calc(var(--rot-y) * (var(--offset-x) + ((var(--item-size-x) - 1) / 2))))
    rotateX(calc(var(--rot-x) * (var(--offset-y) - ((var(--item-size-y) - 1) / 2))))
    translateZ(var(--radius));
}
.dg-tile {
  position: absolute;
  inset: 10px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  overflow: hidden;
  backface-visibility: hidden;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transform: translateZ(0);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18);
}
.dg-tile:focus { outline: none; }
.dg-favicon {
  width: 58%;
  height: 58%;
  object-fit: contain;
  pointer-events: none;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .35));
}
.dg-initial {
  font-size: 1.6rem;
  font-weight: 800;
  color: #fff;
}
.dg-edge {
  position: absolute;
  left: 0;
  right: 0;
  height: 90px;
  z-index: 5;
  pointer-events: none;
}
.dg-edge--top { top: 0; background: linear-gradient(to top, transparent, var(--overlay-blur-color)); }
.dg-edge--bottom { bottom: 0; background: linear-gradient(to bottom, transparent, var(--overlay-blur-color)); }
.dg-viewer {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--viewer-pad);
}
.dg-frame {
  height: 100%;
  aspect-ratio: 1;
  display: flex;
}
@media (max-aspect-ratio: 1/1) {
  .dg-frame { height: auto; width: 100%; }
}
.dg-scrim {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, .4);
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms ease;
  backdrop-filter: blur(3px);
}
.dome-gallery[data-enlarging='true'] .dg-scrim {
  opacity: 1;
  pointer-events: all;
}
.dg-enlarge {
  position: absolute;
  z-index: 30;
  border-radius: 28px;
  overflow: hidden;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 420ms ease, opacity 300ms ease;
  transform-origin: top left;
  box-shadow: 0 20px 50px rgba(0, 0, 0, .4);
}
.dg-card {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  gap: 14px;
  padding: 24px;
  color: #fff;
}
.dg-card-favicon { width: 96px; height: 96px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,.4)); }
.dg-card-initial { font-size: 4rem; font-weight: 800; }
.dg-card-title {
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 2px 8px rgba(0, 0, 0, .5);
}
#app.hide-labels .dg-card-title { display: none; }
```

- [ ] **Step 3: 编译确认（CSS 不影响 tsc，但确保 HTML/TS 一致）**

Run: `npm run compile`
Expected: 成功。

- [ ] **Step 4: 提交**

```bash
git add url-archive-extension/entrypoints/newtab/style.css url-archive-extension/entrypoints/newtab/index.html
git commit -m "feat: add dome gallery styles and view switching"
```

---

### Task 6: main.ts 接入偏好、设置开关与画廊渲染

**Files:**
- Modify: `url-archive-extension/entrypoints/newtab/main.ts`
- Modify: `url-archive-extension/entrypoints/newtab/index.html`

**Interfaces:**
- Consumes: Task 3/4 的 `DomeGallery` 类、`DomeItem` 类型；Task 1 的 `galleryMode` 偏好；Task 5 的 `#domeGallery` 容器与 `gallery-mode` class。
- Produces: 设置开关 `#galleryModeInput`；`main.ts` 中 `renderDome`、`mapToDomeItems`、`domeInstance` 单例、`applyPrefs` 视图切换。

- [ ] **Step 1: index.html 增加设置开关**

在 `index.html` 「布局」分组内、`<label class="toggle-field"><span>隐藏图标名称</span>...` 这一 `label` 之前插入：
```html
          <label class="toggle-field">
            <span>画廊模式</span>
            <input id="galleryModeInput" type="checkbox" />
            <span class="toggle-switch" aria-hidden="true"></span>
          </label>
```

- [ ] **Step 2: main.ts 引入 DomeGallery 与类型**

在 `main.ts` 顶部 `image-store` import 语句之后新增：
```ts
import { DomeGallery, type DomeItem } from './dome-gallery';
```
在文件顶部元素引用区（`showLabelsInputEl` 定义之后）新增：
```ts
const galleryModeInputEl = document.getElementById('galleryModeInput') as HTMLInputElement;
const domeGalleryEl = document.getElementById('domeGallery') as HTMLDivElement;
```

- [ ] **Step 3: main.ts 扩展 Prefs / DEFAULT_PREFS / normalizePrefs**

在 `type Prefs = { ... showLabels: boolean; }` 中，`showLabels: boolean;` 下方加：
```ts
  galleryMode: boolean;
```
在 `DEFAULT_PREFS` 的 `showLabels: true,` 下方加：
```ts
  galleryMode: false,
```
在 `normalizePrefs` 返回对象的 `showLabels: ...,` 那一行下方加：
```ts
    galleryMode: typeof value.galleryMode === 'boolean' ? value.galleryMode : DEFAULT_PREFS.galleryMode,
```

- [ ] **Step 4: 新增单例与映射/渲染函数**

在 `main.ts` 中 `let searchEngine ...` 附近的模块级变量区新增：
```ts
let domeInstance: DomeGallery | null = null;
```
在 `renderCards` 函数之前新增两个函数：
```ts
function mapToDomeItems(cards: DashboardCard[]): DomeItem[] {
  return cards
    .filter((card) => card.url)
    .map((card) => ({
      src: card.faviconUrl,
      title: card.title || card.url,
      url: card.url,
      initial: (card.initial || card.domain || '?').slice(0, 1).toUpperCase(),
    }));
}

function renderDome(cards: DashboardCard[]) {
  if (!domeInstance) {
    domeInstance = new DomeGallery(domeGalleryEl, {
      onOpen: (url) => { openTab(url); },
    });
  }
  domeInstance.setItems(mapToDomeItems(cards));
}
```

- [ ] **Step 5: 在 renderDashboard 中按模式分流**

将 `renderDashboard` 中的 `renderCards(data.cards, query);` 一行替换为：
```ts
  if (prefs.galleryMode) {
    renderDome(data.cards);
  } else {
    renderCards(data.cards, query);
  }
```

- [ ] **Step 6: applyPrefs 中同步开关与视图 class**

在 `applyPrefs` 中 `appEl.classList.toggle('hide-labels', !prefs.showLabels);` 下方加：
```ts
  appEl.classList.toggle('gallery-mode', prefs.galleryMode);
```
在 `showLabelsInputEl.checked = !prefs.showLabels;` 下方加：
```ts
  galleryModeInputEl.checked = prefs.galleryMode;
```

- [ ] **Step 7: bindEvents 中绑定开关**

在 `bindEvents` 内 `showLabelsInputEl.addEventListener('change', ...)` 块之后新增：
```ts
  galleryModeInputEl.addEventListener('change', () => {
    currentPage = 0;
    savePrefs({ galleryMode: galleryModeInputEl.checked });
    refreshDashboard();
  });
```

- [ ] **Step 8: 编译 + 测试**

Run: `npm run compile && npm test`
Expected: 编译成功、全部测试通过。

- [ ] **Step 9: 提交**

```bash
git add url-archive-extension/entrypoints/newtab/main.ts url-archive-extension/entrypoints/newtab/index.html
git commit -m "feat: wire gallery mode toggle and dome rendering into new tab"
```

---

### Task 7: 构建与手动验证

**Files:** 无（仅验证）

- [ ] **Step 1: 类型检查与构建**

Run: `npm run compile && npm run build`
Expected: 均成功，零 TS 错误。

- [ ] **Step 2: 加载扩展并按清单手动验证**

Run: `npm run dev`（启动后在浏览器打开新标签页）
逐项确认：
- 设置 → 布局 → 「画廊模式」开关可切换；关闭时为原分页网格，开启时为球面画廊。
- 刷新页面后偏好保持（`galleryMode` 持久化）。
- 球面可拖拽旋转，释放有惯性；垂直旋转受限、水平可环绕。
- 点击瓦片放大为居中大卡；点击大卡在新标签打开对应书签 URL；点击遮罩或按 Esc 收起。
- 顶部搜索 / 右侧分类筛选后，画廊内容随之更新。
- favicon 加载失败时瓦片回退为首字母。
- 亮 / 暗主题下画廊表现正常，页面背景从边缘透出。
- 「隐藏图标名称」开启时放大卡标题隐藏。

- [ ] **Step 3: 提交（如手动验证阶段有微调）**

```bash
git add -A
git commit -m "chore: finalize gallery mode after manual verification"
```

---

## Self-Review

**Spec 覆盖：**
- 不引入 React → 全程原生 TS（Task 2–6）。✓
- `galleryMode` 偏好双处同步 → Task 1（preferences.ts）+ Task 6（main.ts）。✓
- 设置 UI 开关（布局分组，`.toggle-field`）→ Task 6 Step 1。✓
- 整体替换网格视图切换 → Task 5（CSS）+ Task 6（class 切换）。✓
- favicon + 品牌底色瓦片 → Task 2（`colorForSeed`）+ Task 3（`renderTile`）+ Task 5（`.dg-tile`）。✓
- 先放大预览再打开 → Task 4（`openTile` + 放大卡点击 `onOpen`）。✓
- 拖拽旋转 + 惯性 + 自适应半径 → Task 3。✓
- 循环复用 pool 填满 → Task 2（`buildTiles`）。✓
- favicon 回退首字母 → Task 3（`renderTile` error 监听）。✓
- `dg-scroll-lock` 作用于容器而非 body → Task 3（`this.root.classList`）。✓
- 测试：preferences 规范化 + dome 纯函数 → Task 1 + Task 2。✓
- 收尾 compile + build → Task 7。✓

**占位符扫描：** 无 TBD/TODO；Task 3 的 `openTile` 占位在 Task 4 明确替换，已在接口块与步骤中说明。✓

**类型一致性：** `DomeItem` / `DomeTile` / `DomeGalleryOptions` / `buildTiles` / `colorForSeed` / `computeItemBaseRotation` 在 Task 2 定义，Task 3/4/6 一致引用；`setItems` / `destroy` / `onOpen` 签名一致。✓

**注意事项：** 已确认 `url-archive-extension/.wxt/tsconfig.json` 仅 `strict: true`，未开启 `noUnusedLocals`/`noUnusedParameters`，故 Task 3 中将在 Task 4 才使用的字段与占位参数不会导致编译失败，无需额外处理。
