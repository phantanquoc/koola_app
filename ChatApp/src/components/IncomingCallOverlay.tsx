/**
 * IncomingCallOverlay — shown when an incoming call arrives.
 * Displays caller info and accept/decline buttons as a modal overlay.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useCall } from '../contexts/CallContext';

export const IncomingCallOverlay: React.FC = () => {
  const { incomingCall, acceptIncomingCall, declineIncomingCall } = useCall();

  if (!incomingCall) return null;

  const callerName = incomingCall.fromUser?.displayName ?? 'Unknown';
  const isVideo = incomingCall.callType === 'video';

  return (
    <Modal transparent animationType="fade" visible={!!incomingCall}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {callerName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.callType}>
            Incoming {isVideo ? 'Video' : 'Audio'} Call
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.declineBtn} onPress={declineIncomingCall}>
              <Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={acceptIncomingCall}>
              <Text style={styles.btnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 300,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  callerName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 4,
  },
  callType: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 32,
  },
  actions: {
    flexDirection: 'row',
    gap: 32,
  },
  declineBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#34c759',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
