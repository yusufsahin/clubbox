import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lastRoom = require('../electron/lastRoom.cjs') as {
  STALE_ROOM_MAX_MS: number;
  writeLastRoom: (userData: string, channel: string, now?: number) => boolean;
  clearLastRoom: (userData: string) => void;
  peekStaleRoom: (userData: string, now?: number) => { action: 'none' | 'drop' | 'leave'; channel?: string };
};

test('last-room marker writes, clears, and plans a stale leave', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-last-room-'));
  const now = Date.parse('2026-10-12T10:00:00.000Z');
  try {
    assert.equal(lastRoom.peekStaleRoom(dir, now).action, 'none');
    assert.equal(lastRoom.writeLastRoom(dir, 'abc123', now), true);
    const fresh = lastRoom.peekStaleRoom(dir, now + 60_000);
    assert.equal(fresh.action, 'leave');
    assert.equal(fresh.channel, 'abc123');

    lastRoom.clearLastRoom(dir);
    assert.equal(lastRoom.peekStaleRoom(dir, now).action, 'none');
    assert.equal(fs.existsSync(path.join(dir, 'last-room.json')), false);

    lastRoom.writeLastRoom(dir, 'abc123', now);
    const expired = lastRoom.peekStaleRoom(dir, now + lastRoom.STALE_ROOM_MAX_MS);
    assert.equal(expired.action, 'drop');
    assert.equal(expired.channel, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
