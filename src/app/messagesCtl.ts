// @ts-nocheck — extracted controller; imports trimmed over time.
import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
import { readConversationThread } from '../api/conversationThread.ts';
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

export async function openConversationThread(this: ClubboxApp, conversationId: string): Promise<void> {
    this.openConversationId = conversationId;
    this.previewMember = null;
    this.openConversationThreadData = null;
    this.threadLiveNote = '';
    const sandboxThread = clubhouseClient.getSandbox()?.thread(conversationId) ?? null;
    if (sandboxThread) {
      this.openConversationThreadData = sandboxThread;
      this.render();
      return;
    }
    if (!clubhouseClient.supports('get_conversation')) {
      this.threadLiveNote = t('threadLiveNote');
      this.render();
      return;
    }
    this.render();
    try {
      const res = await clubhouseClient.getConversation(conversationId);
      this.openConversationThreadData = readConversationThread(res);
      if (this.openConversationId === conversationId && !this.openConversationThreadData) {
        // Flat/nested parse failed — keep the panel open with empty segments.
        this.openConversationThreadData = { segments: [], members: [] };
      }
    } catch (err) {
      this.threadLiveNote = t('threadLiveNote');
      this.reportApiError(err);
    }
    if (this.openConversationId === conversationId) this.render();
  }

export function activeConversationThread(this: ClubboxApp) {
    if (!this.openConversationId) return null;
    const sandbox = clubhouseClient.getSandbox()?.thread(this.openConversationId);
    if (sandbox) return sandbox;
    return this.openConversationThreadData;
  }

export function sendThreadSegment(this: ClubboxApp, conversationId: string | undefined, kind: 'text' | 'voice') : void {
    if (!conversationId) return;
    const item = this.conversations.find((entry) => entry.conversation_id === conversationId);
    if (!item?.can_reply) return;
    const input = document.getElementById('thread-input') as HTMLInputElement | null;
    const text = kind === 'voice' ? t('voicePreview') : (input?.value.trim() ?? '');
    if (!text && kind === 'text') return;
    const sandbox = clubhouseClient.getSandbox();
    if (sandbox) {
      sandbox.appendSegment(conversationId, {
        kind,
        author_name: this.me?.name || 'Sandbox User',
        text,
      });
      if (kind === 'voice') audioEngine.playVoiceNote(this.voiceRate);
      void this.loadConversations();
      if (this.openConversationId === conversationId) {
        this.openConversationThreadData = sandbox.thread(conversationId);
        this.render();
      }
      if (input && kind === 'text') input.value = '';
      return;
    }
    if (!clubhouseClient.supports('add_conversation_segment')) {
      this.liveMessageBlocked();
      return;
    }
    if (input && kind === 'text') input.value = '';
    void clubhouseClient.addConversationSegment(conversationId, kind, kind === 'text' ? text : undefined)
      .then(async () => {
        await this.loadConversations();
        if (this.openConversationId === conversationId) await this.openConversationThread(conversationId);
      })
      .catch((err) => this.reportApiError(err));
    if (kind === 'voice') audioEngine.playVoiceNote(this.voiceRate);
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
    this.showToast(t('memberAdded', { name }), '➕');
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
      this.showToast(t('inviteMember'), '✉️');
      return;
    }
    clubhouseClient.getSandbox()?.removeConversation(conversationId);
    if (this.openConversationId === conversationId) {
      this.openConversationId = null;
      this.previewMember = null;
      this.openConversationThreadData = null;
      this.threadLiveNote = '';
    }
    void this.loadConversations();
  }

export function liveMessageBlocked(this: ClubboxApp) : boolean {
    if (clubhouseClient.getConfig().useSandbox) return false;
    this.showToast(t('unverifiedAction'), '🔒');
    return true;
  }

export async function reactToThreadSegment(
  this: ClubboxApp,
  conversationId: string | undefined,
  segmentId: string | undefined,
  emoji: string | undefined,
): Promise<void> {
    if (!conversationId || !segmentId || !emoji) return;
    if (!clubhouseClient.supports('send_conversation_emoji_reaction')) {
      this.showToast(t('unverifiedAction'), '🔒');
      return;
    }
    try {
      await clubhouseClient.sendConversationEmojiReaction(conversationId, segmentId, emoji);
      this.showToast(t('reactionSent'), emoji);
    } catch (err) {
      // 400 (and other failures) are recorded in API Health by the client; surface them.
      this.reportApiError(err);
    }
  }

export function wireMessagesCtl(proto: ClubboxApp): void {
  proto.loadConversations = loadConversations;
  proto.openConversationThread = openConversationThread;
  proto.activeConversationThread = activeConversationThread;
  proto.sendThreadSegment = sendThreadSegment;
  proto.addThreadMember = addThreadMember;
  proto.runThreadPermission = runThreadPermission;
  proto.liveMessageBlocked = liveMessageBlocked;
  proto.reactToThreadSegment = reactToThreadSegment;
}
