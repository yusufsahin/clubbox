import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clipButtonVisible, validateClipDurationSeconds } from '../src/audio/clipRules.ts';

describe('clipRules', () => {
  it('clipButtonVisible requires public room with replays and host clips', () => {
    assert.equal(
      clipButtonVisible({
        allowLocalRecording: true,
        replayEnabled: true,
        hostClipsEnabled: true,
        audience: 'public',
      }),
      true,
    );
    assert.equal(
      clipButtonVisible({
        allowLocalRecording: true,
        replayEnabled: false,
        hostClipsEnabled: true,
        audience: 'public',
      }),
      false,
    );
  });

  it('validateClipDurationSeconds enforces 5–55 seconds', () => {
    assert.equal(validateClipDurationSeconds(3), 'too_short');
    assert.equal(validateClipDurationSeconds(40), null);
    assert.equal(validateClipDurationSeconds(60), 'too_long');
  });
});
