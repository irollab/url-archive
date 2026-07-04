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
    });
  });

  test('saves valid preferences', async () => {
    await saveNewTabPrefs({ density: 'compact', theme: 'dark', rightPanelCollapsed: true });
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'compact',
      theme: 'dark',
      rightPanelCollapsed: true,
    });
  });

  test('replaces preferences with a normalized full snapshot', async () => {
    await saveNewTabPrefs({ density: 'compact', theme: 'dark', rightPanelCollapsed: true });
    await replaceNewTabPrefs({ density: 'large', theme: 'light', rightPanelCollapsed: false });
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'large',
      theme: 'light',
      rightPanelCollapsed: false,
    });
  });

  test('falls back from invalid stored values', async () => {
    store.new_tab_prefs = { density: 'tiny', theme: 'neon', rightPanelCollapsed: 'yes' };
    await expect(loadNewTabPrefs()).resolves.toEqual({
      density: 'standard',
      theme: 'light',
      rightPanelCollapsed: false,
    });
  });
});
