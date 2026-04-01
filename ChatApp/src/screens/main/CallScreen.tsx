import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useCall } from '../../contexts/CallContext';
import type { CallScreenProps } from '../../navigation/types';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const CallScreen: React.FC<CallScreenProps> = ({ route, navigation }) => {
  const { callType } = route.params;
  const {
    callState,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    callDuration,
    endCall,
    toggleMute,
    toggleCamera,
  } = useCall();

  // Auto-dismiss when call ends
  useEffect(() => {
    if (callState === 'idle' || callState === 'ended') {
      navigation.goBack();
    }
  }, [callState, navigation]);

  const statusText = (() => {
    switch (callState) {
      case 'initiating':
        return 'Calling...';
      case 'ringing':
        return 'Ringing...';
      case 'connecting':
        return 'Connecting...';
      case 'active':
        return formatDuration(callDuration);
      default:
        return '';
    }
  })();

  const isVideo = callType === 'video';

  return (
    <SafeAreaView style={styles.container}>
      {/* Remote video (full screen background) */}
      {isVideo && remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={styles.audioBg}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {callType === 'audio' ? 'Audio Call' : 'No Video'}
            </Text>
          </View>
        </View>
      )}

      {/* Local video (picture-in-picture) */}
      {isVideo && localStream && !isCameraOff && (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.localVideo}
          objectFit="cover"
          zOrder={1}
          mirror
        />
      )}

      {/* Status overlay */}
      <View style={styles.statusOverlay}>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={toggleMute}
        >
          <Text style={styles.controlIcon}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        {isVideo && (
          <TouchableOpacity
            style={[styles.controlBtn, isCameraOff && styles.controlBtnActive]}
            onPress={toggleCamera}
          >
            <Text style={styles.controlIcon}>{isCameraOff ? 'Cam On' : 'Cam Off'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.endBtn} onPress={endCall}>
          <Text style={styles.endIcon}>End</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  audioBg: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  localVideo: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  statusOverlay: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  controls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  controlIcon: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  endBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
