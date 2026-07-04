import { beforeEach, describe, expect, test, vi } from 'vitest';
import { loadNewTabPrefs, replaceNewTabPrefs, saveNewTabPrefs } from './preferences';

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
    });
  });

  test('saves valid preferences', async () => {
    await saveNewTabPrefs({
      density: 'compact',
      theme: 'dark',
      rightPanelCollapsed: true,
      backgroundImageUrl: 'https://example.com/wallpaper.jpg',
      gridColumns: 6,
      gridRows: 3,
      cardRadius: 16,
      iconSize: 120,
      columnGap: 40,
      rowGap: 50,
      showLabels: false,
      galleryMode: true,
    });
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'compact',
      theme: 'dark',
      rightPanelCollapsed: true,
      backgroundImageUrl: 'https://example.com/wallpaper.jpg',
      gridColumns: 6,
      gridRows: 3,
      cardRadius: 16,
      iconSize: 120,
      columnGap: 40,
      rowGap: 50,
      showLabels: false,
      galleryMode: true,
    });
  });

  test('replaces preferences with a normalized full snapshot', async () => {
    await saveNewTabPrefs({
      density: 'compact',
      theme: 'dark',
      rightPanelCollapsed: true,
      backgroundImageUrl: 'https://example.com/old.jpg',
      gridColumns: 8,
      gridRows: 4,
      cardRadius: 0,
      iconSize: 150,
      columnGap: 120,
      rowGap: 120,
      showLabels: false,
      galleryMode: false,
    });
    await replaceNewTabPrefs({
      density: 'large',
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
    });
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'large',
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
    });
  });

  test('falls back from invalid stored values', async () => {
    store.new_tab_prefs = {
      density: 'tiny',
      theme: 'neon',
      rightPanelCollapsed: 'yes',
      backgroundImageUrl: 42,
      gridColumns: 'many',
      gridRows: null,
      cardRadius: -10,
      iconSize: 'big',
      columnGap: -5,
      rowGap: 999,
      showLabels: 'no',
    };
    await expect(loadNewTabPrefs()).resolves.toEqual({
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
    });
  });

  test('normalizes galleryMode', async () => {
    store.new_tab_prefs = { galleryMode: 'yes' };
    await expect(loadNewTabPrefs()).resolves.toMatchObject({ galleryMode: false });

    store.new_tab_prefs = { galleryMode: true };
    await expect(loadNewTabPrefs()).resolves.toMatchObject({ galleryMode: true });
  });
});
