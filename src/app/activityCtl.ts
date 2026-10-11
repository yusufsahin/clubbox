// @ts-nocheck — extracted controller; imports trimmed over time.
import { clubhouseClient } from '../api/client.ts';
import {
  mergeActivityFeed,
  notificationToActivity,
  readEdgeStoriesPayload,
  readNotificationsPayload,
  type ActivityItem,
} from '../api/activityFeed.ts';
import { roomSync } from '../api/roomSync.ts';
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
  proto.startActivityRefresh = startActivityRefresh;
  proto.stopActivityRefresh = stopActivityRefresh;
  proto.onVisibilityChange = onVisibilityChange;
  proto.schedulePollPause = schedulePollPause;
  proto.pausePolls = pausePolls;
  proto.resumePolls = resumePolls;
}
