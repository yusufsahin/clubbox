import { t } from '../../i18n';
import type { CHChannel, FeedTopic } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, safeUrl, type SafeHtml } from '../html';
import { channelHasFriendSpeaker, roomTitleKeywordHits, speakerIsFriend, splitKeywordHighlight } from '../../hallway/hallwayDisplay';
import type { HallwayPrefs } from '../../hallway/hallwayPrefs';

// Preview listening and "in a house" stay hidden until a capture shows those requests.

function privacyLine(channel: CHChannel): SafeHtml | string {
  const label = channel.privacy_label && channel.privacy_label !== channel.club_name ? channel.privacy_label : '';
  const tooltip = channel.privacy_tooltip || '';
  const text = label || tooltip;
  if (!text) return '';
  return html`<div class="room-card-privacy" title="${tooltip || text}">${text}</div>`;
}

function housePhoto(channel: CHChannel): SafeHtml | string {
  const photo = safeUrl(channel.club_photo_url);
  if (!photo) return '';
  return html`<img class="house-photo" src="${photo}" alt="" />`;
}

function roomSpeakers(channel: CHChannel) {
  const speakers = channel.users.filter((user) => user.is_speaker);
  return speakers.length > 0 ? speakers : channel.users;
}

function renderTopicTitle(topic: string, keywords: string[]): SafeHtml {
  const hits = roomTitleKeywordHits(topic, keywords);
  if (hits.length === 0) return html`${topic}`;
  const keyword = hits[0];
  const parts = splitKeywordHighlight(topic, keyword);
  return html`${parts.map((part) => part.hit ? html`<span class="keyword-hit">${part.text}</span>` : part.text)}`;
}

function speakerName(user: CHChannel['users'][number]): SafeHtml {
  const friend = speakerIsFriend(user);
  return html`${user.name}${friend ? html`<span class="friend-star" title="${t('friendsHere')}">★</span>` : ''}`;
}

function formatRunningFor(iso: string | undefined): string {
  if (!iso) return '';
  const started = Date.parse(iso);
  if (!Number.isFinite(started)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60_000));
  if (minutes < 60) return t('runningForMinutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return t('runningForHours', { count: hours });
}

export function exploreView(
  channels: CHChannel[],
  topics: FeedTopic[],
  notices: string[],
  access: {
    canJoin: boolean;
    canCreate: boolean;
    canHide: boolean;
    canLoadMore?: boolean;
    loadingMore?: boolean;
  },
  hallway: HallwayPrefs,
  selectedTopicKey: string | null = null,
): SafeHtml {
  const view = html`
    <div style="max-width:1100px; margin:0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <h2 style="font-size:22px; font-weight:700;">${t('liveRooms')}</h2>
          <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">${t('liveRoomsHelp')}</p>
        </div>
        <button class="btn btn-secondary" data-action="refresh-explore">${t('refresh')}</button>
      </div>
      <div class="hallway-filters">
        <label style="font-size:13px; color:var(--text-muted);">${t('hallwayKeywords')}</label>
        <input class="form-input" id="hallway-keyword-input" placeholder="${t('hallwayKeywordPlaceholder')}" style="max-width:220px;" />
        <button class="btn btn-secondary" type="button" data-action="add-hallway-keyword">${t('addKeyword')}</button>
        ${hallway.keywords.map((keyword) => html`
          <span class="hallway-keyword-chip">${keyword}
            <button type="button" class="top-icon-btn" data-action="remove-hallway-keyword" data-keyword="${keyword}">×</button>
          </span>
        `)}
        ${hallway.keywords.length ? html`
          <label style="font-size:13px; display:flex; align-items:center; gap:6px;">
            <input type="checkbox" id="hallway-only-keywords" data-action="toggle-hallway-only-keywords" ${hallway.onlyKeywordMatches ? 'checked' : ''} />
            ${t('onlyKeywordRooms')}
          </label>
        ` : ''}
        <label style="font-size:13px; display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="hallway-show-nsfw" data-action="toggle-hallway-nsfw" ${hallway.showNsfw ? 'checked' : ''} />
          ${t('showNsfwRooms')}
        </label>
      </div>
      ${topics.length ? html`
      <div class="topic-chips">
          <button class="topic-chip ${selectedTopicKey ? '' : 'active'}" type="button" data-action="select-hallway-topic">${t('forYou')}</button>
          ${topics.map((topic) => html`
            <button class="topic-chip ${selectedTopicKey === topic.key ? 'active' : ''}" type="button" data-action="select-hallway-topic" data-topic-key="${topic.key}">${topic.display_name}</button>
          `)}
      </div>
      <p class="list-note">${t('topicFilterLocalHelp')}</p>
      ` : ''}
      ${notices.map((notice) => html`<p class="list-note">${notice}</p>`)}

      ${channels.length === 0 ? html`
        <div class="explore-empty">
          <p>${t('noLiveRooms')}</p>
          <button class="btn btn-secondary" data-action="refresh-explore" type="button">${t('refresh')}</button>
        </div>
      ` : html`
      <div class="rooms-grid">
        ${channels.map((ch) => {
          const speakers = roomSpeakers(ch);
          const shown = speakers.slice(0, 6);
          const extra = speakers.length - shown.length;
          const talking = speakers.filter((user) => user.is_speaking).map((user) => user.name).filter(Boolean);
          const channelId = ch.channel || ch.channel_id;
          const friendSpeaker = channelHasFriendSpeaker(ch.users);
          const runningFor = formatRunningFor(ch.time_created);
          return html`
          <div class="room-card ${ch.visited ? 'is-visited' : ''} ${access.canJoin ? '' : 'is-static'}" ${access.canJoin ? html`data-action="join-room" data-channel-id="${channelId}"` : ''}>
            <div>
              <div class="room-card-header">
                <span class="room-card-club">${housePhoto(ch)} ${ch.club_name || 'Clubhouse'}</span>
                <div class="room-card-stats">
                  <span>👥 ${ch.num_all}</span>
                  <span>🎙️ ${ch.num_speakers}</span>
                </div>
              </div>
              <div class="room-card-topic">${renderTopicTitle(ch.topic, hallway.keywords)}</div>
              ${privacyLine(ch)}
              <div class="replay-note">${ch.is_replay_enabled ? t('replaysOn') : t('replaysOff')}</div>
              <div class="replay-note">${ch.is_clips_enabled ? t('clipsOn') : t('clipsOff')}</div>
              ${runningFor ? html`<div class="replay-note">${runningFor}</div>` : ''}
              ${ch.is_active_trending_topic_channel ? html`<div class="replay-note">${t('trending')}</div>` : ''}
              ${ch.is_social_mode ? html`<div class="replay-note">${t('socialRoom')}</div>` : ''}
              ${ch.is_nsfw ? html`<div class="replay-note">${t('showNsfwRooms')}</div>` : ''}
              ${friendSpeaker ? html`<div class="replay-note">${t('friendsHere')}: ${friendSpeaker.name}★</div>` : ''}
            </div>

            <div>
              <div class="room-card-speakers">
                <div class="speaker-avatar-overlap">
                  ${shown.map((user) => avatarHtml(user, 32))}
                  ${extra > 0 ? html`<span class="room-card-more">${t('moreSpeakers', { count: extra })}</span>` : ''}
                </div>
                <div class="speaker-names-list">
                  ${shown.map((user, index) => html`${index > 0 ? ', ' : ''}${speakerName(user)}${ch.creator_user_profile_id === user.user_id ? html` <span class="host-tag">${t('host')}</span>` : ''}`)}
                </div>
              </div>
              ${talking.length > 0 ? html`<div class="room-card-speaking">${t('speakingNow', { names: talking.join(', ') })}</div>` : ''}
              ${access.canJoin ? html`
                <button class="btn btn-secondary" style="width:100%;" data-action="join-room" data-channel-id="${channelId}">
                  ${t('joinStage')}
                </button>
              ` : html`
                <button class="btn btn-secondary" style="width:100%;" type="button" disabled title="${t('notVerifiedHint')}">${t('notVerifiedYet')}</button>
              `}
              ${safeUrl(ch.url) ? html`<button class="btn btn-secondary room-share" type="button" data-action="copy-room-link" data-channel-id="${ch.channel || ch.channel_id}">${t('copyLink')}</button>` : ''}
              ${access.canHide ? html`<button class="btn btn-secondary room-share" type="button" data-action="hide-room" data-channel-id="${ch.channel || ch.channel_id}">${t('hide')}</button>` : ''}
            </div>
          </div>
        `;
        })}
      </div>
      ${access.canLoadMore ? html`
        <div style="margin:16px 0; text-align:center;">
          <button class="btn btn-secondary" type="button" data-action="load-more-hallway" ${access.loadingMore ? 'disabled' : ''}>
            ${t('loadMoreRooms')}
          </button>
        </div>
      ` : ''}
      `}
      ${access.canCreate ? html`
        <button class="host-room-fab btn btn-primary" type="button" data-action="create-room">➕ ${t('startRoom')}</button>
      ` : html`
        <button class="host-room-fab btn btn-secondary" type="button" disabled title="${t('notVerifiedHint')}">${t('notVerifiedYet')}</button>
      `}
    </div>
  `;
  // Narrow layouts pad the hallway so the optional FAB does not cover cards.
  queueMicrotask(() => {
    document.getElementById('view-root')?.classList.toggle('has-fab-pad', access.canCreate);
  });
  return view;
}
