import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import LiveAudioStream from 'react-native-live-audio-stream';

export const GEMINI_LIVE_URL = process.env.EXPO_PUBLIC_GEMINI_LIVE_URL ?? '';
// Live API model with audio dialog. Adjust if your key uses a different one.
const LIVE_MODEL = 'models/gemini-live-2.5-flash-preview';

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

  constructor(userId: string | null, cb: LiveCallbacks) {
    this.userId = userId;
    this.cb = cb;
  }

  get isConfigured() {
    return !!GEMINI_LIVE_URL && !GEMINI_LIVE_URL.includes('REPLACE-WITH');
  }

  async connect() {
    if (!this.isConfigured) {
      this.cb.onStatus?.('error');
      throw new Error('Gemini Live URL not configured');
    }
    this.cb.onStatus?.('connecting');

    const url = `${GEMINI_LIVE_URL}?userId=${encodeURIComponent(this.userId ?? '')}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      // Identify, then send Live API setup.
      this.send({ type: 'auth', userId: this.userId });
      this.send({
        setup: {
          model: LIVE_MODEL,
          generationConfig: { responseModalities: ['AUDIO'] },
          systemInstruction: {
            parts: [
              {
                text:
                  'You are Aboy AI, a concise, evidence-based healthcare tutor for ' +
                  'medical, nursing and allied-health students. Keep spoken answers short, ' +
                  'clear and accurate. If you see an image, describe and explain it for study.',
              },
            ],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });
    };

    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onerror = () => this.cb.onStatus?.('error');
    ws.onclose = () => {
      if (!this.closed) this.cb.onStatus?.('closed');
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
      try {
        text = await (raw as Blob).text();
      } catch {
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
      if (msg.status === 'connected') {
        this.cb.onStatus?.('connected');
        this.startMic();
      } else if (msg.status === 'reconnecting') this.cb.onStatus?.('reconnecting');
      else if (msg.status === 'rate_limited') this.cb.onStatus?.('rate_limited');
      else if (msg.status === 'error') this.cb.onStatus?.('error');
      return;
    }

    if (msg.setupComplete) {
      this.cb.onStatus?.('listening');
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
    for (const p of parts) {
      const inline = p.inlineData || p.inline_data;
      if (inline?.data && String(inline.mimeType || inline.mime_type).startsWith('audio/')) {
        this.pcmChunks.push(inline.data);
        this.cb.onStatus?.('speaking');
      }
    }

    if (sc.turnComplete || sc.generationComplete) {
      await this.flushPlayback();
      this.cb.onStatus?.('listening');
    }
  }

  // ── Microphone streaming ──
  private startMic() {
    if (this.micActive) return;
    try {
      LiveAudioStream.init(MIC_OPTIONS as any);
      LiveAudioStream.on('data', (chunk: string) => {
        this.send({
          realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: chunk }] },
        });
        // rough level estimate for the waveform
        this.cb.onLevel?.(Math.min(1, chunk.length / 6000));
      });
      LiveAudioStream.start();
      this.micActive = true;
      this.cb.onStatus?.('listening');
    } catch {
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
    this.send({
      realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: base64Jpeg }] },
    });
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
      const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: true });
      this.sound = sound;
      sound.setOnPlaybackStatusUpdate((st: any) => {
        if (st.didJustFinish) this.stopPlayback();
      });
    } catch {
      // ignore playback failure
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
