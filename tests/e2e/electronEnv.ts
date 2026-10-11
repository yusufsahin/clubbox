/** Strip Cursor/VS Code ELECTRON_RUN_AS_NODE so Playwright can launch Electron. */
export function cleanElectronEnv(
  base: NodeJS.ProcessEnv = process.env,
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
