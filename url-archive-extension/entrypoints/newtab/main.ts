const appEl = document.getElementById('app') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const searchInputEl = document.getElementById('searchInput') as HTMLInputElement;
const categoryListEl = document.getElementById('categoryList') as HTMLDivElement;
const contentTitleEl = document.getElementById('contentTitle') as HTMLDivElement;
const cardsEl = document.getElementById('cards') as HTMLDivElement;
const rightPanelEl = document.getElementById('rightPanel') as HTMLElement;
const revisitWidgetEl = document.getElementById('revisitWidget') as HTMLDivElement;
const recentWidgetEl = document.getElementById('recentWidget') as HTMLDivElement;
const densityButtonEls = [...document.querySelectorAll<HTMLButtonElement>('.density-button')];
const themeToggleEl = document.getElementById('themeToggle') as HTMLButtonElement;

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
let searchTimer: number | undefined;
let dashboardRequestSeq = 0;

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
  renderCategories(data, folder);
  renderCards(data.cards, query);
  renderRightPanel(data);
}

function renderCategories(data: DashboardData, folder: string) {
  const topLevelFolders = getTopLevelFolders(data.folders);
  const totalCount = data.stats.total;

  const allButton = categoryButtonHtml('全部收藏', totalCount, '', folder === '');
  const folderButtons = topLevelFolders
    .map((item) => categoryButtonHtml(item.name, item.count, item.path, folder === item.path))
    .join('');

  categoryListEl.innerHTML = allButton + folderButtons;
  for (const button of categoryListEl.querySelectorAll<HTMLButtonElement>('.category-button')) {
    button.addEventListener('click', () => {
      currentFolder = button.dataset.folder ?? '';
      contentTitleEl.textContent = currentFolder || '全部收藏';
      refreshDashboard();
    });
  }
}

function renderCards(cards: DashboardCard[], query: string) {
  if (!cards.length) {
    cardsEl.innerHTML = `<article class="bookmark-card"><div class="card-title">没有匹配的收藏</div><div class="card-meta">${query ? '换个关键词试试' : '导入或剪藏后会显示在这里'}</div></article>`;
    return;
  }

  cardsEl.innerHTML = cards.map(cardHtml).join('');

  for (const cardEl of cardsEl.querySelectorAll<HTMLElement>('.bookmark-card[data-url]')) {
    cardEl.addEventListener('click', async () => {
      const url = cardEl.dataset.url;
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
  searchInputEl.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      refreshDashboard();
    }, 180);
  });
}

function applyPrefs() {
  appEl.classList.remove('density-compact', 'density-standard', 'density-large', 'theme-light', 'theme-dark');
  appEl.classList.add(`density-${prefs.density}`, `theme-${prefs.theme}`);
  rightPanelEl.classList.toggle('open', !prefs.rightPanelCollapsed);
  themeToggleEl.textContent = prefs.theme === 'dark' ? '浅色' : '深色';

  for (const button of densityButtonEls) {
    button.classList.toggle('active', button.dataset.density === prefs.density);
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

function categoryButtonHtml(label: string, count: number, folder: string, active: boolean): string {
  return `
    <button class="category-button${active ? ' active' : ''}" type="button" data-folder="${escapeAttr(folder)}" title="${escapeAttr(folder || label)}">
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(String(count))}</small>
    </button>
  `;
}

function getTopLevelFolders(folders: BookmarkFolderOption[]): Array<BookmarkFolderOption & { name: string }> {
  return folders
    .filter((folder) => folder.path && !folder.path.includes(' / '))
    .map((folder) => ({ ...folder, name: folder.path }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
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
