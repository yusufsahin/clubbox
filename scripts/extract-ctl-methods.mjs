import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appPath = path.join(root, 'src', 'app', 'clubboxApp.full.ts');
const src = fs.readFileSync(appPath, 'utf8');

const groups = {
  roomCtl: [
    'handleBeforeUnload', 'startRoomPresence', 'stopChatPolling', 'syncChatPolling', 'stopRoomPresence',
    'refreshChat', 'channelApiId', 'applyRoomUpdate', 'isMeSpeaker', 'isMeModerator', 'syncAgoraRole',
    'runAgoraRoleSync', 'inviteToStage', 'moderateSpeaker', 'maybeShowSpeakerInvite', 'renderSpeakerInvite',
    'closeSpeakerInvite', 'acceptSpeakerInvite', 'declineSpeakerInvite', 'muteEveryone', 'refreshStageManual',
    'toggleHandRaise', 'recordingAllowed', 'syncRecBanner', 'toggleRecording', 'clipsAllowed', 'syncClipArm',
    'saveClip', 'allowAction', 'joinRoom', 'connectRoomAudio', 'releaseRoomLocally', 'leaveRoom', 'afterRoomExit',
    'endRoom', 'sendChatMessage', 'confirmCreateRoom',
  ],
  hallwayCtl: [
    'reloadChannels', 'refreshExplore', 'liveUpdatesUnavailable', 'refreshCurrentRoom', 'hallwayNotices',
    'roomHousePhoto', 'discoverTypes', 'scheduleDiscoverSearch', 'runDiscoverSearch',
  ],
  messagesCtl: [
    'loadConversations', 'sendThreadSegment', 'addThreadMember', 'runThreadPermission', 'liveMessageBlocked',
  ],
  profileCtl: [
    'inspectProfile', 'loadFullProfile', 'clearPeopleList', 'openPeopleList', 'paintPeopleList', 'closeProfileDrawer',
    'followUser', 'toggleFollow', 'profileState', 'renderProfileDrawer', 'talkLive', 'sendVm', 'sendPrivateMessage',
    'findKnownUser',
  ],
  activityCtl: [
    'loadActivity', 'loadSuggestions', 'startActivityRefresh', 'stopActivityRefresh', 'onVisibilityChange',
    'schedulePollPause', 'pausePolls', 'resumePolls',
  ],
  studioCtl: [
    'setupHotkeys', 'handleGlobalShortcut', 'updateVuMeter', 'handleRecordingStateChange', 'toggleMute',
    'toggleMusicMode', 'applyMusicMode', 'applyAudioPrefs', 'saveAudioPrefs', 'fillAudioDevices', 'fillDeviceSelect',
    'renderSoundboardView', 'commitSoundEdit', 'removeSound', 'assignShortcut', 'syncShortcuts', 'publishShortcuts',
    'isShortcutAction',
  ],
  settingsCtl: [
    'finishSignIn', 'guidelinesAccepted', 'acceptGuidelines', 'startLiveAfterGuidelines', 'declineGuidelines',
    'renderGuidelines', 'openOfficialSignIn', 'tryAdoptOfficialSession', 'logOut', 'saveSettings', 'switchRuntimeMode',
    'handleAuthExpired', 'refreshMe', 'openSettingsModal', 'closeSettingsModal', 'openCreateModal', 'closeCreateModal',
  ],
};

function extractMethod(source, name) {
  const headRe = new RegExp(`^  (?:private |public )?(?:async )?${name}\\(`, 'm');
  const start = source.search(headRe);
  if (start < 0) return null;
  let pDepth = 0;
  let openBrace = -1;
  for (let i = source.indexOf('(', start); i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') pDepth++;
    else if (ch === ')') {
      pDepth--;
      if (pDepth === 0) {
        const tail = source.slice(i).match(/^\)\s*(?::[^({]+)?\s*\{/);
        if (tail) {
          openBrace = i + tail[0].length - 1;
          break;
        }
      }
    }
  }
  if (openBrace < 0) return null;
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function toExportFn(block) {
  const isAsync = /^  (?:private |public )?async /.test(block);
  const inner = block
    .replace(/^  /, '')
    .replace(/^private /, '')
    .replace(/^public /, '')
    .replace(/^async /, '');
  const m = inner.match(/^([a-zA-Z0-9_]+)\(([\s\S]*?)\)\s*(?::[^({]+)?\s*\{/);
  if (!m) return `export function broken(this: ClubboxApp) {`;
  const params = m[2].trim();
  const paramSuffix = params.length ? `, ${params}` : '';
  const body = inner.slice(m.index + m[0].length - 1);
  const ret = inner.match(/\)\s*(:[^({]+)?\s*\{/)?.[1]?.trim() ?? '';
  return `export ${isAsync ? 'async ' : ''}function ${m[1]}(this: ClubboxApp${paramSuffix})${ret ? ` ${ret}` : ''} ${body}`;
}

const ctlImports = `import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
import { beginJoin, commitJoin, finishLeave, localClipAllowed, roleSyncDecision, roomAudience } from '../api/guards.ts';
import { capturedCreateBody, leaveClosesRoom, roomHasOthers } from '../api/roomActions.ts';
import { applyFollowResponse, mergeProfile, PEOPLE_LIST_ENDPOINTS, profileCountsMissing, readProfile, relationshipFromStatus, talkPartners, type PeopleListKind } from '../api/relationship.ts';
import { PubNubRoomSource } from '../api/pubnubRoomSource.ts';
import { roomSync } from '../api/roomSync.ts';
import { audioEngine } from '../audio/audioEngine.ts';
import { readAudioPrefs, writeAudioPrefs, type AudioPrefs } from '../audio/audioPrefs.ts';
import { eventToAccelerator, normalizeShortcuts, readShortcuts, writeShortcuts, type ShortcutAction, type ShortcutMap } from '../shortcuts.ts';
import { agoraVoice } from '../audio/agoraVoice.ts';
import type { CHChannel, CHChannelDetail, CHChatMessage, CHConversation, CHUser, FeedTopic, MeSettings, SearchHit, SearchObjectType } from '../api/types.ts';
import { setLanguage, t } from '../i18n/index.ts';
import { avatarHtml, installAvatarFallback } from '../ui/avatar.ts';
import { cockpitBar } from '../ui/components/cockpitBar.ts';
import { mountCreateModal } from '../ui/components/createModal.ts';
import { paintPersonSheet, selfProfilePage } from '../ui/components/profileDrawer.ts';
import { mountSpeakerInvite } from '../ui/components/speakerInvite.ts';
import { showToast } from '../ui/components/toast.ts';
import { html, markup, safeUrl } from '../ui/html.ts';
import { activityView } from '../ui/views/activity.ts';
import { exploreView } from '../ui/views/explore.ts';
import { friendsView } from '../ui/views/friends.ts';
import { peopleListView } from '../ui/views/peopleList.ts';
import { discoverView, type DiscoverTab } from '../ui/views/discover.ts';
import { loginView } from '../ui/views/login.ts';
import { messagesView } from '../ui/views/messages.ts';
import { settingsView } from '../ui/views/settings.ts';
import { soundboardView } from '../ui/views/soundboard.ts';
import { chatList, emptyStageView, stageColumn, stageView } from '../ui/views/stage.ts';
import type { ClubboxApp } from './clubboxApp.ts';

const CHAT_POLL_MS = 15_000;
const GUIDELINES_KEY = 'clubbox-guidelines-accepted';

function electronAPI() {
  return (window as Window & { electronAPI?: unknown }).electronAPI ?? null;
}

function recordingFilename(topic: string | undefined, kind: 'recording' | 'clip' = 'recording'): string {
  const slug = (topic || 'room')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'room';
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const stamp = \`\${now.getFullYear()}\${pad(now.getMonth() + 1)}\${pad(now.getDate())}-\${pad(now.getHours())}\${pad(now.getMinutes())}\`;
  const extension = kind === 'clip' ? 'wav' : 'webm';
  return \`clubbox-\${kind}-\${slug}-\${stamp}.\${extension}\`;
}
`;

let remaining = src;
const appDir = path.join(root, 'src', 'app');

for (const [file, methods] of Object.entries(groups)) {
  const chunks = [];
  const wired = [];
  for (const name of methods) {
    const block = extractMethod(remaining, name);
    if (!block) {
      console.warn(`missing ${name} in ${file}`);
      continue;
    }
    wired.push(name);
    chunks.push(toExportFn(block));
    remaining = remaining.replace(block, '');
  }
  const wireName = `wire${file[0].toUpperCase()}${file.slice(1)}`;
  const out = `/* eslint-disable @typescript-eslint/no-unused-vars -- extracted controller module */
// @ts-nocheck
${ctlImports}

${chunks.join('\n\n')}

export function ${wireName}(proto: ClubboxApp): void {
${wired.map((n) => `  proto.${n} = ${n};`).join('\n')}
}
`;
  fs.writeFileSync(path.join(appDir, `${file}.ts`), out);
}

const headerEnd = remaining.indexOf('class ClubboxApp');
const header = remaining.slice(0, headerEnd)
  .replace(/\.\/api\//g, '../api/')
  .replace(/\.\/audio\//g, '../audio/')
  .replace(/\.\/shortcuts/g, '../shortcuts')
  .replace(/\.\/i18n/g, '../i18n')
  .replace(/\.\/ui\//g, '../ui/')
  .replace("import './style.css';\n", '');
const classPart = remaining.slice(headerEnd)
  .replace('class ClubboxApp', 'export class ClubboxApp')
  .replace(/\n\/\/ Instantiate App[\s\S]*$/, '\n');

const wireImports = Object.keys(groups).map((f) => {
  const wireName = `wire${f[0].toUpperCase()}${f.slice(1)}`;
  return `import { ${wireName} } from './${f}.ts';`;
}).join('\n');

const wireFn = `
${wireImports}

export function wireAppControllers(ClubboxAppClass: typeof ClubboxApp): void {
  const proto = ClubboxAppClass.prototype as ClubboxApp;
  ${Object.keys(groups).map((f) => {
    const wireName = `wire${f[0].toUpperCase()}${f.slice(1)}`;
    return `${wireName}(proto);`;
  }).join('\n  ')}
}

wireAppControllers(ClubboxApp);
`;

fs.writeFileSync(path.join(appDir, 'clubboxApp.ts'), `${header}${classPart}${wireFn}`);
fs.writeFileSync(path.join(root, 'src', 'main.ts'), `import './style.css';\nimport { ClubboxApp } from './app/clubboxApp.ts';\n\nnew ClubboxApp();\n`);
console.log('clubboxApp lines', fs.readFileSync(path.join(appDir, 'clubboxApp.ts'), 'utf8').split('\n').length);
