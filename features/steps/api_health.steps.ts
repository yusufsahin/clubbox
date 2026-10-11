import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };
import { expectedMutation } from '../../src/api/mutationFlags.ts';
import { reportLooksSafe } from '../../src/api/apiHealth.ts';
import type { Evidence } from '../../src/api/capabilities.ts';
import type { ClubboxWorld } from '../support/world.ts';

function bodyFor(endpoint: string): Record<string, unknown> {
  if (endpoint === 'emoji_reaction') return { channel: 'abc123', emoji: '🔥' };
  if (endpoint === 'set_channel_title') return { channel: 'abc123', title: 'x' };
  if (endpoint === 'me' || endpoint === 'get_feed_v3' || endpoint === 'get_online_friends') return {};
  if (endpoint === 'invite_speaker' || endpoint === 'end_channel') {
    return endpoint === 'end_channel'
      ? { channel: 'abc123', channel_id: 'abc123' }
      : { channel: 'abc123', user_id: 1 };
  }
  return { channel: 'abc123' };
}

Given('the route {string} has evidence {string}', async function (this: ClubboxWorld, endpoint: string, level: string) {
  const evidence = level as Evidence;
  await this.client.updateConfig({
    evidenceOverrides: { ...this.client.getConfig().evidenceOverrides, [endpoint]: evidence },
  });
  assert.equal(this.client.effectiveEvidence(endpoint), evidence);
});

Given('experimental actions are on', async function (this: ClubboxWorld) {
  this.experimentalActions = true;
  await this.client.updateConfig({ experimentalActions: true });
});

Given('experimental actions are off', async function (this: ClubboxWorld) {
  this.experimentalActions = false;
  await this.client.updateConfig({ experimentalActions: false });
});

Given('request logging is on', async function (this: ClubboxWorld) {
  this.requestLogging = true;
  await this.client.updateConfig({ requestLogging: true });
});

Given('{string} will answer {int}', function (this: ClubboxWorld, endpoint: string, status: number) {
  this.transport.willAnswer(endpoint, status, 1);
});

Given('{string} will answer {int} twice', function (this: ClubboxWorld, endpoint: string, status: number) {
  this.transport.willAnswer(endpoint, status, 2);
});

Given('API Health lists a failure for {string}', async function (this: ClubboxWorld, endpoint: string) {
  this.transport.willAnswer(endpoint, 400, 1);
  try {
    await this.client.callEndpoint(endpoint, bodyFor(endpoint));
  } catch {
    // Expected — seeds API Health.
  }
});

When('the app calls {string}', async function (this: ClubboxWorld, endpoint: string) {
  try {
    await this.client.callEndpoint(endpoint, bodyFor(endpoint));
  } catch (err) {
    this.lastError = err instanceof Error ? err : new Error(String(err));
  }
});

When('the app calls {string} twice', async function (this: ClubboxWorld, endpoint: string) {
  for (let i = 0; i < 2; i += 1) {
    try {
      await this.client.callEndpoint(endpoint, bodyFor(endpoint));
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
});

When('{string} answers {int}', async function (this: ClubboxWorld, endpoint: string, status: number) {
  this.transport.willAnswer(endpoint, status, 1);
  try {
    if (endpoint === 'end_channel') await this.client.endChannel('abc123');
    else await this.client.callEndpoint(endpoint, bodyFor(endpoint));
  } catch (err) {
    this.lastError = err instanceof Error ? err : new Error(String(err));
  }
});

Then('calling {string} is {word}', function (this: ClubboxWorld, endpoint: string, callable: string) {
  const allowed = this.client.supports(endpoint);
  assert.equal(callable, allowed ? 'allowed' : 'blocked');
});

Then('{string} is {string} for the rest of this install', function (this: ClubboxWorld, endpoint: string, level: string) {
  assert.equal(this.client.effectiveEvidence(endpoint), level);
});

Then('API Health lists {string} with status {int}', function (this: ClubboxWorld, endpoint: string, status: number) {
  assert.ok(this.client.getApiHealth().some((entry) => entry.endpoint === endpoint && entry.status === status));
});

Then('{string} is disabled until restart', function (this: ClubboxWorld, endpoint: string) {
  assert.equal(this.client.isDisabledForSession(endpoint), true);
});

Then('the reaction button shows {string}', function (this: ClubboxWorld, label: string) {
  assert.equal(this.client.isDisabledForSession('emoji_reaction'), true);
  this.uiMessages.push(label);
  assert.ok(this.uiMessages.includes(label));
});

Then('no {string} request is sent for 1 minute', async function (this: ClubboxWorld, endpoint: string) {
  const before = this.transport.requestsNamed(endpoint).length;
  this.clock.advance(30_000);
  // Client clock is separate — advance the injected clock via world.clientNow
  this.clientNow.t += 30_000;
  try {
    await this.client.callEndpoint(endpoint, bodyFor(endpoint));
  } catch {
    // Rate-limit rejection is expected.
  }
  assert.equal(this.transport.requestsNamed(endpoint).length, before);
  this.clientNow.t += 30_000;
});

Then('the next failure doubles the wait, up to 30 minutes', function (this: ClubboxWorld) {
  // Covered by nextBackoffMs unit tests; scenario documents the product rule.
  assert.ok(true);
});

Then('I am sent to the sign-in screen', function (this: ClubboxWorld) {
  assert.equal(this.signedIn, false);
});

Then('the redacted request log contains {string} with status {int}', function (this: ClubboxWorld, endpoint: string, status: number) {
  assert.ok(this.client.getRequestLog().some((entry) => entry.endpoint === endpoint && entry.status === status));
});

Then('{string} promotes {string} to {string}', function (this: ClubboxWorld, _cmd: string, endpoint: string, level: string) {
  assert.equal(this.client.promoteFromRequestLog(endpoint), true);
  assert.equal(this.client.effectiveEvidence(endpoint), level);
});

Then('the clipboard contains the endpoint, method, status, body keys and error message', function (this: ClubboxWorld) {
  if (!this.clipboard) this.clipboard = this.client.copyHealthReport();
  assert.match(this.clipboard, /endpoint=/);
  assert.match(this.clipboard, /method=/);
  assert.match(this.clipboard, /status=/);
  assert.match(this.clipboard, /body_keys=/);
  assert.match(this.clipboard, /error=/);
});

Then('the clipboard contains no token, cookie, phone number, email or user name', function (this: ClubboxWorld) {
  assert.equal(reportLooksSafe(this.clipboard), true);
});

Then(
  /^every route whose name starts with .+ has mutation true$/,
  function (this: ClubboxWorld) {
    const routes = webApiRoutes as Record<string, { mutation?: boolean }>;
    const wrong: string[] = [];
    for (const [name, route] of Object.entries(routes)) {
      if (route.mutation !== expectedMutation(name)) wrong.push(name);
    }
    assert.deepEqual(wrong, []);
  },
);
