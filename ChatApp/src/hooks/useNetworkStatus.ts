import { useState, useEffect, useRef, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface UseNetworkStatusOptions {
  onConnectivityChange?: (isConnected: boolean) => void;
}

export function useNetworkStatus(options?: UseNetworkStatusOptions) {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const prevConnected = useRef<boolean>(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);

      if (connected !== prevConnected.current) {
        prevConnected.current = connected;
        setIsConnected(connected);
        options?.onConnectivityChange?.(connected);
      }
    });

    return () => unsubscribe();
  }, [options?.onConnectivityChange]);

  return { isConnected };
}
