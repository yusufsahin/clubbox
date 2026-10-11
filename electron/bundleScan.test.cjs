const test = require('node:test');
const assert = require('node:assert/strict');
const { extractBundleEndpoints, isBundleScript } = require('./bundleScan.cjs');

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

test('script bodies are read only while the recorder is on clubhouse.com', () => {
  assert.equal(isBundleScript('https://cdn.example.com/app.js', 'Script', 'https://www.clubhouse.com/home'), true);
  assert.equal(isBundleScript('https://www.clubhouse.com/static/app.js', undefined, 'https://www.clubhouse.com/home'), true);
  assert.equal(isBundleScript('https://cdn.example.com/app.js', 'Script', 'https://example.com'), false);
  assert.equal(isBundleScript('https://www.clubhouse.com/photo.png', 'Image', 'https://www.clubhouse.com/home'), false);
});
