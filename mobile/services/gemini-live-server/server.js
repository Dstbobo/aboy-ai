/**
 * Aboy AI — Gemini Live WebSocket proxy
 *
 * Sits between the mobile app and the Gemini Live API
 * (BidiGenerateContent). The phone connects to this server; this server
 * opens a second WebSocket to Gemini and pipes data both ways.
 *
 * - Phone -> proxy -> Gemini  (audio/video/text frames)
 * - Gemini -> proxy -> phone  (audio + transcripts)
 * - Parses transcripts as they flow, and on session end writes them to the
 *   Supabase `ai_live_sessions` table.
 * - Reconnects to Gemini with backoff and degrades gracefully on 429.
 *
 * Env: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, PORT (default 8080)
 */
require('dotenv').config();
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { createClient } = require('@supabase/supabase-js');

const PORT = parseInt(process.env.PORT || '8080', 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const GEMINI_HOST =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    : null;

const MAX_RETRIES = 4;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// HTTP server for Railway healthcheck; the WebSocket server shares the port.
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'gemini-live-proxy' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, () => log(`Gemini Live proxy listening on :${PORT}`));

wss.on('connection', (phone, req) => {
  const session = {
    userId: null,
    startedAt: Date.now(),
    transcript: [], // [{ role: 'user'|'assistant', text, ts }]
    closed: false,
    // diagnostics
    audioIn: 0,
    imageIn: 0,
    setupSent: false,
    setupComplete: false,
    audioOut: 0,
  };

  // Periodic diagnostic heartbeat so we can see flow in real time.
  const diag = setInterval(() => {
    if (session.closed) return;
    log(
      `flow ${session.userId || '?'} | audioIn=${session.audioIn} imageIn=${session.imageIn} ` +
        `setup=${session.setupComplete} audioOut=${session.audioOut} turns=${session.transcript.length}`,
    );
  }, 5000);

  // Pull userId from query string (?userId=...) if present.
  try {
    const url = new URL(req.url, 'http://localhost');
    session.userId = url.searchParams.get('userId');
  } catch (_) {}

  log('Phone connected', session.userId || '(anonymous)');

  let gemini = null;
  let retries = 0;
  const pendingFromPhone = [];

  function connectGemini() {
    const upstream = new WebSocket(`${GEMINI_HOST}?key=${GEMINI_API_KEY}`);

    upstream.on('open', () => {
      retries = 0;
      log('Connected to Gemini Live');
      // Flush anything the phone sent before upstream was ready.
      while (pendingFromPhone.length) {
        const buf = pendingFromPhone.shift();
        if (upstream.readyState === WebSocket.OPEN) upstream.send(buf);
      }
      if (phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({ type: 'proxy_status', status: 'connected' }));
      }
    });

    // Gemini -> phone (and accumulate transcript). Gemini sends JSON in
    // binary frames; React Native cannot read Blob payloads, so always
    // forward to the phone as TEXT.
    upstream.on('message', (data, isBinary) => {
      const text = data.toString('utf8');
      if (phone.readyState === WebSocket.OPEN) {
        phone.send(text);
      }
      accumulateTranscript(session, text);
      countServerFrame(session, text);
    });

    upstream.on('close', (code, reason) => {
      log('Gemini closed', code, reason.toString().slice(0, 120));
      if (session.closed) return;
      // 1011/1013 or 429-style overloads -> retry with backoff
      if (retries < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, retries); // 1s,2s,4s,8s
        retries += 1;
        log(`Reconnecting to Gemini in ${delay}ms (attempt ${retries})`);
        if (phone.readyState === WebSocket.OPEN) {
          phone.send(JSON.stringify({ type: 'proxy_status', status: 'reconnecting', attempt: retries }));
        }
        setTimeout(connectGemini, delay);
      } else {
        if (phone.readyState === WebSocket.OPEN) {
          phone.send(JSON.stringify({ type: 'proxy_status', status: 'error', detail: 'upstream_unavailable' }));
        }
      }
    });

    upstream.on('error', (err) => {
      const msg = String(err && err.message);
      log('Gemini error', msg.slice(0, 160));
      // 429 rate-limit: tell the phone to back off; the close handler retries.
      if (msg.includes('429') && phone.readyState === WebSocket.OPEN) {
        phone.send(JSON.stringify({ type: 'proxy_status', status: 'rate_limited' }));
      }
    });

    gemini = upstream;
  }

  // Phone -> Gemini
  phone.on('message', (data, isBinary) => {
    // Allow the phone to attach its userId via a control frame.
    if (!isBinary) {
      const str = data.toString();
      try {
        const obj = JSON.parse(str);
        if (obj && obj.type === 'auth' && obj.userId) {
          session.userId = obj.userId;
          return; // don't forward control frames
        }
        if (obj && obj.setup) {
          session.setupSent = true;
          log('phone sent setup, model =', obj.setup.model);
        }
        // Count realtime media chunks from the phone.
        const chunks = obj && obj.realtimeInput && obj.realtimeInput.mediaChunks;
        if (Array.isArray(chunks)) {
          for (const c of chunks) {
            const mt = String(c.mimeType || c.mime_type || '');
            if (mt.startsWith('audio/')) session.audioIn++;
            else if (mt.startsWith('image/')) session.imageIn++;
          }
        }
      } catch (_) {
        // not JSON — forward as-is
      }
    }
    if (gemini && gemini.readyState === WebSocket.OPEN) {
      gemini.send(data, { binary: isBinary });
    } else {
      pendingFromPhone.push(data);
    }
  });

  phone.on('close', async () => {
    session.closed = true;
    clearInterval(diag);
    log(
      `Phone disconnected ${session.userId || '(anon)'} | SUMMARY audioIn=${session.audioIn} ` +
        `imageIn=${session.imageIn} setupComplete=${session.setupComplete} audioOut=${session.audioOut} ` +
        `turns=${session.transcript.length}`,
    );
    try {
      if (gemini && gemini.readyState === WebSocket.OPEN) gemini.close();
    } catch (_) {}
    await saveSession(session);
  });

  phone.on('error', (err) => log('Phone socket error', String(err && err.message).slice(0, 120)));

  connectGemini();
});

/**
 * Parse Gemini serverContent messages for input/output transcriptions and
 * append them to the running transcript.
 */
function countServerFrame(session, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch (_) {
    return;
  }
  if (msg.setupComplete && !session.setupComplete) {
    session.setupComplete = true;
    log('Gemini setupComplete for', session.userId || '?');
  }
  const sc = msg.serverContent || msg.server_content;
  const parts = sc && sc.modelTurn && sc.modelTurn.parts;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      const inl = p.inlineData || p.inline_data;
      const mt = inl && String(inl.mimeType || inl.mime_type || '');
      if (mt && mt.startsWith('audio/')) session.audioOut++;
    }
  }
}

function accumulateTranscript(session, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch (_) {
    return;
  }
  const sc = msg.serverContent || (msg.server_content ?? null);
  if (!sc) return;

  const inputT = sc.inputTranscription || sc.input_transcription;
  const outputT = sc.outputTranscription || sc.output_transcription;
  if (inputT && inputT.text) {
    session.transcript.push({ role: 'user', text: inputT.text, ts: Date.now() });
  }
  if (outputT && outputT.text) {
    session.transcript.push({ role: 'assistant', text: outputT.text, ts: Date.now() });
  }
}

async function saveSession(session) {
  if (!supabase) {
    log('Supabase not configured — skipping transcript save');
    return;
  }
  if (!session.transcript.length) return;
  const duration = Math.round((Date.now() - session.startedAt) / 1000);
  const summary = session.transcript
    .map((t) => `${t.role === 'user' ? 'You' : 'AI'}: ${t.text}`)
    .join('\n')
    .slice(0, 500);

  try {
    const { error } = await supabase.from('ai_live_sessions').insert({
      user_id: session.userId || null,
      session_summary: summary,
      transcript: session.transcript,
      duration_seconds: duration,
    });
    if (error) log('Supabase insert error', error.message);
    else log('Saved live session', duration + 's', session.transcript.length + ' turns');
  } catch (err) {
    log('Supabase save failed', String(err && err.message).slice(0, 120));
  }
}

// Basic health for Railway healthcheck (HTTP upgrade not required).
wss.on('error', (err) => log('WSS error', String(err && err.message)));
