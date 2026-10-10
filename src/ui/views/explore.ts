import { t } from '../../i18n';
import type { CHChannel, FeedTopic } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, safeUrl, type SafeHtml } from '../html';

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

export function exploreView(
  channels: CHChannel[],
  topics: FeedTopic[],
  notices: string[],
  access: { canJoin: boolean; canCreate: boolean },
): SafeHtml {
  return html`
    <div style="max-width:1100px; margin:0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <h2 style="font-size:22px; font-weight:700;">${t('liveRooms')}</h2>
          <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">${t('liveRoomsHelp')}</p>
        </div>
        <button class="btn btn-secondary" data-action="refresh-explore">${t('refresh')}</button>
      </div>
      <div class="topic-chips">
          <button class="topic-chip active" type="button" data-action="refresh-explore">${t('forYou')}</button>
          ${topics.map((topic) => html`<span class="topic-chip">${topic.display_name}</span>`)}
      </div>
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
          return html`
          <div class="room-card ${ch.visited ? 'is-visited' : ''}" ${access.canJoin ? html`data-action="join-room" data-channel-id="${channelId}"` : ''}>
            <div>
              <div class="room-card-header">
                <span class="room-card-club">${housePhoto(ch)} ${ch.club_name || 'Clubhouse'}</span>
                <div class="room-card-stats">
                  <span>👥 ${ch.num_all}</span>
                  <span>🎙️ ${ch.num_speakers}</span>
                </div>
              </div>
              <div class="room-card-topic">${ch.topic}</div>
              ${privacyLine(ch)}
              ${ch.is_replay_enabled ? html`<div class="replay-note">${t('replayAvailable')}</div>` : ''}
              ${ch.is_active_trending_topic_channel ? html`<div class="replay-note">${t('trending')}</div>` : ''}
              ${ch.is_social_mode ? html`<div class="replay-note">${t('socialRoom')}</div>` : ''}
            </div>

            <div>
              <div class="room-card-speakers">
                <div class="speaker-avatar-overlap">
                  ${shown.map((user) => avatarHtml(user, 32))}
                  ${extra > 0 ? html`<span class="room-card-more">${t('moreSpeakers', { count: extra })}</span>` : ''}
                </div>
                <div class="speaker-names-list">
                  ${shown.map((user, index) => html`${index > 0 ? ', ' : ''}${user.name}${ch.creator_user_profile_id === user.user_id ? html` <span class="host-tag">${t('host')}</span>` : ''}`)}
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
            </div>
          </div>
        `;
        })}
      </div>
      `}
      ${access.canCreate ? html`
        <button class="host-room-fab btn btn-primary" type="button" data-action="create-room">➕ ${t('startRoom')}</button>
      ` : html`
        <button class="host-room-fab btn btn-secondary" type="button" disabled title="${t('notVerifiedHint')}">${t('notVerifiedYet')}</button>
      `}
    </div>
  `;
}
