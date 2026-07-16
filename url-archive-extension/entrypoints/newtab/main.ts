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
import { attachImageLightbox } from '@/lib/lightbox';
import { mountReauthBanner } from '@/lib/reauth-banner';
import { requestOriginAccess, requestTabsAccess } from '@/lib/permissions';
import { affectsSavedClips } from '@/lib/revisit';
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
const backgroundImageFileEl = document.getElementById('backgroundImageFile') as HTMLInputElement;
const wallpaperPreviewEl = document.getElementById('wallpaperPreview') as HTMLButtonElement;
const cycleWallpaperEl = document.getElementById('cycleWallpaper') as HTMLButtonElement;
const clearBackgroundImageEl = document.getElementById('clearBackgroundImage') as HTMLButtonElement;
const wallpaperMaskInputEl = document.getElementById('wallpaperMaskInput') as HTMLInputElement;
const wallpaperMaskValueEl = document.getElementById('wallpaperMaskValue') as HTMLOutputElement;
const wallpaperBlurInputEl = document.getElementById('wallpaperBlurInput') as HTMLInputElement;
const wallpaperBlurValueEl = document.getElementById('wallpaperBlurValue') as HTMLOutputElement;
const webSearchFormEl = document.getElementById('webSearchForm') as HTMLFormElement;
const searchEngineToggleEl = document.getElementById('searchEngineToggle') as HTMLButtonElement;
const searchInputEl = document.getElementById('searchInput') as HTMLInputElement;
const searchBoxVisibleInputEl = document.getElementById('searchBoxVisibleInput') as HTMLInputElement;
const searchBoxWidthInputEl = document.getElementById('searchBoxWidthInput') as HTMLInputElement;
const searchBoxWidthValueEl = document.getElementById('searchBoxWidthValue') as HTMLOutputElement;
const searchBoxRadiusInputEl = document.getElementById('searchBoxRadiusInput') as HTMLInputElement;
const searchBoxRadiusValueEl = document.getElementById('searchBoxRadiusValue') as HTMLOutputElement;
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
const layoutPresetButtons = [...document.querySelectorAll<HTMLButtonElement>('.layout-preset')];
const cardRadiusInputEl = document.getElementById('cardRadiusInput') as HTMLInputElement;
const cardRadiusValueEl = document.getElementById('cardRadiusValue') as HTMLOutputElement;
const iconSizeInputEl = document.getElementById('iconSizeInput') as HTMLInputElement;
const iconSizeValueEl = document.getElementById('iconSizeValue') as HTMLOutputElement;
const columnGapInputEl = document.getElementById('columnGapInput') as HTMLInputElement;
const columnGapValueEl = document.getElementById('columnGapValue') as HTMLOutputElement;
const rowGapInputEl = document.getElementById('rowGapInput') as HTMLInputElement;
const rowGapValueEl = document.getElementById('rowGapValue') as HTMLOutputElement;
const showLabelsInputEl = document.getElementById('showLabelsInput') as HTMLInputElement;
const iconGlowInputEl = document.getElementById('iconGlowInput') as HTMLInputElement;
const fontFamilyInputEl = document.getElementById('fontFamilyInput') as HTMLSelectElement;
const fontShadowInputEl = document.getElementById('fontShadowInput') as HTMLInputElement;
const fontSizeInputEl = document.getElementById('fontSizeInput') as HTMLInputElement;
const fontSizeValueEl = document.getElementById('fontSizeValue') as HTMLOutputElement;
const galleryModeInputEl = document.getElementById('galleryModeInput') as HTMLInputElement;
const domeGalleryEl = document.getElementById('domeGallery') as HTMLDivElement;
const detailListEl = document.getElementById('detailList') as HTMLDivElement;
const rightPanelEl = document.getElementById('rightPanel') as HTMLElement;
const rightDrawerHotspotEl = document.getElementById('rightDrawerHotspot') as HTMLButtonElement;
const revisitWidgetEl = document.getElementById('revisitWidget') as HTMLDivElement;
const recentWidgetEl = document.getElementById('recentWidget') as HTMLDivElement;
const densityButtons = [...document.querySelectorAll<HTMLButtonElement>('.density-button')];
const engineListEl = document.getElementById('engineList') as HTMLDivElement;
const addEngineEl = document.getElementById('addEngine') as HTMLButtonElement;
const engineIconFileEl = document.getElementById('engineIconFile') as HTMLInputElement;
let engineMenuEl!: HTMLDivElement;
let pendingIconEngineId = '';
const themeToggleEl = document.getElementById('themeToggle') as HTMLButtonElement;
const drawerToggleEl = document.getElementById('rightDrawerToggle') as HTMLButtonElement;
const clipCurrentEl = document.getElementById('clipCurrent') as HTMLButtonElement;
const aiRecallEl = document.getElementById('aiRecall') as HTMLButtonElement;
const importButtons = [document.getElementById('importBookmarks') as HTMLButtonElement];
const settingsButtons = [document.getElementById('openSettings') as HTMLButtonElement];
const resetDefaultPrefsEl = document.getElementById('resetDefaultPrefs') as HTMLButtonElement;

type Density = 'compact' | 'standard' | 'large';
type Theme = 'light' | 'dark';
type DisplayFont = 'system' | 'smiley-sans';
type SearchEngineConfig = { id: string; name: string; url: string; icon?: string };

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
  revisits?: DashboardCard[];
};

type Prefs = {
  density: Density;
  theme: Theme;
  rightPanelCollapsed: boolean;
  backgroundImageUrl: string;
  wallpaperMask: number;
  wallpaperBlur: number;
  gridColumns: number;
  gridRows: number;
  cardRadius: number;
  iconSize: number;
  columnGap: number;
  rowGap: number;
  showLabels: boolean;
  galleryMode: boolean;
  iconGlow: boolean;
  searchBoxVisible: boolean;
  searchBoxWidth: number;
  searchBoxRadius: number;
  fontFamily: DisplayFont;
  fontShadow: boolean;
  fontSize: number;
  searchEngines: SearchEngineConfig[];
  searchEngineId: string;
};

type RuntimeResponse<T> = {
  ok?: boolean;
  error?: string;
} & T;

type AIRecallResponse = {
  data?: DashboardData;
  recall?: {
    query: string;
    keywords: string[];
    aliases: string[];
    intent: string;
  };
};

const DEFAULT_SEARCH_ENGINES: SearchEngineConfig[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', icon: '/engine/google.png' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', icon: '/engine/bing_new.png' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s', icon: '/engine/baidu.png' },
  { id: 'yandex', name: 'Yandex', url: 'https://yandex.com/search/?text=%s', icon: '/engine/yandex.png' },
];
const REVISIT_ROTATE_MS = 6000;
const REVISIT_FLASH_MS = 3000;

const DEFAULT_PREFS: Prefs = {
  density: 'large',
  theme: 'light',
  rightPanelCollapsed: true,
  backgroundImageUrl: '',
  wallpaperMask: 58,
  wallpaperBlur: 0,
  gridColumns: 6,
  gridRows: 3,
  cardRadius: 24,
  iconSize: 100,
  columnGap: 48,
  rowGap: 50,
  showLabels: true,
  galleryMode: true,
  iconGlow: true,
  searchBoxVisible: true,
  searchBoxWidth: 75,
  searchBoxRadius: 9,
  fontFamily: 'system',
  fontShadow: true,
  fontSize: 13,
  searchEngines: DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine })),
  searchEngineId: 'google',
};

// 内置壁纸打包在扩展 public/wallpaper 下，默认无远程请求（隐私/审核友好）；
// 用绝对路径（不含扩展 id）便于持久化到 prefs 且开发/发布环境通用。
const DEFAULT_BACKGROUND_IMAGE = '/wallpaper/wallpaper-1.jpg';
const BUILT_IN_WALLPAPERS = [
  DEFAULT_BACKGROUND_IMAGE,
  '/wallpaper/wallpaper-2.jpg',
  '/wallpaper/wallpaper-3.jpg',
  '/wallpaper/wallpaper-4.jpg',
  '/wallpaper/wallpaper-5.jpg',
];
const PREVIEW_PREFS_KEY = 'url_archive_preview_new_tab_prefs';

let prefs: Prefs = DEFAULT_PREFS;
let dashboardData: DashboardData | null = null;
// 已解析图标后的最近一次数据：用于画廊/网格纯视图切换时的同步重渲染（避免异步刷新期间闪现旧内容）
let lastResolvedData: DashboardData | null = null;
let currentFolder = '';
let editingCard: DashboardCard | null = null;
let currentPage = 0;
let totalPages = 1;
let isScrolling = false;
let searchTimer: number | undefined;
let engineSaveTimer: number | undefined;
let dashboardRequestSeq = 0;
let prefsSaveSeq = 0;
let importingBookmarks = false;
let clippingRecentPage = false;
let drawerAutoCloseTimer: number | undefined;
let hotspotHideTimer: number | undefined;
let domeInstance: DomeGallery | null = null;
let revisitCards: DashboardCard[] = [];
let revisitIndex = 0;
let revisitRotateTimer: number | undefined;
let revisitFlashTimer: number | undefined;
let clipsRefreshTimer: number | undefined;

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
  void mountReauthBanner(appEl);
  attachImageLightbox('.donate-codes img');
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
    lastResolvedData = resolvedData;
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
    data.cards.map(resolveDashboardCardImage),
  );
  const revisit = data.revisit ? await resolveDashboardCardImage(data.revisit) : data.revisit;
  const revisits = data.revisits ? await Promise.all(data.revisits.map(resolveDashboardCardImage)) : data.revisits;
  return { ...data, cards, revisit, revisits };
}

async function resolveDashboardCardImage(card: DashboardCard): Promise<DashboardCard> {
  if (!card.faviconUrl || !isImageKey(card.faviconUrl)) return card;
  const resolved = await loadImage(imageKey(card.faviconUrl));
  return resolved ? { ...card, faviconUrl: resolved } : card;
}

/** 画廊模式是否实际生效：首启无书签（且未搜索）时回退网格，以复用其「导入书签」引导卡 */
function shouldShowGallery(): boolean {
  if (!prefs.galleryMode) return false;
  if (!dashboardData) return true; // 收藏数据未知时先按偏好显示，避免加载期闪烁
  const total = dashboardData.stats.total ?? 0;
  const hasQuery = searchInputEl.value.trim() !== '';
  return total > 0 || hasQuery;
}

function renderDashboard(data: DashboardData, query: string, folder: string) {
  renderCategories(data.folders);
  // 无书签的首启态即便偏好画廊模式也回退网格，露出「导入书签」引导卡
  const galleryOn = shouldShowGallery();
  appEl.classList.toggle('gallery-mode', galleryOn);
  domeGalleryEl.hidden = !galleryOn;
  if (galleryOn) {
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
  // 先展示面板并取消待折叠计时，避免异步渲染期间书签栏误触发自动折叠
  editPanelEl.hidden = false;
  window.clearTimeout(drawerAutoCloseTimer);
  editTitleEl.focus();
  await renderEditIconPreview(card);
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
      src: faviconSource(card).src,
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

function emptyCardsHtml(query: string): string {
  const hasSavedItems = (dashboardData?.stats.total ?? 0) > 0;
  if (query || hasSavedItems) {
    return `
      <article class="bookmark-card empty-card">
        <div class="card-title">没有匹配的收藏</div>
        <div class="card-meta">${query ? '换个关键词试试，或按 Enter 搜索网页' : '导入或剪藏后会显示在这里'}</div>
      </article>
    `;
  }

  return `
    <article class="bookmark-card empty-card onboarding-card">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V5Z"/>
          <path d="M9 8h6"/>
          <path d="M9 12h4"/>
        </svg>
      </div>
      <div class="card-title">导入浏览器书签</div>
      <div class="card-meta">首次使用可一键导入 Chrome 书签，导入后会自动生成分类和图标网格。</div>
      <div class="empty-actions">
        <button class="empty-import-action" type="button">立即导入书签</button>
        <button class="empty-settings-action" type="button">更多设置</button>
      </div>
    </article>
  `;
}

function renderCards(cards: DashboardCard[], query: string) {
  if (!cards.length) {
    cardsEl.innerHTML = emptyCardsHtml(query);
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
    pageIndicatorEl.replaceChildren();
    return;
  }

  // 胶囊分页指示器：每 3 页为一组，长条在组内循环移动，令每次翻页都有动效
  const groupStart = Math.floor(currentPage / 3) * 3;
  const count = Math.min(3, totalPages - groupStart);

  // 复用已有圆点元素（不重建 DOM），保证 CSS 宽度过渡生效、长条平滑伸缩
  while (pageIndicatorEl.childElementCount > count) {
    pageIndicatorEl.lastElementChild?.remove();
  }
  while (pageIndicatorEl.childElementCount < count) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'page-dot';
    pageIndicatorEl.appendChild(dot);
  }

  const dots = pageIndicatorEl.children;
  for (let i = 0; i < count; i += 1) {
    const page = groupStart + i;
    const dot = dots[i] as HTMLButtonElement;
    dot.dataset.page = String(page);
    dot.classList.toggle('active', page === currentPage);
    dot.setAttribute('aria-label', `第 ${page + 1} 页，共 ${totalPages} 页`);
  }
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

function handlePageWheel(event: WheelEvent) {
  if (!shouldHandlePageWheel(event)) return;
  handleCardsWheel(event);
}

function shouldHandlePageWheel(event: WheelEvent): boolean {
  if (prefs.galleryMode || totalPages <= 1) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, button, [contenteditable="true"]')) return false;
  if (target.closest('#settingsPanel, #editPanel, #rightPanel, #rightDrawerHotspot, .bottom-dock, .engine-menu')) return false;
  return true;
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
  stopRevisitRotation();
  revisitCards = data.revisits?.length
    ? data.revisits
    : data.revisit
      ? [data.revisit]
      : [];
  revisitIndex = 0;
  renderRevisitWidget();
  startRevisitRotation();

  recentWidgetEl.innerHTML = data.recent.length
    ? data.recent.slice(0, 3).map((card) => compactCardHtml(card, 'recent-card')).join('')
    : '<div>暂无最近剪藏</div>';

  bindOpenableItems(recentWidgetEl);
}

function renderRevisitWidget() {
  const card = revisitCards[revisitIndex];
  revisitWidgetEl.classList.remove('is-flashing');
  revisitWidgetEl.innerHTML = card
    ? compactCardHtml(card, 'revisit-card')
    : '<div>暂无回访建议</div>';
  bindOpenableItems(revisitWidgetEl);
}

function rotateRevisitWidget() {
  if (document.visibilityState !== 'visible' || revisitCards.length <= 1) return;
  revisitIndex = (revisitIndex + 1) % revisitCards.length;
  renderRevisitWidget();
  scheduleRevisitFlash();
}

function scheduleRevisitFlash() {
  window.clearTimeout(revisitFlashTimer);
  revisitWidgetEl.classList.remove('is-flashing');
  if (document.visibilityState !== 'visible' || revisitCards.length <= 1) return;
  revisitFlashTimer = window.setTimeout(() => {
    revisitWidgetEl.classList.add('is-flashing');
  }, Math.max(0, REVISIT_ROTATE_MS - REVISIT_FLASH_MS));
}

function startRevisitRotation() {
  window.clearInterval(revisitRotateTimer);
  scheduleRevisitFlash();
  if (document.visibilityState !== 'visible' || revisitCards.length <= 1) return;
  revisitRotateTimer = window.setInterval(rotateRevisitWidget, REVISIT_ROTATE_MS);
}

function stopRevisitRotation() {
  window.clearInterval(revisitRotateTimer);
  window.clearTimeout(revisitFlashTimer);
  revisitRotateTimer = undefined;
  revisitFlashTimer = undefined;
  revisitWidgetEl.classList.remove('is-flashing');
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
      // 真实图标加载失败时，先用浏览器缓存的站点图标兜底，仍失败再退化为首字母
      const pageUrl = faviconEl.dataset.pageUrl;
      if (pageUrl && faviconEl.dataset.service !== 'true') {
        faviconEl.dataset.service = 'true';
        faviconEl.src = faviconServiceUrl(pageUrl);
        return;
      }
      const fallback = document.createElement('span');
      fallback.className = faviconEl.classList.contains('small-favicon')
        ? 'favicon-fallback small-favicon'
        : 'favicon-fallback';
      fallback.textContent = faviconEl.dataset.initial || '?';
      fallback.setAttribute('style', faviconEl.dataset.fallbackStyle || '');
      faviconEl.replaceWith(fallback);
    });
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
      wallpaperPreviewEl.focus();
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

  // 引擎按钮：点击弹出引擎列表快速切换当前引擎
  setupEngineMenu();
  searchEngineToggleEl.addEventListener('click', (event) => {
    event.stopPropagation();
    if (engineMenuEl.hidden) openEngineMenu();
    else closeEngineMenu();
  });

  // 设置面板：搜索引擎增删改
  addEngineEl.addEventListener('click', () => {
    const engines = [...prefs.searchEngines, { id: createEngineId(), name: '', url: '' }];
    savePrefs({ searchEngines: engines });
  });

  engineListEl.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    const id = target.closest<HTMLElement>('.engine-row')?.dataset.id;
    if (!id) return;
    const engine = prefs.searchEngines.find((item) => item.id === id);
    if (!engine) return;
    if (target.classList.contains('engine-name')) engine.name = target.value;
    else if (target.classList.contains('engine-url')) engine.url = target.value;
    updateSearchEngineButton();
    window.clearTimeout(engineSaveTimer);
    engineSaveTimer = window.setTimeout(() => {
      // 保存时以 DOM 为准，避免异步回写覆盖刚输入的内容
      savePrefs({ searchEngines: collectEnginesFromDom() });
    }, 300);
  });

  engineListEl.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('.engine-row');
    const id = row?.dataset.id;
    if (!id) return;

    if (target.closest('.engine-icon')) {
      // 点击图标 → 上传/替换该引擎的图标
      pendingIconEngineId = id;
      engineIconFileEl.click();
      return;
    }
    if (target.closest('.engine-delete')) {
      const engines = prefs.searchEngines.filter((item) => item.id !== id);
      const update: Partial<Prefs> = { searchEngines: engines };
      if (prefs.searchEngineId === id) update.searchEngineId = engines[0]?.id ?? '';
      savePrefs(update);
    }
  });

  engineIconFileEl.addEventListener('change', async () => {
    const file = engineIconFileEl.files?.[0];
    const id = pendingIconEngineId;
    engineIconFileEl.value = '';
    pendingIconEngineId = '';
    if (!file || !id) return;
    try {
      const dataUrl = await resizeImageFile(file, 128, 128, 0.9);
      const key = toImageKey(`engine-icon-${Date.now()}`);
      await saveImage(key, dataUrl);
      const row = engineListEl.querySelector<HTMLElement>(`.engine-row[data-id="${id}"]`);
      if (row) {
        row.dataset.icon = key;
        const iconBtn = row.querySelector<HTMLElement>('.engine-icon');
        if (iconBtn) await applyEngineIcon(iconBtn, { name: '', icon: key });
      }
      await savePrefs({ searchEngines: collectEnginesFromDom() });
    } catch (error) {
      setStatus(`图标上传失败：${errorMessage(error)}`);
    }
  });

  for (const button of densityButtons) {
    button.addEventListener('click', () => {
      const density = button.dataset.density;
      if (density !== 'compact' && density !== 'standard' && density !== 'large') return;
      savePrefs({ density });
    });
  }

  for (const button of layoutPresetButtons) {
    button.addEventListener('click', () => {
      const columns = parseInt(button.dataset.columns ?? '', 10);
      const rows = parseInt(button.dataset.rows ?? '', 10);
      if (!Number.isFinite(columns) || !Number.isFinite(rows)) return;
      currentPage = 0;
      savePrefs({ gridColumns: columns, gridRows: rows });
      refreshDashboard();
    });
  }

  themeToggleEl.addEventListener('click', () => {
    const nextTheme = prefs.theme === 'dark' ? 'light' : 'dark';
    savePrefs(nextTheme === 'dark'
      ? { theme: nextTheme, wallpaperMask: 68 }
      : { theme: nextTheme, wallpaperMask: 0 });
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

  // 鼠标滑向右侧边缘时显露入口，静止 3s 后自动隐藏
  window.addEventListener('mousemove', (event) => {
    if (event.clientX >= window.innerWidth - HOTSPOT_REVEAL_ZONE) {
      revealHotspot();
    }
  });

  rightPanelEl.addEventListener('mouseenter', () => {
    window.clearTimeout(drawerAutoCloseTimer);
  });

  rightPanelEl.addEventListener('mouseleave', () => {
    scheduleDrawerClose();
  });

  wallpaperPreviewEl.addEventListener('click', () => backgroundImageFileEl.click());
  cycleWallpaperEl.addEventListener('click', () => {
    const current = isImageKey(prefs.backgroundImageUrl)
      ? DEFAULT_BACKGROUND_IMAGE
      : prefs.backgroundImageUrl || DEFAULT_BACKGROUND_IMAGE;
    const index = BUILT_IN_WALLPAPERS.indexOf(current);
    const next = BUILT_IN_WALLPAPERS[(index + 1 + BUILT_IN_WALLPAPERS.length) % BUILT_IN_WALLPAPERS.length];
    savePrefs({ backgroundImageUrl: next === DEFAULT_BACKGROUND_IMAGE ? '' : next });
  });
  backgroundImageFileEl.addEventListener('change', async () => {
    const file = backgroundImageFileEl.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 2560, 1440, 0.85);
      const key = `background-${Date.now()}`;
      await saveImage(key, dataUrl);
      savePrefs({ backgroundImageUrl: toImageKey(key) });
    } catch (error) {
      setStatus(`背景图上传失败：${errorMessage(error)}`);
    }
    backgroundImageFileEl.value = '';
  });

  wallpaperMaskInputEl.addEventListener('input', () => {
    const value = parseInt(wallpaperMaskInputEl.value, 10);
    wallpaperMaskValueEl.value = `${value}%`;
    savePrefs({ wallpaperMask: value });
  });

  wallpaperBlurInputEl.addEventListener('input', () => {
    const value = parseInt(wallpaperBlurInputEl.value, 10);
    wallpaperBlurValueEl.value = `${value}%`;
    savePrefs({ wallpaperBlur: value });
  });


  clearBackgroundImageEl.addEventListener('click', async () => {
    const oldUrl = prefs.backgroundImageUrl;
    if (isImageKey(oldUrl)) {
      await deleteImage(imageKey(oldUrl)).catch(() => {});
    }
    savePrefs({ backgroundImageUrl: '' });
  });

  for (const button of importButtons) {
    button.addEventListener('click', () => {
      importBookmarks();
    });
  }

  cardsEl.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.empty-import-action')) {
      event.stopPropagation();
      importBookmarks();
      return;
    }
    if (target.closest('.empty-settings-action')) {
      event.stopPropagation();
      settingsPanelEl.hidden = false;
    }
  });

  for (const button of settingsButtons) {
    button.addEventListener('click', () => {
      openOptionsPage();
    });
  }

  clipCurrentEl.addEventListener('click', async () => {
    captureRecentPage();
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!settingsPanelEl.hidden && !target.closest('#settingsPanel, #settingsToggle')) {
      settingsPanelEl.hidden = true;
    }
    if (target.closest('.detail-menu, .detail-menu-button')) return;
    closeDetailMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetailMenus();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startRevisitRotation();
    else stopRevisitRotation();
  });

  // 后台在别处剪藏/补 AI/导入书签时会写入剪藏存储，已打开的新标签页据此自动刷新，
  // 无需重开页面即可让「最近剪藏」等区块更新；防抖以合并两阶段剪藏的连续写入
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!affectsSavedClips(changes, areaName)) return;
    window.clearTimeout(clipsRefreshTimer);
    clipsRefreshTimer = window.setTimeout(() => {
      refreshDashboard();
    }, 250);
  });

  aiRecallEl.addEventListener('click', () => {
    runAIRecall();
  });

  document.addEventListener('wheel', handlePageWheel, { passive: false });

  pageIndicatorEl.addEventListener('click', (event) => {
    const dot = (event.target as HTMLElement).closest<HTMLButtonElement>('.page-dot');
    if (!dot?.dataset.page) return;
    const page = Number(dot.dataset.page);
    if (page === currentPage) return;
    currentPage = page;
    refreshCardsPage();
  });

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

  iconGlowInputEl.addEventListener('change', () => {
    savePrefs({ iconGlow: iconGlowInputEl.checked });
  });

  fontFamilyInputEl.addEventListener('change', () => {
    const fontFamily = fontFamilyInputEl.value === 'smiley-sans' ? 'smiley-sans' : 'system';
    savePrefs({ fontFamily });
  });

  fontShadowInputEl.addEventListener('change', () => {
    savePrefs({ fontShadow: fontShadowInputEl.checked });
  });

  fontSizeInputEl.addEventListener('input', () => {
    const value = parseInt(fontSizeInputEl.value, 10);
    fontSizeValueEl.value = String(value);
    savePrefs({ fontSize: value });
  });

  galleryModeInputEl.addEventListener('change', () => {
    currentPage = 0;
    savePrefs({ galleryMode: galleryModeInputEl.checked });
    // 纯视图切换、数据未变：用缓存同步重渲染，避免异步刷新期间露出旧 cardsEl 内容（导入引导闪现）
    if (lastResolvedData) {
      renderDashboard(lastResolvedData, searchInputEl.value, currentFolder);
    } else {
      refreshDashboard();
    }
  });

  searchBoxVisibleInputEl.addEventListener('change', () => {
    savePrefs({ searchBoxVisible: !searchBoxVisibleInputEl.checked });
  });

  searchBoxWidthInputEl.addEventListener('input', () => {
    const value = parseInt(searchBoxWidthInputEl.value, 10);
    searchBoxWidthValueEl.value = `${value}%`;
    savePrefs({ searchBoxWidth: value });
  });

  searchBoxRadiusInputEl.addEventListener('input', () => {
    const value = parseInt(searchBoxRadiusInputEl.value, 10);
    searchBoxRadiusValueEl.value = `${value}px`;
    savePrefs({ searchBoxRadius: value });
  });

  resetDefaultPrefsEl.addEventListener('click', async () => {
    const oldUrl = prefs.backgroundImageUrl;
    if (isImageKey(oldUrl)) {
      await deleteImage(imageKey(oldUrl)).catch(() => {});
    }
    currentPage = 0;
    await savePrefs({ ...DEFAULT_PREFS });
    refreshDashboard();
    setStatus('已恢复默认设置');
  });
}

function openDrawerTemporarily() {
  window.clearTimeout(drawerAutoCloseTimer);
  if (prefs.rightPanelCollapsed) {
    savePrefs({ rightPanelCollapsed: false });
  }
}

function scheduleDrawerClose() {
  if (!editPanelEl.hidden) return;
  window.clearTimeout(drawerAutoCloseTimer);
  drawerAutoCloseTimer = window.setTimeout(() => {
    // 计时结束时再次确认：编辑面板已打开则保持展开，避免中断编辑
    if (!editPanelEl.hidden) return;
    closeEditPanel();
    savePrefs({ rightPanelCollapsed: true });
  }, 360);
}

/** 鼠标进入右侧这个宽度内即视为“滑向右侧”，显露书签入口 */
const HOTSPOT_REVEAL_ZONE = 140;
/** 鼠标静止这么久后自动隐藏入口 */
const HOTSPOT_IDLE_HIDE_MS = 3000;

/** 显露书签入口，并在鼠标静止 3s 后自动淡出；抽屉已展开（入口不可用）时跳过 */
function revealHotspot() {
  if (rightDrawerHotspotEl.hidden) return;
  rightDrawerHotspotEl.classList.add('revealed');
  window.clearTimeout(hotspotHideTimer);
  hotspotHideTimer = window.setTimeout(() => {
    rightDrawerHotspotEl.classList.remove('revealed');
  }, HOTSPOT_IDLE_HIDE_MS);
}

function openWebSearch() {
  const query = searchInputEl.value.trim();
  if (!query) return;
  const engine = getCurrentEngine();
  if (!engine?.url) return;
  const encoded = encodeURIComponent(query);
  const url = engine.url.includes('%s') ? engine.url.replaceAll('%s', encoded) : `${engine.url}${encoded}`;
  openTab(url);
}

async function runAIRecall() {
  const query = searchInputEl.value.trim();
  if (!query) {
    setStatus('输入想找回的内容后，再点击 AI 找回。');
    searchInputEl.focus();
    return;
  }

  aiRecallEl.disabled = true;
  aiRecallEl.textContent = '找回中';
  setStatus('AI 正在理解你的找回意图...');

  try {
    const res = await sendRuntimeMessage({
      type: 'AI_RECALL',
      query,
      folder: currentFolder,
    }) as RuntimeResponse<AIRecallResponse>;

    if (!res?.ok || !res.data || !res.recall) {
      throw new Error(res?.error ?? 'AI 找回失败');
    }

    dashboardData = res.data;
    currentPage = 0;
    renderDashboard(res.data, query, currentFolder);
    const count = res.data.cards.length;
    const recallTerms = res.recall.query ? `：${res.recall.query}` : '';
    setStatus(`AI 找回完成，找到 ${count} 条结果${recallTerms}`);
  } catch (error) {
    if (isAIConfigError(error)) {
      setStatus(`AI 找回需要先配置 AI：${errorMessage(error)}。可从右上角设置进入扩展配置。`);
    } else {
      setStatus(`AI 找回失败，已使用本地搜索：${errorMessage(error)}`);
    }
    currentPage = 0;
    refreshDashboard();
  } finally {
    aiRecallEl.disabled = false;
    aiRecallEl.textContent = 'AI 找回';
    searchInputEl.focus();
  }
}

async function applyPrefs() {
  appEl.classList.remove('density-compact', 'density-standard', 'density-large', 'theme-light', 'theme-dark', 'right-collapsed', 'right-panel-open');
  appEl.classList.add(`density-${prefs.density}`, `theme-${prefs.theme}`);
  appEl.classList.toggle('right-collapsed', prefs.rightPanelCollapsed);
  appEl.classList.toggle('right-panel-open', !prefs.rightPanelCollapsed);
  rightPanelEl.classList.toggle('open', !prefs.rightPanelCollapsed);
  rightDrawerHotspotEl.hidden = !prefs.rightPanelCollapsed;
  if (prefs.rightPanelCollapsed) {
    revealHotspot(); // 首次加载与每次关闭抽屉后：先回显入口，再 3s 自动隐藏
  } else {
    window.clearTimeout(hotspotHideTimer);
    rightDrawerHotspotEl.classList.remove('revealed');
  }
  const resolvedUrl = await resolveImageUrl(prefs.backgroundImageUrl);
  const imageUrl = resolvedUrl || DEFAULT_BACKGROUND_IMAGE;
  appEl.style.setProperty('--wallpaper-image', `url("${cssUrl(imageUrl)}")`);
  appEl.style.setProperty('--wallpaper-mask', String(prefs.wallpaperMask / 100));
  appEl.style.setProperty('--wallpaper-blur', `${Math.round(prefs.wallpaperBlur * 0.24)}px`);
  appEl.style.setProperty('--wallpaper-blur-value', String(prefs.wallpaperBlur));
  appEl.style.setProperty('--grid-columns', String(prefs.gridColumns));
  appEl.style.setProperty('--grid-rows', String(prefs.gridRows));
  appEl.style.setProperty('--card-radius', `${prefs.cardRadius}px`);
  appEl.style.setProperty('--icon-size', String(prefs.iconSize / 100));
  appEl.style.setProperty('--column-gap', `${prefs.columnGap}px`);
  appEl.style.setProperty('--row-gap', `${prefs.rowGap}px`);
  appEl.style.setProperty('--search-box-width', String(prefs.searchBoxWidth));
  appEl.style.setProperty('--search-box-radius', `${prefs.searchBoxRadius}px`);
  appEl.style.setProperty(
    '--page-font-family',
    prefs.fontFamily === 'smiley-sans'
      ? '"Smiley Sans", Inter, "SF Pro Display", "Segoe UI", system-ui, sans-serif'
      : 'Inter, "SF Pro Display", "Segoe UI", system-ui, sans-serif',
  );
  appEl.style.setProperty('--page-font-size', `${prefs.fontSize}px`);
  appEl.classList.toggle('hide-labels', !prefs.showLabels);
  appEl.classList.toggle('hide-search-box', !prefs.searchBoxVisible);
  appEl.classList.toggle('gallery-mode', shouldShowGallery());
  appEl.classList.toggle('font-shadow', prefs.fontShadow);
  appEl.classList.toggle('icon-glow', prefs.iconGlow);
  domeGalleryEl.hidden = !shouldShowGallery();

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
  wallpaperMaskInputEl.value = String(prefs.wallpaperMask);
  wallpaperMaskValueEl.value = `${prefs.wallpaperMask}%`;
  wallpaperBlurInputEl.value = String(prefs.wallpaperBlur);
  wallpaperBlurValueEl.value = `${prefs.wallpaperBlur}%`;
  showLabelsInputEl.checked = !prefs.showLabels;
  iconGlowInputEl.checked = prefs.iconGlow;
  fontFamilyInputEl.value = prefs.fontFamily;
  fontShadowInputEl.checked = prefs.fontShadow;
  fontSizeInputEl.value = String(prefs.fontSize);
  fontSizeValueEl.value = String(prefs.fontSize);
  galleryModeInputEl.checked = prefs.galleryMode;
  searchBoxVisibleInputEl.checked = !prefs.searchBoxVisible;
  searchBoxWidthInputEl.value = String(prefs.searchBoxWidth);
  searchBoxWidthValueEl.value = `${prefs.searchBoxWidth}%`;
  searchBoxRadiusInputEl.value = String(prefs.searchBoxRadius);
  searchBoxRadiusValueEl.value = `${prefs.searchBoxRadius}px`;

  for (const button of densityButtons) {
    button.classList.toggle('active', button.dataset.density === prefs.density);
  }
  for (const button of layoutPresetButtons) {
    const columns = parseInt(button.dataset.columns ?? '', 10);
    const rows = parseInt(button.dataset.rows ?? '', 10);
    button.classList.toggle('active', columns === prefs.gridColumns && rows === prefs.gridRows);
  }
  updateSearchEngineButton();
  // 结构变化（增删）时才重建配置列表，避免编辑输入时丢失焦点
  if (engineListEl.childElementCount !== prefs.searchEngines.length) {
    renderEngineList();
  }
}

function createEngineId(): string {
  return crypto.randomUUID?.() ?? `engine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCurrentEngine(): SearchEngineConfig | undefined {
  return prefs.searchEngines.find((engine) => engine.id === prefs.searchEngineId) ?? prefs.searchEngines[0];
}

function engineLabel(engine: { name: string }): string {
  return (engine.name.trim()[0] ?? '?').toUpperCase();
}

// 有图标显示图标，否则回退为名称首字母
async function applyEngineIcon(target: HTMLElement, engine: { name: string; icon?: string } | undefined) {
  const resolved = engine?.icon ? await resolveImageUrl(engine.icon) : null;
  if (resolved) {
    const img = document.createElement('img');
    img.className = 'engine-icon-img';
    img.src = resolved;
    img.alt = engine?.name ?? '';
    target.replaceChildren(img);
  } else {
    target.textContent = engine ? engineLabel(engine) : '?';
  }
}

function updateSearchEngineButton() {
  const engine = getCurrentEngine();
  searchEngineToggleEl.title = engine ? `当前搜索引擎：${engine.name || '(未命名)'}（点击切换）` : '未配置搜索引擎';
  void applyEngineIcon(searchEngineToggleEl, engine);
}

function collectEnginesFromDom(): SearchEngineConfig[] {
  return [...engineListEl.querySelectorAll<HTMLElement>('.engine-row')].map((row) => {
    const engine: SearchEngineConfig = {
      id: row.dataset.id ?? createEngineId(),
      name: (row.querySelector('.engine-name') as HTMLInputElement).value,
      url: (row.querySelector('.engine-url') as HTMLInputElement).value,
    };
    if (row.dataset.icon) engine.icon = row.dataset.icon;
    return engine;
  });
}

function renderEngineList() {
  engineListEl.replaceChildren(
    ...prefs.searchEngines.map((engine) => {
      const row = document.createElement('div');
      row.className = 'engine-row';
      row.dataset.id = engine.id;
      if (engine.icon) row.dataset.icon = engine.icon;

      const icon = document.createElement('button');
      icon.className = 'engine-icon';
      icon.type = 'button';
      icon.title = '上传图标';
      icon.setAttribute('aria-label', '上传搜索引擎图标');
      void applyEngineIcon(icon, engine);

      const name = document.createElement('input');
      name.className = 'engine-name';
      name.type = 'text';
      name.placeholder = '名称';
      name.value = engine.name;

      const url = document.createElement('input');
      url.className = 'engine-url';
      url.type = 'text';
      url.placeholder = 'https://…?q=%s';
      url.value = engine.url;

      const del = document.createElement('button');
      del.className = 'engine-delete';
      del.type = 'button';
      del.title = '删除';
      del.setAttribute('aria-label', '删除搜索引擎');
      del.textContent = '×';

      row.append(icon, name, url, del);
      return row;
    }),
  );
}

function setupEngineMenu() {
  engineMenuEl = document.createElement('div');
  engineMenuEl.className = 'engine-menu';
  engineMenuEl.setAttribute('role', 'listbox');
  engineMenuEl.hidden = true;
  document.body.appendChild(engineMenuEl);

  engineMenuEl.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLButtonElement>('.engine-menu-item');
    if (!item?.dataset.id) return;
    closeEngineMenu();
    savePrefs({ searchEngineId: item.dataset.id });
    searchInputEl.focus();
  });
  document.addEventListener('click', (event) => {
    if (engineMenuEl.hidden) return;
    const target = event.target as Node;
    if (engineMenuEl.contains(target) || searchEngineToggleEl.contains(target)) return;
    closeEngineMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !engineMenuEl.hidden) closeEngineMenu();
  });
  window.addEventListener('resize', () => {
    if (!engineMenuEl.hidden) closeEngineMenu();
  });
}

function openEngineMenu() {
  // 每次打开按最新配置渲染，挂在 body 上按钮定位，避开搜索框 overflow:hidden 裁剪
  engineMenuEl.replaceChildren(
    ...prefs.searchEngines.map((engine) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `engine-menu-item${engine.id === prefs.searchEngineId ? ' active' : ''}`;
      item.dataset.id = engine.id;
      item.setAttribute('role', 'option');
      const mark = document.createElement('span');
      mark.className = 'engine-menu-mark';
      void applyEngineIcon(mark, engine);
      const name = document.createElement('span');
      name.className = 'engine-menu-name';
      name.textContent = engine.name || '(未命名)';
      item.append(mark, name);
      return item;
    }),
  );
  const rect = searchEngineToggleEl.getBoundingClientRect();
  engineMenuEl.style.left = `${rect.left}px`;
  engineMenuEl.style.top = `${rect.bottom + 8}px`;
  engineMenuEl.hidden = false;
  searchEngineToggleEl.setAttribute('aria-expanded', 'true');
}

function closeEngineMenu() {
  engineMenuEl.hidden = true;
  searchEngineToggleEl.setAttribute('aria-expanded', 'false');
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
    const canReadTabs = await requestTabsAccess();
    if (!canReadTabs) {
      setStatus('已跳过：可在目标网页用扩展图标「剪藏本页」。');
      return;
    }

    const target = await sendRuntimeMessage({
      type: 'GET_LAST_ACTIVE_ORIGIN',
    }) as RuntimeResponse<{ origin?: string }>;

    if (!target?.ok || !target.origin) {
      throw new Error(target?.error ?? '没有找到可剪藏的最近网页');
    }

    const granted = await requestOriginAccess([target.origin]);
    if (!granted) {
      setStatus('已跳过：可在目标网页用扩展图标「剪藏本页」。');
      return;
    }

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
  for (const button of getImportActionButtons()) {
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
    for (const button of getImportActionButtons()) {
      button.disabled = false;
    }
  }
}

function getImportActionButtons(): HTMLButtonElement[] {
  return [
    ...importButtons,
    ...cardsEl.querySelectorAll<HTMLButtonElement>('.empty-import-action'),
  ];
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
  if (type === 'GET_LAST_ACTIVE_ORIGIN') {
    return { ok: true, origin: 'https://example.com/*' };
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

// 用浏览器已缓存的站点图标（chrome _favicon 服务），比猜测 /favicon.ico 更可靠、不会挂起
function faviconServiceUrl(pageUrl: string, size = 64): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

// faviconUrl 是否只是 origin/favicon.ico 的猜测值（并非真实捕获/自定义的图标）
function isGuessedFavicon(card: DashboardCard): boolean {
  if (!card.faviconUrl) return false;
  try {
    return card.faviconUrl === `${new URL(card.url).origin}/favicon.ico`;
  } catch {
    return false;
  }
}

// 图标显示源：优先真实捕获/自定义图标，其次浏览器缓存图标，最后由调用方回退首字母
function faviconSource(card: DashboardCard): { src: string; isService: boolean } {
  if (card.faviconUrl && !isGuessedFavicon(card)) return { src: card.faviconUrl, isService: false };
  if (/^https?:/i.test(card.url)) return { src: faviconServiceUrl(card.url), isService: true };
  return { src: '', isService: false };
}

function faviconHtml(card: DashboardCard, extraClass = ''): string {
  const initial = (card.initial || card.domain || '?').slice(0, 1).toUpperCase();
  const className = extraClass ? `favicon ${extraClass}` : 'favicon';
  const colorStyle = domainColorStyle(card.domain || card.url);
  const { src, isService } = faviconSource(card);
  if (!src) {
    return `<span class="favicon-fallback${extraClass ? ` ${escapeAttr(extraClass)}` : ''}" style="${escapeAttr(colorStyle)}">${escapeHtml(initial)}</span>`;
  }
  return `<img class="${escapeAttr(className)}" src="${escapeAttr(src)}" alt="" data-page-url="${escapeAttr(card.url)}" data-service="${isService ? 'true' : ''}" data-initial="${escapeAttr(initial)}" data-fallback-style="${escapeAttr(colorStyle)}" />`;
}

function domainColorStyle(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  return `--fallback-hue: ${hue}; --fallback-bg: hsl(${hue} 54% 44%); --fallback-bg-soft: hsl(${hue} 62% 58%)`;
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

function normalizeEngines(value: unknown): SearchEngineConfig[] {
  if (!Array.isArray(value)) return DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine }));
  const engines = value
    .filter((raw): raw is SearchEngineConfig =>
      !!raw && typeof raw === 'object'
      && typeof (raw as SearchEngineConfig).id === 'string'
      && typeof (raw as SearchEngineConfig).name === 'string'
      && typeof (raw as SearchEngineConfig).url === 'string')
    .map((raw) => {
      const engine: SearchEngineConfig = { id: raw.id, name: raw.name, url: raw.url };
      const icon = typeof raw.icon === 'string' && raw.icon
        ? raw.icon
        : DEFAULT_SEARCH_ENGINES.find((preset) => preset.id === engine.id)?.icon;
      if (icon) engine.icon = icon;
      return engine;
    });
  return engines.length ? engines : DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine }));
}

function normalizePrefs(value: Partial<Prefs>): Prefs {
  const normalized: Prefs = {
    density: value.density === 'compact' || value.density === 'large' ? value.density : 'standard',
    theme: value.theme === 'dark' ? 'dark' : 'light',
    rightPanelCollapsed: typeof value.rightPanelCollapsed === 'boolean'
      ? value.rightPanelCollapsed
      : DEFAULT_PREFS.rightPanelCollapsed,
    backgroundImageUrl: typeof value.backgroundImageUrl === 'string'
      ? value.backgroundImageUrl.trim()
      : DEFAULT_PREFS.backgroundImageUrl,
    wallpaperMask: clampInt(value.wallpaperMask, DEFAULT_PREFS.wallpaperMask, 0, 100),
    wallpaperBlur: clampInt(value.wallpaperBlur, DEFAULT_PREFS.wallpaperBlur, 0, 100),
    gridColumns: clampInt(value.gridColumns, DEFAULT_PREFS.gridColumns, 2, 12),
    gridRows: clampInt(value.gridRows, DEFAULT_PREFS.gridRows, 1, 8),
    cardRadius: clampInt(value.cardRadius, DEFAULT_PREFS.cardRadius, 0, 50),
    iconSize: clampInt(value.iconSize, DEFAULT_PREFS.iconSize, 50, 150),
    columnGap: clampInt(value.columnGap, DEFAULT_PREFS.columnGap, 0, 120),
    rowGap: clampInt(value.rowGap, DEFAULT_PREFS.rowGap, 0, 120),
    showLabels: typeof value.showLabels === 'boolean' ? value.showLabels : DEFAULT_PREFS.showLabels,
    galleryMode: typeof value.galleryMode === 'boolean' ? value.galleryMode : DEFAULT_PREFS.galleryMode,
    iconGlow: typeof value.iconGlow === 'boolean' ? value.iconGlow : DEFAULT_PREFS.iconGlow,
    searchBoxVisible: typeof value.searchBoxVisible === 'boolean' ? value.searchBoxVisible : DEFAULT_PREFS.searchBoxVisible,
    searchBoxWidth: clampInt(value.searchBoxWidth, DEFAULT_PREFS.searchBoxWidth, 50, 100),
    searchBoxRadius: clampInt(value.searchBoxRadius, DEFAULT_PREFS.searchBoxRadius, 0, 50),
    fontFamily: value.fontFamily === 'smiley-sans' ? 'smiley-sans' : DEFAULT_PREFS.fontFamily,
    fontShadow: typeof value.fontShadow === 'boolean' ? value.fontShadow : DEFAULT_PREFS.fontShadow,
    fontSize: clampInt(value.fontSize, DEFAULT_PREFS.fontSize, 10, 18),
    searchEngines: normalizeEngines(value.searchEngines),
    searchEngineId: typeof value.searchEngineId === 'string' && value.searchEngineId
      ? value.searchEngineId
      : DEFAULT_PREFS.searchEngineId,
  };
  if (
    normalized.gridColumns === 5 &&
    normalized.gridRows === 2 &&
    normalized.cardRadius === 26 &&
    normalized.columnGap === 24 &&
    normalized.rowGap === 30
  ) {
    return {
      ...normalized,
      gridColumns: DEFAULT_PREFS.gridColumns,
      gridRows: DEFAULT_PREFS.gridRows,
      cardRadius: DEFAULT_PREFS.cardRadius,
      columnGap: DEFAULT_PREFS.columnGap,
      rowGap: DEFAULT_PREFS.rowGap,
    };
  }
  if (
    normalized.gridColumns === 6 &&
    normalized.gridRows === 3 &&
    normalized.cardRadius === DEFAULT_PREFS.cardRadius &&
    normalized.iconSize === DEFAULT_PREFS.iconSize &&
    normalized.columnGap === 38 &&
    normalized.rowGap === 44
  ) {
    return {
      ...normalized,
      columnGap: DEFAULT_PREFS.columnGap,
      rowGap: DEFAULT_PREFS.rowGap,
    };
  }
  return normalized;
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

function isAIConfigError(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes('未配置 AI API 端点')
    || message.includes('未配置 AI API Key')
    || message.includes('未配置 AI 模型');
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
