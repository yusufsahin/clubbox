const fs = require('fs');
const path = require('path');

/** Crash recovery only keeps a room marker for six hours. */
const STALE_ROOM_MAX_MS = 6 * 60 * 60 * 1000;
const CHANNEL_ID = /^[A-Za-z0-9_-]{1,80}$/;

function lastRoomPath(userData) {
  return path.join(userData, 'last-room.json');
}

function writeLastRoom(userData, channel, now = Date.now()) {
  if (typeof channel !== 'string' || !CHANNEL_ID.test(channel)) return false;
  fs.mkdirSync(userData, { recursive: true });
  const payload = { channel, joinedAt: new Date(now).toISOString() };
  fs.writeFileSync(lastRoomPath(userData), JSON.stringify(payload));
  return true;
}

function clearLastRoom(userData) {
  try {
    fs.unlinkSync(lastRoomPath(userData));
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
}

/**
 * @returns {{ action: 'none' | 'drop' | 'leave', channel?: string }}
 * `leave` = marker is younger than six hours. `drop` = unreadable or expired (delete, do not call).
 */
function peekStaleRoom(userData, now = Date.now()) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(lastRoomPath(userData), 'utf8'));
  } catch {
    return { action: 'none' };
  }
  if (!raw || typeof raw.channel !== 'string' || !CHANNEL_ID.test(raw.channel)) {
    return { action: 'drop' };
  }
  const joinedAt = Date.parse(raw.joinedAt);
  if (!Number.isFinite(joinedAt) || now - joinedAt >= STALE_ROOM_MAX_MS) {
    return { action: 'drop' };
  }
  return { action: 'leave', channel: raw.channel };
}

module.exports = {
  STALE_ROOM_MAX_MS,
  writeLastRoom,
  clearLastRoom,
  peekStaleRoom,
};
