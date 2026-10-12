import assert from 'node:assert/strict';
import test from 'node:test';
import { roomActionsFor, type RoomActionFlags } from '../src/api/roomCardActions.ts';

const modFlags: RoomActionFlags = {
  canMute: true,
  canMakeModerator: true,
  canMoveToAudience: true,
  canInvite: true,
  canBlock: true,
  canLeaveStage: false,
};

test('moderator on a listener gets invite, remove, view profile', () => {
  assert.deepEqual(
    roomActionsFor('moderator', modFlags, {
      isSelf: false,
      isSpeaker: false,
      isModerator: false,
    }),
    ['invite_to_stage', 'remove_from_room', 'view_profile'],
  );
});

test('moderator on a speaker gets mute → move → make mod → remove', () => {
  assert.deepEqual(
    roomActionsFor('moderator', modFlags, {
      isSelf: false,
      isSpeaker: true,
      isModerator: false,
      isMuted: false,
    }),
    ['mute', 'move_to_audience', 'make_moderator', 'remove_from_room'],
  );
});

test('muted speakers skip mute; existing mods skip make moderator', () => {
  assert.deepEqual(
    roomActionsFor('moderator', modFlags, {
      isSelf: false,
      isSpeaker: true,
      isModerator: true,
      isMuted: true,
    }),
    ['move_to_audience', 'remove_from_room'],
  );
});

test('self card offers leave room; leave stage only when flagged', () => {
  assert.deepEqual(
    roomActionsFor('speaker', modFlags, {
      isSelf: true,
      isSpeaker: true,
      isModerator: false,
    }),
    ['leave_room'],
  );
  assert.deepEqual(
    roomActionsFor('speaker', { ...modFlags, canLeaveStage: true }, {
      isSelf: true,
      isSpeaker: true,
      isModerator: false,
    }),
    ['leave_stage', 'leave_room'],
  );
  assert.deepEqual(
    roomActionsFor('listener', modFlags, {
      isSelf: true,
      isSpeaker: false,
      isModerator: false,
    }),
    ['leave_room'],
  );
});

test('non-moderators do not get host tools on others', () => {
  assert.deepEqual(
    roomActionsFor('listener', modFlags, {
      isSelf: false,
      isSpeaker: true,
      isModerator: false,
    }),
    [],
  );
  assert.deepEqual(
    roomActionsFor('speaker', modFlags, {
      isSelf: false,
      isSpeaker: false,
      isModerator: false,
    }),
    [],
  );
});

test('capability flags hide individual actions', () => {
  assert.deepEqual(
    roomActionsFor('moderator', {
      canMute: false,
      canMakeModerator: false,
      canMoveToAudience: true,
      canInvite: false,
      canBlock: true,
    }, {
      isSelf: false,
      isSpeaker: true,
      isModerator: false,
      isMuted: false,
    }),
    ['move_to_audience', 'remove_from_room'],
  );
});
