const APP_PREFS_KEY = 'clubbox_app_prefs';

export type ThemeChoice = 'light' | 'dark' | 'system';

export type AppPrefs = {
  theme: ThemeChoice;
  zoomPercent: number;
  desktopNotifications: boolean;
};

const DEFAULT_PREFS: AppPrefs = {
  theme: 'dark',
  zoomPercent: 100,
  desktopNotifications: false,
};

function clampZoom(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(50, Math.min(200, Math.round(n)));
}

export function readAppPrefs(): AppPrefs {
  try {
    const raw = localStorage.getItem(APP_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    const theme = parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
      ? parsed.theme
      : DEFAULT_PREFS.theme;
    return {
      theme,
      zoomPercent: clampZoom(parsed.zoomPercent),
      desktopNotifications: parsed.desktopNotifications === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeAppPrefs(next: AppPrefs): void {
  try {
    localStorage.setItem(APP_PREFS_KEY, JSON.stringify({
      theme: next.theme,
      zoomPercent: clampZoom(next.zoomPercent),
      desktopNotifications: next.desktopNotifications === true,
    }));
  } catch {
    // ignore quota / private mode
  }
}

/** Resolved palette for BDD / DOM (system follows prefers-color-scheme when provided). */
export function resolvedTheme(
  choice: ThemeChoice,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

export function applyThemeToDocument(choice: ThemeChoice, prefersDark = false): 'light' | 'dark' {
  const resolved = resolvedTheme(choice, prefersDark);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function zoomFactorFromPercent(percent: number): number {
  return clampZoom(percent) / 100;
}

export function adjustZoomPercent(current: number, deltaSteps: number): number {
  const step = 10;
  return clampZoom(current + deltaSteps * step);
}
