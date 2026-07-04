import {
  deleteImage,
  imageKey,
  isImageKey,
  loadImage,
  resizeImageFile,
  resolveImageUrl,
  saveImage,
  toImageKey,
} from '@/lib/image-store';
import { DomeGallery, type DomeItem } from './dome-gallery';

const appEl = document.getElementById('app') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const editPanelEl = document.getElementById('editPanel') as HTMLElement;
const editCloseEl = document.getElementById('editClose') as HTMLButtonElement;
const editTitleEl = document.getElementById('editTitle') as HTMLInputElement;
const editFolderEl = document.getElementById('editFolder') as HTMLSelectElement;
const editFaviconUrlEl = document.getElementById('editFaviconUrl') as HTMLInputElement;
const editFaviconFileEl = document.getElementById('editFaviconFile') as HTMLInputElement;
const editIconPreviewEl = document.getElementById('editIconPreview') as HTMLDivElement;
const editClearFaviconEl = document.getElementById('editClearFavicon') as HTMLButtonElement;
const uploadFaviconEl = document.getElementById('uploadFavicon') as HTMLButtonElement;
const editSaveEl = document.getElementById('editSave') as HTMLButtonElement;
const editCancelEl = document.getElementById('editCancel') as HTMLButtonElement;
const settingsPanelEl = document.getElementById('settingsPanel') as HTMLElement;
const settingsToggleEl = document.getElementById('settingsToggle') as HTMLButtonElement;
const settingsCloseEl = document.getElementById('settingsClose') as HTMLButtonElement;
const backgroundImageInputEl = document.getElementById('backgroundImageInput') as HTMLInputElement;
const backgroundImageFileEl = document.getElementById('backgroundImageFile') as HTMLInputElement;
const uploadBackgroundImageEl = document.getElementById('uploadBackgroundImage') as HTMLButtonElement;
const saveBackgroundImageEl = document.getElementById('saveBackgroundImage') as HTMLButtonElement;
const clearBackgroundImageEl = document.getElementById('clearBackgroundImage') as HTMLButtonElement;
const webSearchFormEl = document.getElementById('webSearchForm') as HTMLFormElement;
const searchEngineToggleEl = document.getElementById('searchEngineToggle') as HTMLButtonElement;
const searchInputEl = document.getElementById('searchInput') as HTMLInputElement;
const drawerSearchInputEl = document.getElementById('drawerSearchInput') as HTMLInputElement;
const categoryListEl = document.getElementById('categoryList') as HTMLDivElement;
const contentTitleEl = document.getElementById('contentTitle') as HTMLDivElement;
const contentHintEl = document.getElementById('contentHint') as HTMLParagraphElement;
const cardsEl = document.getElementById('cards') as HTMLDivElement;
const cardsViewportEl = document.getElementById('cardsViewport') as HTMLDivElement;
const pageIndicatorEl = document.getElementById('pageIndicator') as HTMLDivElement;
const gridColumnsInputEl = document.getElementById('gridColumnsInput') as HTMLInputElement;
const gridColumnsValueEl = document.getElementById('gridColumnsValue') as HTMLOutputElement;
const gridRowsInputEl = document.getElementById('gridRowsInput') as HTMLInputElement;
const gridRowsValueEl = document.getElementById('gridRowsValue') as HTMLOutputElement;
const cardRadiusInputEl = document.getElementById('cardRadiusInput') as HTMLInputElement;
const cardRadiusValueEl = document.getElementById('cardRadiusValue') as HTMLOutputElement;
const iconSizeInputEl = document.getElementById('iconSizeInput') as HTMLInputElement;
const iconSizeValueEl = document.getElementById('iconSizeValue') as HTMLOutputElement;
const columnGapInputEl = document.getElementById('columnGapInput') as HTMLInputElement;
const columnGapValueEl = document.getElementById('columnGapValue') as HTMLOutputElement;
const rowGapInputEl = document.getElementById('rowGapInput') as HTMLInputElement;
const rowGapValueEl = document.getElementById('rowGapValue') as HTMLOutputElement;
const showLabelsInputEl = document.getElementById('showLabelsInput') as HTMLInputElement;
const galleryModeInputEl = document.getElementById('galleryModeInput') as HTMLInputElement;
const domeGalleryEl = document.getElementById('domeGallery') as HTMLDivElement;
const detailListEl = document.getElementById('detailList') as HTMLDivElement;
const rightPanelEl = document.getElementById('rightPanel') as HTMLElement;
const rightDrawerHotspotEl = document.getElementById('rightDrawerHotspot') as HTMLButtonElement;
const revisitWidgetEl = document.getElementById('revisitWidget') as HTMLDivElement;
const recentWidgetEl = document.getElementById('recentWidget') as HTMLDivElement;
const densityButtons = [...document.querySelectorAll<HTMLButtonElement>('.density-button')];
const themeToggleEl = document.getElementById('themeToggle') as HTMLButtonElement;
const drawerToggleEl = document.getElementById('rightDrawerToggle') as HTMLButtonElement;
const clipCurrentEl = document.getElementById('clipCurrent') as HTMLButtonElement;
const aiRecallEl = document.getElementById('aiRecall') as HTMLButtonElement;
const importButtons = [document.getElementById('importBookmarks') as HTMLButtonElement];
const settingsButtons = [document.getElementById('openSettings') as HTMLButtonElement];

type Density = 'compact' | 'standard' | 'large';
type Theme = 'light' | 'dark';
type SearchEngine = 'google' | 'bing' | 'baidu';

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
  backgroundImageUrl: string;
  gridColumns: number;
  gridRows: number;
  cardRadius: number;
  iconSize: number;
  columnGap: number;
  rowGap: number;
  showLabels: boolean;
  galleryMode: boolean;
};

type RuntimeResponse<T> = {
  ok?: boolean;
  error?: string;
} & T;

const DEFAULT_PREFS: Prefs = {
  density: 'standard',
  theme: 'light',
  rightPanelCollapsed: false,
  backgroundImageUrl: '',
  gridColumns: 5,
  gridRows: 2,
  cardRadius: 26,
  iconSize: 100,
  columnGap: 24,
  rowGap: 30,
  showLabels: true,
  galleryMode: false,
};

const DEFAULT_BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=80';
const SEARCH_ENGINES: Record<SearchEngine, { label: string; url: string }> = {
  google: { label: 'G', url: 'https://www.google.com/search?q=' },
  bing: { label: 'B', url: 'https://www.bing.com/search?q=' },
  baidu: { label: '百', url: 'https://www.baidu.com/s?wd=' },
};
const SEARCH_ENGINE_ORDER: SearchEngine[] = ['google', 'bing', 'baidu'];
const PREVIEW_PREFS_KEY = 'url_archive_preview_new_tab_prefs';

let prefs: Prefs = DEFAULT_PREFS;
let dashboardData: DashboardData | null = null;
let currentFolder = '';
let editingCard: DashboardCard | null = null;
let currentPage = 0;
let totalPages = 1;
let isScrolling = false;
let searchTimer: number | undefined;
let dashboardRequestSeq = 0;
let prefsSaveSeq = 0;
let importingBookmarks = false;
let clippingRecentPage = false;
let searchEngine: SearchEngine = 'google';
let drawerAutoCloseTimer: number | undefined;
let domeInstance: DomeGallery | null = null;

const PREVIEW_CARDS: DashboardCard[] = [
  previewCard('https://app.tapnow.ai', 'TapNow | 你的智能体创意画布', 'app.tapnow.ai', '书签栏 / AI绘画', 'bookmark', ['AI', '创意'], '智能体创意画布和视觉工作台'),
  previewCard('https://github.com', 'GitHub: Where the world builds software', 'github.com', '书签栏 / 源码', 'bookmark', ['代码', '协作'], '开发者代码托管与项目协作'),
  previewCard('https://www.mercury.com', 'Mercury - Online Business Banking', 'mercury.com', '书签栏 / 工作 / 金融', 'clip', ['金融', 'SaaS'], '适合创业公司的在线银行服务'),
  previewCard('https://www.awwwards.com', 'Awwwards - SOTD', 'awwwards.com', '书签栏 / 设计类', 'bookmark', ['设计', '灵感'], '网站设计与交互灵感'),
  previewCard('https://www.lapaninja.com', 'Lapa Ninja | Landing Page Gallery', 'lapaninja.com', '书签栏 / 设计类', 'bookmark', ['落地页', 'UI'], '高质量 Landing Page 参考'),
  previewCard('https://resend.com', 'Resend | 域名邮箱', 'resend.com', '书签栏 / 管理站点', 'clip', ['邮件', '开发'], '开发者友好的邮件 API'),
  previewCard('https://www.cloudflare.com', 'Cloudflare: Build for the agentic web', 'cloudflare.com', '书签栏 / 管理站点', 'bookmark', ['部署', '网络'], '网络、DNS 与应用部署平台'),
  previewCard('https://www.pinterest.com', 'Pinterest', 'pinterest.com', '书签栏 / 图片', 'bookmark', ['图片', '灵感'], '视觉收藏与灵感检索'),
  previewCard('https://www.producthunt.com', 'Product Hunt', 'producthunt.com', '书签栏 / 产品', 'clip', ['产品', '趋势'], '发现新产品和工具'),
  previewCard('https://linear.app', 'Linear', 'linear.app', '书签栏 / 工作', 'bookmark', ['项目', '效率'], '产品研发项目管理工具'),
  previewCard('https://vercel.com', 'Vercel', 'vercel.com', '书签栏 / 开发工具', 'bookmark', ['部署', '前端'], '前端应用托管与部署'),
  previewCard('https://www.figma.com', 'Figma', 'figma.com', '书签栏 / 设计类', 'bookmark', ['设计', '协作'], '界面设计与原型协作'),
];

init();

async function init() {
  await loadPrefs();
  await refreshDashboard();
  bindEvents();
  searchInputEl.focus();
}

async function loadPrefs() {
  try {
    const res = await sendRuntimeMessage({ type: 'LOAD_NEW_TAB_PREFS' }) as RuntimeResponse<{ prefs?: Prefs }>;
    if (!res?.ok || !res.prefs) {
      throw new Error(res?.error ?? '无法读取偏好设置');
    }
    prefs = normalizePrefs(res.prefs);
  } catch (error) {
    prefs = DEFAULT_PREFS;
    setStatus(`偏好设置加载失败，已使用默认设置：${errorMessage(error)}`);
  }
  await applyPrefs();
}

async function refreshDashboard() {
  const requestId = ++dashboardRequestSeq;
  const query = searchInputEl.value;
  const folder = currentFolder;

  setStatus('正在加载收藏数据...');
  try {
    const res = await sendRuntimeMessage({
      type: 'GET_DASHBOARD_DATA',
      query,
      folder,
    }) as RuntimeResponse<{ data?: DashboardData }>;

    if (requestId !== dashboardRequestSeq) return;

    if (!res?.ok || !res.data) {
      throw new Error(res?.error ?? '无法读取收藏数据');
    }

    dashboardData = res.data;
    const resolvedData = await resolveDashboardImages(res.data);
    renderDashboard(resolvedData, query, folder);
    setStatus(statusText(resolvedData, query, folder));
  } catch (error) {
    if (requestId !== dashboardRequestSeq) return;

    dashboardData = null;
    categoryListEl.innerHTML = '';
    cardsEl.innerHTML = '<div class="empty-state">收藏数据加载失败</div>';
    detailListEl.innerHTML = '<div class="empty-state">暂无详细书签</div>';
    revisitWidgetEl.textContent = '暂无回访建议';
    recentWidgetEl.textContent = '暂无最近剪藏';
    setStatus(`加载失败：${errorMessage(error)}`);
  }
}

async function resolveDashboardImages(data: DashboardData): Promise<DashboardData> {
  const cards = await Promise.all(
    data.cards.map(async (card) => {
      if (!card.faviconUrl || !isImageKey(card.faviconUrl)) return card;
      const resolved = await loadImage(imageKey(card.faviconUrl));
      return resolved ? { ...card, faviconUrl: resolved } : card;
    }),
  );
  const revisit = data.revisit && data.revisit.faviconUrl && isImageKey(data.revisit.faviconUrl)
    ? { ...data.revisit, faviconUrl: (await loadImage(imageKey(data.revisit.faviconUrl))) || data.revisit.faviconUrl }
    : data.revisit;
  return { ...data, cards, revisit };
}

function renderDashboard(data: DashboardData, query: string, folder: string) {
  renderCategories(data.folders);
  if (prefs.galleryMode) {
    renderDome(data.cards);
  } else {
    renderCards(data.cards, query);
  }
  renderDetailList(data.cards);
  renderWidgets(data);
  contentTitleEl.textContent = folder || (query.trim() ? '搜索结果' : '全部收藏');
  contentHintEl.textContent = query.trim()
    ? `本地收藏已按“${query.trim()}”筛选，按 Enter 可继续网页搜索。`
    : '常用收藏会在这里快速打开，输入关键词可即时筛选。';
}

async function openEditPanel(card: DashboardCard) {
  editingCard = card;
  editTitleEl.value = card.title || '';
  renderEditFolderOptions(card.folder || '');
  editFaviconUrlEl.value = card.faviconUrl || '';
  await renderEditIconPreview(card);
  editPanelEl.hidden = false;
  editTitleEl.focus();
}

function closeEditPanel() {
  editingCard = null;
  editPanelEl.hidden = true;
}

async function renderEditIconPreview(card?: DashboardCard | null) {
  if (!card) {
    editIconPreviewEl.innerHTML = '';
    return;
  }

  const rawUrl = editFaviconUrlEl.value.trim() || card.faviconUrl;
  const url = rawUrl ? await resolveImageUrl(rawUrl) : '';
  const initial = (card.initial || card.domain || '?').slice(0, 1).toUpperCase();
  editIconPreviewEl.innerHTML = url
    ? `<img class="icon-preview-img" src="${escapeAttr(url)}" alt="" data-initial="${escapeAttr(initial)}" />`
    : `<span class="icon-preview-fallback">${escapeHtml(initial)}</span>`;

  const img = editIconPreviewEl.querySelector<HTMLImageElement>('.icon-preview-img');
  img?.addEventListener('error', () => {
    img.replaceWith(document.createTextNode(initial));
  }, { once: true });
}

function renderEditFolderOptions(selectedFolder: string) {
  const folders = new Set((dashboardData?.folders ?? []).map((folder) => folder.path));
  if (selectedFolder) folders.add(selectedFolder);

  const options = [
    { label: '未指定收藏夹', value: '' },
    ...[...folders]
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map((folder) => ({ label: folder, value: folder })),
  ];

  editFolderEl.replaceChildren(...options.map((option) => {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    el.selected = option.value === selectedFolder;
    return el;
  }));
}

async function saveEdit() {
  if (!editingCard) return;

  editSaveEl.disabled = true;
  try {
    const res = await sendRuntimeMessage({
      type: 'UPDATE_SAVED_CLIP',
      update: {
        url: editingCard.url,
        canonicalUrl: editingCard.canonicalUrl,
        title: editTitleEl.value,
        folder: editFolderEl.value,
        faviconUrl: editFaviconUrlEl.value.trim(),
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

async function deleteCard(card: DashboardCard) {
  const confirmed = window.confirm(`删除收藏“${card.title || card.url}”？`);
  if (!confirmed) return;

  try {
    const res = await sendRuntimeMessage({
      type: 'DELETE_SAVED_CLIP',
      target: {
        url: card.url,
        canonicalUrl: card.canonicalUrl,
      },
    }) as RuntimeResponse<{ deleted?: boolean }>;

    if (!res?.ok) {
      setStatus(`删除失败：${res?.error ?? '未找到要删除的收藏'}`);
      return;
    }

    setStatus('已删除收藏');
    await refreshDashboard();
  } catch (error) {
    setStatus(`删除失败：${errorMessage(error)}`);
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

function renderCards(cards: DashboardCard[], query: string) {
  if (!cards.length) {
    cardsEl.innerHTML = `<article class="bookmark-card empty-card"><div class="card-title">没有匹配的收藏</div><div class="card-meta">${query ? '换个关键词试试，或按 Enter 搜索网页' : '导入或剪藏后会显示在这里'}</div></article>`;
    pageIndicatorEl.innerHTML = '';
    cardsEl.style.transform = '';
    return;
  }

  const perPage = cardsPerPage();
  totalPages = Math.max(1, Math.ceil(cards.length / perPage));
  currentPage = Math.min(currentPage, totalPages - 1);

  const pages: DashboardCard[][] = [];
  for (let i = 0; i < totalPages; i += 1) {
    const pageCards = cards.slice(i * perPage, (i + 1) * perPage);
    while (pageCards.length < perPage) {
      pageCards.push({ ...cards[0], url: '', title: '', domain: '' } as DashboardCard);
    }
    pages.push(pageCards);
  }

  cardsEl.innerHTML = pages.map((pageCards, pageIndex) => `
    <div class="bookmark-page${pageIndex === currentPage ? ' active' : ''}" data-page="${pageIndex}" aria-label="第 ${pageIndex + 1} 页">
      ${pageCards.map((card, index) => card.url ? cardHtml(card) : placeholderCardHtml(index)).join('')}
    </div>
  `).join('');

  bindCardEvents(cards);
  renderPageIndicator();
  applyPageTransform(false);
}

function renderPageIndicator() {
  if (totalPages <= 1) {
    pageIndicatorEl.innerHTML = '';
    return;
  }

  pageIndicatorEl.replaceChildren(
    ...Array.from({ length: totalPages }, (_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `page-dot${i === currentPage ? ' active' : ''}`;
      dot.textContent = String(i + 1);
      dot.setAttribute('aria-label', `第 ${i + 1} 页`);
      dot.addEventListener('click', () => {
        currentPage = i;
        refreshCardsPage();
      });
      return dot;
    }),
  );
}

function applyPageTransform(animate: boolean) {
  cardsEl.style.transition = animate ? 'transform .38s cubic-bezier(.22, .61, .36, 1)' : 'none';
  const offset = currentPage * -100;
  cardsEl.style.transform = `translateX(${offset}%)`;
}

function refreshCardsPage() {
  renderPageIndicator();
  applyPageTransform(true);
  for (const page of cardsEl.querySelectorAll<HTMLElement>('.bookmark-page')) {
    page.classList.toggle('active', Number(page.dataset.page) === currentPage);
  }
}

function goToPage(delta: number) {
  if (totalPages <= 1) return;
  const next = currentPage + delta;
  if (next < 0 || next >= totalPages) return;
  currentPage = next;
  refreshCardsPage();
}

function handleCardsWheel(event: WheelEvent) {
  if (totalPages <= 1) return;
  event.preventDefault();
  if (isScrolling) return;

  const delta = event.deltaY > 0 ? 1 : -1;
  const next = currentPage + delta;
  if (next < 0 || next >= totalPages) return;

  isScrolling = true;
  currentPage = next;
  refreshCardsPage();
  window.setTimeout(() => {
    isScrolling = false;
  }, 420);
}

function renderDetailList(cards: DashboardCard[]) {
  if (!cards.length) {
    detailListEl.innerHTML = '<div class="empty-state">暂无详细书签</div>';
    return;
  }

  const visibleCards = cards.slice(0, 18);
  detailListEl.innerHTML = visibleCards.map(detailItemHtml).join('');
  bindDetailListEvents(visibleCards);
}

function renderWidgets(data: DashboardData) {
  revisitWidgetEl.innerHTML = data.revisit
    ? compactCardHtml(data.revisit, 'revisit-card')
    : '<div>暂无回访建议</div>';

  recentWidgetEl.innerHTML = data.recent.length
    ? data.recent.slice(0, 3).map((card) => compactCardHtml(card, 'recent-card')).join('')
    : '<div>暂无最近剪藏</div>';

  bindOpenableItems(revisitWidgetEl);
  bindOpenableItems(recentWidgetEl);
}

function bindCardEvents(cards: DashboardCard[]) {
  const cardByUrl = new Map(cards.map((card) => [card.url, card]));

  for (const article of cardsEl.querySelectorAll<HTMLElement>('.bookmark-card[data-url]')) {
    const card = cardByUrl.get(article.dataset.url || '');
    article.querySelector('.edit-card')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (card) openEditPanel(card);
    });

    article.addEventListener('click', async (event) => {
      if ((event.target as HTMLElement).closest('.edit-card')) return;
      await openUrlFromElement(article);
    });
  }

  bindFaviconFallbacks(cardsEl);
}

function bindOpenableItems(root: HTMLElement) {
  for (const itemEl of root.querySelectorAll<HTMLElement>('[data-url]')) {
    itemEl.addEventListener('click', async () => {
      await openUrlFromElement(itemEl);
    });
  }
  bindFaviconFallbacks(root);
}

function bindDetailListEvents(cards: DashboardCard[]) {
  const cardByUrl = new Map(cards.map((card) => [card.url, card]));

  for (const itemEl of detailListEl.querySelectorAll<HTMLElement>('.detail-item[data-url]')) {
    const card = cardByUrl.get(itemEl.dataset.url || '');

    itemEl.querySelector<HTMLElement>('.detail-main')?.addEventListener('click', async () => {
      await openUrlFromElement(itemEl);
    });

    itemEl.querySelector<HTMLButtonElement>('.detail-menu-button')?.addEventListener('click', (event) => {
      event.stopPropagation();
      closeDetailMenus(itemEl);
      const menu = itemEl.querySelector<HTMLElement>('.detail-menu');
      if (menu) menu.hidden = !menu.hidden;
    });

    itemEl.querySelector<HTMLButtonElement>('.detail-menu-edit')?.addEventListener('click', (event) => {
      event.stopPropagation();
      closeDetailMenus();
      if (card) openEditPanel(card);
    });

    itemEl.querySelector<HTMLButtonElement>('.detail-menu-delete')?.addEventListener('click', (event) => {
      event.stopPropagation();
      closeDetailMenus();
      if (card) deleteCard(card);
    });
  }

  bindFaviconFallbacks(detailListEl);
}

function closeDetailMenus(except?: HTMLElement) {
  for (const menu of detailListEl.querySelectorAll<HTMLElement>('.detail-menu')) {
    if (except?.contains(menu)) continue;
    menu.hidden = true;
  }
}

function bindFaviconFallbacks(root: HTMLElement) {
  for (const faviconEl of root.querySelectorAll<HTMLImageElement>('.favicon')) {
    faviconEl.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = faviconEl.classList.contains('small-favicon')
        ? 'favicon-fallback small-favicon'
        : 'favicon-fallback';
      fallback.textContent = faviconEl.dataset.initial || '?';
      faviconEl.replaceWith(fallback);
    }, { once: true });
  }
}

async function openUrlFromElement(el: HTMLElement) {
  const url = el.dataset.url;
  if (!url) return;
  await openTab(url);
}

function bindEvents() {
  document.querySelector<HTMLButtonElement>('.brand')?.addEventListener('click', () => {
    currentFolder = '';
    searchInputEl.value = '';
    currentPage = 0;
    refreshDashboard();
  });

  editSaveEl.addEventListener('click', saveEdit);
  editCancelEl.addEventListener('click', closeEditPanel);
  editCloseEl.addEventListener('click', closeEditPanel);
  editFaviconUrlEl.addEventListener('input', () => {
    renderEditIconPreview(editingCard);
  });
  uploadFaviconEl.addEventListener('click', () => editFaviconFileEl.click());
  editFaviconFileEl.addEventListener('change', async () => {
    const file = editFaviconFileEl.files?.[0];
    if (!file || !editingCard) return;
    try {
      const dataUrl = await resizeImageFile(file, 256, 256, 0.9);
      const key = `favicon-${Date.now()}`;
      await saveImage(key, dataUrl);
      editFaviconUrlEl.value = toImageKey(key);
      await renderEditIconPreview(editingCard);
    } catch (error) {
      setStatus(`图标上传失败：${errorMessage(error)}`);
    }
    editFaviconFileEl.value = '';
  });
  editClearFaviconEl.addEventListener('click', () => {
    editFaviconUrlEl.value = '';
    renderEditIconPreview(editingCard);
  });

  settingsToggleEl.addEventListener('click', () => {
    settingsPanelEl.hidden = !settingsPanelEl.hidden;
    if (!settingsPanelEl.hidden) {
      backgroundImageInputEl.value = prefs.backgroundImageUrl;
      backgroundImageInputEl.focus();
    }
  });
  settingsCloseEl.addEventListener('click', () => {
    settingsPanelEl.hidden = true;
  });

  webSearchFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    openWebSearch();
  });

  searchInputEl.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      drawerSearchInputEl.value = searchInputEl.value;
      currentPage = 0;
      refreshDashboard();
    }, 160);
  });

  drawerSearchInputEl.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchInputEl.value = drawerSearchInputEl.value;
      currentPage = 0;
      refreshDashboard();
    }, 160);
  });

  searchEngineToggleEl.addEventListener('click', () => {
    const nextIndex = (SEARCH_ENGINE_ORDER.indexOf(searchEngine) + 1) % SEARCH_ENGINE_ORDER.length;
    searchEngine = SEARCH_ENGINE_ORDER[nextIndex];
    updateSearchEngineButton();
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
    const nextCollapsed = !prefs.rightPanelCollapsed;
    if (nextCollapsed) closeEditPanel();
    savePrefs({ rightPanelCollapsed: nextCollapsed });
  });

  rightDrawerHotspotEl.addEventListener('mouseenter', () => {
    openDrawerTemporarily();
  });

  rightDrawerHotspotEl.addEventListener('click', () => {
    openDrawerTemporarily();
  });

  rightPanelEl.addEventListener('mouseenter', () => {
    window.clearTimeout(drawerAutoCloseTimer);
  });

  rightPanelEl.addEventListener('mouseleave', () => {
    scheduleDrawerClose();
  });

  uploadBackgroundImageEl.addEventListener('click', () => backgroundImageFileEl.click());
  backgroundImageFileEl.addEventListener('change', async () => {
    const file = backgroundImageFileEl.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 2560, 1440, 0.85);
      const key = `background-${Date.now()}`;
      await saveImage(key, dataUrl);
      backgroundImageInputEl.value = toImageKey(key);
      savePrefs({ backgroundImageUrl: toImageKey(key) });
    } catch (error) {
      setStatus(`背景图上传失败：${errorMessage(error)}`);
    }
    backgroundImageFileEl.value = '';
  });

  saveBackgroundImageEl.addEventListener('click', () => {
    savePrefs({ backgroundImageUrl: backgroundImageInputEl.value.trim() });
  });

  clearBackgroundImageEl.addEventListener('click', async () => {
    const oldUrl = prefs.backgroundImageUrl;
    if (isImageKey(oldUrl)) {
      await deleteImage(imageKey(oldUrl)).catch(() => {});
    }
    backgroundImageInputEl.value = '';
    savePrefs({ backgroundImageUrl: '' });
  });

  for (const button of importButtons) {
    button.addEventListener('click', () => {
      importBookmarks();
    });
  }

  for (const button of settingsButtons) {
    button.addEventListener('click', () => {
      openOptionsPage();
    });
  }

  clipCurrentEl.addEventListener('click', () => {
    captureRecentPage();
  });

  document.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('.detail-menu, .detail-menu-button')) return;
    closeDetailMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetailMenus();
  });

  aiRecallEl.addEventListener('click', () => {
    setStatus('AI 找回入口已预留；未配置或请求失败时，本地搜索继续可用。');
    if (!searchInputEl.value.trim()) {
      searchInputEl.value = 'AI';
      currentPage = 0;
      refreshDashboard();
    }
    searchInputEl.focus();
  });

  cardsViewportEl.addEventListener('wheel', handleCardsWheel, { passive: false });

  gridColumnsInputEl.addEventListener('input', () => {
    const value = parseInt(gridColumnsInputEl.value, 10);
    gridColumnsValueEl.value = String(value);
    currentPage = 0;
    savePrefs({ gridColumns: value });
    refreshDashboard();
  });

  gridRowsInputEl.addEventListener('input', () => {
    const value = parseInt(gridRowsInputEl.value, 10);
    gridRowsValueEl.value = String(value);
    currentPage = 0;
    savePrefs({ gridRows: value });
    refreshDashboard();
  });

  cardRadiusInputEl.addEventListener('input', () => {
    const value = parseInt(cardRadiusInputEl.value, 10);
    cardRadiusValueEl.value = String(value);
    savePrefs({ cardRadius: value });
  });

  iconSizeInputEl.addEventListener('input', () => {
    const value = parseInt(iconSizeInputEl.value, 10);
    iconSizeValueEl.value = `${value}%`;
    savePrefs({ iconSize: value });
  });

  columnGapInputEl.addEventListener('input', () => {
    const value = parseInt(columnGapInputEl.value, 10);
    columnGapValueEl.value = `${value}px`;
    savePrefs({ columnGap: value });
  });

  rowGapInputEl.addEventListener('input', () => {
    const value = parseInt(rowGapInputEl.value, 10);
    rowGapValueEl.value = `${value}px`;
    savePrefs({ rowGap: value });
  });

  showLabelsInputEl.addEventListener('change', () => {
    savePrefs({ showLabels: !showLabelsInputEl.checked });
  });

  galleryModeInputEl.addEventListener('change', () => {
    currentPage = 0;
    savePrefs({ galleryMode: galleryModeInputEl.checked });
    refreshDashboard();
  });
}

function openDrawerTemporarily() {
  window.clearTimeout(drawerAutoCloseTimer);
  if (prefs.rightPanelCollapsed) {
    savePrefs({ rightPanelCollapsed: false });
  }
}

function scheduleDrawerClose() {
  window.clearTimeout(drawerAutoCloseTimer);
  drawerAutoCloseTimer = window.setTimeout(() => {
    closeEditPanel();
    savePrefs({ rightPanelCollapsed: true });
  }, 360);
}

function openWebSearch() {
  const query = searchInputEl.value.trim();
  if (!query) return;
  const engine = SEARCH_ENGINES[searchEngine];
  const url = `${engine.url}${encodeURIComponent(query)}`;
  openTab(url);
}

async function applyPrefs() {
  appEl.classList.remove('density-compact', 'density-standard', 'density-large', 'theme-light', 'theme-dark', 'right-collapsed', 'right-panel-open');
  appEl.classList.add(`density-${prefs.density}`, `theme-${prefs.theme}`);
  appEl.classList.toggle('right-collapsed', prefs.rightPanelCollapsed);
  appEl.classList.toggle('right-panel-open', !prefs.rightPanelCollapsed);
  rightPanelEl.classList.toggle('open', !prefs.rightPanelCollapsed);
  rightDrawerHotspotEl.hidden = !prefs.rightPanelCollapsed;
  backgroundImageInputEl.value = prefs.backgroundImageUrl;

  const resolvedUrl = await resolveImageUrl(prefs.backgroundImageUrl);
  const imageUrl = resolvedUrl || DEFAULT_BACKGROUND_IMAGE;
  appEl.style.setProperty('--wallpaper-image', `url("${cssUrl(imageUrl)}")`);
  appEl.style.setProperty('--grid-columns', String(prefs.gridColumns));
  appEl.style.setProperty('--grid-rows', String(prefs.gridRows));
  appEl.style.setProperty('--card-radius', `${prefs.cardRadius}px`);
  appEl.style.setProperty('--icon-size', String(prefs.iconSize / 100));
  appEl.style.setProperty('--column-gap', `${prefs.columnGap}px`);
  appEl.style.setProperty('--row-gap', `${prefs.rowGap}px`);
  appEl.classList.toggle('hide-labels', !prefs.showLabels);
  appEl.classList.toggle('gallery-mode', prefs.galleryMode);

  gridColumnsInputEl.value = String(prefs.gridColumns);
  gridColumnsValueEl.value = String(prefs.gridColumns);
  gridRowsInputEl.value = String(prefs.gridRows);
  gridRowsValueEl.value = String(prefs.gridRows);
  cardRadiusInputEl.value = String(prefs.cardRadius);
  cardRadiusValueEl.value = String(prefs.cardRadius);
  iconSizeInputEl.value = String(prefs.iconSize);
  iconSizeValueEl.value = `${prefs.iconSize}%`;
  columnGapInputEl.value = String(prefs.columnGap);
  columnGapValueEl.value = `${prefs.columnGap}px`;
  rowGapInputEl.value = String(prefs.rowGap);
  rowGapValueEl.value = `${prefs.rowGap}px`;
  showLabelsInputEl.checked = !prefs.showLabels;
  galleryModeInputEl.checked = prefs.galleryMode;

  for (const button of densityButtons) {
    button.classList.toggle('active', button.dataset.density === prefs.density);
  }
  updateSearchEngineButton();
}

function updateSearchEngineButton() {
  searchEngineToggleEl.textContent = SEARCH_ENGINES[searchEngine].label;
}

async function savePrefs(update: Partial<Prefs>) {
  const requestId = ++prefsSaveSeq;
  const previousPrefs = { ...prefs };
  prefs = normalizePrefs({ ...prefs, ...update });
  await applyPrefs();

  try {
    const res = await sendRuntimeMessage({
      type: 'SAVE_NEW_TAB_PREFS',
      update,
    }) as RuntimeResponse<{ prefs?: Prefs }>;

    if (!res?.ok || !res.prefs) {
      throw new Error(res?.error ?? '偏好设置保存失败');
    }

    if (requestId === prefsSaveSeq) {
      prefs = normalizePrefs(res.prefs);
      await applyPrefs();
    }
  } catch (error) {
    if (requestId === prefsSaveSeq) {
      prefs = previousPrefs;
      await applyPrefs();
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
    const res = await sendRuntimeMessage({
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
    const res = await sendRuntimeMessage({ type: 'IMPORT_BROWSER_BOOKMARKS' }) as RuntimeResponse<{
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

async function sendRuntimeMessage(message: Record<string, unknown>): Promise<unknown> {
  if (hasExtensionRuntime()) {
    return globalThis.chrome.runtime.sendMessage(message);
  }
  return previewRuntimeMessage(message);
}

async function openTab(url: string) {
  if (hasExtensionRuntime() && globalThis.chrome.tabs?.create) {
    await globalThis.chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openOptionsPage() {
  if (hasExtensionRuntime() && globalThis.chrome.runtime.openOptionsPage) {
    globalThis.chrome.runtime.openOptionsPage();
    return;
  }
  setStatus('本地预览模式下无法打开扩展设置');
}

function hasExtensionRuntime(): boolean {
  return typeof globalThis.chrome !== 'undefined' && Boolean(globalThis.chrome.runtime?.sendMessage);
}

async function previewRuntimeMessage(message: Record<string, unknown>): Promise<RuntimeResponse<Record<string, unknown>>> {
  const type = String(message.type ?? '');
  if (type === 'LOAD_NEW_TAB_PREFS') {
    return { ok: true, prefs: loadPreviewPrefs() };
  }
  if (type === 'SAVE_NEW_TAB_PREFS') {
    const update = isRecord(message.update) ? message.update : {};
    const prefs = normalizePrefs({ ...loadPreviewPrefs(), ...update });
    localStorage.setItem(PREVIEW_PREFS_KEY, JSON.stringify(prefs));
    return { ok: true, prefs };
  }
  if (type === 'GET_DASHBOARD_DATA') {
    return {
      ok: true,
      data: buildPreviewDashboardData(String(message.query ?? ''), String(message.folder ?? '')),
    };
  }
  if (type === 'UPDATE_SAVED_CLIP') {
    return { ok: true };
  }
  if (type === 'DELETE_SAVED_CLIP') {
    const target = isRecord(message.target) ? message.target : {};
    const targetUrl = String(target.url ?? '');
    const index = PREVIEW_CARDS.findIndex((card) => card.url === targetUrl || card.canonicalUrl === targetUrl);
    if (index < 0) return { ok: false, deleted: false, error: '未找到要删除的收藏' };
    PREVIEW_CARDS.splice(index, 1);
    return { ok: true, deleted: true };
  }
  if (type === 'CAPTURE_LAST_ACTIVE') {
    return { ok: true, queued: false, path: 'preview/current-page.md' };
  }
  if (type === 'IMPORT_BROWSER_BOOKMARKS') {
    return { ok: true, imported: PREVIEW_CARDS.length, total: PREVIEW_CARDS.length };
  }
  return { ok: false, error: `预览模式未实现消息：${type}` };
}

function loadPreviewPrefs(): Prefs {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(PREVIEW_PREFS_KEY) || '{}'));
  } catch {
    return DEFAULT_PREFS;
  }
}

function buildPreviewDashboardData(query: string, folder: string): DashboardData {
  const normalized = query.trim().toLowerCase();
  const cards = PREVIEW_CARDS
    .filter((card) => !folder || card.folder?.startsWith(folder))
    .filter((card) => {
      if (!normalized) return true;
      return [
        card.title,
        card.domain,
        card.folder ?? '',
        card.summary,
        ...card.tags,
        ...card.keywords,
      ].join(' ').toLowerCase().includes(normalized);
    });
  const folders = previewFolders(PREVIEW_CARDS);
  const clips = PREVIEW_CARDS.filter((card) => card.source === 'clip');
  const bookmarks = PREVIEW_CARDS.filter((card) => card.source === 'bookmark');
  return {
    stats: {
      total: PREVIEW_CARDS.length,
      clips: clips.length,
      bookmarks: bookmarks.length,
      queued: 0,
      unvisited: 7,
      visited: PREVIEW_CARDS.length - 7,
    },
    folders,
    cards,
    recent: clips.slice(0, 5),
    revisit: PREVIEW_CARDS[2],
  };
}

function previewFolders(cards: DashboardCard[]): BookmarkFolderOption[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const parts = (card.folder || '书签栏').split(' / ').filter(Boolean);
    for (let i = 1; i <= parts.length; i += 1) {
      const path = parts.slice(0, i).join(' / ');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([path, count]) => ({ path, count }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function previewCard(
  url: string,
  title: string,
  domain: string,
  folder: string,
  source: 'clip' | 'bookmark',
  tags: string[],
  summary: string,
): DashboardCard {
  return {
    url,
    canonicalUrl: url,
    title,
    domain,
    path: `preview/${domain}.md`,
    source,
    sourceLabel: source === 'bookmark' ? '书签' : '剪藏',
    folder,
    faviconUrl: `${new URL(url).origin}/favicon.ico`,
    summary,
    tags,
    keywords: tags,
    aliases: [],
    intent: '',
    why: summary,
    clipped: '2026-07-04T00:00:00.000Z',
    queued: false,
    revived: 0,
    lastVisited: '',
    initial: (title || domain).slice(0, 1).toUpperCase(),
  };
}

function cardHtml(card: DashboardCard): string {
  return `
    <article class="bookmark-card" data-url="${escapeAttr(card.url)}" title="${escapeAttr(card.title || card.url)}">
      <div class="icon-wrap">${faviconHtml(card)}</div>
      <div class="card-copy">
        <div class="card-title">${escapeHtml(card.title || card.url)}</div>
        <div class="card-meta">${escapeHtml(card.domain)}</div>
      </div>
      <button class="edit-card" type="button" aria-label="编辑 ${escapeAttr(card.title || card.url)}">编辑</button>
    </article>
  `;
}

function placeholderCardHtml(_index: number): string {
  return `<article class="bookmark-card placeholder-card" aria-hidden="true"><div class="icon-wrap"></div><div class="card-copy"><div class="card-title">&nbsp;</div><div class="card-meta">&nbsp;</div></div></article>`;
}

function detailItemHtml(card: DashboardCard): string {
  const meta = card.folder ? `${card.domain} · ${card.folder}` : card.domain;
  return `
    <article class="detail-item" data-url="${escapeAttr(card.url)}" title="${escapeAttr(card.title || card.url)}">
      <button class="detail-main" type="button">
        ${faviconHtml(card, 'small-favicon')}
        <span>
          <strong>${escapeHtml(card.title || card.url)}</strong>
          <small>${escapeHtml(meta)}</small>
        </span>
      </button>
      <button class="detail-menu-button" type="button" aria-label="书签操作">⋯</button>
      <div class="detail-menu" role="menu" hidden>
        <button class="detail-menu-edit" type="button" role="menuitem">编辑</button>
        <button class="detail-menu-delete" type="button" role="menuitem">删除</button>
      </div>
    </article>
  `;
}

function compactCardHtml(card: DashboardCard, className: string): string {
  const meta = card.folder ? `${card.domain} · ${folderName(card.folder)}` : card.domain;
  return `
    <button class="dock-action ${escapeAttr(className)}" type="button" data-url="${escapeAttr(card.url)}" title="${escapeAttr(card.title || card.url)}">
      ${faviconHtml(card, 'small-favicon')}
      <span>
        <strong>${escapeHtml(card.title || card.url)}</strong>
        <small>${escapeHtml(meta)}</small>
      </span>
    </button>
  `;
}

function faviconHtml(card: DashboardCard, extraClass = ''): string {
  const initial = (card.initial || card.domain || '?').slice(0, 1).toUpperCase();
  const className = extraClass ? `favicon ${extraClass}` : 'favicon';
  if (!card.faviconUrl) {
    return `<span class="favicon-fallback${extraClass ? ` ${escapeAttr(extraClass)}` : ''}">${escapeHtml(initial)}</span>`;
  }
  return `<img class="${escapeAttr(className)}" src="${escapeAttr(card.faviconUrl)}" alt="" data-initial="${escapeAttr(initial)}" />`;
}

function categoryButton(label: string, folder: string, count: number, extraClass = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `category-button${folder === currentFolder ? ' active' : ''}${extraClass ? ` ${extraClass}` : ''}`;
  btn.innerHTML = `<span>${escapeHtml(label)}</span>${count ? `<b>${count}</b>` : '<b></b>'}`;
  btn.addEventListener('click', () => {
    currentFolder = folder;
    currentPage = 0;
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
    backgroundImageUrl: typeof value.backgroundImageUrl === 'string'
      ? value.backgroundImageUrl.trim()
      : DEFAULT_PREFS.backgroundImageUrl,
    gridColumns: clampInt(value.gridColumns, DEFAULT_PREFS.gridColumns, 2, 12),
    gridRows: clampInt(value.gridRows, DEFAULT_PREFS.gridRows, 1, 8),
    cardRadius: clampInt(value.cardRadius, DEFAULT_PREFS.cardRadius, 0, 50),
    iconSize: clampInt(value.iconSize, DEFAULT_PREFS.iconSize, 50, 150),
    columnGap: clampInt(value.columnGap, DEFAULT_PREFS.columnGap, 0, 120),
    rowGap: clampInt(value.rowGap, DEFAULT_PREFS.rowGap, 0, 120),
    showLabels: typeof value.showLabels === 'boolean' ? value.showLabels : DEFAULT_PREFS.showLabels,
    galleryMode: typeof value.galleryMode === 'boolean' ? value.galleryMode : DEFAULT_PREFS.galleryMode,
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (Number.isNaN(n) || !Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function cardsPerPage(): number {
  return prefs.gridColumns * prefs.gridRows;
}

function statusText(data: DashboardData, query: string, folder: string): string {
  const parts = [
    `${data.stats.total} 条收藏`,
    `${data.stats.clips} 条剪藏`,
    `${data.stats.bookmarks} 个书签`,
  ];
  const trimmedQuery = query.trim();
  if (trimmedQuery) parts.push(`本地筛选：${trimmedQuery}`);
  if (folder) parts.push(`分类：${folderName(folder)}`);
  return parts.join(' · ');
}

function setStatus(message: string) {
  statusEl.textContent = message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cssUrl(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
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
