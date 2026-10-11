/* Fixture chunk — secrets are fake and must never appear outside realtime-config. */
const API_ENDPOINTS = {
  GET_CONVERSATION: () => '/web_api/get_conversation',
  ADD_CONVERSATION_SEGMENT: () => '/web_api/add_conversation_segment',
  CREATE_CONVERSATION: () => '/web_api/create_conversation',
  GET_SOCIAL_CLUB: () => '/web_api/get_social_club',
  GET_SOCIAL_CLUB_MEMBERS: () => '/web_api/get_social_club_members',
  GET_REPLAY_CHANNEL: () => '/web_api/get_replay_channel',
  JOIN_CHANNEL: () => '/web_api/join_channel',
};

authenticatedApi.post(t.API_ENDPOINTS.GET_CONVERSATION(), { conversation_id: e });
authenticatedApi.post(t.API_ENDPOINTS.ADD_CONVERSATION_SEGMENT(), { conversation_id: e, message: m });
authenticatedApi.post(t.API_ENDPOINTS.CREATE_CONVERSATION(), { user_ids: ids });
authenticatedApi.post(t.API_ENDPOINTS.GET_SOCIAL_CLUB(), { club_id: c });
authenticatedApi.post(t.API_ENDPOINTS.GET_SOCIAL_CLUB_MEMBERS(), { club_id: c });
authenticatedApi.post(t.API_ENDPOINTS.GET_REPLAY_CHANNEL(), { channel: ch });
authenticatedApi.post(t.API_ENDPOINTS.JOIN_CHANNEL(), { channel: e });

const pubnub = {
  origin: 'clubhouse.pubnubapi.com',
  publishKey: 'pub-c-fixture-publish-key-0001',
  subscribeKey: 'sub-c-fixture-subscribe-key-0001',
};
const channelName = 'channel_' + roomId;
const template = 'channel_${channel}';
if (type === 'channel_message' || type === 'channel_reaction') {
  // room ticker
}
const agora = { key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
const env = process.env.NEXT_PUBLIC_AGORA_KEY;
createClient({ mode: 'live', codec: 'vp8' });
