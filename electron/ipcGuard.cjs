const routes = require('./webApiRoutes.json');

const WEB_AUTH = new Set([
  'start_phone_number_web_auth',
  'complete_phone_number_web_auth',
  'resend_phone_number_auth',
]);

const HEADER_NAMES = new Set([
  'content-type',
  'accept',
  'user-agent',
  'ch-languages',
  'ch-locale',
  'ch-appversion',
  'ch-appbuild',
  'ch-deviceid',
  'ch-web-appversion',
  'ch-web-version',
  'x-clubbox-web-session',
]);

function isAllowedEndpoint(name) {
  return WEB_AUTH.has(name) || Object.prototype.hasOwnProperty.call(routes, name);
}

function isPlainPayload(value, depth) {
  if (value == null) return true;
  if (typeof value === 'string') return value.length <= 4000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (depth > 5) return false;
  if (Array.isArray(value)) {
    if (value.length > 40) return false;
    return value.every((entry) => isPlainPayload(entry, depth + 1));
  }
  if (typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Object.keys(value);
  if (keys.length > 40) return false;
  return keys.every((key) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && isPlainPayload(value[key], depth + 1));
}

function pickHeaders(incoming) {
  const headers = {};
  if (!incoming || typeof incoming !== 'object') return headers;
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== 'string' || value.length > 512) continue;
    if (!HEADER_NAMES.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  return headers;
}

module.exports = { isAllowedEndpoint, isPlainPayload, pickHeaders };
