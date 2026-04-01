/**
 * useNetworkStatus — monitors device connectivity using @react-native-community/netinfo.
 * Exposes `isConnected` and calls `onConnectivityChange` whenever connectivity changes.
 */
import { useEffect, useState, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface UseNetworkStatusOptions {
  /** Called on every connectivity change. Pass null if no callback needed. */
  onConnectivityChange?: (isConnected: boolean) => void;
}

/** Returns `true` once confirmed connected, `false` once confirmed disconnected, `null` while unknown. */
export function useNetworkStatus(options: UseNetworkStatusOptions = {}): boolean {
  const { onConnectivityChange } = options;

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const onChangeRef = useRef(onConnectivityChange);
  onChangeRef.current = onConnectivityChange;

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then((state: NetInfoState) => {
      const connected = state.isConnected === true;
      setIsConnected(connected);
      onChangeRef.current?.(connected);
    });

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected === true;
      setIsConnected(connected);
      onChangeRef.current?.(connected);
    });

    return unsubscribe;
  }, []);

  return isConnected;
}
