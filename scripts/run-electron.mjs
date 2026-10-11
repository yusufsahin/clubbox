import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cleanElectronEnv } from './electronEnv.mjs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const args = process.argv.slice(2);

const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env: cleanElectronEnv(),
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
