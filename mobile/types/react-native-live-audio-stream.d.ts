declare module 'react-native-live-audio-stream' {
  export interface LiveAudioStreamOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
    wavFile?: string;
  }
  interface LiveAudioStreamStatic {
    init(options: LiveAudioStreamOptions): void;
    start(): void;
    stop(): void;
    on(event: 'data', callback: (data: string) => void): void;
  }
  const LiveAudioStream: LiveAudioStreamStatic;
  export default LiveAudioStream;
}
