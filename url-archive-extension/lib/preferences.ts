const KEY = 'new_tab_prefs';

export type NewTabDensity = 'compact' | 'standard' | 'large';
export type NewTabTheme = 'light' | 'dark';

export interface NewTabPrefs {
  density: NewTabDensity;
  theme: NewTabTheme;
  rightPanelCollapsed: boolean;
}

const DEFAULT_PREFS: NewTabPrefs = {
  density: 'standard',
  theme: 'light',
  rightPanelCollapsed: false,
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

export function normalizePrefs(value: unknown): NewTabPrefs {
  const raw = isRecord(value) ? value : {};
  return {
    density: isDensity(raw.density) ? raw.density : DEFAULT_PREFS.density,
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_PREFS.theme,
    rightPanelCollapsed: typeof raw.rightPanelCollapsed === 'boolean'
      ? raw.rightPanelCollapsed
      : DEFAULT_PREFS.rightPanelCollapsed,
  };
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
