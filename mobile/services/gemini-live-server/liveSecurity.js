'use strict';

const AUTH_FRAME_MAX_BYTES = 16 * 1024;

function parseAuthFrame(data, isBinary) {
  if (isBinary || !data || data.length > AUTH_FRAME_MAX_BYTES) return null;
  let frame;
  try {
    frame = JSON.parse(data.toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!frame || frame.type !== 'auth' || typeof frame.accessToken !== 'string') return null;
  if (!frame.accessToken || frame.accessToken.length > AUTH_FRAME_MAX_BYTES) return null;
  return { accessToken: frame.accessToken };
}

class SlidingWindow {
  constructor(maxSubjects = 10000) {
    this.maxSubjects = maxSubjects;
    this.windows = new Map();
  }

  allow(subject, limit, windowMs, now = Date.now()) {
    if (limit <= 0 || windowMs <= 0) return false;
    let entries = this.windows.get(subject);
    if (!entries) {
      this.prune(now, windowMs);
      if (this.windows.size >= this.maxSubjects) return false;
      entries = [];
      this.windows.set(subject, entries);
    }
    const cutoff = now - windowMs;
    while (entries.length && entries[0] <= cutoff) entries.shift();
    if (entries.length >= limit) return false;
    entries.push(now);
    return true;
  }

  prune(now, windowMs) {
    const cutoff = now - windowMs;
    for (const [key, entries] of this.windows) {
      while (entries.length && entries[0] <= cutoff) entries.shift();
      if (!entries.length) this.windows.delete(key);
    }
  }
}

class ConnectionRegistry {
  constructor() {
    this.total = 0;
    this.byUser = new Map();
  }

  acquire(userId, perUserLimit, globalLimit) {
    const userCount = this.byUser.get(userId) || 0;
    if (this.total >= globalLimit || userCount >= perUserLimit) return false;
    this.total += 1;
    this.byUser.set(userId, userCount + 1);
    return true;
  }

  release(userId) {
    const userCount = this.byUser.get(userId) || 0;
    if (!userCount) return;
    this.total = Math.max(0, this.total - 1);
    if (userCount === 1) this.byUser.delete(userId);
    else this.byUser.set(userId, userCount - 1);
  }
}

module.exports = { AUTH_FRAME_MAX_BYTES, ConnectionRegistry, SlidingWindow, parseAuthFrame };
