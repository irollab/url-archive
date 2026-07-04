const KEY = 'new_tab_prefs';

export type NewTabDensity = 'compact' | 'standard' | 'large';
export type NewTabTheme = 'light' | 'dark';

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
  searchBoxVisible: boolean;
  searchBoxWidth: number;
  searchBoxRadius: number;
}

const DEFAULT_PREFS: NewTabPrefs = {
  density: 'standard',
  theme: 'light',
  rightPanelCollapsed: false,
  backgroundImageUrl: '',
  wallpaperMask: 58,
  wallpaperBlur: 0,
  gridColumns: 6,
  gridRows: 3,
  cardRadius: 24,
  iconSize: 100,
  columnGap: 42,
  rowGap: 54,
  showLabels: true,
  galleryMode: false,
  searchBoxVisible: true,
  searchBoxWidth: 75,
  searchBoxRadius: 9,
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
    searchBoxVisible: typeof raw.searchBoxVisible === 'boolean' ? raw.searchBoxVisible : DEFAULT_PREFS.searchBoxVisible,
    searchBoxWidth: positiveInt(raw.searchBoxWidth, DEFAULT_PREFS.searchBoxWidth, 50, 100),
    searchBoxRadius: positiveInt(raw.searchBoxRadius, DEFAULT_PREFS.searchBoxRadius, 0, 50),
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
  return prefs;
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
