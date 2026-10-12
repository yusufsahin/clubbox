'use strict';

/**
 * Sign-in window only. Clubhouse's SPA may call WebOTP / WebAuthn via
 * navigator.credentials after start_phone; in Electron those APIs hang or
 * open a broken Windows passkey prompt and the SMS form never submits.
 * Fail fast so the page falls back to manual code entry.
 */
const { webFrame } = require('electron');

const stub = `
(() => {
  try {
    const creds = {
      get: () => Promise.reject(Object.assign(new Error('NotSupportedError'), { name: 'NotSupportedError' })),
      create: () => Promise.reject(Object.assign(new Error('NotSupportedError'), { name: 'NotSupportedError' })),
      preventSilentAccess: () => Promise.resolve(),
    };
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      enumerable: true,
      get: () => creds,
    });
  } catch {
    // ignore
  }
})();
`;

try {
  webFrame.executeJavaScript(stub, true).catch(() => {});
} catch {
  // ignore
}
