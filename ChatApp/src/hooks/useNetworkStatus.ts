import { useState, useEffect, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface UseNetworkStatusOptions {
  onConnectivityChange?: (isConnected: boolean) => void;
}

export function useNetworkStatus(options?: UseNetworkStatusOptions) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const prevConnected = useRef<boolean | null>(null);
  const callbackRef = useRef(options?.onConnectivityChange);
  callbackRef.current = options?.onConnectivityChange;

  useEffect(() => {
    // Fetch actual initial state instead of assuming connected
    NetInfo.fetch().then((state: NetInfoState) => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      prevConnected.current = connected;
      setIsConnected(connected);
    });

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);

      if (connected !== prevConnected.current) {
        prevConnected.current = connected;
        setIsConnected(connected);
        callbackRef.current?.(connected);
      }
    });

    return () => unsubscribe();
  }, []);

  return { isConnected };
}
