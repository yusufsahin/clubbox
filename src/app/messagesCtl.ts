// @ts-nocheck — extracted controller; imports trimmed over time.
import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
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
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const extension = kind === 'clip' ? 'wav' : 'webm';
  return `clubbox-${kind}-${slug}-${stamp}.${extension}`;
}


export async function loadConversations(this: ClubboxApp) : Promise<void> {
    try {
      const res = await clubhouseClient.getConversations();
      this.conversations = res.conversations || [];
      this.conversationsLoaded = true;
      this.dmRequestCount = typeof res.new_dm_requests_count === 'number' ? res.new_dm_requests_count : 0;
    } catch (err) {
      this.conversations = [];
      this.conversationsLoaded = true;
      this.dmRequestCount = 0;
      this.reportApiError(err);
    }
    if (this.currentTab === 'messages' || this.currentTab === 'friends') this.render();
  }

export function sendThreadSegment(this: ClubboxApp, conversationId: string | undefined, kind: 'text' | 'voice') : void {
    if (!conversationId) return;
    const item = this.conversations.find((entry) => entry.conversation_id === conversationId);
    if (!item?.can_reply) return;
    if (this.liveMessageBlocked()) return;
    const input = document.getElementById('thread-input') as HTMLInputElement | null;
    const text = kind === 'voice' ? t('voicePreview') : (input?.value.trim() ?? '');
    if (!text) return;
    clubhouseClient.getSandbox()?.appendSegment(conversationId, {
      kind,
      author_name: this.me?.name || 'Sandbox User',
      text,
    });
    if (kind === 'voice') audioEngine.playVoiceNote(this.voiceRate);
    void this.loadConversations();
  }

export function addThreadMember(this: ClubboxApp, conversationId: string | undefined) : void {
    if (!conversationId) return;
    const item = this.conversations.find((entry) => entry.conversation_id === conversationId);
    if (!item?.can_add_members) return;
    if (this.liveMessageBlocked()) return;
    const sandbox = clubhouseClient.getSandbox();
    const count = (sandbox?.thread(conversationId)?.members.length ?? 0) + 1;
    const name = `New member ${count}`;
    if (!sandbox?.addMember(conversationId, name)) return;
    this.showToast(t('memberAdded', { name }), 'Γ₧ò');
    this.render();
  }

export function runThreadPermission(this: ClubboxApp, conversationId: string | undefined, permission: string | undefined) : void {
    if (!conversationId) return;
    const item = this.conversations.find((entry) => entry.conversation_id === conversationId);
    if (!item) return;
    const allowed = (permission === 'invite' && item.can_invite)
      || (permission === 'delete' && item.can_delete)
      || (permission === 'leave' && item.can_leave);
    if (!allowed) return;
    if (this.liveMessageBlocked()) return;
    if (permission === 'invite') {
      this.showToast(t('inviteMember'), 'Γ£ë∩╕Å');
      return;
    }
    clubhouseClient.getSandbox()?.removeConversation(conversationId);
    if (this.openConversationId === conversationId) {
      this.openConversationId = null;
      this.previewMember = null;
    }
    void this.loadConversations();
  }

export function liveMessageBlocked(this: ClubboxApp) : boolean {
    if (clubhouseClient.getConfig().useSandbox) return false;
    this.showToast(t('unverifiedAction'), '≡ƒöÆ');
    return true;
  }

export function wireMessagesCtl(proto: ClubboxApp): void {
  proto.loadConversations = loadConversations;
  proto.sendThreadSegment = sendThreadSegment;
  proto.addThreadMember = addThreadMember;
  proto.runThreadPermission = runThreadPermission;
  proto.liveMessageBlocked = liveMessageBlocked;
}
