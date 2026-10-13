import { raw, type SafeHtml } from './html';

/** Compact SVG icons (currentColor) for chrome buttons — not for user content. */
export function icon(name: IconName, size = 18): SafeHtml {
  const s = String(size);
  const open = `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
  const paths: Record<IconName, string> = {
    mic: '<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 19v3"/>',
    micOff: '<path d="M2 2l20 20"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M15 9.34V6a3 3 0 0 0-5.94-.6"/><path d="M18.89 13.23A7 7 0 0 1 5 11"/><path d="M12 19v3"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    musicOff: '<path d="M2 2l20 20"/><path d="M9 9v9"/><path d="M9 5l8.5-1.4"/><circle cx="6" cy="18" r="3"/><path d="M18 12v4"/><circle cx="18" cy="16" r="3"/>',
    hand: '<path d="M8 13V6a1 1 0 0 1 2 0v4"/><path d="M12 11V3a1 1 0 0 1 2 0v8"/><path d="M16 11V5a1 1 0 0 1 2 0v9a5 5 0 0 1-5 5H9.5a4.5 4.5 0 0 1-3.2-7.7L9 8"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    speaker: '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    record: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
    chat: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>',
    details: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/>',
    leave: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  };
  return raw(`${open}${paths[name]}</svg>`);
}

export type IconName =
  | 'mic'
  | 'micOff'
  | 'music'
  | 'musicOff'
  | 'hand'
  | 'smile'
  | 'speaker'
  | 'record'
  | 'chat'
  | 'details'
  | 'leave'
  | 'plus'
  | 'more';
