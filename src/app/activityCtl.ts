// @ts-nocheck — extracted controller; imports trimmed over time.
import { clubhouseClient } from '../api/client.ts';
import {
  mergeActivityFeed,
  notificationToActivity,
  readEdgeStoriesPayload,
  readNotificationsPayload,
  type ActivityItem,
} from '../api/activityFeed.ts';
import {
  buildEventIcs,
  readEventsPayload,
  readHouseChatPayload,
  readHouseDetail,
  readHouseMembersPayload,
  readHousesPayload,
  type EventListItem,
} from '../api/communityLists.ts';
import { roomSync } from '../api/roomSync.ts';
import { t } from '../i18n/index.ts';
import type { ClubboxApp } from './clubboxApp.ts';

export async function loadActivity(this: ClubboxApp): Promise<void> {
    if (this.activityItems == null && this.currentTab === 'activity') this.render();
    const edgeItems: ActivityItem[] = [];
    const notificationItems: ActivityItem[] = [];
    try {
      const res = await clubhouseClient.getEdgeStories();
      edgeItems.push(...readEdgeStoriesPayload(res));
    } catch (err) {
      this.reportApiError(err);
    }
    if (clubhouseClient.supports('get_notifications')) {
      try {
        const res = await clubhouseClient.getNotifications();
        notificationItems.push(...readNotificationsPayload(res).map(notificationToActivity));
      } catch (err) {
        this.reportApiError(err);
      }
    }
    this.activityItems = mergeActivityFeed(edgeItems, notificationItems);
    this.activityCount = this.activityItems.length;
    if (this.currentTab === 'activity') this.render();
  }

export async function loadSuggestions(this: ClubboxApp) : Promise<void> {
    try {
      const res = await clubhouseClient.getGroupSuggestedInvites();
      this.suggestionsCount = Array.isArray(res.suggestions) ? res.suggestions.length : 0;
    } catch (err) {
      this.suggestionsCount = 0;
      this.reportApiError(err);
    }
    if (this.currentTab === 'friends') this.render();
  }

export async function loadHouses(this: ClubboxApp): Promise<void> {
    if (!clubhouseClient.supports('get_user_social_clubs')) {
      this.housesList = [];
      if (this.currentTab === 'houses') this.render();
      return;
    }
    try {
      const res = await clubhouseClient.getUserSocialClubs();
      this.housesList = readHousesPayload(res);
    } catch (err) {
      this.housesList = [];
      this.reportApiError(err);
    }
    if (this.currentTab === 'houses') this.render();
  }

export async function openHouse(this: ClubboxApp, slug: string | undefined): Promise<void> {
    if (!slug || !clubhouseClient.supports('get_social_club')) return;
    this.currentTab = 'houses';
    this.houseChatOpen = false;
    this.houseChatMessages = null;
    this.houseChatCanPost = false;
    this.houseMembersOpen = false;
    this.houseMembers = null;
    this.selectedHouse = null;
    this.render();
    try {
      const res = await clubhouseClient.getSocialClub(slug);
      this.selectedHouse = readHouseDetail(res);
    } catch (err) {
      this.selectedHouse = null;
      this.reportApiError(err);
    }
    this.render();
  }

export async function loadHouseMembers(this: ClubboxApp, houseIdRaw: string | undefined): Promise<void> {
    if (!clubhouseClient.supports('get_social_club_members')) return;
    const houseId = Number(houseIdRaw);
    if (!Number.isFinite(houseId)) return;
    this.houseChatOpen = false;
    this.houseChatMessages = null;
    this.houseMembersOpen = true;
    this.houseMembers = null;
    if (this.currentTab === 'houses') this.render();
    try {
      const res = await clubhouseClient.getSocialClubMembers(houseId);
      this.houseMembers = readHouseMembersPayload(res);
    } catch (err) {
      this.houseMembers = [];
      this.reportApiError(err);
    }
    if (this.currentTab === 'houses') this.render();
  }

export function closeHouseMembers(this: ClubboxApp): void {
    this.houseMembersOpen = false;
    this.houseMembers = null;
    if (this.currentTab === 'houses') this.render();
  }

export async function loadHouseChat(this: ClubboxApp, houseIdRaw: string | undefined, slug: string | undefined): Promise<void> {
    if (!slug || !clubhouseClient.supports('get_social_club_messages')) return;
    const houseId = Number(houseIdRaw);
    if (!Number.isFinite(houseId)) return;
    this.houseMembersOpen = false;
    this.houseMembers = null;
    this.houseChatOpen = true;
    this.houseChatMessages = null;
    if (this.currentTab === 'houses') this.render();
    try {
      const res = await clubhouseClient.getSocialClubMessages(houseId, slug);
      const chat = readHouseChatPayload(res);
      this.houseChatMessages = chat.messages;
      this.houseChatCanPost = chat.canPost;
    } catch (err) {
      this.houseChatMessages = [];
      this.houseChatCanPost = false;
      this.reportApiError(err);
    }
    if (this.currentTab === 'houses') this.render();
  }

export function closeHouseChat(this: ClubboxApp): void {
    this.houseChatOpen = false;
    this.houseChatMessages = null;
    this.houseChatCanPost = false;
    if (this.currentTab === 'houses') this.render();
  }

export async function sendHouseChat(this: ClubboxApp, houseIdRaw: string | undefined, slug: string | undefined): Promise<void> {
    if (!slug || !this.houseChatCanPost || !clubhouseClient.supports('send_social_club_message')) return;
    const houseId = Number(houseIdRaw);
    if (!Number.isFinite(houseId)) return;
    const input = document.getElementById('house-chat-input') as HTMLInputElement | null;
    const message = input?.value.trim() || '';
    if (!message) return;
    try {
      await clubhouseClient.sendSocialClubMessage(houseId, slug, message);
      if (input) input.value = '';
      await this.loadHouseChat(String(houseId), slug);
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function loadEvents(this: ClubboxApp): Promise<void> {
    if (!clubhouseClient.supports('get_events')) {
      this.eventsList = [];
      if (this.currentTab === 'events') this.render();
      return;
    }
    try {
      const res = await clubhouseClient.getEvents(1, 20, false);
      this.eventsList = readEventsPayload(res);
    } catch (err) {
      this.eventsList = [];
      this.reportApiError(err);
    }
    if (this.currentTab === 'events') this.render();
  }

export function downloadEventIcs(this: ClubboxApp, event: EventListItem): void {
    const ics = buildEventIcs(event);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/[^\w]+/g, '-').slice(0, 40) || 'event'}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast(t('calendarSaved'), '📋');
  }

export function startActivityRefresh(this: ClubboxApp) : void {
    this.stopActivityRefresh();
    if (this.pollsPaused) return;
    this.activityTimer = window.setInterval(() => {
      if (this.currentTab !== 'activity') {
        this.stopActivityRefresh();
        return;
      }
      void this.loadActivity();
    }, 60000);
  }

export function stopActivityRefresh(this: ClubboxApp) : void {
    if (this.activityTimer !== null) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

export function onVisibilityChange(this: ClubboxApp) : void {
    if (document.visibilityState === 'hidden') {
      this.schedulePollPause();
      return;
    }
    if (this.hiddenPauseTimer !== null) {
      window.clearTimeout(this.hiddenPauseTimer);
      this.hiddenPauseTimer = null;
    }
    if (this.pollsPaused) this.resumePolls();
  }

export function schedulePollPause(this: ClubboxApp) : void {
    if (this.hiddenPauseTimer !== null || this.pollsPaused) return;
    this.hiddenPauseTimer = window.setTimeout(() => {
      this.hiddenPauseTimer = null;
      if (document.visibilityState === 'hidden') this.pausePolls();
    }, 2 * 60 * 1000);
  }

export function pausePolls(this: ClubboxApp) : void {
    this.pollsPaused = true;
    this.stopActivityRefresh();
    this.stopChatPolling();
    roomSync.pause();
  }

export function resumePolls(this: ClubboxApp) : void {
    this.pollsPaused = false;
    if (this.me && this.currentTab !== 'login') {
      void this.refreshMe({ quiet: true });
    }
    if (this.currentTab === 'activity') {
      void this.loadActivity();
      this.startActivityRefresh();
    }
    if (this.currentTab === 'explore') {
      void this.refreshExplore();
    }
    if (!this.currentChannel) return;
    const channelId = this.channelApiId(this.currentChannel);
    this.syncChatPolling();
    if (!roomSync.resume()) roomSync.start(channelId);
  }

export function wireActivityCtl(proto: ClubboxApp): void {
  proto.loadActivity = loadActivity;
  proto.loadSuggestions = loadSuggestions;
  proto.loadHouses = loadHouses;
  proto.openHouse = openHouse;
  proto.loadHouseMembers = loadHouseMembers;
  proto.closeHouseMembers = closeHouseMembers;
  proto.loadHouseChat = loadHouseChat;
  proto.closeHouseChat = closeHouseChat;
  proto.sendHouseChat = sendHouseChat;
  proto.loadEvents = loadEvents;
  proto.downloadEventIcs = downloadEventIcs;
  proto.startActivityRefresh = startActivityRefresh;
  proto.stopActivityRefresh = stopActivityRefresh;
  proto.onVisibilityChange = onVisibilityChange;
  proto.schedulePollPause = schedulePollPause;
  proto.pausePolls = pausePolls;
  proto.resumePolls = resumePolls;
}
