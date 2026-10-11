export type RecordingChapter = { atSec: number; title: string };

export function formatChapterTimestamp(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, '0')).join(':');
}

export function normalizeChapters(chapters: RecordingChapter[]): RecordingChapter[] {
  const sorted = [...chapters].sort((a, b) => a.atSec - b.atSec);
  if (sorted.length === 0 || sorted[0].atSec > 0) {
    return [{ atSec: 0, title: 'Intro' }, ...sorted];
  }
  return sorted;
}

export function buildChapterFileContent(chapters: RecordingChapter[]): string {
  const rows = normalizeChapters(chapters);
  const youtube = rows.map((row) => `${formatChapterTimestamp(row.atSec)} ${row.title}`).join('\n');
  const spotify = rows.map((row) => `(${formatChapterTimestamp(row.atSec)}) ${row.title}`).join('\n');
  return `# YouTube\n${youtube}\n\n# Spotify\n${spotify}\n`;
}

export function chapterFilename(recordingDownloadName: string): string {
  const base = recordingDownloadName.replace(/\.[^.]+$/, '');
  return `${base}.chapters.txt`;
}
