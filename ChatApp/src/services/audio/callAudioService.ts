import { Vibration } from 'react-native';
import InCallManager from 'react-native-incall-manager';

class CallAudioService {
  // Task 5.2: Start ringback tone for caller
  startRingback(): void {
    try {
      InCallManager.startRingback('_BUNDLE_');
    } catch (err) {
      console.warn('[CallAudio] startRingback failed:', err);
    }
  }

  stopRingback(): void {
    try {
      InCallManager.stopRingback();
    } catch (err) {
      console.warn('[CallAudio] stopRingback failed:', err);
    }
  }

  // Task 5.3: Start ringtone + vibration for callee
  startRingtone(): void {
    try {
      // Signature: startRingtone(ringtone, vibrate_pattern, ios_category, seconds)
      InCallManager.startRingtone('_DEFAULT_', [0, 1000, 1000], 'playback', 30);
      Vibration.vibrate([0, 1000, 1000], true);
    } catch (err) {
      console.warn('[CallAudio] startRingtone failed:', err);
    }
  }

  stopRingtone(): void {
    try {
      InCallManager.stopRingtone();
      Vibration.cancel();
    } catch (err) {
      console.warn('[CallAudio] stopRingtone failed:', err);
    }
  }

  // Task 5.4: Stop everything — safe to call at any time
  stop(): void {
    try {
      InCallManager.stopRingtone();
      InCallManager.stopRingback();
      InCallManager.stop();
      Vibration.cancel();
    } catch (err) {
      console.warn('[CallAudio] stop failed:', err);
    }
  }

  // Task 5.5: Route audio to earpiece (active call mode)
  setVoiceMode(): void {
    try {
      InCallManager.start({ media: 'audio' });
    } catch (err) {
      console.warn('[CallAudio] setVoiceMode failed:', err);
    }
  }

  // Task 5.6: Toggle speaker
  setSpeaker(enabled: boolean): void {
    try {
      InCallManager.setForceSpeakerphoneOn(enabled);
    } catch (err) {
      console.warn('[CallAudio] setSpeaker failed:', err);
    }
  }

  setKeepScreenOn(enabled: boolean): void {
    try {
      InCallManager.setKeepScreenOn(enabled);
    } catch (err) {
      console.warn('[CallAudio] setKeepScreenOn failed:', err);
    }
  }
}

export const callAudioService = new CallAudioService();
export default callAudioService;
