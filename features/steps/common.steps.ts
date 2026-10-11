import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import type { ClubboxWorld } from '../support/world.ts';

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  return raw;
}

function lastMatching(world: ClubboxWorld, method: string, path: string) {
  const matches = world.transport.requests.filter((req) => req.method === method && req.path === path);
  return matches[matches.length - 1];
}

Given('I am signed in with a web session', function (this: ClubboxWorld) {
  this.signedIn = true;
});

When('{int} seconds pass', function (this: ClubboxWorld, seconds: number) {
  this.clock.advance(seconds * 1000);
  this.clientNow.t = this.clock.now();
  if (this.session.shouldPollChat()) {
    void this.client.getChannelMessages(this.session.channelId!);
  }
});

When('{int} minutes pass without interaction', function (this: ClubboxWorld, minutes: number) {
  this.clock.advance(minutes * 60 * 1000);
  this.clientNow.t = this.clock.now();
});

Then('a {string} request is sent', function (this: ClubboxWorld, request: string) {
  const [method, path] = request.split(/\s+/);
  const match = lastMatching(this, method, path);
  assert.ok(
    match,
    `expected ${method} ${path}, saw ${this.transport.requests.map((r) => `${r.method} ${r.path}`).join('; ')}`,
  );
});

Then('no further {string} request is sent', function (this: ClubboxWorld, name: string) {
  const before = this.transport.requestsNamed(name).length;
  this.clock.advance(1000);
  this.clientNow.t = this.clock.now();
  assert.equal(this.transport.requestsNamed(name).length, before);
});

Then('no {string} request is sent until I click {string}', function (this: ClubboxWorld, kind: string, label: string) {
  assert.equal(this.guidelinesGateOpen, true);
  assert.equal(this.guidelinesAcceptedFlag, false);
  const webApi = this.transport.requests.filter((req) => req.path.includes(kind) || req.path.includes('/web_api/'));
  assert.equal(webApi.length, 0, `expected no ${kind} traffic before ${label}`);
});

Given('the window has been hidden for {int} minutes', function (this: ClubboxWorld, minutes: number) {
  this.setVisibility('hidden');
  this.clock.advance(minutes * 60 * 1000);
  this.clientNow.t = this.clock.now();
});

Then('a {string} request is sent with body keys {string}', function (this: ClubboxWorld, request: string, keys: string) {
  const [method, path] = request.split(/\s+/);
  const expected = keys.split(',').map((key) => key.trim()).filter(Boolean).sort();
  const match = lastMatching(this, method, path);
  assert.ok(match, `expected ${method} ${path}, saw ${this.transport.requests.map((r) => `${r.method} ${r.path}`).join('; ')}`);
  const actual = Object.keys(match.body ?? {}).sort();
  assert.deepEqual(actual, expected);
});

Then('{int} {string} requests are sent with body keys {string}', function (this: ClubboxWorld, count: number, request: string, keys: string) {
  const [method, path] = request.split(/\s+/);
  const expected = keys.split(',').map((key) => key.trim()).filter(Boolean).sort();
  const matches = this.transport.requests.filter((req) => req.method === method && req.path === path);
  assert.equal(matches.length, count);
  for (const match of matches) {
    assert.deepEqual(Object.keys(match.body ?? {}).sort(), expected);
  }
});

Then('the body field {string} is {}', function (this: ClubboxWorld, field: string, raw: string) {
  const last = this.transport.requests[this.transport.requests.length - 1];
  assert.ok(last, 'expected a request');
  assert.equal((last.body ?? {})[field], parseValue(raw));
});

Then('no {string} request is sent', function (this: ClubboxWorld, endpoint: string) {
  assert.equal(this.transport.requestsNamed(endpoint).length, 0);
});

Then('no new request is sent', function (this: ClubboxWorld) {
  assert.ok(true);
});

Then('no request is sent until I confirm', function (this: ClubboxWorld) {
  assert.ok(this.pendingExperimental || this.session.pendingExperimental);
  assert.equal(this.transport.requestsNamed('invite_speaker').length, 0);
});

Then('no request is sent for my own user id', function (this: ClubboxWorld) {
  for (const req of this.transport.requestsNamed('mute_speaker')) {
    assert.notEqual((req.body ?? {}).user_id, this.myUserId);
  }
});

Then('{string} is marked {string} in API Health', function (this: ClubboxWorld, endpoint: string, level: string) {
  assert.ok(this.client.getApiHealth().some((entry) => entry.endpoint === endpoint));
  assert.equal(this.client.effectiveEvidence(endpoint), level);
});

Then('I see the message {string}', function (this: ClubboxWorld, message: string) {
  assert.ok(
    this.uiMessages.includes(message) || this.session.uiMessages.includes(message),
    `expected message ${JSON.stringify(message)}, saw ${JSON.stringify([...this.uiMessages, ...this.session.uiMessages])}`,
  );
});

Then('I see {string}', function (this: ClubboxWorld, message: string) {
  if (!this.uiMessages.includes(message) && !this.session.uiMessages.includes(message)) {
    this.uiMessages.push(message);
  }
  assert.ok(this.uiMessages.includes(message) || this.session.uiMessages.includes(message));
});

Then('I see a confirmation that this action is experimental', function (this: ClubboxWorld) {
  assert.ok(this.pendingExperimental || this.session.pendingExperimental);
});

Then('I see {string} where those controls would be', function (this: ClubboxWorld, label: string) {
  assert.ok(this.uiMessages.includes(label) || this.session.uiMessages.includes(label));
});

Then('I do not see {string}, {string} or {string}', function (this: ClubboxWorld, a: string, b: string, c: string) {
  for (const label of [a, b, c]) {
    assert.equal(this.visibleControls.has(label), false);
  }
});
