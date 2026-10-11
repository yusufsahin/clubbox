const STORAGE_KEY = 'clubbox_hallway_prefs';

/** Mirrors HallwayPrivacy without importing hallwayDisplay (avoids a cycle). */
export type StoredHallwayPrivacy = 'public' | 'friend' | 'friend_of_friend' | 'house' | 'dm' | 'other';

const STORED_PRIVACIES = new Set<string>(['public', 'friend', 'friend_of_friend', 'house', 'dm', 'other']);

export type HallwayPrefs = {
  keywords: string[];
  showNsfw: boolean;
  onlyKeywordMatches: boolean;
  savedSearchColumns: string[];
  selectedPrivacy: StoredHallwayPrivacy | null;
};

export const defaultHallwayPrefs = (): HallwayPrefs => ({
  keywords: [],
  showNsfw: false,
  onlyKeywordMatches: false,
  savedSearchColumns: [],
  selectedPrivacy: null,
});

function readSelectedPrivacy(value: unknown): StoredHallwayPrivacy | null {
  if (typeof value !== 'string' || !value) return null;
  return STORED_PRIVACIES.has(value) ? (value as StoredHallwayPrivacy) : null;
}

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
      selectedPrivacy: readSelectedPrivacy(parsed.selectedPrivacy),
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
      selectedPrivacy: prefs.selectedPrivacy,
    }));
  } catch {
    // ignore quota / private mode
  }
}
