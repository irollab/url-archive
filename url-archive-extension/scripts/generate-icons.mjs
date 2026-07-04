import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = path.join(root, 'public', 'icon');
const source = path.join(iconDir, 'IROLLAB_dark.svg');

for (const size of [16, 32, 48, 96, 128]) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(path.join(iconDir, `${size}.png`));
}
