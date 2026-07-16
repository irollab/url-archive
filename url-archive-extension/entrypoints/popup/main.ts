import { enrichStatusText } from '@/lib/enrich-status';
import { mountReauthBanner } from '@/lib/reauth-banner';
import { originPattern, requestOriginAccess } from '@/lib/permissions';

const whyEl = document.getElementById('why') as HTMLTextAreaElement;
const btn = document.getElementById('clip') as HTMLButtonElement;
const importBtn = document.getElementById('importBookmarks') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const statsEl = document.getElementById('stats') as HTMLParagraphElement;
const revisitEl = document.getElementById('revisit') as HTMLElement;
const revisitMetaEl = document.getElementById('revisitMeta') as HTMLSpanElement;
const revisitOpenEl = document.getElementById('revisitOpen') as HTMLButtonElement;
const revisitTitleEl = document.getElementById('revisitTitle') as HTMLSpanElement;
const revisitSummaryEl = document.getElementById('revisitSummary') as HTMLElement;
const searchEl = document.getElementById('search') as HTMLInputElement;
const searchResultsEl = document.getElementById('searchResults') as HTMLDivElement;
const paginationEl = document.getElementById('pagination') as HTMLDivElement;
const panelScrollEl = document.querySelector('.panel-scroll') as HTMLDivElement;
const scrollbarOverlayEl = document.getElementById('scrollbarOverlay') as HTMLDivElement;
const scrollbarThumbEl = scrollbarOverlayEl.querySelector('span') as HTMLSpanElement;
const categoryNavEl = document.getElementById('categoryNav') as HTMLElement;
const categoryBackEl = document.getElementById('categoryBack') as HTMLButtonElement;
const categoryCrumbEl = document.getElementById('categoryCrumb') as HTMLSpanElement;
const categoryGridEl = document.getElementById('categoryGrid') as HTMLDivElement;
const editPanelEl = document.getElementById('editPanel') as HTMLElement;
const editCloseEl = document.getElementById('editClose') as HTMLButtonElement;
const editTitleEl = document.getElementById('editTitle') as HTMLInputElement;
const editFolderEl = document.getElementById('editFolder') as HTMLSelectElement;
const editTagsEl = document.getElementById('editTags') as HTMLInputElement;
const editWhyEl = document.getElementById('editWhy') as HTMLTextAreaElement;
const editSaveEl = document.getElementById('editSave') as HTMLButtonElement;
const editCancelEl = document.getElementById('editCancel') as HTMLButtonElement;
const filterEls = [...document.querySelectorAll<HTMLButtonElement>('.filter')];
const PAGE_SIZE = 20;
const SEARCH_LIMIT = 1000;
const SCROLLBAR_VISIBLE_MS = 2000;
const REVISIT_ROTATE_MS = 6000;
const REVISIT_FLASH_MS = 3000;

type ClipFilter = 'all' | 'clip' | 'bookmark' | 'queued' | 'unvisited' | 'visited';

type SavedClip = {
  url: string;
  canonicalUrl?: string;
  title: string;
  domain: string;
  path: string;
  folder?: string;
  faviconUrl?: string;
  source?: 'clip' | 'bookmark';
  summary: string;
  tags: string[];
  why: string;
  revived: number;
  queued: boolean;
  lastVisited: string;
};

type SavedClipStats = {
  total: number;
  clips: number;
  bookmarks: number;
  queued: number;
  unvisited: number;
  visited: number;
};

type BookmarkFolderOption = {
  path: string;
  count: number;
};

let currentFilter: ClipFilter = 'all';
let currentFolder = '';
let bookmarkFolders: BookmarkFolderOption[] = [];
let editingClip: SavedClip | null = null;
let currentPage = 1;
let currentClips: SavedClip[] = [];
let revisitClips: SavedClip[] = [];
let revisitIndex = 0;
let revisitRotateTimer: number | undefined;
let revisitFlashTimer: number | undefined;
let scrollbarHideTimer: number | undefined;

searchEl.focus();
// 挂到带内边距的滚动容器而非 body：避免横幅圆角被 22px 圆角窗口裁切，也不挤压固定面板
void mountReauthBanner(panelScrollEl);

function showTransientScrollbar() {
  updateScrollbarOverlay();
  document.body.classList.add('scrollbar-active');
  window.clearTimeout(scrollbarHideTimer);
  scrollbarHideTimer = window.setTimeout(() => {
    document.body.classList.remove('scrollbar-active');
  }, SCROLLBAR_VISIBLE_MS);
}

function updateScrollbarOverlay() {
  const scrollable = panelScrollEl.scrollHeight - panelScrollEl.clientHeight;
  scrollbarOverlayEl.hidden = scrollable <= 0;
  if (scrollable <= 0) return;
  const trackHeight = panelScrollEl.clientHeight;
  const thumbHeight = Math.max(42, (panelScrollEl.clientHeight / panelScrollEl.scrollHeight) * trackHeight);
  const maxTop = trackHeight - thumbHeight;
  const top = (panelScrollEl.scrollTop / scrollable) * maxTop;
  scrollbarThumbEl.style.height = `${thumbHeight}px`;
  scrollbarThumbEl.style.transform = `translateY(${top}px)`;
}

panelScrollEl.addEventListener('mouseenter', showTransientScrollbar, { passive: true });
panelScrollEl.addEventListener('mousemove', showTransientScrollbar, { passive: true });
panelScrollEl.addEventListener('wheel', showTransientScrollbar, { passive: true });
panelScrollEl.addEventListener('scroll', showTransientScrollbar, { passive: true });
window.addEventListener('resize', updateScrollbarOverlay, { passive: true });

async function loadRevisitSuggestion() {
  revisitEl.hidden = true;
  revisitClips = [];
  stopRevisitRotation();

  const res = await chrome.runtime.sendMessage({ type: 'SUGGEST_REVISIT' });
  if (!res?.ok) return;
  revisitClips = Array.isArray(res.clips) && res.clips.length
    ? res.clips as SavedClip[]
    : res.clip
      ? [res.clip as SavedClip]
      : [];
  revisitClips = revisitClips.filter((clip) => isOpenableUrl(clip.url));
  revisitIndex = 0;
  if (!revisitClips.length) return;

  revisitEl.hidden = false;
  renderRevisitSuggestion();
  startRevisitRotation();
}

function renderRevisitSuggestion() {
  const clip = revisitClips[revisitIndex];
  if (!clip) return;
  const meta = displayMeta(clip);
  const icon = revisitIconForClip(clip);
  const text = document.createElement('span');
  text.className = 'revisit-text';
  text.append(revisitTitleEl, revisitSummaryEl);
  revisitOpenEl.replaceChildren(icon, text);
  revisitMetaEl.textContent = `${meta}${clip.revived ? ` · 已回访 ${clip.revived} 次` : ''}`;
  revisitTitleEl.textContent = displayTitle(clip);
  revisitSummaryEl.textContent = clip.summary || (clip.queued ? '已暂存，等待写入 Obsidian' : '暂无摘要');
  revisitOpenEl.onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'OPEN_REVISIT', url: clip.url });
    window.close();
  };
}

function rotateRevisitSuggestion() {
  if (document.visibilityState !== 'visible' || revisitClips.length <= 1) return;
  revisitEl.classList.remove('is-flashing');
  revisitIndex = (revisitIndex + 1) % revisitClips.length;
  renderRevisitSuggestion();
  scheduleRevisitFlash();
}

function scheduleRevisitFlash() {
  window.clearTimeout(revisitFlashTimer);
  revisitEl.classList.remove('is-flashing');
  if (document.visibilityState !== 'visible' || revisitClips.length <= 1) return;
  revisitFlashTimer = window.setTimeout(() => {
    revisitEl.classList.add('is-flashing');
  }, Math.max(0, REVISIT_ROTATE_MS - REVISIT_FLASH_MS));
}

function startRevisitRotation() {
  window.clearInterval(revisitRotateTimer);
  scheduleRevisitFlash();
  if (document.visibilityState !== 'visible' || revisitClips.length <= 1) return;
  revisitRotateTimer = window.setInterval(rotateRevisitSuggestion, REVISIT_ROTATE_MS);
}

function stopRevisitRotation() {
  window.clearInterval(revisitRotateTimer);
  window.clearTimeout(revisitFlashTimer);
  revisitRotateTimer = undefined;
  revisitFlashTimer = undefined;
  revisitEl.classList.remove('is-flashing');
}

function renderSearchResults(clips: SavedClip[]) {
  searchResultsEl.replaceChildren();
  paginationEl.replaceChildren();
  if (!clips.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = searchEl.value.trim() ? '没有匹配的收藏' : '暂无收藏索引';
    searchResultsEl.append(empty);
    paginationEl.hidden = true;
    updateScrollbarOverlay();
    return;
  }

  const totalPages = Math.max(1, Math.ceil(clips.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageClips = clips.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  for (const clip of pageClips) {
    const item = document.createElement('article');
    item.className = 'search-result';
    if (clip.queued) item.classList.add('queued');

    const favicon = faviconElement(clip, 'result-favicon');

    const body = document.createElement('button');
    body.type = 'button';
    body.className = 'result-body';

    const head = document.createElement('span');
    head.className = 'result-head';

    const title = document.createElement('span');
    title.className = 'result-title';
    title.textContent = displayTitle(clip);

    const badge = document.createElement('span');
    badge.className = clip.source === 'bookmark' ? 'badge bookmark' : 'badge clip';
    badge.textContent = clip.source === 'bookmark' ? '书签' : (clip.queued ? '暂存' : '剪藏');
    head.append(title, badge);

    const meta = document.createElement('small');
    const tags = Array.isArray(clip.tags) && clip.tags.length ? ` · ${clip.tags.slice(0, 3).join(' / ')}` : '';
    const folder = clip.folder ? ` · ${clip.folder}` : '';
    meta.textContent = `${displayMeta(clip)}${folder}${tags}`;

    const summary = document.createElement('span');
    summary.className = 'result-summary';
    summary.textContent = clip.summary || (clip.lastVisited ? '已回访' : '未通过 URL Archive 回访');

    body.append(head, meta, summary);
    body.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'OPEN_REVISIT', url: clip.url });
      window.close();
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-button';
    editBtn.title = '编辑';
    editBtn.setAttribute('aria-label', '编辑收藏');
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    editBtn.addEventListener('click', () => openEditPanel(clip));

    item.append(favicon, body, editBtn);
    searchResultsEl.append(item);
  }

  renderPagination(clips.length, totalPages);
  updateScrollbarOverlay();
}

function renderPagination(total: number, totalPages: number) {
  paginationEl.hidden = totalPages <= 1;
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'page-button';
  prev.textContent = '上一页';
  prev.disabled = currentPage <= 1;
  prev.addEventListener('click', () => {
    currentPage -= 1;
    renderSearchResults(currentClips);
    panelScrollEl.scrollTo({ top: panelScrollEl.scrollHeight, behavior: 'smooth' });
  });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `${currentPage} / ${totalPages} · 共 ${total} 条`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'page-button';
  next.textContent = '下一页';
  next.disabled = currentPage >= totalPages;
  next.addEventListener('click', () => {
    currentPage += 1;
    renderSearchResults(currentClips);
    panelScrollEl.scrollTo({ top: panelScrollEl.scrollHeight, behavior: 'smooth' });
  });

  paginationEl.append(prev, info, next);
}

// 与新标签页一致：用浏览器已缓存的站点图标（chrome _favicon 服务），比猜测 /favicon.ico 更可靠、不会挂起
function faviconServiceUrl(pageUrl: string, size = 64): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

// faviconUrl 是否只是 origin/favicon.ico 的猜测值（并非真实捕获/自定义的图标）
function isGuessedFavicon(clip: SavedClip): boolean {
  if (!clip.faviconUrl) return false;
  try {
    return clip.faviconUrl === `${new URL(clip.url).origin}/favicon.ico`;
  } catch {
    return false;
  }
}

// 图标显示源：优先真实捕获/自定义图标，其次浏览器缓存图标，最后由调用方回退首字母
function faviconSource(clip: SavedClip): { src: string; isService: boolean } {
  if (clip.faviconUrl && !isGuessedFavicon(clip)) return { src: clip.faviconUrl, isService: false };
  if (/^https?:/i.test(clip.url)) return { src: faviconServiceUrl(clip.url), isService: true };
  return { src: '', isService: false };
}

// 统一构建书签图标：真实图标 → 浏览器缓存图标兜底 → 首字母
function faviconElement(clip: SavedClip, className: string): HTMLElement {
  const { src, isService } = faviconSource(clip);
  if (!src) return domainFallback(displayDomain(clip), className);

  const icon = document.createElement('img');
  icon.className = className;
  icon.alt = '';
  icon.dataset.service = isService ? 'true' : '';
  icon.src = src;
  icon.addEventListener('error', () => {
    // 真实图标加载失败时，先用浏览器缓存的站点图标兜底，仍失败再退化为首字母
    if (icon.dataset.service !== 'true' && /^https?:/i.test(clip.url)) {
      icon.dataset.service = 'true';
      icon.src = faviconServiceUrl(clip.url);
      return;
    }
    icon.replaceWith(domainFallback(displayDomain(clip), className));
  });
  return icon;
}

function revisitIconForClip(clip: SavedClip): HTMLElement {
  return faviconElement(clip, 'revisit-favicon');
}

function isOpenableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function displayDomain(clip: SavedClip): string {
  if (clip.domain) return clip.domain;
  try {
    return new URL(clip.url).hostname;
  } catch {
    return '';
  }
}

function displayMeta(clip: SavedClip): string {
  const domain = displayDomain(clip);
  if (domain) return domain;
  if (clip.folder) return clip.folder;
  if (clip.path) return clip.path;
  return clip.source === 'bookmark' ? '浏览器书签' : '收藏';
}

function displayTitle(clip: SavedClip): string {
  return clip.title || clip.url || displayMeta(clip);
}

function domainFallback(domain: string, className = 'result-favicon'): HTMLElement {
  const fallback = document.createElement('span');
  fallback.className = `${className} fallback`;
  fallback.textContent = (domain || '?').slice(0, 1).toUpperCase();
  return fallback;
}

async function searchClips() {
  const res = await chrome.runtime.sendMessage({
    type: 'SEARCH_CLIPS',
    query: searchEl.value,
    filter: currentFilter,
    folder: currentFilter === 'bookmark' ? currentFolder : '',
    limit: SEARCH_LIMIT,
  });
  if (res?.ok) {
    currentClips = res.clips as SavedClip[];
    renderSearchResults(currentClips);
  }
}

async function refreshBookmarkFolders() {
  const res = await chrome.runtime.sendMessage({ type: 'BOOKMARK_FOLDERS' });
  if (!res?.ok) return;

  bookmarkFolders = res.folders as BookmarkFolderOption[];
  if (currentFolder && !bookmarkFolders.some((folder) => folder.path === currentFolder)) {
    currentFolder = '';
  }
  renderCategoryNav();
}

function renderCategoryNav() {
  categoryNavEl.hidden = bookmarkFolders.length === 0;
  categoryCrumbEl.textContent = currentFolder || '全部书签分类';
  categoryBackEl.hidden = !currentFolder;
  categoryGridEl.replaceChildren();

  const children = getChildFolders(currentFolder);
  if (!children.length) {
    const empty = document.createElement('span');
    empty.className = 'category-empty';
    empty.textContent = currentFolder ? '当前分类没有子分类' : '暂无书签分类';
    categoryGridEl.append(empty);
    return;
  }

  for (const folder of children) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-item';
    btn.title = folder.path;

    const name = document.createElement('span');
    name.textContent = getFolderName(folder.path);
    const count = document.createElement('small');
    count.textContent = `${folder.count}`;
    btn.append(name, count);

    btn.addEventListener('click', () => {
      currentFolder = folder.path;
      currentFilter = 'bookmark';
      currentPage = 1;
      syncFilterButtons();
      renderCategoryNav();
      searchClips();
    });
    categoryGridEl.append(btn);
  }
}

function renderEditFolderOptions(selectedFolder: string) {
  editFolderEl.replaceChildren();

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '不设置分类';
  editFolderEl.append(empty);

  const folders = [...bookmarkFolders];
  if (selectedFolder && !folders.some((folder) => folder.path === selectedFolder)) {
    folders.unshift({ path: selectedFolder, count: 0 });
  }

  for (const folder of folders) {
    const option = document.createElement('option');
    option.value = folder.path;
    option.textContent = `${folder.path}${folder.count ? ` (${folder.count})` : ''}`;
    editFolderEl.append(option);
  }
  editFolderEl.value = selectedFolder;
}

function getChildFolders(parent: string): BookmarkFolderOption[] {
  const prefix = parent ? `${parent} / ` : '';
  const depth = parent ? parent.split(' / ').length + 1 : 1;
  return bookmarkFolders
    .filter((folder) => folder.path.startsWith(prefix) && folder.path.split(' / ').length === depth)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path, 'zh-CN'));
}

function getFolderName(path: string): string {
  const parts = path.split(' / ');
  return parts[parts.length - 1] ?? path;
}

function parentFolder(path: string): string {
  const parts = path.split(' / ').filter(Boolean);
  return parts.slice(0, -1).join(' / ');
}

function openEditPanel(clip: SavedClip) {
  editingClip = clip;
  editTitleEl.value = clip.title || '';
  renderEditFolderOptions(clip.folder || '');
  editTagsEl.value = clip.tags.join(', ');
  editWhyEl.value = clip.why || '';
  editPanelEl.hidden = false;
  editTitleEl.focus();
}

function closeEditPanel() {
  editingClip = null;
  editPanelEl.hidden = true;
}

async function saveEdit() {
  if (!editingClip) return;
  editSaveEl.disabled = true;
  const res = await chrome.runtime.sendMessage({
    type: 'UPDATE_SAVED_CLIP',
    update: {
      url: editingClip.url,
      canonicalUrl: editingClip.canonicalUrl,
      title: editTitleEl.value,
      folder: editFolderEl.value,
      tags: editTagsEl.value.split(/[,，]/),
      why: editWhyEl.value,
      summary: editWhyEl.value || editingClip.summary,
    },
  });

  if (res?.ok) {
    statusEl.textContent = '✓ 已保存收藏信息';
    closeEditPanel();
    await refreshBookmarkFolders();
    await Promise.all([refreshStats(), searchClips()]);
  } else {
    statusEl.textContent = `✗ 保存失败：${res?.error ?? '未知错误'}`;
  }
  editSaveEl.disabled = false;
}

async function refreshStats() {
  const res = await chrome.runtime.sendMessage({ type: 'SAVED_CLIP_STATS' });
  if (!res?.ok) {
    statsEl.textContent = '无法读取收藏统计';
    return;
  }

  const stats = res.stats as SavedClipStats;
  statsEl.textContent = `${stats.total} 条收藏 · ${stats.clips} 条剪藏 · ${stats.bookmarks} 个浏览器书签`;
}

// 追踪后台补 AI（Phase B）：剪藏秒级返回后弹出页保持打开，等 CAPTURE_ENRICHED 广播更新状态
// 兜底时间略大于 LLM 超时（60s），保证愿意等待时能看到真实结果；用户可随时关闭，后台照常补
const ENRICH_FALLBACK_MS = 65000;
let pendingEnrichUrl = '';
let enrichBaseText = '';
let enrichFallbackTimer: number | undefined;

function watchEnrich(canonicalUrl: string, baseText: string) {
  pendingEnrichUrl = canonicalUrl;
  enrichBaseText = baseText;
  window.clearTimeout(enrichFallbackTimer);
  enrichFallbackTimer = window.setTimeout(() => {
    if (!pendingEnrichUrl) return;
    pendingEnrichUrl = '';
    statusEl.textContent = `${baseText} · AI 补充可能仍在后台进行`;
    btn.disabled = false;
  }, ENRICH_FALLBACK_MS);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'CAPTURE_ENRICHED' || !pendingEnrichUrl || msg.canonicalUrl !== pendingEnrichUrl) return;
  window.clearTimeout(enrichFallbackTimer);
  pendingEnrichUrl = '';
  statusEl.textContent = `${enrichBaseText} · ${enrichStatusText(msg.status, msg.error)}`;
  if (msg.status === 'done') {
    setTimeout(() => window.close(), 1200);
  } else {
    btn.disabled = false;
  }
});

// 当前活动标签页的 origin 模式（作为 missingOrigin 缺失时的兜底，仍是具体 origin 而非全站）
async function currentTabOrigin(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ? originPattern(tab.url) : null;
}

// 缺 host 权限的错误（来自 background 的 MissingHostPermissionError）→ 提供一键重新授权。
// 只申请后台回传的缺失 origin（兜底当前标签页 origin），避免申请全站 http/https 触发审核与用户敏感提示。
function maybeOfferReauth(statusEl: HTMLElement, error: string, missingOrigin?: string) {
  if (!error.includes('重新授权')) return;
  const reauthBtn = document.createElement('button');
  reauthBtn.type = 'button';
  reauthBtn.className = 'reauth-btn';
  reauthBtn.textContent = '重新授权';
  reauthBtn.addEventListener('click', async () => {
    reauthBtn.disabled = true;
    const origin = missingOrigin ?? (await currentTabOrigin());
    if (!origin) {
      reauthBtn.textContent = '无法确定要授权的站点';
      reauthBtn.disabled = false;
      return;
    }
    const ok = await requestOriginAccess([origin]);
    reauthBtn.textContent = ok ? '已授权，请重试剪藏' : '授权被拒绝';
  });
  statusEl.appendChild(reauthBtn);
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = '剪藏中…';
  const res = await chrome.runtime.sendMessage({ type: 'CAPTURE', why: whyEl.value });
  if (res?.ok) {
    const base = res.written
      ? '✓ 已剪藏到 Obsidian'
      : `✓ 已暂存（${res.queuedReason ?? 'Obsidian 不可用'}，恢复后自动写入）`;
    statusEl.textContent = `${base} · AI 摘要补充中…`;
    watchEnrich(res.savedClip?.canonicalUrl || res.savedClip?.url || '', base);
    if (!res.written) await Promise.all([refreshStats(), searchClips()]);
  } else {
    statusEl.textContent = `✗ 失败：${res?.error ?? '未知错误'}`;
    btn.disabled = false;
    void maybeOfferReauth(statusEl, res?.error ?? '', res?.missingOrigin);
  }
});

importBtn.addEventListener('click', async () => {
  importBtn.disabled = true;
  statusEl.textContent = '正在导入浏览器书签…';
  const res = await chrome.runtime.sendMessage({ type: 'IMPORT_BROWSER_BOOKMARKS' });
  if (res?.ok) {
    statusEl.textContent = `✓ 已导入 ${res.imported ?? 0} 个浏览器书签`;
    currentFilter = 'bookmark';
    currentFolder = '';
    currentPage = 1;
    syncFilterButtons();
    await refreshBookmarkFolders();
    await Promise.all([refreshStats(), searchClips()]);
  } else {
    statusEl.textContent = `✗ 导入失败：${res?.error ?? '未知错误'}`;
  }
  importBtn.disabled = false;
});

for (const filterEl of filterEls) {
  filterEl.addEventListener('click', () => {
    currentFilter = (filterEl.dataset.filter ?? 'all') as ClipFilter;
    if (currentFilter !== 'bookmark') currentFolder = '';
    currentPage = 1;
    syncFilterButtons();
    renderCategoryNav();
    searchClips();
  });
}

function syncFilterButtons() {
  for (const filterEl of filterEls) {
    filterEl.classList.toggle('active', filterEl.dataset.filter === currentFilter);
  }
}

categoryBackEl.addEventListener('click', () => {
  currentFolder = parentFolder(currentFolder);
  currentFilter = currentFolder ? 'bookmark' : currentFilter;
  currentPage = 1;
  syncFilterButtons();
  renderCategoryNav();
  searchClips();
});

editSaveEl.addEventListener('click', saveEdit);
editCancelEl.addEventListener('click', closeEditPanel);
editCloseEl.addEventListener('click', closeEditPanel);

loadRevisitSuggestion();
refreshStats();
refreshBookmarkFolders();
searchClips();
searchEl.addEventListener('input', () => {
  currentPage = 1;
  searchClips();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') startRevisitRotation();
  else stopRevisitRotation();
});
