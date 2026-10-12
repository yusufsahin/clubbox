/**
 * Lazy QR encoding for the Open-on-phone sheet (Phase 30.3).
 * Loads `qrcode` only when a sheet needs an image.
 */

type QrModule = {
  toDataURL: (text: string, opts?: Record<string, unknown>) => Promise<string>;
};

export async function qrCodeDataUrl(text: string, size = 168): Promise<string> {
  const mod = await import('qrcode') as QrModule & { default?: QrModule };
  const api = typeof mod.toDataURL === 'function' ? mod : mod.default;
  if (!api || typeof api.toDataURL !== 'function') {
    throw new Error('qrcode.toDataURL unavailable');
  }
  return api.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}
