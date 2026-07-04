import { describe, expect, test } from 'vitest';
import { buildTiles, colorForSeed, computeItemBaseRotation, type DomeItem } from './dome-gallery';

const item = (n: string): DomeItem => ({ src: `${n}.ico`, title: n, url: `https://${n}`, initial: n[0].toUpperCase() });

describe('dome-gallery helpers', () => {
  test('buildTiles fills every slot by cycling the pool', () => {
    const pool = [item('a'), item('b'), item('c')];
    const tiles = buildTiles(pool, 35);
    expect(tiles.length).toBeGreaterThan(pool.length);
    expect(tiles.every((t) => t.src !== '')).toBe(true);
    expect(tiles.every((t) => t.sizeX === 2 && t.sizeY === 2)).toBe(true);
  });

  test('buildTiles returns empty tiles for an empty pool', () => {
    const tiles = buildTiles([], 35);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.src === '' && t.url === '')).toBe(true);
  });

  test('colorForSeed is stable and returns hsl', () => {
    expect(colorForSeed('github.com')).toBe(colorForSeed('github.com'));
    expect(colorForSeed('github.com')).toMatch(/^hsl\(/);
  });

  test('computeItemBaseRotation is centered at origin', () => {
    const r = computeItemBaseRotation(0, 0, 2, 2, 35);
    const unit = 360 / 35 / 2;
    expect(r.rotateY).toBeCloseTo(unit * 0.5);
    expect(r.rotateX).toBeCloseTo(unit * -0.5);
  });
});
