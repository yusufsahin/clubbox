/** Strip Cursor/VS Code ELECTRON_RUN_AS_NODE so Playwright can launch Electron. */
export function cleanElectronEnv(
  base: NodeJS.ProcessEnv = process.env,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
