import { useRef, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';

// Record in formats Gemini accepts directly:
//   Android -> AAC ADTS (.aac, audio/aac)
//   iOS     -> Linear PCM WAV (.wav, audio/wav)
// 16 kHz mono keeps files small and is ideal for speech.
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.aac',
    outputFormat: Audio.AndroidOutputFormat.AAC_ADTS,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
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
 * Audio recorder around expo-av.
 *   start()  — request permission + begin recording
 *   stop()   — stop and return the recorded file URI (or null)
 *   onMeter  — optional callback receiving metering dB for waveform animation
 */
export function useRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const start = useCallback(
    async (onMeter?: (db: number) => void): Promise<boolean> => {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Microphone needed', 'Please allow microphone access to use voice.');
          return false;
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(RECORDING_OPTIONS);
        if (onMeter) {
          recording.setProgressUpdateInterval(120);
          recording.setOnRecordingStatusUpdate((s) => {
            if (s.isRecording && typeof s.metering === 'number') onMeter(s.metering);
          });
        }
        await recording.startAsync();
        recordingRef.current = recording;
        setIsRecording(true);
        return true;
      } catch {
        setIsRecording(false);
        return false;
      }
    },
    [],
  );

  /** URI of the in-progress recording file (AAC/WAV are streamable formats,
   *  so the partial file can be transcribed while recording continues). */
  const getUri = useCallback((): string | null => {
    return recordingRef.current?.getURI() ?? null;
  }, []);

  const stop = useCallback(async (): Promise<string | null> => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!recording) return null;
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return recording.getURI();
    } catch {
      return null;
    }
  }, []);

  return { isRecording, start, stop, getUri };
}
