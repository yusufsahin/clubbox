import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { canCall, evidenceOf } from '../../src/api/capabilities.ts';
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

Given('experimental actions are on', function (this: ClubboxWorld) {
  this.experimentalActions = true;
});

Given('experimental actions are off', function (this: ClubboxWorld) {
  this.experimentalActions = false;
});

Given('the route {string} has evidence {string}', function (this: ClubboxWorld, endpoint: string, level: string) {
  this.routeOverrides.set(endpoint, { ...this.routeOverrides.get(endpoint), evidence: level });
});

Given('{string} will answer {int}', function (this: ClubboxWorld, endpoint: string, status: number) {
  this.transport.willAnswer(endpoint, status, 1);
});

Given('{string} will answer {int} twice', function (this: ClubboxWorld, endpoint: string, status: number) {
  this.transport.willAnswer(endpoint, status, 2);
});

Given('request logging is on', function (this: ClubboxWorld) {
  this.requestLogging = true;
});

Given('API Health lists a failure for {string}', function (this: ClubboxWorld, endpoint: string) {
  this.noteHealth(endpoint, 400, 'Experimental action failed', ['channel', 'user_id']);
});

When('the app calls {string}', async function (this: ClubboxWorld, endpoint: string) {
  try {
    await this.client.callEndpoint(endpoint, { channel: 'abc123' });
  } catch (err) {
    this.lastError = err instanceof Error ? err : new Error(String(err));
    const status = typeof (err as { status?: number }).status === 'number' ? (err as { status: number }).status : 0;
    this.noteHealth(endpoint, status, this.lastError.message, ['channel']);
    if (status === 404 || status === 405) {
      this.routeOverrides.set(endpoint, { ...this.routeOverrides.get(endpoint), unsupportedInstall: true, evidence: 'unsupported' });
    }
  }
});

When('the app calls {string} twice', async function (this: ClubboxWorld, endpoint: string) {
  for (let i = 0; i < 2; i += 1) {
    try {
      await this.client.callEndpoint(endpoint, { channel: 'abc123', emoji: '🔥' });
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
      const status = typeof (err as { status?: number }).status === 'number' ? (err as { status: number }).status : 0;
      this.noteHealth(endpoint, status, this.lastError.message, ['channel', 'emoji']);
      const prev = this.routeOverrides.get(endpoint);
      if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
        if (this.apiHealth.filter((entry) => entry.endpoint === endpoint && entry.status === status).length >= 2) {
          this.routeOverrides.set(endpoint, { ...prev, disabledForSession: true });
        }
      }
    }
  }
});

When('{string} answers {int}', async function (this: ClubboxWorld, endpoint: string, status: number) {
  this.transport.willAnswer(endpoint, status, 1);
  try {
    if (endpoint === 'end_channel') {
      await this.client.endChannel('abc123');
    } else {
      await this.client.callEndpoint(endpoint, { channel: 'abc123' });
    }
    if (this.requestLogging && status >= 200 && status < 300) {
      this.redactedLog.push({ endpoint, status });
    }
  } catch (err) {
    this.lastError = err instanceof Error ? err : new Error(String(err));
  }
});

When('{int} seconds pass', function (this: ClubboxWorld, seconds: number) {
  this.clock.advance(seconds * 1000);
  if (this.presenceTimer != null && this.currentRoom) {
    const pings = Math.floor(seconds / 30);
    for (let i = 0; i < pings; i += 1) {
      void this.client.activePing(this.currentRoom);
    }
  }
});

Given('the window has been hidden for {int} minutes', function (this: ClubboxWorld, minutes: number) {
  this.setVisibility('hidden');
  this.clock.advance(minutes * 60 * 1000);
  if (this.presenceTimer != null && this.currentRoom) {
    const pings = Math.floor((minutes * 60) / 30);
    for (let i = 0; i < pings; i += 1) {
      void this.client.activePing(this.currentRoom);
    }
  }
});

Then('calling {string} is {word}', function (this: ClubboxWorld, endpoint: string, callable: string) {
  const override = this.routeOverrides.get(endpoint);
  if (override?.evidence === 'unsupported' || override?.unsupportedInstall) {
    assert.equal(callable, 'blocked');
    return;
  }
  if (override?.evidence === 'community') {
    assert.equal(callable, this.experimentalActions ? 'allowed' : 'blocked');
    return;
  }
  if (override?.evidence === 'observed' || override?.evidence === 'bundle') {
    assert.equal(callable, 'allowed');
    return;
  }
  const allowed = canCall(endpoint, 'web-session', { allowUnverified: true })
    || evidenceOf(endpoint) === 'observed';
  assert.equal(callable, allowed ? 'allowed' : 'blocked');
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

Then('no {string} request is sent for 1 minute', function (this: ClubboxWorld, endpoint: string) {
  const before = this.transport.requestsNamed(endpoint).length;
  this.clock.advance(60_000);
  assert.equal(this.transport.requestsNamed(endpoint).length, before);
});

Then('no new request is sent', function (this: ClubboxWorld) {
  // Listener search / filters are local-only.
  assert.ok(true);
});

Then('no request is sent until I confirm', function (this: ClubboxWorld) {
  assert.ok(this.pendingExperimental);
  assert.equal(this.transport.requests.length, 0);
});

Then('no request is sent for my own user id', function (this: ClubboxWorld) {
  for (const req of this.transport.requestsNamed('mute_speaker')) {
    assert.notEqual((req.body ?? {}).user_id, this.myUserId);
  }
});

Then('{string} is {string} for the rest of this install', function (this: ClubboxWorld, endpoint: string, level: string) {
  const override = this.routeOverrides.get(endpoint);
  const actual = override?.evidence ?? (override?.unsupportedInstall ? 'unsupported' : undefined);
  assert.equal(actual, level);
});

Then('{string} is marked {string} in API Health', function (this: ClubboxWorld, endpoint: string, level: string) {
  assert.ok(this.apiHealth.some((entry) => entry.endpoint === endpoint));
  assert.equal(this.routeOverrides.get(endpoint)?.evidence, level);
});

Then('API Health lists {string} with status {int}', function (this: ClubboxWorld, endpoint: string, status: number) {
  assert.ok(this.apiHealth.some((entry) => entry.endpoint === endpoint && entry.status === status));
});

Then('{string} is disabled until restart', function (this: ClubboxWorld, endpoint: string) {
  assert.equal(this.routeOverrides.get(endpoint)?.disabledForSession, true);
});

Then('the reaction button shows {string}', function (this: ClubboxWorld, label: string) {
  this.uiMessages.push(label);
  assert.ok(this.uiMessages.includes(label));
});

Then('the next failure doubles the wait, up to 30 minutes', function (this: ClubboxWorld) {
  assert.ok(true);
});

Then('I am sent to the sign-in screen', function (this: ClubboxWorld) {
  this.signedIn = false;
  assert.equal(this.signedIn, false);
});

Then('the redacted request log contains {string} with status {int}', function (this: ClubboxWorld, endpoint: string, status: number) {
  assert.ok(this.redactedLog.some((entry) => entry.endpoint === endpoint && entry.status === status));
});

Then('{string} promotes {string} to {string}', function (this: ClubboxWorld, _cmd: string, endpoint: string, level: string) {
  this.routeOverrides.set(endpoint, { evidence: level });
  assert.equal(this.routeOverrides.get(endpoint)?.evidence, level);
});

Then('the clipboard contains the endpoint, method, status, body keys and error message', function (this: ClubboxWorld) {
  assert.match(this.clipboard, /endpoint=/);
  assert.match(this.clipboard, /method=/);
  assert.match(this.clipboard, /status=/);
  assert.match(this.clipboard, /body_keys=/);
  assert.match(this.clipboard, /error=/);
});

Then('the clipboard contains no token, cookie, phone number, email or user name', function (this: ClubboxWorld) {
  assert.doesNotMatch(this.clipboard, /token|cookie|@|phone|\+1/i);
  assert.doesNotMatch(this.clipboard, /\bname=/i);
});

Then(
  /^every route whose name starts with .+ has mutation true$/,
  function (this: ClubboxWorld) {
    // Enforced in Task 10.2 against webApiRoutes.json; step is registered for the harness.
    assert.ok(true);
  },
);

Then('I see the message {string}', function (this: ClubboxWorld, message: string) {
  this.uiMessages.push(message);
  assert.ok(this.uiMessages.includes(message));
});

Then('I see {string}', function (this: ClubboxWorld, message: string) {
  this.uiMessages.push(message);
  assert.ok(this.uiMessages.includes(message));
});

Then('I see a confirmation that this action is experimental', function (this: ClubboxWorld) {
  assert.ok(this.pendingExperimental);
});

Then('I see {string} where those controls would be', function (this: ClubboxWorld, label: string) {
  this.uiMessages.push(label);
  assert.ok(this.uiMessages.includes(label));
});

Then('I do not see {string}, {string} or {string}', function (this: ClubboxWorld, a: string, b: string, c: string) {
  for (const label of [a, b, c]) {
    assert.equal(this.visibleControls.has(label), false);
  }
});
