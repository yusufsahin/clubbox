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

/** Microsoft Store / AppX tile assets (build/appx/). */
const appxDir = path.join(root, 'build', 'appx');
mkdirSync(appxDir, { recursive: true });

function writePng(name, size) {
  writeFileSync(path.join(appxDir, name), render(size));
}

function writeWideLogo() {
  // 310×150: brand mark centered on the product accent (favicon fill).
  const svgWide = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="310" height="150" viewBox="0 0 310 150">
      <rect width="310" height="150" fill="#7952f5"/>
      <g transform="translate(123,43) scale(1)">
        <rect x="26" y="12" width="12" height="22" rx="6" fill="#ffffff"/>
        <path d="M20 28a12 12 0 0 0 24 0" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
        <path d="M32 40v8" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
        <path d="M24 48h16" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`,
  );
  const png = new Resvg(svgWide, { fitTo: { mode: 'width', value: 310 } }).render().asPng();
  writeFileSync(path.join(appxDir, 'Wide310x150Logo.png'), Buffer.from(png));
}

function writeSplash() {
  const svgSplash = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="300" viewBox="0 0 620 300">
      <rect width="620" height="300" fill="#080a0f"/>
      <g transform="translate(278,118)">
        <rect width="64" height="64" rx="16" fill="#7952f5"/>
        <rect x="26" y="12" width="12" height="22" rx="6" fill="#ffffff"/>
        <path d="M20 28a12 12 0 0 0 24 0" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
        <path d="M32 40v8" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
        <path d="M24 48h16" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`,
  );
  const png = new Resvg(svgSplash, { fitTo: { mode: 'width', value: 620 } }).render().asPng();
  writeFileSync(path.join(appxDir, 'SplashScreen.png'), Buffer.from(png));
}

writePng('StoreLogo.png', 50);
writePng('Square44x44Logo.png', 44);
writePng('Square150x150Logo.png', 150);
writePng('Square71x71Logo.png', 71);
writePng('LargeTile.png', 310);
writePng('BadgeLogo.png', 24);
writeFileSync(path.join(appxDir, 'SmallTile.png'), render(71));
writeWideLogo();
writeSplash();

console.log('[Clubbox] wrote build/icon.png, build/icon.ico, and build/appx/*');
