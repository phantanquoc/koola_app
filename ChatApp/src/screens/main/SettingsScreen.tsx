import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTabBarBottomInset, useTabDockSuppression } from '../../navigation/MainNavigator';
import type { PersonalTabStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import { usePendingOrderCount } from '../../services/shopping/usePendingOrderCount';
import { useTheme } from '../../ui';
import { HeaderSearchDock } from '../../components/HeaderSearchDock';
import QrScannerModal from './QrScannerModal';
import GroupCreateModal from '../../components/GroupCreateModal';
import { PersonalCard } from './components/personal/PersonalCard';
import { PersonalIconRow } from './components/personal/PersonalIconRow';
import { PersonalProfileCard } from './components/personal/PersonalProfileCard';
import { PersonalWalletCard } from './components/personal/PersonalWalletCard';
import { PersonalAccountInfoCard } from './components/personal/PersonalAccountInfoCard';
import { PersonalSecuritySection } from './components/personal/PersonalSecuritySection';

// Đồng bộ với ChatHomeScreen: 87×15, TOP 1, DOCK 36
const WORDMARK_TOP = 1;
const WORDMARK_H = 15;
const DOCK_GAP = 6;
const DOCK_H = 36;

/**
 * Personal home (tab Cá nhân) — the four Figma cards: profile, wallet,
 * account info, security. All detailed settings (theme, translation,
 * notifications, privacy, about, cache) live behind the "Cài đặt" row,
 * which navigates to `SettingsDetail`.
 */
const SettingsScreen: React.FC = () => {
  const { user, activeAccount, logout } = useAuth();
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const { resolvedScheme, tokens } = useTheme();
  const { notify: notifyComingSoon, toast: comingSoonToast } = useComingSoonToast({
    bottom: tabBarInset + 16,
  });
  const styles = useMemo(() => makeScreenStyles(), []);

  // Buyer-side badge for the wallet card's order row. Refetches on focus, so
  // returning from PersonalOrders updates the count.
  const ordersPending = usePendingOrderCount('buyer', true);

  const blockH = insets.top + WORDMARK_TOP + WORDMARK_H + DOCK_GAP + DOCK_H; // = insets.top + 58
  const isDark = resolvedScheme === 'dark';

  const [qrVisible, setQrVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);

  // __DEV__ Logo Lab lives in the Chat tab stack, and `MainTabParamList`
  // declares `ChatTab: undefined` — so this stack's typed navigation prop cannot
  // express the nested-screen jump. Scoped cast to the minimal call shape at the
  // boundary (no `any`); casting the object rather than the method keeps the
  // navigation object as the receiver.
  const crossTabNavigation = navigation as unknown as {
    navigate: (name: string, params: { screen: string } | { screen: string; params: object }) => void;
    getParent: () => { navigate: (name: string, params?: object) => void } | undefined;
  };

  const handleSearchPress = useCallback(() => {
    // Dùng chung UniversalSearch của Chat tab
    crossTabNavigation.getParent?.()?.navigate('ChatTab', { screen: 'UniversalSearch' } as never);
  }, [crossTabNavigation]);

  const handleQrPress = useCallback(() => setQrVisible(true), []);
  const handleQrClose = useCallback(() => setQrVisible(false), []);

  // The group form no longer suppresses the dock itself (GroupCreateModal is
  // side-effect free); Personal is not under a Chat Home overlay owner, so this
  // screen owns the suppression. It is acquired synchronously in the press
  // handler (an effect would hide the dock one frame late) and released when
  // the form closes or the screen unmounts. Release is idempotent.
  const suppressTabDock = useTabDockSuppression();
  const groupDockReleaseRef = useRef<(() => void) | null>(null);
  const releaseGroupDock = useCallback(() => {
    if (groupDockReleaseRef.current !== null) {
      groupDockReleaseRef.current();
      groupDockReleaseRef.current = null;
    }
  }, []);
  const handleAddPress = useCallback(() => {
    if (groupDockReleaseRef.current === null) {
      groupDockReleaseRef.current = suppressTabDock();
    }
    setGroupModalVisible(true);
  }, [suppressTabDock]);
  const handleGroupClose = useCallback(() => {
    releaseGroupDock();
    setGroupModalVisible(false);
  }, [releaseGroupDock]);
  useEffect(() => releaseGroupDock, [releaseGroupDock]);

  const handleNavigateProfile = useCallback((userId: string) => {
    navigation.navigate('AccountList' as never);
    // Nếu cần mở Profile chi tiết, cross-tab:
    crossTabNavigation.getParent?.()?.navigate('ChatTab', { screen: 'Profile', params: { userId } } as never);
  }, [navigation, crossTabNavigation]);

  const handleNavigateChat = useCallback((conversationId: string) => {
    crossTabNavigation.getParent?.()?.navigate('ChatTab', { screen: 'Chat', params: { conversationId } } as never);
  }, [crossTabNavigation]);

  const handleGroupCreated = useCallback((conv: { _id: string }) => {
    releaseGroupDock();
    setGroupModalVisible(false);
    crossTabNavigation.getParent?.()?.navigate('ChatTab', { screen: 'Chat', params: { conversationId: conv._id } } as never);
  }, [crossTabNavigation, releaseGroupDock]);

  return (
    <View style={[styles.root, { backgroundColor: tokens.semantic.bg.canvas }]}>
      {/* Header block — wordmark + search dock, đồng bộ 100% ChatHome (87×15, TOP1, H58) */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: blockH,
          zIndex: 20,
          overflow: 'hidden',
        }}>
        {/* Nền đặc che list trượt sau kính */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#1C2026' : '#FFFFFF' }]}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: insets.top + WORDMARK_TOP,
            height: WORDMARK_H,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Image
            source={require('../../assets/logo_koola_wordmark.png')}
            style={{ width: 87, height: 15 }}
            resizeMode="contain"
            accessibilityLabel="KOOLA"
          />
        </View>
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: insets.top + WORDMARK_TOP + WORDMARK_H + DOCK_GAP,
            height: DOCK_H,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}>
          <HeaderSearchDock
            onSearchPress={handleSearchPress}
            onQrPress={handleQrPress}
            onAddPress={handleAddPress}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: blockH + 12, paddingBottom: tabBarInset },
        ]}
        showsVerticalScrollIndicator={false}>
        <PersonalProfileCard
          displayName={activeAccount?.displayName || user?.displayName || 'Không rõ'}
          avatar={activeAccount?.avatar || user?.avatar || undefined}
          accountType={activeAccount?.accountType ?? 'personal'}
          onEdit={() => navigation.navigate('EditProfile')}
          onSwitchAccount={() => navigation.navigate('AccountList')}
          onUpgradeBusiness={() => navigation.navigate('UpgradeAccount')}
        />
        <PersonalWalletCard
          onComingSoon={notifyComingSoon}
          onOrders={() => navigation.navigate('PersonalOrders')}
          ordersPending={ordersPending}
        />

        {/* Account information — polished Figma 92:51 card */}
        <PersonalAccountInfoCard
          phone={user?.phone ?? undefined}
          email={user?.email ?? ''}
          userId={user?._id ? `KOOLA-${user._id.slice(-5).toUpperCase()}` : 'KOOLA-XXXXX'}
          onEdit={() => navigation.navigate('EditProfile')}
        />

        {/* Settings & security — Figma 92:74 card. "Cài đặt" opens the detail
            screen where theme / translation / notifications / privacy / about /
            cache live. */}
        <PersonalSecuritySection
          onOpenSettings={() => navigation.navigate('SettingsDetail')}
          onLogout={logout}
        />

        {/* __DEV__ only — Logo Lab playground for 3D variant experiments */}
        {__DEV__ && (
          <PersonalCard>
            <PersonalIconRow
              title="[DEV] Logo Lab"
              icon="science"
              onPress={() => crossTabNavigation.navigate('ChatTab', { screen: 'LogoLab' })}
            />
          </PersonalCard>
        )}
      </ScrollView>
      {comingSoonToast}
      <QrScannerModal
        visible={qrVisible}
        onClose={handleQrClose}
        onNavigateProfile={handleNavigateProfile}
        onNavigateChat={handleNavigateChat}
      />
      <GroupCreateModal
        visible={groupModalVisible}
        onClose={handleGroupClose}
        onCreated={handleGroupCreated}
      />
    </View>
  );
};

const makeScreenStyles = () =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    contentContainer: {
      flexGrow: 1,
    },
    devCardWrap: {
      opacity: 0.6,
    },
  });

export default SettingsScreen;
