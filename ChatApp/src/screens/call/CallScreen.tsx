import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { RootStackParamList } from '../../navigation/types';
import { useWebRTC } from '../../hooks/useWebRTC';
import UserAvatar from '../../components/UserAvatar';
import { callAudioService } from '../../services/audio/callAudioService';
import { KoolaText, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

type CallScreenRouteProp = RouteProp<RootStackParamList, 'CallModal'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

// Task 9.1: Moved from screens/main/ to screens/call/
const CallScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<CallScreenRouteProp>();
  const { sessionId, callType, isInitiator, iceServers, remoteUser } = route.params;
  const { tokens } = useTheme();
  const styles = useMemo(() => makeScreenStyles(tokens.semantic), [tokens.semantic]);

  // Stabilize the ICE list reference — useWebRTC's setup effect depends on it,
  // and an inline `?? []` would create a new array each render → effect churn
  // (tear down + rebuild the peer connection mid-call).
  const stableIceServers = useMemo(() => iceServers ?? [], [iceServers]);

  // Task 9.1: Speaker toggle state
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
    iceServers: stableIceServers,
    onCallEnded: handleCallEnded,
  });

  // Task 9.3: Status text based on call state
  const statusText = (): string => {
    switch (callState) {
      case 'initiating': return 'Đang kết nối...';
      case 'connecting': return 'Đang kết nối...';
      case 'ringing': return isInitiator ? 'Đang đổ chuông...' : 'Cuộc gọi đến...';
      case 'active': return formattedDuration;
      case 'failed': return 'Cuộc gọi thất bại';
      case 'ended': return 'Cuộc gọi đã kết thúc';
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
          zOrder={0}
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
            zOrder={1}
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
              <KoolaText style={styles.remoteUserName}>{remoteUser.displayName}</KoolaText>
            </>
          )}
          <KoolaText style={styles.title}>
            {callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
          </KoolaText>
          {/* Task 9.3: Connection status label */}
          <KoolaText style={styles.statusText}>{statusText()}</KoolaText>
        </View>

        {/* Task 9.6: Failed state retry affordance */}
        {callState === 'failed' && (
          <View style={styles.failedSection}>
            <KoolaText style={styles.failedText}>Kết nối thất bại</KoolaText>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack();
              }}
              accessibilityRole="button"
              accessibilityLabel="Đóng và gọi lại">
              <KoolaText style={styles.retryButtonText}>Đóng và gọi lại</KoolaText>
            </Pressable>
          </View>
        )}

        {/* Controls */}
        {callState !== 'ended' && callState !== 'failed' && (
          <View style={styles.controls}>
            <Pressable
              style={[styles.controlButton, isMuted && styles.controlActive]}
              onPress={toggleMute}
              accessibilityRole="button"
              accessibilityLabel={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}>
              <MaterialIcons
                name={isMuted ? 'mic-off' : 'mic'}
                size={28}
                color="#fff"
              />
              <KoolaText style={styles.controlLabel}>{isMuted ? 'Bật tiếng' : 'Tắt tiếng'}</KoolaText>
            </Pressable>

            {/* Task 9.5: Speaker toggle */}
            <Pressable
              style={[styles.controlButton, isSpeakerOn && styles.controlActive]}
              onPress={handleSpeakerToggle}
              accessibilityRole="button"
              accessibilityLabel={isSpeakerOn ? 'Chuyển tai nghe' : 'Bật loa ngoài'}>
              <MaterialIcons
                name={isSpeakerOn ? 'volume-up' : 'volume-off'}
                size={28}
                color="#fff"
              />
              <KoolaText style={styles.controlLabel}>{isSpeakerOn ? 'Tai nghe' : 'Loa ngoài'}</KoolaText>
            </Pressable>

            <Pressable
              style={[styles.controlButton, styles.endButton]}
              onPress={handleEndOrCancel}
              accessibilityRole="button"
              accessibilityLabel={callState === 'initiating' || callState === 'ringing' ? 'Hủy cuộc gọi' : 'Kết thúc cuộc gọi'}>
              <MaterialIcons name="call-end" size={28} color="#fff" />
              <KoolaText style={styles.controlLabel}>
                {callState === 'initiating' || callState === 'ringing' ? 'Hủy' : 'Kết thúc'}
              </KoolaText>
            </Pressable>

            {/* Task 9.4: Switch camera (video only) */}
            {callType === 'video' && callState === 'active' && (
              <Pressable
                style={styles.controlButton}
                onPress={switchCamera}
                accessibilityRole="button"
                accessibilityLabel="Lật camera">
                <MaterialIcons
                  name="flip-camera-android"
                  size={28}
                  color="#fff"
                />
                <KoolaText style={styles.controlLabel}>Lật</KoolaText>
              </Pressable>
            )}

            {callType === 'video' && (
              <Pressable
                style={[styles.controlButton, isCameraOff && styles.controlActive]}
                onPress={toggleCamera}
                accessibilityRole="button"
                accessibilityLabel={isCameraOff ? 'Bật camera' : 'Tắt camera'}>
                <MaterialIcons
                  name={isCameraOff ? 'videocam-off' : 'videocam'}
                  size={28}
                  color="#fff"
                />
                <KoolaText style={styles.controlLabel}>{isCameraOff ? 'Hiện' : 'Ẩn'}</KoolaText>
              </Pressable>
            )}
          </View>
        )}

        {callState === 'ended' && (
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Quay lại">
            <KoolaText style={styles.backText}>Quay lại</KoolaText>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const makeScreenStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
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
    failedText: { fontSize: 18, color: semantic.status.danger, fontWeight: '600' },
    retryButton: {
      paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#333', borderRadius: 8,
    },
    retryButtonText: { color: '#fff', fontSize: 16 },
    controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 24 },
    controlButton: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center', alignItems: 'center',
    },
    controlActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
    endButton: { backgroundColor: semantic.status.danger },
    controlLabel: { color: '#fff', fontSize: 10, marginTop: 4 },
    backButton: {
      paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#333', borderRadius: 8,
    },
    backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });

export default CallScreen;
