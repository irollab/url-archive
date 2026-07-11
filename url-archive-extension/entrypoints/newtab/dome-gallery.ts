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

function hueForSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function applySeedColorVars(el: HTMLElement, seed: string) {
  const hue = hueForSeed(seed);
  el.style.setProperty('--fallback-hue', String(hue));
  el.style.setProperty('--fallback-bg', `hsl(${hue} 54% 44%)`);
  el.style.setProperty('--fallback-bg-soft', `hsl(${hue} 62% 58%)`);
}

export type DomeGalleryOptions = {
  onOpen: (url: string) => void;
  segments?: number;
  overlayBlurColor?: string;
};

const DEFAULT_SEGMENTS = 35;
const MAX_VERTICAL_ROTATION_DEG = 5;
const DRAG_SENSITIVITY = 20;
const POINTER_SAMPLE_WINDOW_MS = 120;
const FRAME_MS = 1000 / 60;
const MIN_INERTIA_DEG_PER_FRAME = 0.03;
const MAX_INERTIA_DEG_PER_FRAME = 4.5;
const INERTIA_FRICTION = 0.94;
// 自动旋转角速度（度/秒），方向会继承最后一次水平拖拽/甩动
const AUTO_ROTATE_DEG_PER_SEC = 6;
const AUTO_ROTATE_DEG_PER_FRAME = AUTO_ROTATE_DEG_PER_SEC / 60;

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
  private pointerSamples: Array<{ x: number; y: number; time: number }> = [];
  private dragging = false;
  private moved = false;
  private inertiaRAF: number | null = null;
  private lastDragEndAt = 0;
  private focusedEl: HTMLElement | null = null;
  private opening = false;
  private openStartedAt = 0;
  private onKey: (e: KeyboardEvent) => void = () => {};
  private autoRAF: number | null = null;
  private autoLast = 0;
  private autoRotateDirection: 1 | -1 = 1;

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
    document.addEventListener('visibilitychange', this.onVisibility);
    this.autoRAF = requestAnimationFrame(this.tickAuto);
  }

  setItems(items: DomeItem[]): void {
    const tiles = buildTiles(items, this.segments);
    const rotY = 360 / this.segments / 2;
    const rotX = 360 / this.segments / 2;
    this.sphere.replaceChildren(
      ...tiles.map((t) => this.renderTile(t, rotY, rotX)),
    );
    this.applyTransform();
    this.ensureAutoRunning();
  }

  destroy(): void {
    this.ro.disconnect();
    if (this.inertiaRAF) cancelAnimationFrame(this.inertiaRAF);
    this.stopAuto();
    this.root.classList.remove('dg-scroll-lock');
    this.root.replaceChildren();
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  // 自动缓慢旋转：仅在空闲时递增 rotation.y（拖拽/惯性/放大态时暂停一帧渲染）
  private tickAuto = (now: number) => {
    // 容器隐藏（卡片模式）或页面不可见时，彻底停止 rAF 调度而非空转唤醒；
    // 再次可见由 onResize / setItems / onVisibility 通过 ensureAutoRunning 重启
    if (this.root.offsetParent === null || document.hidden) {
      this.autoRAF = null;
      this.autoLast = 0;
      return;
    }
    const dt = this.autoLast ? (now - this.autoLast) / 1000 : 0;
    this.autoLast = now;
    const idle = !this.dragging && !this.opening && !this.focusedEl && this.inertiaRAF === null;
    if (idle && dt > 0 && dt < 0.1) {
      this.rotation.y = wrapAngleSigned(this.rotation.y + this.autoRotateDirection * AUTO_ROTATE_DEG_PER_SEC * dt);
      this.applyTransform();
    }
    this.autoRAF = requestAnimationFrame(this.tickAuto);
  };

  /** 满足运行条件（可见且未在运行）时启动自动旋转循环，重复调用安全 */
  private ensureAutoRunning() {
    if (this.autoRAF !== null) return;
    if (this.root.offsetParent === null || document.hidden) return;
    this.autoLast = 0;
    this.autoRAF = requestAnimationFrame(this.tickAuto);
  }

  private stopAuto() {
    if (this.autoRAF !== null) {
      cancelAnimationFrame(this.autoRAF);
      this.autoRAF = null;
    }
    this.autoLast = 0;
  }

  // 页面可见性切换：隐藏时立即停循环，恢复可见时按条件重启
  private onVisibility = () => {
    if (document.hidden) this.stopAuto();
    else this.ensureAutoRunning();
  };

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
    tile.className = `dg-tile ${t.src ? 'dg-tile--favicon' : 'dg-tile--fallback'}`;
    tile.setAttribute('role', 'button');
    tile.tabIndex = 0;
    tile.setAttribute('aria-label', t.title || '打开书签');
    applySeedColorVars(tile, t.url || t.title || t.initial);
    tile.innerHTML = t.src
      ? `<img class="dg-favicon" src="${escapeAttr(t.src)}" alt="" draggable="false" />`
      : (t.initial ? `<span class="dg-initial">${escapeHtml(t.initial)}</span>` : '');
    tile.querySelector<HTMLImageElement>('.dg-favicon')?.addEventListener('error', function () {
      tile.classList.remove('dg-tile--favicon');
      tile.classList.add('dg-tile--fallback');
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

  private buildCard(url: string, src: string, title: string, initial: string): HTMLElement {
    const card = document.createElement('div');
    card.className = `dg-card ${src ? 'dg-card--favicon' : 'dg-card--fallback'}`;
    applySeedColorVars(card, url || title || initial);
    card.innerHTML = `
      ${src ? `<img class="dg-card-favicon" src="${escapeAttr(src)}" alt="" draggable="false" />` : `<span class="dg-card-initial">${escapeHtml(initial || '?')}</span>`}
      <div class="dg-card-title">${escapeHtml(title || url)}</div>`;
    card.querySelector<HTMLImageElement>('.dg-card-favicon')?.addEventListener('error', function () {
      card.classList.remove('dg-card--favicon');
      card.classList.add('dg-card--fallback');
      this.replaceWith(Object.assign(document.createElement('span'), { className: 'dg-card-initial', textContent: initial || '?' }));
    }, { once: true });
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
    // 防重入：关闭过程中标记，避免重复触发堆叠监听/定时器
    if (overlay.dataset.closing === 'true') return;
    overlay.dataset.closing = 'true';
    overlay.style.opacity = '0';
    let done = false;
    let fallback = 0;
    const cleanup = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallback);
      overlay.removeEventListener('transitionend', cleanup);
      overlay.remove();
      if (el) el.style.visibility = '';
      this.focusedEl = null;
      this.opening = false;
      this.root.removeAttribute('data-enlarging');
      this.root.classList.remove('dg-scroll-lock');
    };
    overlay.addEventListener('transitionend', cleanup);
    // 兜底：若无过渡事件，320ms 后强制清理
    fallback = window.setTimeout(cleanup, 320);
  }

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
    // 容器由隐藏转为可见会触发 resize，借此恢复自动旋转
    this.ensureAutoRunning();
  }

  private bindPointer() {
    this.main.style.touchAction = 'none';
    this.main.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (this.focusedEl) return;
      this.stopInertia();
      this.dragging = true;
      this.moved = false;
      this.startRot = { ...this.rotation };
      this.startPos = { x: e.clientX, y: e.clientY };
      this.pointerSamples = [{ x: e.clientX, y: e.clientY, time: performance.now() }];
      this.root.classList.add('dg-dragging');
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    });
    this.main.addEventListener('pointermove', (e) => {
      if (!this.dragging || !this.startPos || this.focusedEl) return;
      const now = performance.now();
      const dx = e.clientX - this.startPos.x;
      const dy = e.clientY - this.startPos.y;
      if (!this.moved && dx * dx + dy * dy > 16) this.moved = true;
      this.pointerSamples.push({ x: e.clientX, y: e.clientY, time: now });
      this.pointerSamples = this.pointerSamples.filter((sample) => now - sample.time <= POINTER_SAMPLE_WINDOW_MS);
      this.rotation = {
        x: clamp(this.startRot.x - dy / DRAG_SENSITIVITY, -MAX_VERTICAL_ROTATION_DEG, MAX_VERTICAL_ROTATION_DEG),
        y: wrapAngleSigned(this.startRot.y + dx / DRAG_SENSITIVITY),
      };
      this.applyTransform();
    });
    const end = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.root.classList.remove('dg-dragging');
      if (this.moved) {
        const now = performance.now();
        this.pointerSamples.push({ x: e.clientX, y: e.clientY, time: now });
        const samples = this.pointerSamples.filter((sample) => now - sample.time <= POINTER_SAMPLE_WINDOW_MS);
        const first = samples[0];
        const last = samples[samples.length - 1];
        const elapsed = Math.max(16, last.time - first.time);
        const vx = clamp(
          ((last.x - first.x) / elapsed / DRAG_SENSITIVITY) * FRAME_MS,
          -MAX_INERTIA_DEG_PER_FRAME,
          MAX_INERTIA_DEG_PER_FRAME,
        );
        const vy = clamp(
          ((last.y - first.y) / elapsed / DRAG_SENSITIVITY) * FRAME_MS,
          -MAX_INERTIA_DEG_PER_FRAME,
          MAX_INERTIA_DEG_PER_FRAME,
        );
        if (Math.abs(vx) > MIN_INERTIA_DEG_PER_FRAME) {
          this.autoRotateDirection = vx > 0 ? 1 : -1;
        }
        if (Math.abs(vx) > MIN_INERTIA_DEG_PER_FRAME || Math.abs(vy) > MIN_INERTIA_DEG_PER_FRAME) {
          this.startInertia(vx, vy);
        }
        this.lastDragEndAt = performance.now();
      }
      this.pointerSamples = [];
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
    let vX = clamp(vx, -MAX_INERTIA_DEG_PER_FRAME, MAX_INERTIA_DEG_PER_FRAME);
    let vY = clamp(vy, -MAX_INERTIA_DEG_PER_FRAME, MAX_INERTIA_DEG_PER_FRAME);
    if (Math.abs(vX) > MIN_INERTIA_DEG_PER_FRAME) {
      this.autoRotateDirection = vX > 0 ? 1 : -1;
    }
    const step = () => {
      vX *= INERTIA_FRICTION;
      vY *= INERTIA_FRICTION;
      if (Math.abs(vX) <= AUTO_ROTATE_DEG_PER_FRAME && Math.abs(vY) <= AUTO_ROTATE_DEG_PER_FRAME) {
        this.inertiaRAF = null;
        this.autoLast = performance.now();
        return;
      }
      this.rotation = {
        x: clamp(this.rotation.x - vY, -MAX_VERTICAL_ROTATION_DEG, MAX_VERTICAL_ROTATION_DEG),
        y: wrapAngleSigned(this.rotation.y + vX),
      };
      this.applyTransform();
      this.inertiaRAF = requestAnimationFrame(step);
    };
    this.stopInertia();
    this.inertiaRAF = requestAnimationFrame(step);
  }

  private bindClose() {
    this.scrim.addEventListener('click', () => this.closeEnlarged());
    this.onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closeEnlarged();
    };
    window.addEventListener('keydown', this.onKey);
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
