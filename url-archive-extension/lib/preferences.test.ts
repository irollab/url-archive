import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SEARCH_ENGINES, loadNewTabPrefs, replaceNewTabPrefs, saveNewTabPrefs } from './preferences';

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(store, obj); }),
      },
    },
  };
});

describe('new tab preferences', () => {
  test('loads defaults when no preferences are saved', async () => {
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'large',
      theme: 'light',
      rightPanelCollapsed: false,
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
      searchEngines: DEFAULT_SEARCH_ENGINES,
      searchEngineId: 'google',
    });
  });

  test('saves valid preferences', async () => {
    await saveNewTabPrefs({
      density: 'compact',
      theme: 'dark',
      rightPanelCollapsed: true,
      backgroundImageUrl: 'https://example.com/wallpaper.jpg',
      wallpaperMask: 72,
      wallpaperBlur: 35,
      gridColumns: 6,
      gridRows: 3,
      cardRadius: 16,
      iconSize: 120,
      columnGap: 40,
      rowGap: 50,
      showLabels: false,
      galleryMode: true,
      iconGlow: false,
      searchBoxVisible: false,
      searchBoxWidth: 92,
      searchBoxRadius: 18,
      fontFamily: 'smiley-sans',
      fontShadow: false,
      fontSize: 16,
      searchEngines: DEFAULT_SEARCH_ENGINES,
      searchEngineId: 'google',
    });
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'compact',
      theme: 'dark',
      rightPanelCollapsed: true,
      backgroundImageUrl: 'https://example.com/wallpaper.jpg',
      wallpaperMask: 72,
      wallpaperBlur: 35,
      gridColumns: 6,
      gridRows: 3,
      cardRadius: 16,
      iconSize: 120,
      columnGap: 40,
      rowGap: 50,
      showLabels: false,
      galleryMode: true,
      iconGlow: false,
      searchBoxVisible: false,
      searchBoxWidth: 92,
      searchBoxRadius: 18,
      fontFamily: 'smiley-sans',
      fontShadow: false,
      fontSize: 16,
      searchEngines: DEFAULT_SEARCH_ENGINES,
      searchEngineId: 'google',
    });
  });

  test('replaces preferences with a normalized full snapshot', async () => {
    await saveNewTabPrefs({
      density: 'compact',
      theme: 'dark',
      rightPanelCollapsed: true,
      backgroundImageUrl: 'https://example.com/old.jpg',
      wallpaperMask: 85,
      wallpaperBlur: 10,
      gridColumns: 8,
      gridRows: 4,
      cardRadius: 0,
      iconSize: 150,
      columnGap: 120,
      rowGap: 120,
      showLabels: false,
      galleryMode: false,
      searchBoxVisible: false,
      searchBoxWidth: 50,
      searchBoxRadius: 50,
      fontFamily: 'smiley-sans',
      fontShadow: false,
      fontSize: 18,
    });
    await replaceNewTabPrefs({
      density: 'large',
      theme: 'light',
      rightPanelCollapsed: false,
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
      galleryMode: false,
      iconGlow: true,
      searchBoxVisible: true,
      searchBoxWidth: 75,
      searchBoxRadius: 9,
      fontFamily: 'system',
      fontShadow: true,
      fontSize: 13,
      searchEngines: DEFAULT_SEARCH_ENGINES,
      searchEngineId: 'google',
    });
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'large',
      theme: 'light',
      rightPanelCollapsed: false,
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
      galleryMode: false,
      iconGlow: true,
      searchBoxVisible: true,
      searchBoxWidth: 75,
      searchBoxRadius: 9,
      fontFamily: 'system',
      fontShadow: true,
      fontSize: 13,
      searchEngines: DEFAULT_SEARCH_ENGINES,
      searchEngineId: 'google',
    });
  });

  test('falls back from invalid stored values', async () => {
    store.new_tab_prefs = {
      density: 'tiny',
      theme: 'neon',
      rightPanelCollapsed: 'yes',
      backgroundImageUrl: 42,
      wallpaperMask: 200,
      wallpaperBlur: 'strong',
      gridColumns: 'many',
      gridRows: null,
      cardRadius: -10,
      iconSize: 'big',
      columnGap: -5,
      rowGap: 999,
      showLabels: 'no',
      searchBoxVisible: 'yes',
      searchBoxWidth: 1000,
      searchBoxRadius: -1,
      fontFamily: 'comic-sans',
      fontShadow: 'no',
      fontSize: 99,
    };
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'large',
      theme: 'light',
      rightPanelCollapsed: false,
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
      searchEngines: DEFAULT_SEARCH_ENGINES,
      searchEngineId: 'google',
    });
  });

  test('normalizes galleryMode', async () => {
    store.new_tab_prefs = { galleryMode: 'yes' };
    await expect(loadNewTabPrefs()).resolves.toMatchObject({ galleryMode: true });

    store.new_tab_prefs = { galleryMode: false };
    await expect(loadNewTabPrefs()).resolves.toMatchObject({ galleryMode: false });
  });
});
