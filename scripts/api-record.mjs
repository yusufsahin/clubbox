import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn(electronPath, ['.', '--api-recorder'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CLUBBOX_API_RECORDER: '1' },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
