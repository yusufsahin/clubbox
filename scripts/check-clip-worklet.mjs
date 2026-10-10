import fs from 'node:fs';

const target = 'dist/clip-processor.js';
if (!fs.existsSync(target)) {
  console.error(`Clip worklet is missing from the build: ${target}`);
  process.exit(1);
}
