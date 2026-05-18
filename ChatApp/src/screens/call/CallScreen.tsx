import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { RootStackParamList } from '../../navigation/types';
import { useWebRTC } from '../../hooks/useWebRTC';
import UserAvatar from '../../components/UserAvatar';
import { callAudioService } from '../../services/audio/callAudioService';

type CallScreenRouteProp = RouteProp<RootStackParamList, 'CallModal'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

// Task 9.1: Moved from screens/main/ to screens/call/
const CallScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<CallScreenRouteProp>();
  const { sessionId, callType, isInitiator, iceServers, remoteUser } = route.params;

  // Task 9.5: Speaker toggle state
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

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
    cancelCall,
    switchCamera,
  } = useWebRTC({
    sessionId,
    callType,
    isInitiator,
    iceServers: iceServers ?? [],
    onCallEnded: handleCallEnded,
  });

  // Task 9.3: Status text based on call state
  const statusText = (): string => {
    switch (callState) {
      case 'initiating': return 'Connecting...';
      case 'connecting': return 'Connecting...';
      case 'ringing': return isInitiator ? 'Ringing...' : 'Incoming call...';
      case 'active': return formattedDuration;
      case 'failed': return 'Call Failed';
      case 'ended': return 'Call Ended';
      default: return '';
    }
  };

  // Task 9.5: Speaker toggle handler
  const handleSpeakerToggle = useCallback(() => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    callAudioService.setSpeaker(next);
  }, [isSpeakerOn]);

  // Task 9.7: End/Cancel handler based on state
  const handleEndOrCancel = useCallback(() => {
    if (callState === 'initiating' || callState === 'ringing') {
      cancelCall();
    } else {
      endCall();
    }
  }, [callState, cancelCall, endCall]);

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
        {/* Task 9.2: Remote user display */}
        <View style={styles.headerSection}>
          {remoteUser && (
            <>
              <UserAvatar
                displayName={remoteUser.displayName}
                avatar={remoteUser.avatar}
                size={64}
              />
              <Text style={styles.remoteUserName}>{remoteUser.displayName}</Text>
            </>
          )}
          <Text style={styles.title}>
            {callType === 'video' ? 'Video Call' : 'Audio Call'}
          </Text>
          {/* Task 9.3: Connection status label */}
          <Text style={styles.statusText}>{statusText()}</Text>
        </View>

        {/* Task 9.6: Failed state retry affordance */}
        {callState === 'failed' && (
          <View style={styles.failedSection}>
            <Text style={styles.failedText}>Connection failed</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                // Navigate back — user can redial
                if (navigation.canGoBack()) navigation.goBack();
              }}>
              <Text style={styles.retryButtonText}>Close and Redial</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Controls */}
        {callState !== 'ended' && callState !== 'failed' && (
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.controlActive]}
              onPress={toggleMute}>
              <MaterialIcons
                name={isMuted ? 'mic-off' : 'mic'}
                size={28}
                color="#fff"
              />
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            {/* Task 9.5: Speaker toggle */}
            <TouchableOpacity
              style={[styles.controlButton, isSpeakerOn && styles.controlActive]}
              onPress={handleSpeakerToggle}>
              <MaterialIcons
                name={isSpeakerOn ? 'volume-up' : 'volume-off'}
                size={28}
                color="#fff"
              />
              <Text style={styles.controlLabel}>{isSpeakerOn ? 'Earpiece' : 'Speaker'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.endButton]}
              onPress={handleEndOrCancel}>
              <MaterialIcons name="call-end" size={28} color="#fff" />
              <Text style={styles.controlLabel}>
                {callState === 'initiating' || callState === 'ringing' ? 'Cancel' : 'End'}
              </Text>
            </TouchableOpacity>

            {/* Task 9.4: Switch camera (video only) */}
            {callType === 'video' && callState === 'active' && (
              <TouchableOpacity
                style={styles.controlButton}
                onPress={switchCamera}>
                <MaterialIcons
                  name="flip-camera-android"
                  size={28}
                  color="#fff"
                />
                <Text style={styles.controlLabel}>Flip</Text>
              </TouchableOpacity>
            )}

            {callType === 'video' && (
              <TouchableOpacity
                style={[styles.controlButton, isCameraOff && styles.controlActive]}
                onPress={toggleCamera}>
                <MaterialIcons
                  name={isCameraOff ? 'videocam-off' : 'videocam'}
                  size={28}
                  color="#fff"
                />
                <Text style={styles.controlLabel}>{isCameraOff ? 'Show' : 'Hide'}</Text>
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
    paddingTop: 60, paddingBottom: 60,
  },
  headerSection: { alignItems: 'center', gap: 8 },
  remoteUserName: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  title: { fontSize: 16, color: '#aaa' },
  statusText: { fontSize: 18, color: '#ccc' },
  failedSection: { alignItems: 'center', gap: 12 },
  failedText: { fontSize: 18, color: '#ff6b6b', fontWeight: '600' },
  retryButton: {
    paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#333', borderRadius: 8,
  },
  retryButtonText: { color: '#fff', fontSize: 16 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'center' },
  controlButton: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  controlActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  endButton: { backgroundColor: '#ff4444' },
  controlIcon: { fontSize: 14, color: '#fff', fontWeight: 'bold' },
  controlLabel: { color: '#fff', fontSize: 10, marginTop: 4 },
  backButton: {
    paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#333', borderRadius: 8,
  },
  backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default CallScreen;
