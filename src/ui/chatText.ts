import { escapeHtml, raw, safeUrl, type SafeHtml } from './html.ts';

/** http(s) or www. — trailing punctuation stripped before validation. */
const CHAT_URL = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCT = /[.,);:!?]+$/;

/** Prefer https for the system browser; reject non-http(s) schemes via safeUrl. */
export function normalizeChatHref(rawUrl: string): string | null {
  let candidate = rawUrl.trim();
  if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
  else if (/^http:\/\//i.test(candidate)) candidate = `https://${candidate.slice('http://'.length)}`;
  return safeUrl(candidate);
}

/**
 * Escape chat text and turn URLs into external links (Electron opens via
 * shell.openExternal on target=_blank).
 */
export function linkifyChatMessage(message: string): SafeHtml {
  if (!message) return raw('');
  let out = '';
  let last = 0;
  CHAT_URL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHAT_URL.exec(message)) !== null) {
    const start = match.index;
    let candidate = match[0];
    const punct = candidate.match(TRAILING_PUNCT)?.[0] ?? '';
    if (punct) candidate = candidate.slice(0, -punct.length);
    out += escapeHtml(message.slice(last, start));
    const href = normalizeChatHref(candidate);
    if (href) {
      out += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(candidate)}</a>`;
      out += escapeHtml(punct);
    } else {
      out += escapeHtml(match[0]);
    }
    last = start + match[0].length;
  }
  out += escapeHtml(message.slice(last));
  return raw(out);
}
