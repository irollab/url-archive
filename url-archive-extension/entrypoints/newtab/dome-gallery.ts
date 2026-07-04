export type DomeItem = { src: string; title: string; url: string; initial: string };
export type DomeTile = DomeItem & { x: number; y: number; sizeX: number; sizeY: number };

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
export const normalizeAngle = (d: number) => ((d % 360) + 360) % 360;
export const wrapAngleSigned = (deg: number) => {
  const a = (((deg + 180) % 360) + 360) % 360;
  return a - 180;
};

const EMPTY_ITEM: DomeItem = { src: '', title: '', url: '', initial: '' };

export function buildTiles(pool: DomeItem[], seg: number): DomeTile[] {
  const xCols = Array.from({ length: seg }, (_, i) => -37 + i * 2);
  const evenYs = [-4, -2, 0, 2, 4];
  const oddYs = [-3, -1, 1, 3, 5];
  const coords = xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs;
    return ys.map((y) => ({ x, y, sizeX: 2, sizeY: 2 }));
  });
  if (pool.length === 0) {
    return coords.map((c) => ({ ...c, ...EMPTY_ITEM }));
  }
  const used = Array.from({ length: coords.length }, (_, i) => pool[i % pool.length]);
  // 尽量避免相邻槽位重复同一书签
  for (let i = 1; i < used.length; i++) {
    if (used[i].url === used[i - 1].url) {
      for (let j = i + 1; j < used.length; j++) {
        if (used[j].url !== used[i].url) {
          const tmp = used[i];
          used[i] = used[j];
          used[j] = tmp;
          break;
        }
      }
    }
  }
  return coords.map((c, i) => ({ ...c, ...used[i] }));
}

export function computeItemBaseRotation(
  offsetX: number,
  offsetY: number,
  sizeX: number,
  sizeY: number,
  segments: number,
): { rotateX: number; rotateY: number } {
  const unit = 360 / segments / 2;
  const rotateY = unit * (offsetX + (sizeX - 1) / 2);
  const rotateX = unit * (offsetY - (sizeY - 1) / 2);
  return { rotateX, rotateY };
}

export function colorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 60%, 52%)`;
}
