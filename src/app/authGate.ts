/** Pure gate: desktop live mode requires a web session before the app shell. */

export type AuthGateInput = {
  isElectron: boolean;
  forceSandbox?: boolean;
  useSandbox: boolean;
  webSession: boolean;
};

export function needsAuthGate(input: AuthGateInput): boolean {
  if (!input.isElectron) return false;
  if (input.forceSandbox) return false;
  if (input.useSandbox) return false;
  if (input.webSession) return false;
  return true;
}
