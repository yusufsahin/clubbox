import { myRoomRole } from './roomServerFlags.ts';
import type { CHChannelDetail, UserCapabilities } from './types.ts';

export type LiveDetailsRow = {
  key: string;
  labelKey: string;
  value: string;
};

export type LiveDetailsAudio = {
  qualityLevel?: string | null;
  sendBitrateKbps?: number | null;
  stereo?: boolean | null;
  networkTone?: string | null;
};

export type LiveDetailsModel = {
  title: string;
  roomRows: LiveDetailsRow[];
  liveRows: LiveDetailsRow[];
  stateRows: LiveDetailsRow[];
  meRows: LiveDetailsRow[];
  audioRows: LiveDetailsRow[];
  serverRows: LiveDetailsRow[];
  capabilityRows: LiveDetailsRow[];
  /** Always shown for honesty (30.1 / 30.5). */
  moderationNoteKey: 'hostToolsAppOnly';
};

export type LiveDetailsOpts = {
  myUserId?: number | null;
  /** Latest cumulative listeners (PubNub num_ever). */
  numEver?: number | null;
  audio?: LiveDetailsAudio | null;
};

function handraiseLabel(channel: CHChannelDetail): string | null {
  const setting = channel.handraise_queue_setting;
  if (typeof setting !== 'number') {
    if (channel.is_handraise_enabled === false) return 'off';
    return null;
  }
  const opt = channel.handraise_queue_options?.find((o) => o.value === setting);
  if (opt?.label) return opt.label;
  if (setting === 0) return 'open';
  if (setting === 1) return 'invite';
  if (setting === 2) return 'raise';
  return String(setting);
}

function privacyLabel(channel: CHChannelDetail): string | null {
  if (typeof channel.privacy_label === 'string' && channel.privacy_label) return channel.privacy_label;
  if (channel.is_social_mode) return 'social';
  if (channel.is_private) return 'private';
  return 'open';
}

function topicList(channel: CHChannelDetail): string | null {
  if (typeof channel.topic_key === 'string' && channel.topic_key) return channel.topic_key;
  if (!Array.isArray(channel.topics) || channel.topics.length === 0) return null;
  const names = channel.topics.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      if (typeof entry.title === 'string') return entry.title;
      if (typeof entry.name === 'string') return entry.name;
    }
    return '';
  }).filter(Boolean);
  return names.length ? names.join(', ') : null;
}

function boolLabel(value: boolean | undefined): string | null {
  if (value === true) return 'on';
  if (value === false) return 'off';
  return null;
}

function reactionOptionsSummary(channel: CHChannelDetail): string | null {
  const opts = channel.emoji_reaction_options;
  if (!Array.isArray(opts) || opts.length === 0) return null;
  const parts: string[] = [];
  for (const entry of opts) {
    if (typeof entry === 'string' && entry.trim()) parts.push(entry.trim());
    else if (entry && typeof entry === 'object') {
      const rec = entry as { emoji?: unknown; value?: unknown };
      const raw = typeof rec.emoji === 'string' ? rec.emoji
        : typeof rec.value === 'string' ? rec.value
          : '';
      if (raw.trim()) parts.push(raw.trim());
    }
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * Pure view-model for the Live details sheet (29.1 / 30.5).
 * Missing / unknown fields omit their row.
 */
export function buildLiveDetails(
  channel: CHChannelDetail | null | undefined,
  opts: LiveDetailsOpts = {},
): LiveDetailsModel | null {
  if (!channel || typeof channel.channel !== 'string' || !channel.channel) return null;

  const roomRows: LiveDetailsRow[] = [];
  const title = typeof channel.topic === 'string' && channel.topic ? channel.topic : channel.channel;
  roomRows.push({ key: 'title', labelKey: 'liveDetailsTitle', value: title });
  const privacy = privacyLabel(channel);
  if (privacy) roomRows.push({ key: 'privacy', labelKey: 'liveDetailsPrivacy', value: privacy });
  if (typeof channel.language === 'string' && channel.language) {
    roomRows.push({ key: 'language', labelKey: 'liveDetailsLanguage', value: channel.language });
  }
  if (typeof channel.time_created === 'string' && channel.time_created) {
    roomRows.push({ key: 'created', labelKey: 'liveDetailsCreated', value: channel.time_created });
  }
  const topics = topicList(channel);
  if (topics) roomRows.push({ key: 'topics', labelKey: 'liveDetailsTopics', value: topics });
  if (typeof channel.club_name === 'string' && channel.club_name) {
    roomRows.push({ key: 'house', labelKey: 'liveDetailsHouse', value: channel.club_name });
  }
  const nsfw = boolLabel(channel.is_nsfw);
  if (nsfw) roomRows.push({ key: 'nsfw', labelKey: 'liveDetailsNsfw', value: nsfw });

  const liveRows: LiveDetailsRow[] = [];
  if (typeof channel.num_speakers === 'number') {
    liveRows.push({ key: 'speakers', labelKey: 'liveDetailsSpeakers', value: String(channel.num_speakers) });
  }
  if (typeof channel.num_all === 'number') {
    liveRows.push({ key: 'listeners', labelKey: 'liveDetailsListeners', value: String(channel.num_all) });
  }
  const cumulative = typeof opts.numEver === 'number'
    ? opts.numEver
    : (typeof channel.num_ever === 'number' ? channel.num_ever : null);
  if (cumulative != null) {
    liveRows.push({ key: 'cumulative', labelKey: 'liveDetailsCumulative', value: String(cumulative) });
  }
  if (typeof channel.num_shares === 'number') {
    liveRows.push({ key: 'shares', labelKey: 'liveDetailsShares', value: String(channel.num_shares) });
  }
  if (typeof channel.num_clips === 'number') {
    liveRows.push({ key: 'clips', labelKey: 'liveDetailsClips', value: String(channel.num_clips) });
  }

  const stateRows: LiveDetailsRow[] = [];
  const replay = boolLabel(channel.is_replay_enabled);
  if (replay) stateRows.push({ key: 'replay', labelKey: 'liveDetailsReplay', value: replay });
  const chat = boolLabel(channel.is_chat_enabled);
  if (chat) {
    let chatValue = chat;
    if (channel.chat_permission != null && channel.chat_permission !== '') {
      chatValue = `${chat} (${String(channel.chat_permission)})`;
    }
    stateRows.push({ key: 'chat', labelKey: 'liveDetailsChat', value: chatValue });
  }
  const handraise = handraiseLabel(channel);
  if (handraise) stateRows.push({ key: 'handraise', labelKey: 'liveDetailsHandraise', value: handraise });
  if (typeof channel.handraise_permission === 'number') {
    stateRows.push({
      key: 'handraise_permission',
      labelKey: 'liveDetailsHandraisePermission',
      value: String(channel.handraise_permission),
    });
  }
  const web = boolLabel(channel.is_web_listening_enabled);
  if (web) stateRows.push({ key: 'web', labelKey: 'liveDetailsWebListening', value: web });
  const highlights = boolLabel(channel.are_highlights_enabled);
  if (highlights) stateRows.push({ key: 'highlights', labelKey: 'liveDetailsHighlights', value: highlights });
  if (channel.clips_permission != null && channel.clips_permission !== '') {
    stateRows.push({
      key: 'clips_permission',
      labelKey: 'liveDetailsClipsPermission',
      value: String(channel.clips_permission),
    });
  }

  const meRows: LiveDetailsRow[] = [];
  const role = myRoomRole(channel.users, opts.myUserId);
  if (role) meRows.push({ key: 'role', labelKey: 'liveDetailsMyRole', value: role });

  const audioRows: LiveDetailsRow[] = [];
  const audio = opts.audio;
  if (audio) {
    if (typeof audio.qualityLevel === 'string' && audio.qualityLevel) {
      audioRows.push({ key: 'quality', labelKey: 'liveDetailsAudioQuality', value: audio.qualityLevel });
    }
    if (typeof audio.sendBitrateKbps === 'number' && Number.isFinite(audio.sendBitrateKbps)) {
      audioRows.push({
        key: 'bitrate',
        labelKey: 'liveDetailsAudioBitrate',
        value: `${Math.round(audio.sendBitrateKbps)} kbps`,
      });
    }
    if (audio.stereo === true) {
      audioRows.push({ key: 'stereo', labelKey: 'liveDetailsAudioStereo', value: 'stereo' });
    } else if (audio.stereo === false) {
      audioRows.push({ key: 'stereo', labelKey: 'liveDetailsAudioStereo', value: 'mono' });
    }
    if (typeof audio.networkTone === 'string' && audio.networkTone) {
      audioRows.push({ key: 'network', labelKey: 'liveDetailsAudioNetwork', value: audio.networkTone });
    }
  }

  const serverRows: LiveDetailsRow[] = [];
  const lastSpeaker = boolLabel(channel.show_last_speaker_warning);
  if (lastSpeaker) {
    serverRows.push({ key: 'last_speaker_warning', labelKey: 'liveDetailsLastSpeakerWarning', value: lastSpeaker });
  }
  const hideCrowns = boolLabel(channel.hide_moderator_indicator);
  if (hideCrowns) {
    serverRows.push({ key: 'hide_crowns', labelKey: 'liveDetailsHideModeratorIndicator', value: hideCrowns });
  }
  const caps: UserCapabilities | undefined = channel.user_capabilities;
  if (caps?.stage_removed === true) {
    serverRows.push({ key: 'stage_removed', labelKey: 'liveDetailsStageRemoved', value: 'on' });
  }
  if (caps?.can_rejoin_stage_directly === true) {
    serverRows.push({ key: 'can_rejoin', labelKey: 'liveDetailsCanRejoinStage', value: 'on' });
  }
  const reactions = reactionOptionsSummary(channel);
  if (reactions) {
    serverRows.push({ key: 'emoji_options', labelKey: 'liveDetailsEmojiOptions', value: reactions });
  }
  if (channel.welcome_for_user_profile && typeof channel.welcome_for_user_profile === 'object') {
    const name = typeof channel.welcome_for_user_profile.name === 'string'
      ? channel.welcome_for_user_profile.name
      : typeof channel.welcome_for_user_profile.username === 'string'
        ? channel.welcome_for_user_profile.username
        : null;
    if (name) {
      serverRows.push({ key: 'welcome', labelKey: 'liveDetailsWelcome', value: name });
    }
  }

  const capabilityRows: LiveDetailsRow[] = [];
  if (caps) {
    for (const [key, value] of Object.entries(caps)) {
      if (!key.startsWith('can_') || value !== true) continue;
      capabilityRows.push({ key, labelKey: 'liveDetailsCapability', value: key.replace(/^can_/, '') });
    }
    capabilityRows.sort((a, b) => a.value.localeCompare(b.value));
  }

  return {
    title,
    roomRows,
    liveRows,
    stateRows,
    meRows,
    audioRows,
    serverRows,
    capabilityRows,
    moderationNoteKey: 'hostToolsAppOnly',
  };
}
