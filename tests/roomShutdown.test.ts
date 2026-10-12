import assert from 'node:assert/strict';
import test from 'node:test';
import { clubhouseClient } from '../src/api/client.ts';
import { emptyRoomSession } from '../src/api/guards.ts';
import {
  handleAgoraLifecycle,
  handleBeforeUnload,
  resetRoomShutdownForTests,
} from '../src/app/roomCtl.ts';
import type { ClubboxApp } from '../src/app/clubboxApp.ts';
import { agoraVoice } from '../src/audio/agoraVoice.ts';
import { audioEngine } from '../src/audio/audioEngine.ts';

function roomApp(): ClubboxApp {
  return {
    currentChannel: { channel: 'abc123', channel_id: 'abc123' },
    roomSession: { ...emptyRoomSession(), inRoom: true, generation: 2 },
    joinInFlight: false,
    channelApiId() {
      return 'abc123';
    },
    stopRoomPresence() {
      // Presence must stop before leave_channel; the test only checks the call order via leaveChannel.
    },
  } as unknown as ClubboxApp;
}

test('close leaves the Clubhouse room once even if beforeunload also fires', async () => {
  resetRoomShutdownForTests();
  const leaveIds: string[] = [];
  const originalLeave = clubhouseClient.leaveChannel;
  const originalAgoraLeave = agoraVoice.leave;
  const originalStopRecording = audioEngine.stopRecording;
  const originalArmClip = audioEngine.armClip;
  const originalStopMic = audioEngine.stopMicrophone;
  const originalReleaseExternal = audioEngine.releaseExternal;
  clubhouseClient.leaveChannel = (async (channelId: string) => {
    leaveIds.push(channelId);
    return { success: true };
  }) as typeof clubhouseClient.leaveChannel;
  agoraVoice.leave = async () => undefined;
  audioEngine.stopRecording = () => undefined;
  audioEngine.armClip = () => undefined;
  audioEngine.stopMicrophone = () => undefined;
  audioEngine.releaseExternal = () => undefined;
  const app = roomApp();
  try {
    const pending = handleAgoraLifecycle.call(app, 'close');
    handleBeforeUnload.call(app);
    await pending;
    assert.deepEqual(leaveIds, ['abc123']);
  } finally {
    clubhouseClient.leaveChannel = originalLeave;
    agoraVoice.leave = originalAgoraLeave;
    audioEngine.stopRecording = originalStopRecording;
    audioEngine.armClip = originalArmClip;
    audioEngine.stopMicrophone = originalStopMic;
    audioEngine.releaseExternal = originalReleaseExternal;
    resetRoomShutdownForTests();
  }
});

test('suspend leaves Agora only and does not call leaveChannel', async () => {
  resetRoomShutdownForTests();
  let leaveCalls = 0;
  let agoraLeaves = 0;
  const originalLeave = clubhouseClient.leaveChannel;
  const originalAgoraLeave = agoraVoice.leave;
  const originalJoined = agoraVoice.getIsJoined;
  clubhouseClient.leaveChannel = (async () => {
    leaveCalls += 1;
    return { success: true };
  }) as typeof clubhouseClient.leaveChannel;
  agoraVoice.leave = async () => {
    agoraLeaves += 1;
  };
  agoraVoice.getIsJoined = () => true;
  try {
    await handleAgoraLifecycle.call(roomApp(), 'suspend');
    assert.equal(leaveCalls, 0);
    assert.equal(agoraLeaves, 1);
  } finally {
    clubhouseClient.leaveChannel = originalLeave;
    agoraVoice.leave = originalAgoraLeave;
    agoraVoice.getIsJoined = originalJoined;
    resetRoomShutdownForTests();
  }
});
