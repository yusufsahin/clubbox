import assert from 'node:assert/strict';
import test from 'node:test';
import { roomPhoneUrl, roomPhoneUrlFromChannel } from '../src/api/roomPhoneLink.ts';
import { phoneModerationHelpCard } from '../src/ui/components/phoneModerationHelp.ts';
import { openOnPhoneSheet } from '../src/ui/components/openOnPhoneSheet.ts';
import { markup } from '../src/ui/html.ts';
import { qrCodeDataUrl } from '../src/ui/qrCode.ts';

test('roomPhoneUrl builds the canonical Clubhouse room link', () => {
  assert.equal(roomPhoneUrl('PG2LoOww'), 'https://www.clubhouse.com/room/PG2LoOww');
  assert.equal(roomPhoneUrl('  ab_c-1  '), 'https://www.clubhouse.com/room/ab_c-1');
  assert.equal(roomPhoneUrl(''), '');
  assert.equal(roomPhoneUrl('../evil'), '');
  assert.equal(roomPhoneUrl('https://evil.example/x'), '');
});

test('roomPhoneUrlFromChannel prefers channel over channel_id', () => {
  assert.equal(
    roomPhoneUrlFromChannel({ channel: 'PG2LoOww', channel_id: 99 }),
    'https://www.clubhouse.com/room/PG2LoOww',
  );
  assert.equal(
    roomPhoneUrlFromChannel({ channel: '', channel_id: 'AltRoom1' }),
    'https://www.clubhouse.com/room/AltRoom1',
  );
});

test('openOnPhoneSheet and help card render link and copy controls', () => {
  const url = roomPhoneUrl('PG2LoOww');
  const sheet = markup(openOnPhoneSheet({
    roomUrl: url,
    qrDataUrl: 'data:image/png;base64,AAA',
    qrPending: false,
  }));
  assert.match(sheet, /data-open-on-phone-sheet/);
  assert.match(sheet, /PG2LoOww/);
  assert.match(sheet, /data-action="copy-open-on-phone-link"/);
  assert.match(sheet, /data:image\/png;base64,AAA/);

  const help = markup(phoneModerationHelpCard());
  assert.match(help, /data-phone-moderation-help/);
  assert.match(help, /phone-mod-help-list/);
});

test('qrCodeDataUrl encodes the room link (lazy qrcode)', async () => {
  const url = roomPhoneUrl('PG2LoOww');
  const dataUrl = await qrCodeDataUrl(url, 128);
  assert.match(dataUrl, /^data:image\/png;base64,/);
  assert.ok(dataUrl.length > 100);
});
