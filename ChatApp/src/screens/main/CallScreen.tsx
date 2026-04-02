import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useWebRTC } from '../../hooks/useWebRTC';

type CallScreenRouteProp = {
  key: string;
  name: 'CallModal';
  params: RootStackParamList['CallModal'];
};

const CallScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<CallScreenRouteProp>();
  const { sessionId, callType, isInitiator } = route.params;

  const handleCallEnded = useCallback(() => {
    setTimeout(() => {
      if (navigation.canGoBack()) navigation.goBack();
    }, 1500);
  }, [navigation]);

  const {
    callState,
    isMuted,
    isCameraOff,
    localStream,
    remoteStream,
    formattedDuration,
    toggleMute,
    toggleCamera,
    endCall,
  } = useWebRTC({
    sessionId,
    callType,
    isInitiator,
    onCallEnded: handleCallEnded,
  });

  const statusText = (): string => {
    switch (callState) {
      case 'initiating': return 'Connecting...';
      case 'ringing': return isInitiator ? 'Ringing...' : 'Incoming call...';
      case 'active': return formattedDuration;
      case 'ended': return 'Call ended';
      default: return '';
    }
  };

  return (
    <View style={styles.container}>
      {/* Remote video (full screen background) */}
      {callType === 'video' && remoteStream && (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
        />
      )}

      {/* Local video (small overlay) */}
      {callType === 'video' && localStream && !isCameraOff && (
        <View style={styles.localVideoContainer}>
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.localVideo}
            objectFit="cover"
            mirror
          />
        </View>
      )}

      {/* Call info overlay */}
      <View style={styles.overlay}>
        <View style={styles.infoSection}>
          <Text style={styles.title}>
            {callType === 'video' ? '📹 Video Call' : '📞 Audio Call'}
          </Text>
          <Text style={styles.statusText}>{statusText()}</Text>
        </View>

        {/* Controls */}
        {callState !== 'ended' && (
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.controlActive]}
              onPress={toggleMute}>
              <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.endButton]}
              onPress={endCall}>
              <Text style={styles.controlIcon}>📵</Text>
              <Text style={styles.controlLabel}>End</Text>
            </TouchableOpacity>

            {callType === 'video' && (
              <TouchableOpacity
                style={[styles.controlButton, isCameraOff && styles.controlActive]}
                onPress={toggleCamera}>
                <Text style={styles.controlIcon}>{isCameraOff ? '📷' : '🚫'}</Text>
                <Text style={styles.controlLabel}>{isCameraOff ? 'Camera On' : 'Camera Off'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {callState === 'ended' && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  remoteVideo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  localVideoContainer: {
    position: 'absolute', top: 60, right: 16, width: 120, height: 160,
    borderRadius: 12, overflow: 'hidden', zIndex: 10,
    borderWidth: 2, borderColor: '#fff',
  },
  localVideo: { flex: 1 },
  overlay: {
    flex: 1, justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 100, paddingBottom: 60,
  },
  infoSection: { alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  statusText: { fontSize: 18, color: '#ccc' },
  controls: { flexDirection: 'row', gap: 32 },
  controlButton: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  controlActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  endButton: { backgroundColor: '#ff4444' },
  controlIcon: { fontSize: 24 },
  controlLabel: { color: '#fff', fontSize: 10, marginTop: 4 },
  backButton: {
    paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#333', borderRadius: 8,
  },
  backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default CallScreen;
