import { html, safeUrl, type SafeHtml } from './html';

export interface AvatarUser {
  name?: string | null;
  username?: string | null;
  photo_url?: string | null;
  user_id?: number | null;
}

const installed = { current: false };

function initialsFor(user: AvatarUser): string {
  const name = (user.name || '').trim();
  const username = (user.username || '').trim();
  const source = name || username;
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : source.slice(0, 1);
  return letters.toUpperCase();
}

function colorFor(user: AvatarUser): string {
  const key = user.user_id != null ? String(user.user_id) : (user.username || user.name || '?');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 42% 38%)`;
}

function initialsHtml(user: AvatarUser, size: number, className: string): SafeHtml {
  const initials = initialsFor(user);
  const color = colorFor(user);
  const font = Math.max(11, Math.round(size * 0.36));
  const classes = ['avatar-initials', className].filter(Boolean).join(' ');
  return html`<div class="${classes}" style="width:${size}px;height:${size}px;background:${color};font-size:${font}px;" aria-hidden="true">${initials}</div>`;
}

export function avatarHtml(user: AvatarUser, size: number, className = ''): SafeHtml {
  const photo = safeUrl(user.photo_url);
  if (!photo) return initialsHtml(user, size, className);
  const initials = initialsFor(user);
  const color = colorFor(user);
  const font = Math.max(11, Math.round(size * 0.36));
  return html`<img class="${className}" src="${photo}" alt="" width="${size}" height="${size}" data-avatar-initials="${initials}" data-avatar-color="${color}" data-avatar-font="${font}" data-avatar-class="${className}" />`;
}

export function installAvatarFallback(): void {
  if (installed.current || typeof document === 'undefined') return;
  installed.current = true;
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.avatarInitials) return;
    const size = img.width || Number.parseInt(img.getAttribute('width') || '32', 10);
    const fallback = document.createElement('div');
    const extra = img.dataset.avatarClass || '';
    fallback.className = ['avatar-initials', extra].filter(Boolean).join(' ');
    fallback.textContent = img.dataset.avatarInitials;
    fallback.style.background = img.dataset.avatarColor || 'hsl(220 42% 38%)';
    fallback.style.width = `${size}px`;
    fallback.style.height = `${size}px`;
    fallback.style.fontSize = `${img.dataset.avatarFont || Math.max(11, Math.round(size * 0.36))}px`;
    fallback.setAttribute('aria-hidden', 'true');
    img.replaceWith(fallback);
  }, true);
}
