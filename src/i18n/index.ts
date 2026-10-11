import { en, type MessageKey } from './en';
import { tr } from './tr';

export type { MessageKey };
export type Language = 'en' | 'tr';

let language: Language = 'en';

export function setLanguage(next: Language): void {
  language = next;
}

export function getLanguage(): Language {
  return language;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = language === 'tr' ? tr[key] : en[key];
  if (!vars) return text;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
