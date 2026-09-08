import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import type { PersonalTabStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { koolaSpacing, useTheme } from '../../ui';
import { PersonalCard } from './components/personal/PersonalCard';
import { PersonalIconRow } from './components/personal/PersonalIconRow';
import { PersonalProfileCard } from './components/personal/PersonalProfileCard';
import { PersonalWalletCard } from './components/personal/PersonalWalletCard';
import { PersonalAccountInfoCard } from './components/personal/PersonalAccountInfoCard';
import { PersonalSecuritySection } from './components/personal/PersonalSecuritySection';

/**
 * Personal home (tab Cá nhân) — the four Figma cards: profile, wallet,
 * account info, security. All detailed settings (theme, translation,
 * notifications, privacy, about, cache) live behind the "Cài đặt" row,
 * which navigates to `SettingsDetail`.
 */
const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const { resolvedScheme } = useTheme();
  const styles = useMemo(() => makeScreenStyles(), []);

  // __DEV__ Logo Lab lives in the Chat tab stack, and `MainTabParamList`
  // declares `ChatTab: undefined` — so this stack's typed navigation prop cannot
  // express the nested-screen jump. Scoped cast to the minimal call shape at the
  // boundary (no `any`); casting the object rather than the method keeps the
  // navigation object as the receiver.
  const crossTabNavigation = navigation as unknown as {
    navigate: (name: string, params: { screen: string }) => void;
  };

  return (
    <View style={styles.root}>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: insets.top + 4 + 30 + koolaSpacing.lg, paddingBottom: tabBarInset },
        ]}
        showsVerticalScrollIndicator={false}>
        <PersonalProfileCard
          displayName={user?.displayName || 'Không rõ'}
          avatar={user?.avatar || undefined}
          onEdit={() => navigation.navigate('EditProfile')}
          onSwitchAccount={() => navigation.navigate('AccountList')}
          onUpgradeBusiness={() => navigation.navigate('UpgradeAccount')}
        />
        <PersonalWalletCard />

        {/* Account information — polished Figma 92:51 card */}
        <PersonalAccountInfoCard
          phone={user?.phone ?? undefined}
          email={user?.email ?? ''}
          userId={user?._id ? `KOOLA-${user._id.slice(-5).toUpperCase()}` : 'KOOLA-XXXXX'}
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
