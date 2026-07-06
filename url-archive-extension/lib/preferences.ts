const KEY = 'new_tab_prefs';

export type NewTabDensity = 'compact' | 'standard' | 'large';
export type NewTabTheme = 'light' | 'dark';
export type NewTabDisplayFont = 'system' | 'smiley-sans';

export interface NewTabSearchEngine {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export interface NewTabPrefs {
  density: NewTabDensity;
  theme: NewTabTheme;
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
  fontFamily: NewTabDisplayFont;
  fontShadow: boolean;
  fontSize: number;
  searchEngines: NewTabSearchEngine[];
  searchEngineId: string;
}

export const DEFAULT_SEARCH_ENGINES: NewTabSearchEngine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', icon: '/engine/google.png' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', icon: '/engine/bing_new.png' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s', icon: '/engine/baidu.png' },
  { id: 'yandex', name: 'Yandex', url: 'https://yandex.com/search/?text=%s', icon: '/engine/yandex.png' },
];

const DEFAULT_PREFS: NewTabPrefs = {
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

export async function loadNewTabPrefs(): Promise<NewTabPrefs> {
  const got = await chrome.storage.local.get(KEY);
  return normalizePrefs(got[KEY]);
}

export async function saveNewTabPrefs(update: Partial<NewTabPrefs>): Promise<NewTabPrefs> {
  const current = await loadNewTabPrefs();
  const next = normalizePrefs({ ...current, ...update });
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function replaceNewTabPrefs(value: NewTabPrefs): Promise<NewTabPrefs> {
  const next = normalizePrefs(value);
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function normalizePrefs(value: unknown): NewTabPrefs {
  const raw = isRecord(value) ? value : {};
  const prefs = {
    density: isDensity(raw.density) ? raw.density : DEFAULT_PREFS.density,
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_PREFS.theme,
    rightPanelCollapsed: typeof raw.rightPanelCollapsed === 'boolean'
      ? raw.rightPanelCollapsed
      : DEFAULT_PREFS.rightPanelCollapsed,
    backgroundImageUrl: typeof raw.backgroundImageUrl === 'string'
      ? raw.backgroundImageUrl.trim()
      : DEFAULT_PREFS.backgroundImageUrl,
    wallpaperMask: positiveInt(raw.wallpaperMask, DEFAULT_PREFS.wallpaperMask, 0, 100),
    wallpaperBlur: positiveInt(raw.wallpaperBlur, DEFAULT_PREFS.wallpaperBlur, 0, 100),
    gridColumns: positiveInt(raw.gridColumns, DEFAULT_PREFS.gridColumns, 2, 12),
    gridRows: positiveInt(raw.gridRows, DEFAULT_PREFS.gridRows, 1, 8),
    cardRadius: positiveInt(raw.cardRadius, DEFAULT_PREFS.cardRadius, 0, 50),
    iconSize: positiveInt(raw.iconSize, DEFAULT_PREFS.iconSize, 50, 150),
    columnGap: positiveInt(raw.columnGap, DEFAULT_PREFS.columnGap, 0, 120),
    rowGap: positiveInt(raw.rowGap, DEFAULT_PREFS.rowGap, 0, 120),
    showLabels: typeof raw.showLabels === 'boolean' ? raw.showLabels : DEFAULT_PREFS.showLabels,
    galleryMode: typeof raw.galleryMode === 'boolean' ? raw.galleryMode : DEFAULT_PREFS.galleryMode,
    iconGlow: typeof raw.iconGlow === 'boolean' ? raw.iconGlow : DEFAULT_PREFS.iconGlow,
    searchBoxVisible: typeof raw.searchBoxVisible === 'boolean' ? raw.searchBoxVisible : DEFAULT_PREFS.searchBoxVisible,
    searchBoxWidth: positiveInt(raw.searchBoxWidth, DEFAULT_PREFS.searchBoxWidth, 50, 100),
    searchBoxRadius: positiveInt(raw.searchBoxRadius, DEFAULT_PREFS.searchBoxRadius, 0, 50),
    fontFamily: isDisplayFont(raw.fontFamily) ? raw.fontFamily : DEFAULT_PREFS.fontFamily,
    fontShadow: typeof raw.fontShadow === 'boolean' ? raw.fontShadow : DEFAULT_PREFS.fontShadow,
    fontSize: positiveInt(raw.fontSize, DEFAULT_PREFS.fontSize, 10, 18),
    searchEngines: normalizeEngines(raw.searchEngines),
    searchEngineId: typeof raw.searchEngineId === 'string' && raw.searchEngineId
      ? raw.searchEngineId
      : DEFAULT_PREFS.searchEngineId,
  };
  if (
    prefs.gridColumns === 5 &&
    prefs.gridRows === 2 &&
    prefs.cardRadius === 26 &&
    prefs.columnGap === 24 &&
    prefs.rowGap === 30
  ) {
    return {
      ...prefs,
      gridColumns: DEFAULT_PREFS.gridColumns,
      gridRows: DEFAULT_PREFS.gridRows,
      cardRadius: DEFAULT_PREFS.cardRadius,
      columnGap: DEFAULT_PREFS.columnGap,
      rowGap: DEFAULT_PREFS.rowGap,
    };
  }
  if (
    prefs.gridColumns === 6 &&
    prefs.gridRows === 3 &&
    prefs.cardRadius === DEFAULT_PREFS.cardRadius &&
    prefs.iconSize === DEFAULT_PREFS.iconSize &&
    prefs.columnGap === 38 &&
    prefs.rowGap === 44
  ) {
    return {
      ...prefs,
      columnGap: DEFAULT_PREFS.columnGap,
      rowGap: DEFAULT_PREFS.rowGap,
    };
  }
  return prefs;
}

function normalizeEngines(value: unknown): NewTabSearchEngine[] {
  if (!Array.isArray(value)) return DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine }));
  const engines = value
    .filter(isRecord)
    .filter((raw) => typeof raw.id === 'string' && typeof raw.name === 'string' && typeof raw.url === 'string')
    .map((raw) => {
      const engine: NewTabSearchEngine = { id: raw.id as string, name: raw.name as string, url: raw.url as string };
      const icon = typeof raw.icon === 'string' && raw.icon
        ? raw.icon
        : DEFAULT_SEARCH_ENGINES.find((preset) => preset.id === engine.id)?.icon;
      if (icon) engine.icon = icon;
      return engine;
    });
  return engines.length ? engines : DEFAULT_SEARCH_ENGINES.map((engine) => ({ ...engine }));
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (Number.isNaN(n) || !Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDensity(value: unknown): value is NewTabDensity {
  return value === 'compact' || value === 'standard' || value === 'large';
}

function isTheme(value: unknown): value is NewTabTheme {
  return value === 'light' || value === 'dark';
}

function isDisplayFont(value: unknown): value is NewTabDisplayFont {
  return value === 'system' || value === 'smiley-sans';
}
