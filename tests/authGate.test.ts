import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsAuthGate } from '../src/app/authGate.ts';

test('needsAuthGate true only for desktop live without session', () => {
  assert.equal(needsAuthGate({
    isElectron: true,
    useSandbox: false,
    webSession: false,
  }), true);
});

test('needsAuthGate false when sandbox', () => {
  assert.equal(needsAuthGate({
    isElectron: true,
    useSandbox: true,
    webSession: false,
  }), false);
});

test('needsAuthGate false when webSession', () => {
  assert.equal(needsAuthGate({
    isElectron: true,
    useSandbox: false,
    webSession: true,
  }), false);
});

test('needsAuthGate false when forceSandbox (e2e)', () => {
  assert.equal(needsAuthGate({
    isElectron: true,
    forceSandbox: true,
    useSandbox: false,
    webSession: false,
  }), false);
});

test('needsAuthGate false in browser', () => {
  assert.equal(needsAuthGate({
    isElectron: false,
    useSandbox: false,
    webSession: false,
  }), false);
});
