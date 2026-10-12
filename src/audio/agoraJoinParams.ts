/**
 * Pure join-parameter builder for Agora RTC (Phase 23.4).
 * Shapes only — never logs token/appId values.
 */

export type AgoraAppIdSource = 'config' | 'signin-extract' | 'fallback';

export type AgoraJoinParamInput = {
  /** Prefer config (signin-extract / settings); else hard-coded Clubhouse default. */
  configuredAppId?: string | null;
  fallbackAppId: string;
  /** join_channel.token — never rtm_token / pubnub_token. */
  rtcToken?: string | null;
  rtmToken?: string | null;
  pubnubToken?: string | null;
  /** join_channel.channel verbatim. */
  channel?: string | null;
  /** Prefer join_channel.user_profile_id; else me.user_id. Must be number for numeric tokens. */
  userProfileId?: number | string | null;
  meUserId?: number | string | null;
  isSpeaker: boolean;
};

export type AgoraJoinParams = {
  appId: string;
  appIdSource: AgoraAppIdSource;
  appIdPrefix: string;
  appIdLen: number;
  token: string;
  tokenLen: number;
  channel: string;
  channelLen: number;
  uid: number;
  uidType: 'number';
  /** Join the channel as audience first; promote to host after join when true. */
  promoteToHostAfterJoin: boolean;
  ok: boolean;
  error?: string;
};

function asPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function buildAgoraJoinParams(input: AgoraJoinParamInput): AgoraJoinParams {
  const configured = typeof input.configuredAppId === 'string' ? input.configuredAppId.trim() : '';
  const fallback = input.fallbackAppId.trim();
  let appId = '';
  let appIdSource: AgoraAppIdSource = 'fallback';
  if (configured && /^[a-fA-F0-9]{32}$/.test(configured)) {
    appId = configured;
    // Settings / crawl / sign-in extract all land in config — treat non-default as signin-extract when different.
    appIdSource = configured === fallback ? 'config' : 'signin-extract';
  } else if (/^[a-fA-F0-9]{32}$/.test(fallback)) {
    appId = fallback;
    appIdSource = 'fallback';
  }

  // Never use RTM or PubNub tokens for RTC join.
  const token = typeof input.rtcToken === 'string' ? input.rtcToken : '';
  const channel = typeof input.channel === 'string' ? input.channel : '';
  const uid = asPositiveInt(input.userProfileId) ?? asPositiveInt(input.meUserId);

  if (!appId) {
    return {
      appId: '',
      appIdSource,
      appIdPrefix: '',
      appIdLen: 0,
      token,
      tokenLen: token.length,
      channel,
      channelLen: channel.length,
      uid: 0,
      uidType: 'number',
      promoteToHostAfterJoin: input.isSpeaker,
      ok: false,
      error: 'missing_app_id',
    };
  }
  if (!token) {
    return {
      appId,
      appIdSource,
      appIdPrefix: appId.slice(0, 4),
      appIdLen: appId.length,
      token: '',
      tokenLen: 0,
      channel,
      channelLen: channel.length,
      uid: uid ?? 0,
      uidType: 'number',
      promoteToHostAfterJoin: input.isSpeaker,
      ok: false,
      error: 'missing_rtc_token',
    };
  }
  if (!channel) {
    return {
      appId,
      appIdSource,
      appIdPrefix: appId.slice(0, 4),
      appIdLen: appId.length,
      token,
      tokenLen: token.length,
      channel: '',
      channelLen: 0,
      uid: uid ?? 0,
      uidType: 'number',
      promoteToHostAfterJoin: input.isSpeaker,
      ok: false,
      error: 'missing_channel',
    };
  }
  if (uid == null) {
    return {
      appId,
      appIdSource,
      appIdPrefix: appId.slice(0, 4),
      appIdLen: appId.length,
      token,
      tokenLen: token.length,
      channel,
      channelLen: channel.length,
      uid: 0,
      uidType: 'number',
      promoteToHostAfterJoin: input.isSpeaker,
      ok: false,
      error: 'missing_uid',
    };
  }

  return {
    appId,
    appIdSource,
    appIdPrefix: appId.slice(0, 4),
    appIdLen: appId.length,
    token,
    tokenLen: token.length,
    channel,
    channelLen: channel.length,
    uid,
    uidType: 'number',
    promoteToHostAfterJoin: input.isSpeaker,
    ok: true,
  };
}
