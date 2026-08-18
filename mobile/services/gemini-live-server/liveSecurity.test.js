'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConnectionRegistry, SlidingWindow, parseAuthFrame } = require('./liveSecurity');

test('auth frame requires an access token and ignores client identity', () => {
  assert.equal(parseAuthFrame(Buffer.from(JSON.stringify({ type: 'auth', userId: 'forged' })), false), null);
  assert.equal(parseAuthFrame(Buffer.from('not json'), false), null);
  assert.equal(parseAuthFrame(Buffer.from('{}'), true), null);
  assert.deepEqual(
    parseAuthFrame(
      Buffer.from(JSON.stringify({ type: 'auth', accessToken: 'verified-by-server', userId: 'forged' })),
      false,
    ),
    { accessToken: 'verified-by-server' },
  );
});

test('sliding window denies over-limit requests and recovers after expiry', () => {
  const window = new SlidingWindow();
  assert.equal(window.allow('user-1', 2, 1000, 1000), true);
  assert.equal(window.allow('user-1', 2, 1000, 1100), true);
  assert.equal(window.allow('user-1', 2, 1000, 1200), false);
  assert.equal(window.allow('user-1', 2, 1000, 2101), true);
});

test('connection registry enforces per-user and global caps', () => {
  const registry = new ConnectionRegistry();
  assert.equal(registry.acquire('user-1', 1, 2), true);
  assert.equal(registry.acquire('user-1', 1, 2), false);
  assert.equal(registry.acquire('user-2', 1, 2), true);
  assert.equal(registry.acquire('user-3', 1, 2), false);
  registry.release('user-1');
  assert.equal(registry.acquire('user-3', 1, 2), true);
});
