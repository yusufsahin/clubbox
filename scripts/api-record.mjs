import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const extra = process.argv.slice(2).filter((arg) => arg.startsWith('--role=') || arg.startsWith('--profile='));
const child = spawn(electronPath, ['.', '--api-recorder', ...extra], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CLUBBOX_API_RECORDER: '1' },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
