import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import LiveAudioStream from 'react-native-live-audio-stream';

// Primary: FastAPI backend /ws/live proxy. Fallback: standalone Node proxy.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const NODE_PROXY_URL = process.env.EXPO_PUBLIC_GEMINI_LIVE_URL ?? '';
const ENDPOINTS: string[] = [
  ...(API_URL ? [`${API_URL.replace(/^http/, 'ws')}/ws/live`] : []),
  ...(NODE_PROXY_URL && !NODE_PROXY_URL.includes('REPLACE-WITH') ? [NODE_PROXY_URL] : []),
];
export const GEMINI_LIVE_URL = ENDPOINTS[0] ?? '';
// Live API model with native-audio dialog (verified available on this key via
// ListModels — gemini-2.0-flash-live-001 is NOT available and closes 1008).
const LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-latest';

export type LiveStatus =
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'speaking'
  | 'reconnecting'
  | 'rate_limited'
  | 'error'
  | 'closed';

export interface LiveCallbacks {
  onStatus?: (s: LiveStatus) => void;
  onTranscript?: (role: 'user' | 'assistant', text: string) => void;
  onLevel?: (level: number) => void; // 0..1 input level for waveform
}

const MIC_OPTIONS = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  audioSource: 6, // VOICE_RECOGNITION (Android)
  bufferSize: 4096,
};

function log(...args: any[]) {
  console.log('[live]', ...args);
}

/**
 * One realtime Gemini Live session via the Node proxy.
 *  - streams mic PCM16 @16k to Gemini
 *  - optionally streams camera frames (image/jpeg)
 *  - plays Gemini's PCM audio replies and reports transcripts
 */
export class LiveSession {
  private ws: WebSocket | null = null;
  private cb: LiveCallbacks;
  private userId: string | null;
  private micActive = false;
  private pcmChunks: string[] = []; // base64 PCM16 @24k from Gemini (current turn)
  private sound: Audio.Sound | null = null;
  private closed = false;
  private setupDone = false;
  private chunksSent = 0;
  private micMuted = false;

  constructor(userId: string | null, cb: LiveCallbacks) {
    this.userId = userId;
    this.cb = cb;
  }

  private endpointIndex = 0;

  get isConfigured() {
    return ENDPOINTS.length > 0;
  }

  async connect() {
    if (!this.isConfigured) {
      log('NOT CONFIGURED — no Live endpoints available');
      this.cb.onStatus?.('error');
      throw new Error('Gemini Live URL not configured');
    }

    // Request microphone permission BEFORE starting capture. Without this the
    // native PCM recorder silently produces no audio on Android.
    try {
      const perm = await Audio.requestPermissionsAsync();
      log('mic permission granted =', perm.granted);
      if (!perm.granted) {
        this.cb.onStatus?.('error');
        throw new Error('Microphone permission denied');
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        // Route playback to the loudspeaker (not the earpiece). Combined with
        // audioSource=6 (VOICE_RECOGNITION, hardware AEC) this prevents echo.
        playThroughEarpieceAndroid: false,
      });
    } catch (e) {
      log('audio setup failed:', (e as Error)?.message);
      this.cb.onStatus?.('error');
      throw e;
    }

    this.openSocket();
  }

  private setupTimer: ReturnType<typeof setTimeout> | null = null;
  private setupAttempts = 0;

  private sendSetup() {
    this.setupAttempts += 1;
    log('sending setup (attempt', this.setupAttempts, ') with model', LIVE_MODEL);
    this.send({
      setup: {
        model: LIVE_MODEL,
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: {
          parts: [
            {
              text:
                'You are Aboy AI, a medical education assistant for healthcare ' +
                'students. Help with nursing, medicine, and allied health questions. ' +
                'Keep spoken answers short, clear and evidence-based. If you see an ' +
                'image, describe and explain it for study.',
            },
          ],
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    });
    // Watchdog: if setupComplete hasn't arrived, RECONNECT (never re-send
    // setup on the same socket — Gemini treats a duplicate setup as an
    // invalid argument and kills the session with 1007).
    this.clearSetupTimer();
    this.setupTimer = setTimeout(() => {
      if (this.setupDone || this.closed) return;
      log('watchdog: no setupComplete after 5s — reconnecting');
      try {
        this.ws?.close();
      } catch {}
    }, 5000);
  }

  private clearSetupTimer() {
    if (this.setupTimer) {
      clearTimeout(this.setupTimer);
      this.setupTimer = null;
    }
  }

  /** Open (or re-open on the next fallback endpoint) the proxy WebSocket. */
  private openSocket() {
    this.cb.onStatus?.('connecting');
    this.setupAttempts = 0;
    const base = ENDPOINTS[this.endpointIndex];
    const url = `${base}?userId=${encodeURIComponent(this.userId ?? '')}`;
    log('connecting to proxy', url);
    const ws = new WebSocket(url);
    // If a binary frame ever arrives, deliver it as ArrayBuffer (decodable)
    // rather than Blob (unreadable in RN).
    (ws as any).binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      log('connected'); // required log: connected
      this.cb.onStatus?.('connected');
      // Defer the setup send one tick — sends issued synchronously inside
      // onopen have been observed to drop on RN Android.
      setTimeout(() => this.sendSetup(), 50);
    };

    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onerror = (e: any) => {
      log('proxy WS error:', e?.message ?? 'unknown');
    };
    ws.onclose = (e: any) => {
      log('proxy WS closed', e?.code ?? '', e?.reason ?? '');
      this.clearSetupTimer();
      if (this.closed) return;
      // If we never reached setupComplete on this endpoint, try the next one
      // (backend /ws/live -> standalone Node proxy) before reporting failure.
      if (!this.setupDone && this.endpointIndex < ENDPOINTS.length - 1) {
        this.endpointIndex += 1;
        log('falling back to endpoint', ENDPOINTS[this.endpointIndex]);
        this.openSocket();
        return;
      }
      this.cb.onStatus?.(this.setupDone ? 'closed' : 'error');
    };
  }

  private send(obj: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private async onMessage(raw: any) {
    let text = raw;
    if (typeof raw !== 'string') {
      // Binary frame fallback: proxies now convert Gemini's binary JSON to
      // text, but decode ArrayBuffer here too in case one slips through.
      try {
        if (raw instanceof ArrayBuffer) {
          text = utf8Decode(new Uint8Array(raw));
        } else if (raw?.text) {
          text = await (raw as Blob).text();
        } else {
          log('unreadable non-string frame dropped');
          return;
        }
      } catch {
        log('failed to decode binary frame');
        return;
      }
    }
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    // Proxy status frames
    if (msg.type === 'proxy_status') {
      log('proxy_status:', msg.status, msg.attempt ?? '');
      if (msg.status === 'connected') this.cb.onStatus?.('connected');
      else if (msg.status === 'reconnecting') this.cb.onStatus?.('reconnecting');
      else if (msg.status === 'rate_limited') this.cb.onStatus?.('rate_limited');
      else if (msg.status === 'error') this.cb.onStatus?.('error');
      return;
    }

    if (msg.setupComplete) {
      // Gemini is ready — only NOW start streaming mic audio.
      log('setupComplete received — starting mic');
      this.clearSetupTimer();
      this.setupDone = true;
      this.cb.onStatus?.('listening');
      this.startMic();
      return;
    }

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      // Gemini was interrupted — drop queued audio.
      this.pcmChunks = [];
      this.stopPlayback();
      this.cb.onStatus?.('listening');
    }

    const inT = sc.inputTranscription?.text;
    if (inT) this.cb.onTranscript?.('user', inT);
    const outT = sc.outputTranscription?.text;
    if (outT) this.cb.onTranscript?.('assistant', outT);

    const parts = sc.modelTurn?.parts ?? [];
    let audioParts = 0;
    for (const p of parts) {
      const inline = p.inlineData || p.inline_data;
      if (inline?.data && String(inline.mimeType || inline.mime_type).startsWith('audio/')) {
        this.pcmChunks.push(inline.data);
        audioParts++;
        this.cb.onStatus?.('speaking');
      }
    }
    if (audioParts) log('response received —', audioParts, 'audio part(s), buffered:', this.pcmChunks.length);
    if (inT) log('input transcript:', JSON.stringify(inT).slice(0, 80));
    if (outT) log('output transcript:', JSON.stringify(outT).slice(0, 80));

    if (sc.turnComplete || sc.generationComplete) {
      log('turnComplete — playing', this.pcmChunks.length, 'chunks');
      await this.flushPlayback();
      this.cb.onStatus?.('listening');
    }
  }

  // ── Microphone streaming ──
  private startMic() {
    if (this.micActive) return;
    if (!LiveAudioStream || typeof LiveAudioStream.init !== 'function') {
      log('ERROR: LiveAudioStream native module unavailable');
      this.cb.onStatus?.('error');
      return;
    }
    try {
      log('initialising mic', MIC_OPTIONS);
      LiveAudioStream.init(MIC_OPTIONS as any);
      LiveAudioStream.on('data', (chunk: string) => {
        if (!this.setupDone || this.micMuted) return; // gated until ready / while muted
        this.chunksSent++;
        if (this.chunksSent === 1) log('audio sending (first chunk, len', chunk.length, ')');
        if (this.chunksSent % 50 === 0) log('mic chunks sent:', this.chunksSent);
        this.send({
          realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: chunk }] },
        });
        this.cb.onLevel?.(Math.min(1, chunk.length / 6000));
      });
      LiveAudioStream.start();
      this.micActive = true;
      log('mic started');
      this.cb.onStatus?.('listening');
    } catch (e) {
      log('startMic failed:', (e as Error)?.message);
      this.cb.onStatus?.('error');
    }
  }

  private stopMic() {
    if (!this.micActive) return;
    try {
      LiveAudioStream.stop();
    } catch {}
    this.micActive = false;
  }

  /** Send a single camera frame (base64 JPEG) as realtime video input. */
  sendImageFrame(base64Jpeg: string) {
    // Never send realtime input before Gemini has acknowledged setup — doing so
    // breaks the BidiGenerateContent handshake (setupComplete never arrives).
    if (!this.setupDone) return;
    this.send({
      realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: base64Jpeg }] },
    });
  }

  get isReady() {
    return this.setupDone;
  }

  /** Mute/unmute the outgoing mic without ending the session. */
  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    log('mic muted =', muted);
  }

  /** User taps to interrupt the AI while it is speaking. */
  interrupt() {
    this.pcmChunks = [];
    this.stopPlayback();
    this.cb.onStatus?.('listening');
  }

  // ── Playback of Gemini PCM (24k mono) as a per-turn WAV clip ──
  private async flushPlayback() {
    if (!this.pcmChunks.length) return;
    const pcmB64 = this.pcmChunks.join('');
    this.pcmChunks = [];
    try {
      const wavB64 = pcm16ToWavBase64(pcmB64, 24000);
      const path = `${FileSystem.cacheDirectory}live_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(path, wavB64, { encoding: FileSystem.EncodingType.Base64 });
      await this.stopPlayback();
      log('playing AI audio clip', path.split('/').pop());
      const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: true });
      this.sound = sound;
      sound.setOnPlaybackStatusUpdate((st: any) => {
        if (st.didJustFinish) {
          log('AI audio finished');
          this.stopPlayback();
        }
      });
    } catch (e) {
      log('playback failed:', (e as Error)?.message);
    }
  }

  private async stopPlayback() {
    const s = this.sound;
    this.sound = null;
    if (s) {
      try {
        await s.stopAsync();
        await s.unloadAsync();
      } catch {}
    }
  }

  async close() {
    this.closed = true;
    this.clearSetupTimer();
    this.stopMic();
    await this.stopPlayback();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.cb.onStatus?.('closed');
  }
}

// ── helpers ──

// Wrap raw base64 PCM16LE into a base64 WAV (so expo-av can play it).
function pcm16ToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = base64ToBytes(pcmBase64);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  buffer.set(pcm, 44);

  return bytesToBase64(buffer);
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// Minimal UTF-8 decoder (Hermes has no TextDecoder).
function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      const adj = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (adj >> 10), 0xdc00 + (adj & 0x3ff));
      i += 4;
    }
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    out[p++] = (a << 2) | (b >> 4);
    if (clean[i + 2] && clean[i + 2] !== '=') out[p++] = ((b & 15) << 4) | (c >> 2);
    if (clean[i + 3] && clean[i + 3] !== '=') out[p++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, p);
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b !== undefined ? b >> 4 : 0)];
    out += b !== undefined ? B64[((b & 15) << 2) | (c !== undefined ? c >> 6 : 0)] : '=';
    out += c !== undefined ? B64[c & 63] : '=';
  }
  return out;
}
