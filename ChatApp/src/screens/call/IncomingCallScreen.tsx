import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { RootStackParamList } from '../../navigation/types';
import UserAvatar from '../../components/UserAvatar';
import { callAudioService } from '../../services/audio/callAudioService';
import { webrtcService } from '../../services/webrtc/WebRTCService';

type IncomingCallRouteProp = RouteProp<RootStackParamList, 'IncomingCallModal'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

// Task 8.1: Accept navigation params (sessionId, callType, remoteUser)
const IncomingCallScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<IncomingCallRouteProp>();
  const { sessionId, callType, remoteUser, iceServers } = route.params;

  // Task 8.4: On mount — start ringtone and emit call_ringing
  useEffect(() => {
    callAudioService.startRingtone();
    webrtcService.emitRinging(sessionId);

    return () => {
      // Task 8.9: Cleanup on unmount
      callAudioService.stop();
    };
  }, [sessionId]);

  // Task 8.7 & 8.8: Listen for call_cancelled and call_timeout
  useEffect(() => {
    const handleCancelled = () => {
      callAudioService.stop();
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    };

    const handleTimeout = () => {
      callAudioService.stop();
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    };

    webrtcService.on('call_cancelled', handleCancelled);
    webrtcService.on('call_timeout', handleTimeout);

    return () => {
      // Task 8.9: Remove listeners on unmount
      webrtcService.off('call_cancelled', handleCancelled);
      webrtcService.off('call_timeout', handleTimeout);
    };
  }, [navigation]);

  // Task 8.5: Accept handler
  const handleAccept = useCallback(() => {
    callAudioService.stop();
    webrtcService.acceptCall(sessionId);
    navigation.replace('CallModal', {
      sessionId,
      callType,
      isInitiator: false,
      remoteUser,
      iceServers,
    });
  }, [navigation, sessionId, callType, remoteUser, iceServers]);

  // Task 8.6: Decline handler
  const handleDecline = useCallback(() => {
    callAudioService.stop();
    webrtcService.declineCall(sessionId);
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, sessionId]);

  const callTypeLabel = callType === 'video' ? 'Video Call' : 'Audio Call';

  // Task 8.2: Render full-screen layout
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Remote user info */}
        <View style={styles.callerSection}>
          <UserAvatar
            displayName={remoteUser.displayName}
            avatar={remoteUser.avatar}
            size={96}
          />
          <Text style={styles.callerName}>{remoteUser.displayName}</Text>
          <Text style={styles.callTypeLabel}>{callTypeLabel}</Text>
        </View>

        {/* Task 8.3: Accept and Decline buttons */}
        <View style={styles.buttonsRow}>
          <View style={styles.buttonWrapper}>
            <TouchableOpacity
              style={[styles.callButton, styles.declineButton]}
              onPress={handleDecline}
              accessibilityRole="button"
              accessibilityLabel="Decline call">
              <MaterialIcons name="call-end" size={32} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.buttonLabel}>Decline</Text>
          </View>

          <View style={styles.buttonWrapper}>
            <TouchableOpacity
              style={[styles.callButton, styles.acceptButton]}
              onPress={handleAccept}
              accessibilityRole="button"
              accessibilityLabel="Accept call">
              <MaterialIcons
                name={callType === 'video' ? 'videocam' : 'call'}
                size={32}
                color="#fff"
              />
            </TouchableOpacity>
            <Text style={styles.buttonLabel}>Accept</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 24,
  },
  callerSection: {
    alignItems: 'center',
    gap: 16,
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  callTypeLabel: {
    fontSize: 16,
    color: '#aaa',
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  buttonWrapper: {
    alignItems: 'center',
    gap: 8,
  },
  callButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: '#e53935',
  },
  acceptButton: {
    backgroundColor: '#43a047',
  },
  buttonIcon: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
  },
  buttonLabel: {
    fontSize: 14,
    color: '#fff',
  },
});

export default IncomingCallScreen;
