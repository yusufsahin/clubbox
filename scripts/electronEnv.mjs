/**
 * VS Code / Cursor terminals often set ELECTRON_RUN_AS_NODE=1, which makes the
 * Electron binary start as plain Node and break app launches / Playwright e2e.
 * Strip it from any env passed to a real Electron process.
 */
export function cleanElectronEnv(base = process.env) {
  const env = { ...base };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
