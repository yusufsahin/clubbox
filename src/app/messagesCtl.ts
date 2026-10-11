import { clubhouseClient } from '../api/client.ts';
import { readConversationThread } from '../api/conversationThread.ts';
import { conversationIdsForUnreadSummary, readUnreadSummary } from '../api/unreadSummary.ts';
import { audioEngine } from '../audio/audioEngine.ts';
import { t } from '../i18n/index.ts';
import type { ClubboxApp } from './clubboxApp.ts';



async function refreshVisibleUnreadSummaries(app: ClubboxApp): Promise<void> {
  if (!clubhouseClient.supports('get_conversation_unread_summary')) return;
  if (app.pollsPaused || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
    return;
  }
  const ids = conversationIdsForUnreadSummary(
    app.conversations.map((item) => item.conversation_id),
  );
  if (ids.length === 0) {
    app.conversationUnreadById = {};
    return;
  }
  const next: Record<string, number> = { ...app.conversationUnreadById };
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await clubhouseClient.getConversationUnreadSummary(id);
      const count = readUnreadSummary(res);
      if (count == null) {
        delete next[id];
      } else {
        next[id] = count;
      }
    } catch (err) {
      app.reportApiError(err);
    }
  }));
  app.conversationUnreadById = next;
}

export async function loadConversations(this: ClubboxApp) : Promise<void> {
    try {
      const res = await clubhouseClient.getConversations();
      this.conversations = res.conversations || [];
      this.conversationsNextCursor = res.next_cursor ?? null;
      this.conversationsLoaded = true;
      this.dmRequestCount = typeof res.new_dm_requests_count === 'number' ? res.new_dm_requests_count : 0;
      await refreshVisibleUnreadSummaries(this);
    } catch (err) {
      this.conversations = [];
      this.conversationsNextCursor = null;
      this.conversationsLoaded = true;
      this.dmRequestCount = 0;
      this.conversationUnreadById = {};
      this.reportApiError(err);
    }
    if (this.currentTab === 'messages' || this.currentTab === 'friends') this.render();
  }

export async function loadMoreConversations(this: ClubboxApp): Promise<void> {
    if (!this.conversationsNextCursor || this.conversationsLoadingMore) return;
    this.conversationsLoadingMore = true;
    try {
      const res = await clubhouseClient.getConversations({ nextCursor: this.conversationsNextCursor });
      const seen = new Set(this.conversations.map((item) => item.conversation_id));
      for (const item of res.conversations || []) {
        if (!seen.has(item.conversation_id)) this.conversations.push(item);
      }
      this.conversationsNextCursor = res.next_cursor ?? null;
      await refreshVisibleUnreadSummaries(this);
      if (this.currentTab === 'messages' || this.currentTab === 'friends') this.render();
    } catch (err) {
      this.reportApiError(err);
    } finally {
      this.conversationsLoadingMore = false;
    }
  }

export async function renameConversation(this: ClubboxApp, conversationId: string | undefined, title: string): Promise<void> {
    if (!conversationId || !title.trim()) return;
    if (!clubhouseClient.supports('update_conversation_title')) {
      this.showToast(t('unverifiedAction'), '🔒');
      return;
    }
    try {
      await clubhouseClient.updateConversationTitle(conversationId, title.trim());
      const item = this.conversations.find((entry) => entry.conversation_id === conversationId);
      if (item) {
        item.title = title.trim();
        item.short_title = title.trim();
      }
      if (this.currentTab === 'messages') this.render();
      this.showToast(t('conversationRenamed'), '✏️');
    } catch (err) {
      this.reportApiError(err);
    }
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
      || (permission === 'leave' && item.can_leave)
      || (permission === 'rename' && item.can_delete);
    if (!allowed) return;
    if (permission === 'invite') {
      if (this.liveMessageBlocked()) return;
      const sandbox = clubhouseClient.getSandbox();
      const count = (sandbox?.thread(conversationId)?.members.length ?? 0) + 1;
      const name = `Invited member ${count}`;
      if (!sandbox?.addMember(conversationId, name)) {
        this.showToast(t('unverifiedAction'), '🔒');
        return;
      }
      this.showToast(t('memberAdded', { name }), '✉️');
      this.render();
      return;
    }
    if (permission === 'rename') {
      const next = window.prompt(t('renameConversationPrompt'), item.short_title || item.title || '');
      if (next == null || !next.trim()) return;
      void this.renameConversation(conversationId, next.trim());
      return;
    }
    if (permission === 'delete') {
      if (!window.confirm(t('confirmDeleteConversation'))) return;
      const sandbox = clubhouseClient.getSandbox();
      if (sandbox) {
        sandbox.removeConversation(conversationId);
      } else if (clubhouseClient.supports('delete_conversation')) {
        void clubhouseClient.deleteConversation(conversationId).then(() => {
          this.conversations = this.conversations.filter((entry) => entry.conversation_id !== conversationId);
          if (this.openConversationId === conversationId) {
            this.openConversationId = null;
            this.previewMember = null;
            this.openConversationThreadData = null;
            this.threadLiveNote = '';
          }
          if (this.currentTab === 'messages') this.render();
        }).catch((err) => this.reportApiError(err));
        return;
      } else {
        this.showToast(t('unverifiedAction'), '🔒');
        return;
      }
      if (this.openConversationId === conversationId) {
        this.openConversationId = null;
        this.previewMember = null;
        this.openConversationThreadData = null;
        this.threadLiveNote = '';
      }
      void this.loadConversations();
      return;
    }
    if (this.liveMessageBlocked()) return;
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
  proto.loadMoreConversations = loadMoreConversations;
  proto.renameConversation = renameConversation;
  proto.openConversationThread = openConversationThread;
  proto.activeConversationThread = activeConversationThread;
  proto.sendThreadSegment = sendThreadSegment;
  proto.addThreadMember = addThreadMember;
  proto.runThreadPermission = runThreadPermission;
  proto.liveMessageBlocked = liveMessageBlocked;
  proto.reactToThreadSegment = reactToThreadSegment;
}
