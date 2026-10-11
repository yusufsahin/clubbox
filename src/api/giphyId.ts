/** Extract a Giphy id from a pasted URL or raw id (no Giphy API key). */
export function parseGiphyId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^[A-Za-z0-9]+$/.test(raw) && raw.length >= 4 && raw.length <= 64) {
    return raw;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (!host.endsWith('giphy.com')) return null;

  // https://giphy.com/gifs/slug-abcXYZ123 or /gifs/abcXYZ123
  const gifMatch = url.pathname.match(/\/gifs\/(?:[^/]+-)?([A-Za-z0-9]+)\/?$/);
  if (gifMatch?.[1]) return gifMatch[1];

  // https://media.giphy.com/media/abcXYZ123/giphy.gif
  // https://i.giphy.com/abcXYZ123.gif
  const mediaMatch = url.pathname.match(/\/(?:media\/)?([A-Za-z0-9]+)(?:\/|\.gif|$)/i);
  if (mediaMatch?.[1] && mediaMatch[1].toLowerCase() !== 'media') return mediaMatch[1];

  return null;
}
