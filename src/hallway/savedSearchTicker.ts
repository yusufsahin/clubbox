import { readHallwayPrefs, writeHallwayPrefs, type HallwayPrefs } from './hallwayPrefs.ts';

export const SAVED_SEARCH_INTERVAL_MS = 60_000;
export const SAVED_SEARCH_HIDDEN_PAUSE_MS = 2 * 60_000;

export type SavedSearchDeps = {
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
  now: () => number;
  isHidden: () => boolean;
  onSearch: (query: string) => void;
};

/** Slow refresh for saved hallway search columns; pauses while the window is hidden. */
export class SavedSearchTicker {
  private timerId: number | null = null;
  private hiddenSince: number | null = null;
  private deps: SavedSearchDeps;

  constructor(deps: SavedSearchDeps) {
    this.deps = deps;
  }

  columns(): string[] {
    return [...readHallwayPrefs().savedSearchColumns];
  }

  saveColumn(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;
    const prefs = readHallwayPrefs();
    if (prefs.savedSearchColumns.includes(trimmed)) return;
    writeHallwayPrefs({
      ...prefs,
      savedSearchColumns: [...prefs.savedSearchColumns, trimmed],
    });
    this.ensureTimer();
  }

  setHidden(hidden: boolean): void {
    if (hidden) {
      if (this.hiddenSince == null) this.hiddenSince = this.deps.now();
      if (this.timerId != null) {
        this.deps.clearInterval(this.timerId);
        this.timerId = null;
      }
      return;
    }
    this.hiddenSince = null;
    this.ensureTimer();
  }

  /** Called when fake clock advances (BDD) or on each interval tick (live). */
  tick(): void {
    if (this.deps.isHidden()) {
      if (this.hiddenSince == null) this.hiddenSince = this.deps.now();
      return;
    }
    if (this.hiddenSince != null) {
      const hiddenFor = this.deps.now() - this.hiddenSince;
      if (hiddenFor >= SAVED_SEARCH_HIDDEN_PAUSE_MS) return;
      this.hiddenSince = null;
    }
    for (const query of this.columns()) {
      this.deps.onSearch(query);
    }
  }

  ensureTimer(): void {
    if (this.timerId != null || this.deps.isHidden()) return;
    this.timerId = this.deps.setInterval(() => this.tick(), SAVED_SEARCH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timerId != null) {
      this.deps.clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

export function mergeSavedColumns(prefs: HallwayPrefs, query: string): HallwayPrefs {
  const trimmed = query.trim();
  if (!trimmed || prefs.savedSearchColumns.includes(trimmed)) return prefs;
  return { ...prefs, savedSearchColumns: [...prefs.savedSearchColumns, trimmed] };
}
