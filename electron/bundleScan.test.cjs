const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractBundleEndpoints,
  extractCallSites,
  extractEndpointCalls,
  isBundleScript,
  keyShape,
  mineRealtime,
  trafficKind,
} = require('./bundleScan.cjs');

test('bundle scan keeps endpoint names and drops the surrounding source', () => {
  const source = `
    fetch("/web_api/get_profile");
    api.web_api("get_followers");
    web_api.post('get_following');
    request("get_online_friends", web_api);
    const ignored = "profile";
  `;
  assert.deepEqual(extractBundleEndpoints(source), [
    'get_followers',
    'get_following',
    'get_online_friends',
    'get_profile',
  ]);
  assert.equal(extractBundleEndpoints('').length, 0);
  assert.equal(extractBundleEndpoints(null).length, 0);
});

test('call sites keep a short scrubbed snippet and the posted keys', () => {
  const source = `
    JOIN_CHANNEL:()=>"/web_api/join_channel",
    agora:{key:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    pubnub:{origin:"clubhouse.pubnubapi.com",publish:"pub-c-secret-key"},
    authenticatedApi.post(t.API_ENDPOINTS.JOIN_CHANNEL(),{channel:e,source:14})
  `;
  const sites = extractCallSites(source);
  assert.equal(sites[0].name, 'join_channel');
  assert.equal(sites[0].snippet.includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
  assert.equal(sites[0].snippet.includes('<hex32>'), true);
  assert.deepEqual(extractEndpointCalls(source), [{
    name: 'join_channel',
    method: 'POST',
    keys: ['channel', 'source'],
    path: '/web_api/join_channel',
  }]);
  const mined = mineRealtime(source);
  assert.equal(mined.appIdLiteral, true);
  assert.equal(mined.pubnubOrigin, 'clubhouse.pubnubapi.com');
});

test('realtime hosts include the clubhouse PubNub origin and Agora regions', () => {
  assert.equal(trafficKind('https://clubhouse.pubnubapi.com/v2/subscribe'), 'pubnub');
  assert.equal(trafficKind('wss://web-1.agoraio.cn/'), 'agora');
  assert.equal(trafficKind('wss://edge.sd-rtn.com/'), 'agora');
  assert.equal(trafficKind('https://www.clubhouse.com/web_api/me'), 'web_api');
  assert.deepEqual(keyShape({ channel: 'room-secret', action: 'join', nested: { user: 1 } }), {
    channel: '<channel>',
    action: 'join',
    nested: { user: 'number' },
  });
});

test('script bodies are read only while the recorder is on clubhouse.com', () => {
  assert.equal(isBundleScript('https://cdn.example.com/app.js', 'Script', 'https://www.clubhouse.com/home'), true);
  assert.equal(isBundleScript('https://www.clubhouse.com/static/app.js', undefined, 'https://www.clubhouse.com/home'), true);
  assert.equal(isBundleScript('https://cdn.example.com/app.js', 'Script', 'https://example.com'), false);
  assert.equal(isBundleScript('https://www.clubhouse.com/photo.png', 'Image', 'https://www.clubhouse.com/home'), false);
});
