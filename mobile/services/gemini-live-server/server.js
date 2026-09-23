/**
 * Aboy AI — authenticated Gemini Live WebSocket proxy.
 * Identity is derived only from a verified Supabase access token. Provider
 * sockets are never created for anonymous or over-limit clients.
 */
'use strict';

require('dotenv').config();
const http = require('http');
const { randomUUID } = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { ConnectionRegistry, SlidingWindow, parseAuthFrame } = require('./liveSecurity');

function boundedInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

const PORT = boundedInt('PORT', 8080, 1, 65535);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const AUTH_TIMEOUT_MS = boundedInt('LIVE_AUTH_TIMEOUT_MS', 8000, 1000, 30000);
const IDLE_TIMEOUT_MS = boundedInt('LIVE_IDLE_TIMEOUT_MS', 45000, 5000, 300000);
const MAX_SESSION_MS = boundedInt('LIVE_MAX_SESSION_MS', 900000, 10000, 3600000);
const MAX_MESSAGE_BYTES = boundedInt('LIVE_MAX_MESSAGE_BYTES', 1048576, 16384, 4194304);
const USER_SESSIONS_PER_DAY = boundedInt('LIVE_USER_SESSIONS_PER_DAY', 20, 1, 200);
const GLOBAL_SESSIONS_PER_MINUTE = boundedInt('LIVE_GLOBAL_SESSIONS_PER_MINUTE', 60, 1, 600);
const MAX_CONNECTIONS_PER_USER = boundedInt('LIVE_MAX_CONNECTIONS_PER_USER', 1, 1, 5);
const MAX_GLOBAL_CONNECTIONS = boundedInt('LIVE_MAX_GLOBAL_CONNECTIONS', 20, 1, 100);
const MAX_PENDING_AUTH = boundedInt('LIVE_MAX_PENDING_AUTH', 40, 1, 200);
const MAX_PENDING_BYTES = Math.min(MAX_MESSAGE_BYTES * 2, 4 * 1024 * 1024);
const MAX_RETRIES = 2;

const GEMINI_HOST =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

const configured = Boolean(
  GEMINI_API_KEY &&
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_ANON_KEY &&
    SUPABASE_SERVICE_KEY,
);
const supabaseWriter = configured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  : null;
const sessionLimits = new SlidingWindow();
const connections = new ConnectionRegistry();
let pendingAuthConnections = 0;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function closeSocket(socket, code, reason) {
  try {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(code, reason);
    }
  } catch (_) {}
}

async function authenticateAccessToken(accessToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && typeof user.id === 'string' && user.id ? { id: user.id } : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(configured ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: configured ? 'ok' : 'unavailable',
        service: 'gemini-live-proxy',
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MESSAGE_BYTES });
httpServer.listen(PORT, () => log(`Gemini Live proxy listening on :${PORT}`));

wss.on('connection', (phone) => {
  const session = {
    id: randomUUID().slice(0, 8),
    userId: null,
    startedAt: null,
    transcript: [],
    transcriptChars: 0,
    closed: false,
    authenticated: false,
    authenticating: false,
    connectionAcquired: false,
    pendingAuthCounted: false,
    audioIn: 0,
    imageIn: 0,
    setupComplete: false,
    audioOut: 0,
  };
  let gemini = null;
  let retries = 0;
  let pendingBytes = 0;
  const pendingFromPhone = [];
  let idleTimer = null;
  let maxSessionTimer = null;

  if (!configured) {
    closeSocket(phone, 1011, 'Live service unavailable');
    return;
  }
  if (pendingAuthConnections >= MAX_PENDING_AUTH) {
    closeSocket(phone, 4429, 'Live service is busy');
    return;
  }
  pendingAuthConnections += 1;
  session.pendingAuthCounted = true;

  function releasePendingAuth() {
    if (!session.pendingAuthCounted) return;
    session.pendingAuthCounted = false;
    pendingAuthConnections = Math.max(0, pendingAuthConnections - 1);
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => closeSocket(phone, 4408, 'Live session idle'), IDLE_TIMEOUT_MS);
  }

  const authTimer = setTimeout(() => {
    if (!session.authenticated) closeSocket(phone, 4401, 'Authentication required');
  }, AUTH_TIMEOUT_MS);

  function connectGemini() {
    if (!session.authenticated || session.closed) return;
    const upstream = new WebSocket(`${GEMINI_HOST}?key=${GEMINI_API_KEY}`, {
      maxPayload: MAX_MESSAGE_BYTES,
      handshakeTimeout: AUTH_TIMEOUT_MS,
    });

    upstream.on('open', () => {
      retries = 0;
      while (pendingFromPhone.length) {
        const frame = pendingFromPhone.shift();
        pendingBytes -= frame.bytes;
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(frame.data, { binary: frame.isBinary });
        }
      }
      if (phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({ type: 'proxy_status', status: 'connected' }));
      }
      log(`live ${session.id}: upstream connected`);
    });

    upstream.on('message', (data) => {
      const text = data.toString('utf8');
      if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES) {
        closeSocket(phone, 1009, 'Message too large');
        return;
      }
      if (phone.readyState === WebSocket.OPEN) phone.send(text);
      accumulateTranscript(session, text);
      countServerFrame(session, text);
    });

    upstream.on('close', () => {
      if (session.closed) return;
      if (retries < MAX_RETRIES) {
        const delay = 1000 * 2 ** retries;
        retries += 1;
        if (phone.readyState === WebSocket.OPEN) {
          phone.send(
            JSON.stringify({ type: 'proxy_status', status: 'reconnecting', attempt: retries }),
          );
        }
        setTimeout(connectGemini, delay);
      } else {
        closeSocket(phone, 1011, 'Live service unavailable');
      }
    });

    upstream.on('error', () => {
      if (phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({ type: 'proxy_status', status: 'error' }));
      }
    });
    gemini = upstream;
  }

  phone.on('message', async (data, isBinary) => {
    if (session.closed) return;

    if (!session.authenticated) {
      if (session.authenticating) {
        closeSocket(phone, 4401, 'Authentication required');
        return;
      }
      const auth = parseAuthFrame(data, isBinary);
      if (!auth) {
        closeSocket(phone, 4401, 'Authentication required');
        return;
      }
      session.authenticating = true;
      const user = await authenticateAccessToken(auth.accessToken);
      if (!user || session.closed || phone.readyState !== WebSocket.OPEN) {
        closeSocket(phone, 4401, 'Authentication required');
        return;
      }

      const now = Date.now();
      const userAllowed = sessionLimits.allow(
        `daily:${user.id}`,
        USER_SESSIONS_PER_DAY,
        24 * 60 * 60 * 1000,
        now,
      );
      if (!userAllowed) {
        closeSocket(phone, 4429, 'Live session limit reached');
        return;
      }
      const globalAllowed = sessionLimits.allow(
        'global',
        GLOBAL_SESSIONS_PER_MINUTE,
        60 * 1000,
        now,
      );
      if (!globalAllowed) {
        closeSocket(phone, 4429, 'Live service is busy');
        return;
      }
      if (!connections.acquire(user.id, MAX_CONNECTIONS_PER_USER, MAX_GLOBAL_CONNECTIONS)) {
        closeSocket(phone, 4429, 'Live connection limit reached');
        return;
      }

      clearTimeout(authTimer);
      releasePendingAuth();
      session.userId = user.id;
      session.startedAt = now;
      session.authenticated = true;
      session.connectionAcquired = true;
      resetIdleTimer();
      maxSessionTimer = setTimeout(
        () => closeSocket(phone, 4408, 'Live session ended'),
        MAX_SESSION_MS,
      );
      if (phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({ type: 'proxy_status', status: 'authenticated' }));
      }
      connectGemini();
      return;
    }

    const frameBytes = data.length ?? Buffer.byteLength(data);
    if (frameBytes > MAX_MESSAGE_BYTES) {
      closeSocket(phone, 1009, 'Message too large');
      return;
    }
    resetIdleTimer();
    if (!isBinary) inspectClientFrame(session, data.toString('utf8'));
    if (gemini && gemini.readyState === WebSocket.OPEN) {
      gemini.send(data, { binary: isBinary });
    } else if (pendingBytes + frameBytes <= MAX_PENDING_BYTES && pendingFromPhone.length < 8) {
      pendingBytes += frameBytes;
      pendingFromPhone.push({ data, isBinary, bytes: frameBytes });
    } else {
      closeSocket(phone, 1013, 'Live service is busy');
    }
  });

  phone.on('close', async () => {
    if (session.closed) return;
    session.closed = true;
    clearTimeout(authTimer);
    clearTimeout(idleTimer);
    clearTimeout(maxSessionTimer);
    releasePendingAuth();
    if (session.connectionAcquired) connections.release(session.userId);
    try {
      if (gemini && gemini.readyState < WebSocket.CLOSING) gemini.close();
    } catch (_) {}
    log(
      `live ${session.id}: ended authenticated=${session.authenticated} ` +
        `audioIn=${session.audioIn} imageIn=${session.imageIn} audioOut=${session.audioOut} ` +
        `turns=${session.transcript.length}`,
    );
    await saveSession(session);
  });

  phone.on('error', () => log(`live ${session.id}: client socket error`));
});

function inspectClientFrame(session, raw) {
  try {
    const frame = JSON.parse(raw);
    const chunks = frame && frame.realtimeInput && frame.realtimeInput.mediaChunks;
    if (!Array.isArray(chunks)) return;
    for (const chunk of chunks) {
      const mime = String(chunk.mimeType || chunk.mime_type || '');
      if (mime.startsWith('audio/')) session.audioIn += 1;
      else if (mime.startsWith('image/')) session.imageIn += 1;
    }
  } catch (_) {}
}

function countServerFrame(session, raw) {
  try {
    const frame = JSON.parse(raw);
    if (frame.setupComplete) session.setupComplete = true;
    const content = frame.serverContent || frame.server_content;
    const parts = content && content.modelTurn && content.modelTurn.parts;
    if (!Array.isArray(parts)) return;
    for (const part of parts) {
      const inline = part.inlineData || part.inline_data;
      const mime = inline && String(inline.mimeType || inline.mime_type || '');
      if (mime.startsWith('audio/')) session.audioOut += 1;
    }
  } catch (_) {}
}

function accumulateTranscript(session, raw) {
  if (session.transcript.length >= 200 || session.transcriptChars >= 100000) return;
  try {
    const frame = JSON.parse(raw);
    const content = frame.serverContent || frame.server_content;
    if (!content) return;
    const turns = [
      ['user', content.inputTranscription || content.input_transcription],
      ['assistant', content.outputTranscription || content.output_transcription],
    ];
    for (const [role, transcript] of turns) {
      if (!transcript || typeof transcript.text !== 'string') continue;
      const text = transcript.text.slice(0, 2000);
      session.transcriptChars += text.length;
      session.transcript.push({ role, text, ts: Date.now() });
    }
  } catch (_) {}
}

async function saveSession(session) {
  if (!supabaseWriter || !session.authenticated || !session.userId || !session.transcript.length) return;
  const duration = Math.round((Date.now() - session.startedAt) / 1000);
  const summary = session.transcript
    .map((turn) => `${turn.role === 'user' ? 'You' : 'AI'}: ${turn.text}`)
    .join('\n')
    .slice(0, 500);
  try {
    const { error } = await supabaseWriter.from('ai_live_sessions').insert({
      user_id: session.userId,
      session_summary: summary,
      transcript: session.transcript,
      duration_seconds: duration,
    });
    if (error) log(`live ${session.id}: transcript save failed`);
  } catch (_) {
    log(`live ${session.id}: transcript save failed`);
  }
}

wss.on('error', () => log('Live WebSocket server error'));
