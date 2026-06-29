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
    // We trust ONLY `isConnected` (a network interface is up), NOT
    // `isInternetReachable`. The reachability probe pings an external host
    // (e.g. Google) which is unreliable through the Android emulator's NAT and
    // behind captive portals — it returns `false` even when our backend at
    // 10.0.2.2 is perfectly reachable, causing a false "offline" that traps
    // messages in the queue and never sends them. If the device genuinely
    // loses its interface, `isConnected` flips false and the offline path
    // still kicks in. Send failures despite a live interface are caught by the
    // outbox retry logic, so nothing is lost by ignoring reachability here.
    const isOnline = (state: NetInfoState) => state.isConnected !== false;

    // Fetch actual initial state instead of assuming connected
    NetInfo.fetch().then((state: NetInfoState) => {
      const connected = isOnline(state);
      prevConnected.current = connected;
      setIsConnected(connected);
    });

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = isOnline(state);

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
