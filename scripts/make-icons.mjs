import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { Resvg } from '@resvg/resvg-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(path.join(root, 'public', 'favicon.svg'));

function render(size) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  return Buffer.from(png);
}

function toIco(images) {
  let offset = 6 + images.length * 16;
  const entries = images.map((image) => {
    const entry = Buffer.alloc(16);
    const box = image.size >= 256 ? 0 : image.size;
    entry.writeUInt8(box, 0);
    entry.writeUInt8(box, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.png.length;
    return entry;
  });
  const directory = Buffer.alloc(6);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  return Buffer.concat([directory, ...entries, ...images.map((image) => image.png)]);
}

mkdirSync(path.join(root, 'build'), { recursive: true });
writeFileSync(path.join(root, 'build', 'icon.png'), render(1024));
const ico = toIco([16, 32, 48, 256].map((size) => ({ size, png: render(size) })));
writeFileSync(path.join(root, 'build', 'icon.ico'), ico);
console.log('[Clubbox] wrote build/icon.png and build/icon.ico');
