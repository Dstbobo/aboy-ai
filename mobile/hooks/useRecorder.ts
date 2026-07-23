import { useRef, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  useAudioRecorder,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions,
} from 'expo-audio';

// Record in formats Gemini accepts directly:
//   Android -> AAC ADTS (.aac, audio/aac)
//   iOS     -> Linear PCM WAV (.wav, audio/wav)
// 16 kHz mono keeps files small and is ideal for speech.
const RECORDING_OPTIONS: RecordingOptions = {
  isMeteringEnabled: true,
  extension: '.aac',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: {
    extension: '.aac',
    outputFormat: 'aac_adts',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

/**
 * Audio recorder around expo-audio (expo-av was removed in SDK 54).
 *   start()  — request permission + begin recording
 *   stop()   — stop and return the recorded file URI (or null)
 *   onMeter  — optional callback receiving metering dB for waveform animation
 */
export function useRecorder() {
  const onMeterRef = useRef<((db: number) => void) | undefined>(undefined);
  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    const m = (status as { metering?: number }).metering;
    if (typeof m === 'number') onMeterRef.current?.(m);
  });
  const [isRecording, setIsRecording] = useState(false);

  const start = useCallback(
    async (onMeter?: (db: number) => void): Promise<boolean> => {
      try {
        onMeterRef.current = onMeter;
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Microphone needed', 'Please allow microphone access to use voice.');
          return false;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setIsRecording(true);
        return true;
      } catch {
        setIsRecording(false);
        return false;
      }
    },
    [recorder],
  );

  /** URI of the in-progress / last recording file (AAC/WAV are streamable
   *  formats, so the partial file can be transcribed while recording continues). */
  const getUri = useCallback((): string | null => recorder.uri ?? null, [recorder]);

  const stop = useCallback(async (): Promise<string | null> => {
    setIsRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      return recorder.uri ?? null;
    } catch {
      return null;
    }
  }, [recorder]);

  return { isRecording, start, stop, getUri };
}
