'use strict';

/**
 * Signals that the official clubhouse.com window has left the phone/SMS
 * surface and Clubbox may adopt cookies via POST /web_api/me.
 * Cookie *values* are never logged or returned.
 */

function cookieName(cookie) {
  if (typeof cookie === 'string') return cookie;
  return String(cookie?.name || '');
}

function isIgnorableClubhouseCookie(name) {
  const n = String(name || '');
  if (!n) return true;
  if (/csrf/i.test(n)) return true;
  return /^(__stripe|_ga|_gid|_gat|__cf|_cf|_fbp|_gcl)/i.test(n);
}

/**
 * Clubhouse sets the web session as HttpOnly (not in document.cookie).
 * The name has been `sessionid` and has also been an unnamed-to-us Host cookie.
 * Treat known session-ish names, plus any unknown HttpOnly first-party cookie.
 */
function cookieLooksLikeSession(cookie) {
  const n = cookieName(cookie);
  if (isIgnorableClubhouseCookie(n)) return false;
  if (/sessionid|^session$|auth|jwt|refresh|sid|logged|token|identity/i.test(n)) return true;
  return typeof cookie === 'object' && cookie != null && cookie.httpOnly === true;
}

function pathLooksSignedIn(pathname) {
  const p = String(pathname || '').split('?')[0].toLowerCase();
  if (!p) return false;
  if (p === '/signin' || p.startsWith('/signin/')) return false;
  if (p === '/login' || p.startsWith('/login/')) return false;
  if (p === '/signout' || p.startsWith('/signout/')) return false;
  if (p === '/home' || p.startsWith('/home/')) return true;
  if (p.startsWith('/beta/pwa')) return true;
  if (p.startsWith('/room/')) return true;
  if (p.startsWith('/@')) return true;
  if (p.startsWith('/ch/')) return true;
  if (p.startsWith('/house/')) return true;
  if (p.startsWith('/replay/')) return true;
  return false;
}

function urlLooksSignedIn(target) {
  try {
    return pathLooksSignedIn(new URL(String(target || '')).pathname);
  } catch {
    return false;
  }
}

module.exports = {
  cookieLooksLikeSession,
  isIgnorableClubhouseCookie,
  pathLooksSignedIn,
  urlLooksSignedIn,
};
