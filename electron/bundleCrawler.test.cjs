const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  analyzeChunk,
  extractBuildId,
  extractPubNubTemplates,
  extractScriptPathsFromHtml,
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
  const fromHtml = extractScriptPathsFromHtml(homeHtml);
  assert.ok(fromHtml.includes('/_next/static/chunks/webpack-fixture.js'));
  assert.ok(fromHtml.includes('/_next/static/chunks/main-app-fixture.js'));
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
    ['https://www.clubhouse.com/_next/static/chunks/webpack-fixture.js', 'console.log("webpack-fixture");'],
    ['https://www.clubhouse.com/_next/static/chunks/main-app-fixture.js', 'console.log("main-app");'],
  ]);

  const crawler = createBundleCrawler({
    userDataPath: userData,
    projectRoot,
    writeProjectArtifacts: true,
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

  // Phase 30.2 — endpoints.json + endpoints-diff.json under bundle-cache/<buildId>/.
  const endpointsPath = path.join(userData, 'bundle-cache', 'buildAbc123XYZ', 'endpoints.json');
  const diffPath = path.join(userData, 'bundle-cache', 'buildAbc123XYZ', 'endpoints-diff.json');
  assert.equal(fs.existsSync(endpointsPath), true);
  assert.equal(fs.existsSync(diffPath), true);
  const endpoints = JSON.parse(fs.readFileSync(endpointsPath, 'utf8'));
  assert.ok(Array.isArray(endpoints));
  assert.ok(endpoints.includes('get_conversation'));
  const diff = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
  assert.equal(diff.buildId, 'buildAbc123XYZ');
  assert.ok(Array.isArray(diff.watchlistHits));
});

test('runtime crawl writes only under userData (never projectRoot)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-crawl-runtime-'));
  const userData = path.join(root, 'userData');
  const projectRoot = path.join(root, 'project');
  fs.mkdirSync(path.join(projectRoot, 'electron'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'api-captures'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'electron', 'webApiRoutes.json'), '{}\n');
  const marker = path.join(projectRoot, 'api-captures', 'must-not-change.txt');
  fs.writeFileSync(marker, 'keep\n');

  const files = new Map([
    ['https://www.clubhouse.com/', homeHtml],
    ['https://www.clubhouse.com/_next/static/buildAbc123XYZ/_buildManifest.js', manifest],
    ['https://www.clubhouse.com/_next/static/chunks/fixture-room.js', roomChunk],
    ['https://www.clubhouse.com/_next/static/chunks/webpack.js', 'console.log("webpack");'],
    ['https://www.clubhouse.com/_next/static/chunks/webpack-fixture.js', 'console.log("webpack-fixture");'],
    ['https://www.clubhouse.com/_next/static/chunks/main-app-fixture.js', 'console.log("main-app");'],
  ]);

  const crawler = createBundleCrawler({
    userDataPath: userData,
    projectRoot,
    writeProjectArtifacts: false,
    sleepFn: async () => {},
    fetchFn: async (url) => {
      const body = files.get(url);
      if (body == null) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => body };
    },
  });

  const result = await crawler.crawl({ force: true });
  assert.equal(result.ok, true);
  assert.equal(result.writeProjectArtifacts, false);
  assert.ok(fs.existsSync(path.join(userData, 'realtime-config.json')));
  assert.ok(fs.existsSync(path.join(userData, 'bundle-cache', 'meta.json')));
  assert.equal(fs.existsSync(path.join(projectRoot, 'api-captures', 'bundle-callsites.json')), false);
  assert.equal(fs.existsSync(path.join(projectRoot, 'api-captures', 'bundle-discovery.md')), false);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'keep\n');
  assert.equal(fs.readFileSync(path.join(projectRoot, 'electron', 'webApiRoutes.json'), 'utf8'), '{}\n');
});

test('a cache written by an older extractor is re-crawled for the same build', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-crawl-ver-'));
  const userData = path.join(root, 'userData');
  const projectRoot = path.join(root, 'project');
  fs.mkdirSync(path.join(projectRoot, 'electron'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'api-captures'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'electron', 'webApiRoutes.json'), '{}\n');
  fs.mkdirSync(path.join(userData, 'bundle-cache'), { recursive: true });
  // Same build id, but written before extractorVersion existed (it picked the dev keys).
  fs.writeFileSync(path.join(userData, 'bundle-cache', 'meta.json'), JSON.stringify({ buildId: 'buildAbc123XYZ', complete: true, chunks: 2 }));

  const files = new Map([
    ['https://www.clubhouse.com/', homeHtml],
    ['https://www.clubhouse.com/_next/static/buildAbc123XYZ/_buildManifest.js', manifest],
    ['https://www.clubhouse.com/_next/static/chunks/fixture-room.js', roomChunk],
    ['https://www.clubhouse.com/_next/static/chunks/webpack.js', 'console.log("webpack");'],
    ['https://www.clubhouse.com/_next/static/chunks/webpack-fixture.js', 'console.log("webpack-fixture");'],
    ['https://www.clubhouse.com/_next/static/chunks/main-app-fixture.js', 'console.log("main-app");'],
  ]);
  const crawler = createBundleCrawler({
    userDataPath: userData,
    projectRoot,
    writeProjectArtifacts: false,
    sleepFn: async () => {},
    fetchFn: async (url) => {
      const body = files.get(url);
      if (body == null) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => body };
    },
  });
  const first = await crawler.crawl();
  assert.equal(first.reason, 'crawled');
  const second = await crawler.crawl();
  assert.equal(second.reason, 'cache_hit');
});

test('cache hit is skipped when realtime-config secrets are missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-crawl-secrets-'));
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
    ['https://www.clubhouse.com/_next/static/chunks/webpack-fixture.js', 'console.log("webpack-fixture");'],
    ['https://www.clubhouse.com/_next/static/chunks/main-app-fixture.js', 'console.log("main-app");'],
  ]);
  const crawler = createBundleCrawler({
    userDataPath: userData,
    projectRoot,
    writeProjectArtifacts: false,
    sleepFn: async () => {},
    fetchFn: async (url) => {
      const body = files.get(url);
      if (body == null) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => body };
    },
  });
  const first = await crawler.crawl();
  assert.equal(first.reason, 'crawled');
  fs.unlinkSync(path.join(userData, 'realtime-config.json'));
  let fetches = 0;
  const crawler2 = createBundleCrawler({
    userDataPath: userData,
    projectRoot,
    writeProjectArtifacts: false,
    sleepFn: async () => {},
    fetchFn: async (url) => {
      fetches += 1;
      const body = files.get(url);
      if (body == null) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => body };
    },
  });
  const again = await crawler2.crawl();
  assert.equal(again.reason, 'crawled');
  assert.ok(fetches > 0);
  assert.ok(fs.existsSync(path.join(userData, 'realtime-config.json')));
});

test('extractSecrets picks the production config block, not the first (dev) one', () => {
  // The clubhouse.com bundle ships dev, staging and production config objects in that order.
  // Production is the block with a live Stripe key; .match() alone returns the dev block.
  const block = (stripe, pub, sub, agora) =>
    `stripe:{publishableKey:"${stripe}"},pubnub:{origin:"clubhouse.pubnubapi.com",publish:"${pub}",subscribe:"${sub}"},agora:{key:"${agora}"},giphy:{apiKey:"x"}`;
  const chunk = [
    block('pk_test_dev', 'pub-c-dev-0001', 'sub-c-dev-0001', '11111111111111111111111111111111'),
    block('pk_test_stage', 'pub-c-stage-0001', 'sub-c-stage-0001', '22222222222222222222222222222222'),
    block('pk_live_prod', 'pub-c-prod-0001', 'sub-c-prod-0001', '33333333333333333333333333333333'),
  ].join(',');
  const secrets = extractSecrets(chunk);
  assert.equal(secrets.agoraAppId, '33333333333333333333333333333333');
  assert.equal(secrets.pubnubPublishKey, 'pub-c-prod-0001');
  assert.equal(secrets.pubnubSubscribeKey, 'sub-c-prod-0001');
});

test('extractSecrets reports env key names without writing them', () => {
  const secrets = extractSecrets(roomChunk);
  assert.ok(secrets.envKeys.includes('NEXT_PUBLIC_AGORA_KEY'));
  assert.equal(secrets.agoraAppId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});
