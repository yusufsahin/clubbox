const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cookieLooksLikeSession,
  isIgnorableClubhouseCookie,
  pathLooksSignedIn,
  urlLooksSignedIn,
} = require('./webSessionSignals.cjs');

test('sessionid and unknown HttpOnly cookies count; analytics and csrf do not', () => {
  assert.equal(cookieLooksLikeSession('sessionid'), true);
  assert.equal(cookieLooksLikeSession('session'), true);
  assert.equal(cookieLooksLikeSession({ name: 'identity', httpOnly: true }), true);
  assert.equal(cookieLooksLikeSession({ name: 'ch_unknown', httpOnly: true }), true);
  assert.equal(cookieLooksLikeSession({ name: 'ch_lang', httpOnly: false }), false);
  assert.equal(cookieLooksLikeSession('csrftoken'), false);
  assert.equal(cookieLooksLikeSession('_ga'), false);
  assert.equal(cookieLooksLikeSession('_gid'), false);
  assert.equal(isIgnorableClubhouseCookie('csrftoken'), true);
  assert.equal(isIgnorableClubhouseCookie('sessionid'), false);
});

test('Clubhouse /home after SMS is a signed-in surface; /signin is not', () => {
  assert.equal(pathLooksSignedIn('/home'), true);
  assert.equal(pathLooksSignedIn('/home/'), true);
  assert.equal(pathLooksSignedIn('/beta/pwa/app'), true);
  assert.equal(pathLooksSignedIn('/room/abc'), true);
  assert.equal(pathLooksSignedIn('/@someone'), true);
  assert.equal(pathLooksSignedIn('/signin'), false);
  assert.equal(pathLooksSignedIn('/signin/'), false);
  assert.equal(pathLooksSignedIn('/login'), false);
  assert.equal(pathLooksSignedIn('/'), false);
  assert.equal(urlLooksSignedIn('https://www.clubhouse.com/home'), true);
  assert.equal(urlLooksSignedIn('https://www.clubhouse.com/signin'), false);
});
