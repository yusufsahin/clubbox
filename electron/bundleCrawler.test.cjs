const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  analyzeChunk,
  extractBuildId,
  extractPubNubTemplates,
  extractSecrets,
  parseBuildManifest,
} = require('./bundleScan.cjs');
const { createBundleCrawler, discoveryReport } = require('./bundleCrawler.cjs');
const { outputHasLeak } = require('./redact.cjs');

const fixtures = path.join(__dirname, 'fixtures');
const roomChunk = fs.readFileSync(path.join(fixtures, 'bundle-chunk-room.js'), 'utf8');
const manifest = fs.readFileSync(path.join(fixtures, 'buildManifest.js'), 'utf8');
const homeHtml = fs.readFileSync(path.join(fixtures, 'home.html'), 'utf8');

test('extractBuildId and parseBuildManifest read Next.js assets', () => {
  assert.equal(extractBuildId(homeHtml), 'buildAbc123XYZ');
  const chunks = parseBuildManifest(manifest, 'buildAbc123XYZ');
  assert.ok(chunks.includes('/_next/static/chunks/fixture-room.js'));
  assert.ok(chunks.includes('/_next/static/chunks/webpack.js'));
});

test('fixture chunk yields call sites and PubNub templates', () => {
  const analyzed = analyzeChunk(roomChunk, { path: '/_next/static/chunks/fixture-room.js' });
  const names = analyzed.calls.map((call) => call.name).sort();
  assert.ok(names.includes('get_conversation'));
  assert.ok(names.includes('add_conversation_segment'));
  assert.ok(names.includes('create_conversation'));
  assert.ok(names.includes('get_social_club'));
  assert.ok(names.includes('get_social_club_members'));
  assert.ok(names.includes('get_replay_channel'));
  const convo = analyzed.calls.find((call) => call.name === 'get_conversation');
  assert.deepEqual(convo.keys, ['conversation_id']);
  const templates = extractPubNubTemplates(roomChunk);
  assert.ok(templates.some((entry) => entry.includes('channel_')));
  assert.ok(analyzed.realtime.messageTypes.includes('channel_message'));
});

test('secret values never land outside realtime-config.json', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-crawl-'));
  const userData = path.join(root, 'userData');
  const projectRoot = path.join(root, 'project');
  fs.mkdirSync(path.join(projectRoot, 'electron'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'api-captures'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'electron', 'webApiRoutes.json'), '{}\n');

  const files = new Map([
    ['https://www.clubhouse.com/', homeHtml],
    ['https://www.clubhouse.com/_next/static/buildAbc123XYZ/_buildManifest.js', manifest],
    ['https://www.clubhouse.com/_next/static/chunks/fixture-room.js', roomChunk],
    ['https://www.clubhouse.com/_next/static/chunks/webpack.js', 'console.log("webpack");'],
  ]);

  const crawler = createBundleCrawler({
    userDataPath: userData,
    projectRoot,
    sleepFn: async () => {},
    fetchFn: async (url) => {
      const body = files.get(url);
      if (body == null) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => body };
    },
  });

  const result = await crawler.crawl({ force: true });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'crawled');

  const secrets = JSON.parse(fs.readFileSync(path.join(userData, 'realtime-config.json'), 'utf8'));
  assert.equal(secrets.agoraAppId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(secrets.pubnubPublishKey, 'pub-c-fixture-publish-key-0001');
  assert.equal(secrets.pubnubSubscribeKey, 'sub-c-fixture-subscribe-key-0001');

  const callsites = fs.readFileSync(path.join(projectRoot, 'api-captures', 'bundle-callsites.json'), 'utf8');
  const report = fs.readFileSync(path.join(projectRoot, 'api-captures', 'bundle-discovery.md'), 'utf8');
  const routes = fs.readFileSync(path.join(projectRoot, 'electron', 'webApiRoutes.json'), 'utf8');
  for (const text of [callsites, report, routes]) {
    assert.equal(outputHasLeak(text), false);
    assert.equal(text.includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
    assert.equal(text.includes('pub-c-fixture-publish-key-0001'), false);
    assert.equal(text.includes('sub-c-fixture-subscribe-key-0001'), false);
  }

  const reportDoc = discoveryReport(JSON.parse(callsites).scripts, JSON.parse(callsites).realtime);
  assert.match(reportDoc, /get_conversation.: found/);
  assert.match(reportDoc, /PubNub channel templates/);
});

test('extractSecrets reports env key names without writing them', () => {
  const secrets = extractSecrets(roomChunk);
  assert.ok(secrets.envKeys.includes('NEXT_PUBLIC_AGORA_KEY'));
  assert.equal(secrets.agoraAppId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});
