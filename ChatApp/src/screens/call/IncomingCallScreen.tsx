import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { RootStackParamList } from '../../navigation/types';
import UserAvatar from '../../components/UserAvatar';
import { callAudioService } from '../../services/audio/callAudioService';
import { webrtcService } from '../../services/webrtc/WebRTCService';
import { KoolaText, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

type IncomingCallRouteProp = RouteProp<RootStackParamList, 'IncomingCallModal'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

// Task 8.1: Accept navigation params (sessionId, callType, remoteUser)
const IncomingCallScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<IncomingCallRouteProp>();
  const { sessionId, callType, remoteUser, iceServers } = route.params;
  const { tokens } = useTheme();
  const styles = useMemo(() => makeScreenStyles(tokens.semantic), [tokens.semantic]);

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
    const dismiss = () => {
      callAudioService.stop();
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main' as never);
      }
    };

    webrtcService.on('call_cancelled', dismiss);
    webrtcService.on('call_timeout', dismiss);
    webrtcService.on('call_missed', dismiss);
    webrtcService.on('call_ended', dismiss);

    return () => {
      // Task 8.9: Remove listeners on unmount
      webrtcService.off('call_cancelled', dismiss);
      webrtcService.off('call_timeout', dismiss);
      webrtcService.off('call_missed', dismiss);
      webrtcService.off('call_ended', dismiss);
    };
  }, [navigation]);

  // Task 8.5: Accept handler
  const handleAccept = useCallback(() => {
    callAudioService.stop();
    webrtcService.acceptCall(sessionId, callType);
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

  const callTypeLabel = callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';

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
          <KoolaText style={styles.callerName}>{remoteUser.displayName}</KoolaText>
          <KoolaText style={styles.callTypeLabel}>{callTypeLabel}</KoolaText>
        </View>

        {/* Task 8.3: Accept and Decline buttons */}
        <View style={styles.buttonsRow}>
          <View style={styles.buttonWrapper}>
            <Pressable
              style={[styles.callButton, styles.declineButton]}
              onPress={handleDecline}
              accessibilityRole="button"
              accessibilityLabel="Từ chối cuộc gọi">
              <MaterialIcons name="call-end" size={32} color="#fff" />
            </Pressable>
            <KoolaText style={styles.buttonLabel}>Từ chối</KoolaText>
          </View>

          <View style={styles.buttonWrapper}>
            <Pressable
              style={[styles.callButton, styles.acceptButton]}
              onPress={handleAccept}
              accessibilityRole="button"
              accessibilityLabel="Chấp nhận cuộc gọi">
              <MaterialIcons
                name={callType === 'video' ? 'videocam' : 'call'}
                size={32}
                color="#fff"
              />
            </Pressable>
            <KoolaText style={styles.buttonLabel}>Chấp nhận</KoolaText>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const makeScreenStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
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
    },
    callerName: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#fff',
      marginTop: 32,
      marginBottom: 16,
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
    },
    callButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    declineButton: {
      backgroundColor: semantic.status.danger,
    },
    acceptButton: {
      backgroundColor: semantic.status.success,
    },
    buttonLabel: {
      fontSize: 14,
      color: '#fff',
    },
  });

export default IncomingCallScreen;
