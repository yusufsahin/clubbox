/**
 * Privacy filter for local API captures.
 * Apply this before anything is written to disk. One instance keeps a
 * stable user_1, user_2… map for the recorder session.
 */

const DROP_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrftoken',
  'ch-deviceid',
]);

const SECRET_KEY = /token|csrf|cookie|password|code|phone|email|rc_token|secret|signature/i;
const NAME_KEY = /^(name|full_name|display_name|first_name|last_name|username|user_name|alias)$/i;
const PHOTO_KEY = /photo|avatar|image_url|thumbnail/i;
const ID_KEY = /(^id$|_id$|^uid$)/i;
const HEADER_BAG_KEY = /headers$/i;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createRedactor() {
  const users = new Map();
  const known = [];
  let nextUser = 1;

  function userPlaceholder(value) {
    const text = String(value);
    if (users.has(text)) return users.get(text);
    const placeholder = `user_${nextUser}`;
    nextUser += 1;
    users.set(text, placeholder);
    known.push({ raw: text, placeholder });
    known.sort((a, b) => b.raw.length - a.raw.length);
    return placeholder;
  }

  function rememberIdentity(key, value) {
    if (typeof value !== 'string' || value.trim().length < 2) return;
    if (SECRET_KEY.test(key)) return;
    if (NAME_KEY.test(key) || PHOTO_KEY.test(key) || isPhotoUrl(value)) {
      userPlaceholder(value.trim());
    }
  }

  function collect(value, key, depth) {
    if (depth > 12 || value == null) return;
    if (typeof key === 'string') rememberIdentity(key, value);
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry, undefined, depth + 1);
      return;
    }
    if (!isPlainObject(value)) return;
    if (typeof key === 'string' && SECRET_KEY.test(key)) return;
    for (const [childKey, child] of Object.entries(value)) {
      if (HEADER_BAG_KEY.test(childKey) && isPlainObject(child)) {
        for (const [header, headerValue] of Object.entries(child)) {
          if (DROP_HEADERS.has(header.toLowerCase())) continue;
          collect(headerValue, header, depth + 1);
        }
        continue;
      }
      collect(child, childKey, depth + 1);
    }
  }

  function scrubString(value, preserve) {
    if (preserve) return value;
    let text = String(value);
    text = text.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<redacted>');
    text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted>');
    text = text.replace(/\+?\d[\d\s()-]{8,}\d/g, '<redacted>');
    text = text.replace(/[A-Fa-f0-9]{32,}/g, '<redacted>');
    text = text.replace(/[A-Za-z0-9+/]{32,}={0,2}/g, '<redacted>');
    for (const entry of known) {
      if (entry.raw.length < 2) continue;
      if (!text.includes(entry.raw)) continue;
      text = text.split(entry.raw).join(entry.placeholder);
    }
    return text;
  }

  function transform(value, key, depth, preserveKeys) {
    if (depth > 12) return null;
    const preserve = typeof key === 'string' && preserveKeys.has(key);
    if (typeof key === 'string' && SECRET_KEY.test(key) && !preserve) return '<redacted>';
    if (typeof key === 'string' && ID_KEY.test(key) && isIdValue(value)) return '<id>';
    if (typeof key === 'string' && typeof value === 'string' && !SECRET_KEY.test(key)) {
      if (NAME_KEY.test(key) || PHOTO_KEY.test(key) || isPhotoUrl(value)) {
        return userPlaceholder(value.trim());
      }
    }
    if (typeof value === 'string') return scrubString(value, preserve);
    if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
    if (Array.isArray(value)) return value.map((entry) => transform(entry, undefined, depth + 1, preserveKeys));
    if (!isPlainObject(value)) return null;

    const output = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (HEADER_BAG_KEY.test(childKey) && isPlainObject(child)) {
        const headers = {};
        for (const [header, headerValue] of Object.entries(child)) {
          if (DROP_HEADERS.has(header.toLowerCase())) continue;
          headers[header] = transform(headerValue, header, depth + 1, preserveKeys);
        }
        output[childKey] = headers;
        continue;
      }
      output[childKey] = transform(child, childKey, depth + 1, preserveKeys);
    }
    return output;
  }

  function redact(value, options) {
    const preserveKeys = new Set(options?.preserveKeys || []);
    collect(value, undefined, 0);
    return transform(value, undefined, 0, preserveKeys);
  }

  return { redact, userPlaceholder };
}

function isIdValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  return typeof value === 'string' && /^\d+$/.test(value);
}

function isPhotoUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(value)
    || /cloudfront|googleusercontent|clubhouse.*(?:img|image|photo)|imgproxy/i.test(value);
}

function outputHasLeak(text) {
  const pattern = new RegExp([
    '\\+' + '90',
    '@' + 'gmail',
    '@' + 'yusufsahin',
    'ey' + 'J[A-Za-z0-9_-]{10,}',
    'csrf' + 'token=',
  ].join('|'));
  return pattern.test(String(text));
}

module.exports = { createRedactor, outputHasLeak, DROP_HEADERS };
