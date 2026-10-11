const STORAGE_KEY = 'clubbox_hallway_prefs';

export type HallwayPrefs = {
  keywords: string[];
  showNsfw: boolean;
  onlyKeywordMatches: boolean;
  savedSearchColumns: string[];
};

export const defaultHallwayPrefs = (): HallwayPrefs => ({
  keywords: [],
  showNsfw: false,
  onlyKeywordMatches: false,
  savedSearchColumns: [],
});

export function readHallwayPrefs(): HallwayPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultHallwayPrefs();
    const parsed = JSON.parse(raw) as Partial<HallwayPrefs>;
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      : [];
    const savedSearchColumns = Array.isArray(parsed.savedSearchColumns)
      ? parsed.savedSearchColumns.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      : [];
    return {
      keywords,
      showNsfw: parsed.showNsfw === true,
      onlyKeywordMatches: parsed.onlyKeywordMatches === true,
      savedSearchColumns,
    };
  } catch {
    return defaultHallwayPrefs();
  }
}

export function writeHallwayPrefs(prefs: HallwayPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      keywords: prefs.keywords,
      showNsfw: prefs.showNsfw,
      onlyKeywordMatches: prefs.onlyKeywordMatches,
      savedSearchColumns: prefs.savedSearchColumns,
    }));
  } catch {
    // ignore quota / private mode
  }
}
