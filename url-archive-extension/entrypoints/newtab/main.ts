const appEl = document.getElementById('app') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const editPanelEl = document.getElementById('editPanel') as HTMLElement;
const editCloseEl = document.getElementById('editClose') as HTMLButtonElement;
const editTitleEl = document.getElementById('editTitle') as HTMLInputElement;
const editFolderEl = document.getElementById('editFolder') as HTMLInputElement;
const editTagsEl = document.getElementById('editTags') as HTMLInputElement;
const editWhyEl = document.getElementById('editWhy') as HTMLTextAreaElement;
const editSaveEl = document.getElementById('editSave') as HTMLButtonElement;
const editCancelEl = document.getElementById('editCancel') as HTMLButtonElement;
const searchInputEl = document.getElementById('searchInput') as HTMLInputElement;
const categoryListEl = document.getElementById('categoryList') as HTMLDivElement;
const contentTitleEl = document.getElementById('contentTitle') as HTMLDivElement;
const cardsEl = document.getElementById('cards') as HTMLDivElement;
const rightPanelEl = document.getElementById('rightPanel') as HTMLElement;
const revisitWidgetEl = document.getElementById('revisitWidget') as HTMLDivElement;
const recentWidgetEl = document.getElementById('recentWidget') as HTMLDivElement;
const densityButtons = [...document.querySelectorAll<HTMLButtonElement>('.density-button')];
const themeToggleEl = document.getElementById('themeToggle') as HTMLButtonElement;
const drawerToggleEl = document.getElementById('rightDrawerToggle') as HTMLButtonElement;
const clipCurrentEl = document.getElementById('clipCurrent') as HTMLButtonElement;
const aiRecallEl = document.getElementById('aiRecall') as HTMLButtonElement;
const importButtons = [
  document.getElementById('importBookmarks') as HTMLButtonElement,
  document.getElementById('rightImport') as HTMLButtonElement,
];
const settingsButtons = [
  document.getElementById('openSettings') as HTMLButtonElement,
  document.getElementById('rightSettings') as HTMLButtonElement,
];

type Density = 'compact' | 'standard' | 'large';
type Theme = 'light' | 'dark';

type SavedClipStats = {
  total: number;
  clips: number;
  bookmarks: number;
  queued: number;
  unvisited: number;
  visited: number;
};

type DashboardCard = {
  url: string;
  canonicalUrl?: string;
  title: string;
  domain: string;
  path: string;
  source: 'clip' | 'bookmark';
  sourceLabel: string;
  folder?: string;
  faviconUrl: string;
  summary: string;
  tags: string[];
  keywords: string[];
  aliases: string[];
  intent: string;
  why: string;
  clipped: string;
  queued: boolean;
  revived: number;
  lastVisited: string;
  initial: string;
};

type BookmarkFolderOption = {
  path: string;
  count: number;
};

type DashboardData = {
  stats: SavedClipStats;
  folders: BookmarkFolderOption[];
  cards: DashboardCard[];
  recent: DashboardCard[];
  revisit?: DashboardCard;
};

type Prefs = {
  density: Density;
  theme: Theme;
  rightPanelCollapsed: boolean;
};

type RuntimeResponse<T> = {
  ok?: boolean;
  error?: string;
} & T;

const DEFAULT_PREFS: Prefs = {
  density: 'standard',
  theme: 'light',
  rightPanelCollapsed: false,
};

let prefs: Prefs = DEFAULT_PREFS;
let dashboardData: DashboardData | null = null;
let currentFolder = '';
let editingCard: DashboardCard | null = null;
let searchTimer: number | undefined;
let dashboardRequestSeq = 0;
let prefsSaveSeq = 0;
let importingBookmarks = false;
let clippingRecentPage = false;

init();

async function init() {
  await loadPrefs();
  await refreshDashboard();
  bindEvents();
  searchInputEl.focus();
}

async function loadPrefs() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'LOAD_NEW_TAB_PREFS' }) as RuntimeResponse<{ prefs?: Prefs }>;
    if (!res?.ok || !res.prefs) {
      throw new Error(res?.error ?? '无法读取偏好设置');
    }
    prefs = normalizePrefs(res.prefs);
  } catch (error) {
    prefs = DEFAULT_PREFS;
    setStatus(`偏好设置加载失败，已使用默认设置：${errorMessage(error)}`);
  }
  applyPrefs();
}

async function refreshDashboard() {
  const requestId = ++dashboardRequestSeq;
  const query = searchInputEl.value;
  const folder = currentFolder;

  setStatus('正在加载收藏数据...');
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'GET_DASHBOARD_DATA',
      query,
      folder,
    }) as RuntimeResponse<{ data?: DashboardData }>;

    if (requestId !== dashboardRequestSeq) return;

    if (!res?.ok || !res.data) {
      throw new Error(res?.error ?? '无法读取收藏数据');
    }

    dashboardData = res.data;
    renderDashboard(res.data, query, folder);
    setStatus(statusText(res.data, query, folder));
  } catch (error) {
    if (requestId !== dashboardRequestSeq) return;

    dashboardData = null;
    categoryListEl.innerHTML = '';
    cardsEl.innerHTML = '<div class="card-meta">收藏数据加载失败</div>';
    revisitWidgetEl.textContent = '暂无回访建议';
    recentWidgetEl.textContent = '暂无最近剪藏';
    setStatus(`加载失败：${errorMessage(error)}`);
  }
}

function renderDashboard(data: DashboardData, query: string, folder: string) {
  renderCategories(data.folders);
  renderCards(data.cards, query);
  renderRightPanel(data);
}

function openEditPanel(card: DashboardCard) {
  editingCard = card;
  editTitleEl.value = card.title || '';
  editFolderEl.value = card.folder || '';
  editTagsEl.value = card.tags.join(', ');
  editWhyEl.value = card.why || '';
  editPanelEl.hidden = false;
  editTitleEl.focus();
}

function closeEditPanel() {
  editingCard = null;
  editPanelEl.hidden = true;
}

async function saveEdit() {
  if (!editingCard) return;

  editSaveEl.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'UPDATE_SAVED_CLIP',
      update: {
        url: editingCard.url,
        canonicalUrl: editingCard.canonicalUrl,
        title: editTitleEl.value,
        folder: editFolderEl.value,
        tags: editTagsEl.value.split(/[,，]/),
        why: editWhyEl.value,
      },
    }) as RuntimeResponse<{}>;

    if (res?.ok) {
      setStatus('已保存收藏信息');
      closeEditPanel();
      await refreshDashboard();
    } else {
      setStatus(`保存失败：${res?.error ?? '未知错误'}`);
    }
  } catch (error) {
    setStatus(`保存失败：${errorMessage(error)}`);
  } finally {
    editSaveEl.disabled = false;
  }
}

function renderCategories(folders: BookmarkFolderOption[]) {
  categoryListEl.replaceChildren();
  categoryListEl.append(categoryButton('全部收藏', '', dashboardData?.stats.total ?? 0));
  if (currentFolder) {
    categoryListEl.append(categoryButton('上级', parentFolder(currentFolder), 0, 'category-back'));
  }
  for (const folder of childFolders(folders, currentFolder)) {
    categoryListEl.append(categoryButton(folderName(folder.path), folder.path, folder.count));
  }
}

function renderCards(cards: DashboardCard[], query: string) {
  if (!cards.length) {
    cardsEl.innerHTML = `<article class="bookmark-card"><div class="card-title">没有匹配的收藏</div><div class="card-meta">${query ? '换个关键词试试' : '导入或剪藏后会显示在这里'}</div></article>`;
    return;
  }

  cardsEl.innerHTML = cards.map(cardHtml).join('');
  const cardByUrl = new Map(cards.map((card) => [card.url, card]));

  for (const article of cardsEl.querySelectorAll<HTMLElement>('.bookmark-card[data-url]')) {
    const card = cardByUrl.get(article.dataset.url || '');
    article.querySelector('.edit-card')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (card) openEditPanel(card);
    });

    article.addEventListener('click', async (event) => {
      if ((event.target as HTMLElement).closest('.edit-card')) return;

      const url = article.dataset.url;
      if (!url) return;
      await chrome.runtime.sendMessage({ type: 'OPEN_REVISIT', url });
    });
  }

  for (const faviconEl of cardsEl.querySelectorAll<HTMLImageElement>('.favicon')) {
    faviconEl.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'favicon-fallback';
      fallback.textContent = faviconEl.dataset.initial || '?';
      faviconEl.replaceWith(fallback);
    }, { once: true });
  }
}

function renderRightPanel(data: DashboardData) {
  revisitWidgetEl.innerHTML = data.revisit
    ? compactCardHtml(data.revisit, 'revisit-card')
    : '<div>暂无回访建议</div>';

  recentWidgetEl.innerHTML = data.recent.length
    ? data.recent.map((card) => compactCardHtml(card, 'recent-card')).join('')
    : '<div>暂无最近剪藏</div>';

  for (const itemEl of rightPanelEl.querySelectorAll<HTMLElement>('[data-url]')) {
    itemEl.addEventListener('click', async () => {
      const url = itemEl.dataset.url;
      if (!url) return;
      await chrome.runtime.sendMessage({ type: 'OPEN_REVISIT', url });
    });
  }
}

function bindEvents() {
  editSaveEl.addEventListener('click', saveEdit);
  editCancelEl.addEventListener('click', closeEditPanel);
  editCloseEl.addEventListener('click', closeEditPanel);

  searchInputEl.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      refreshDashboard();
    }, 180);
  });

  for (const button of densityButtons) {
    button.addEventListener('click', () => {
      const density = button.dataset.density;
      if (density !== 'compact' && density !== 'standard' && density !== 'large') return;
      savePrefs({ density });
    });
  }

  themeToggleEl.addEventListener('click', () => {
    savePrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' });
  });

  drawerToggleEl.addEventListener('click', () => {
    savePrefs({ rightPanelCollapsed: !prefs.rightPanelCollapsed });
  });

  for (const button of importButtons) {
    button.addEventListener('click', () => {
      importBookmarks();
    });
  }

  for (const button of settingsButtons) {
    button.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  clipCurrentEl.addEventListener('click', () => {
    captureRecentPage();
  });

  aiRecallEl.addEventListener('click', () => {
    setStatus('AI 找回入口已预留；未配置或请求失败时，本地搜索继续可用。');
    if (!searchInputEl.value.trim()) {
      searchInputEl.value = 'AI';
      refreshDashboard();
    }
    searchInputEl.focus();
  });
}

function applyPrefs() {
  appEl.classList.remove('density-compact', 'density-standard', 'density-large', 'theme-light', 'theme-dark');
  appEl.classList.add(`density-${prefs.density}`, `theme-${prefs.theme}`);
  rightPanelEl.classList.toggle('open', !prefs.rightPanelCollapsed);
  themeToggleEl.textContent = prefs.theme === 'dark' ? '浅色' : '深色';

  for (const button of densityButtons) {
    button.classList.toggle('active', button.dataset.density === prefs.density);
  }
}

async function savePrefs(update: Partial<Prefs>) {
  const requestId = ++prefsSaveSeq;
  const previousPrefs = { ...prefs };
  prefs = normalizePrefs({ ...prefs, ...update });
  const nextPrefs = { ...prefs };
  applyPrefs();

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_NEW_TAB_PREFS',
      prefs: nextPrefs,
    }) as RuntimeResponse<{ prefs?: Prefs }>;

    if (!res?.ok || !res.prefs) {
      throw new Error(res?.error ?? '偏好设置保存失败');
    }

    if (requestId === prefsSaveSeq) {
      prefs = normalizePrefs(res.prefs);
      applyPrefs();
    }
  } catch (error) {
    if (requestId === prefsSaveSeq) {
      prefs = previousPrefs;
      applyPrefs();
      setStatus(`偏好设置保存失败：${errorMessage(error)}`);
    }
  }
}

async function captureRecentPage() {
  if (clippingRecentPage) return;

  clippingRecentPage = true;
  clipCurrentEl.disabled = true;
  setStatus('正在剪藏最近浏览的网页...');

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'CAPTURE_LAST_ACTIVE',
      why: '',
    }) as RuntimeResponse<{ queued?: boolean; path?: string }>;

    if (!res?.ok) {
      throw new Error(res?.error ?? '剪藏失败');
    }

    await refreshDashboard();
    setStatus(res.queued ? 'Obsidian 不可用，已暂存，恢复后自动写入' : '已剪藏最近浏览的网页');
  } catch (error) {
    setStatus(`剪藏失败：${errorMessage(error)}`);
  } finally {
    clippingRecentPage = false;
    clipCurrentEl.disabled = false;
  }
}

async function importBookmarks() {
  if (importingBookmarks) return;

  importingBookmarks = true;
  for (const button of importButtons) {
    button.disabled = true;
  }

  setStatus('正在导入浏览器书签...');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'IMPORT_BROWSER_BOOKMARKS' }) as RuntimeResponse<{
      imported?: number;
      total?: number;
    }>;

    if (!res?.ok) {
      throw new Error(res?.error ?? '导入浏览器书签失败');
    }

    await refreshDashboard();
    setStatus(`已导入 ${res.imported ?? 0} / ${res.total ?? 0} 个浏览器书签`);
  } catch (error) {
    setStatus(`导入失败：${errorMessage(error)}`);
  } finally {
    importingBookmarks = false;
    for (const button of importButtons) {
      button.disabled = false;
    }
  }
}

function cardHtml(card: DashboardCard): string {
  const tags = card.tags.slice(0, 3).map((tag) => `#${tag}`).join(' ');
  const folder = card.folder ? ` · ${card.folder}` : '';
  const meta = `${card.domain}${folder}`;

  return `
    <article class="bookmark-card" data-url="${escapeAttr(card.url)}" title="${escapeAttr(card.title || card.url)}">
      <div class="card-top">
        ${faviconHtml(card)}
        <span class="source-badge">${escapeHtml(card.sourceLabel)}</span>
        <button class="edit-card" type="button">编辑</button>
      </div>
      <div>
        <div class="card-title">${escapeHtml(card.title || card.url)}</div>
        <div class="card-meta">${escapeHtml(meta)}</div>
        <div class="card-tags">${escapeHtml(tags || card.summary || card.why || '暂无标签')}</div>
      </div>
    </article>
  `;
}

function compactCardHtml(card: DashboardCard, className: string): string {
  const meta = card.folder ? `${card.domain} · ${card.folder}` : card.domain;
  return `
    <button class="wide-action ${escapeAttr(className)}" type="button" data-url="${escapeAttr(card.url)}" title="${escapeAttr(card.title || card.url)}">
      <strong>${escapeHtml(card.title || card.url)}</strong><br />
      <span>${escapeHtml(meta)}</span>
    </button>
  `;
}

function faviconHtml(card: DashboardCard): string {
  const initial = (card.initial || card.domain || '?').slice(0, 1).toUpperCase();
  if (!card.faviconUrl) {
    return `<span class="favicon-fallback">${escapeHtml(initial)}</span>`;
  }
  return `<img class="favicon" src="${escapeAttr(card.faviconUrl)}" alt="" data-initial="${escapeAttr(initial)}" />`;
}

function categoryButton(label: string, folder: string, count: number, extraClass = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `category-button${folder === currentFolder ? ' active' : ''}${extraClass ? ` ${extraClass}` : ''}`;
  btn.innerHTML = `<span>${escapeHtml(label)}</span>${count ? `<b>${count}</b>` : '<b></b>'}`;
  btn.addEventListener('click', () => {
    currentFolder = folder;
    contentTitleEl.textContent = folder || '全部收藏';
    refreshDashboard();
  });
  return btn;
}

function childFolders(folders: BookmarkFolderOption[], parent: string): BookmarkFolderOption[] {
  const prefix = parent ? `${parent} / ` : '';
  const depth = parent ? parent.split(' / ').length + 1 : 1;
  return folders
    .filter((folder) => folder.path.startsWith(prefix) && folder.path.split(' / ').length === depth)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path, 'zh-CN'));
}

function parentFolder(path: string): string {
  const parts = path.split(' / ').filter(Boolean);
  return parts.slice(0, -1).join(' / ');
}

function folderName(path: string): string {
  const parts = path.split(' / ').filter(Boolean);
  return parts.at(-1) ?? path;
}

function normalizePrefs(value: Partial<Prefs>): Prefs {
  return {
    density: value.density === 'compact' || value.density === 'large' ? value.density : 'standard',
    theme: value.theme === 'dark' ? 'dark' : 'light',
    rightPanelCollapsed: typeof value.rightPanelCollapsed === 'boolean'
      ? value.rightPanelCollapsed
      : DEFAULT_PREFS.rightPanelCollapsed,
  };
}

function statusText(data: DashboardData, query: string, folder: string): string {
  const parts = [
    `${data.stats.total} 条收藏`,
    `${data.stats.clips} 条剪藏`,
    `${data.stats.bookmarks} 个书签`,
  ];
  const trimmedQuery = query.trim();
  if (trimmedQuery) parts.push(`搜索：${trimmedQuery}`);
  if (folder) parts.push(`分类：${folder}`);
  return parts.join(' · ');
}

function setStatus(message: string) {
  statusEl.textContent = message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export {};
