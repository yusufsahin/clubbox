const STORAGE_KEY = 'clubbox_hallway_prefs';

export type HallwayPrefs = {
  keywords: string[];
  showNsfw: boolean;
};

export const defaultHallwayPrefs = (): HallwayPrefs => ({
  keywords: [],
  showNsfw: false,
});

export function readHallwayPrefs(): HallwayPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultHallwayPrefs();
    const parsed = JSON.parse(raw) as Partial<HallwayPrefs>;
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      : [];
    return { keywords, showNsfw: parsed.showNsfw === true };
  } catch {
    return defaultHallwayPrefs();
  }
}

export function writeHallwayPrefs(prefs: HallwayPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      keywords: prefs.keywords,
      showNsfw: prefs.showNsfw,
    }));
  } catch {
    // ignore quota / private mode
  }
}
