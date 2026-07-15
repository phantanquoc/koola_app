import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from '../../navigation/types';
import type { BusinessAccountItem } from '../../services/api/apiService';
import { accountDiscoveryApi, conversationsApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import { CATEGORY_LABELS } from './constants';
import {
  KoolaBadge,
  KoolaButton,
  KoolaSkeleton,
  KoolaState,
  KoolaSurface,
  KoolaText,
  koolaRadii,
  koolaShadows,
  useKoolaToast,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';

type BusinessProfileRouteProp = RouteProp<
  ConnectTabStackParamList,
  'BusinessProfile'
>;

type BusinessProfileNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

const BusinessProfileScreen: React.FC = () => {
  const route = useRoute<BusinessProfileRouteProp>();
  const navigation = useNavigation<BusinessProfileNavProp>();
  const { businessId } = route.params;
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const toast = useKoolaToast();

  const [account, setAccount] = useState<BusinessAccountItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await accountDiscoveryApi.getById(businessId);
      setAccount(data);
    } catch (err) {
      if (__DEV__) console.warn('Failed to load business account:', err);
      setFetchError('Không thể tải thông tin doanh nghiệp');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const handleMessage = useCallback(async () => {
    if (!account) return;
    setMessaging(true);
    try {
      const { conversation } = await conversationsApi.startDirectChat(account._id);
      (navigation as any).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId: conversation._id },
      });
    } catch (err) {
      if (__DEV__) console.warn('Start direct chat failed:', err);
      toast.show('Không thể bắt đầu trò chuyện. Bạn thử lại nhé.', 'danger');
    } finally {
      setMessaging(false);
    }
  }, [account, navigation, toast]);

  if (loading) {
    return (
      <View style={styles.container}>
        <KoolaSurface variant="raised" style={styles.loadingCard}>
          <KoolaSkeleton width={72} height={72} radius={16} style={styles.loadingCardItem} />
          <KoolaSkeleton width="62%" height={22} style={styles.loadingCardItem} />
          <KoolaSkeleton width="44%" height={14} style={styles.loadingCardItem} />
          <KoolaSkeleton width="100%" height={90} />
        </KoolaSurface>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={styles.container}>
        <KoolaState
          icon="cloud-off"
          title="Không thể tải doanh nghiệp"
          message={fetchError}
          actionLabel="Thử lại"
          onActionPress={fetchAccount}
          style={styles.centerState}
        />
      </View>
    );
  }

  if (!account) {
    return (
      <View style={styles.container}>
        <KoolaState
          icon="error-outline"
          title="Không tìm thấy doanh nghiệp"
          message="Hồ sơ này không tồn tại hoặc đã bị ẩn."
          style={styles.centerState}
        />
      </View>
    );
  }

  const categoryLabel =
    (account.businessCategory ? CATEGORY_LABELS[account.businessCategory] : undefined) ||
    account.businessCategory ||
    '';

  // Use avatar or logoKey for real imagery; UserAvatar handles initials fallback
  const imageKey = account.avatar || account.logoKey;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <KoolaSurface variant="raised" style={styles.hero}>
        <UserAvatar
          displayName={account.displayName}
          avatar={imageKey}
          size={72}
        />
        <View style={styles.nameSection}>
          <View style={styles.nameRow}>
            <KoolaText variant="heading" weight="800" numberOfLines={2} style={styles.name}>
              {account.displayName}
            </KoolaText>
            {account.verificationStatus === 'verified' ? (
              <MaterialIcons name="verified" size={21} color={palette.success} />
            ) : null}
          </View>
          <View style={styles.badgeRow}>
            {categoryLabel ? <View style={styles.badgeItem}><KoolaBadge label={categoryLabel} tone="primary" /></View> : null}
            {account.province ? <View style={styles.badgeItem}><KoolaBadge label={account.province} tone="muted" /></View> : null}
          </View>
        </View>
      </KoolaSurface>

      {account.relationshipType ? (
        <KoolaSurface variant="soft" style={styles.typeRow}>
          <MaterialIcons
            name={account.relationshipType === 'partner' ? 'handshake' : 'local-shipping'}
            size={17}
            color={palette.muted}
          />
          <KoolaText variant="caption" tone="muted" weight="800" style={styles.typeRowLabel}>
            {account.relationshipType === 'partner' ? 'Đối tác' : 'Nhà cung cấp'}
          </KoolaText>
        </KoolaSurface>
      ) : null}

      {account.tagline ? (
        <InfoSection title="Giới thiệu" palette={palette} styles={styles}>
          <KoolaText variant="body" tone="muted">
            {account.tagline}
          </KoolaText>
        </InfoSection>
      ) : null}

      {account.website || account.contactEmail || account.contactPhone ? (
        <InfoSection title="Liên hệ" palette={palette} styles={styles}>
          {account.website ? (
            <ContactRow
              icon="language"
              label={account.website}
              palette={palette}
              styles={styles}
              onPress={() => Linking.openURL(account.website!)}
            />
          ) : null}
          {account.contactEmail ? (
            <ContactRow
              icon="email"
              label={account.contactEmail}
              palette={palette}
              styles={styles}
              onPress={() => Linking.openURL(`mailto:${account.contactEmail}`)}
            />
          ) : null}
          {account.contactPhone ? (
            <ContactRow
              icon="phone"
              label={account.contactPhone}
              palette={palette}
              styles={styles}
              onPress={() => Linking.openURL(`tel:${account.contactPhone}`)}
            />
          ) : null}
        </InfoSection>
      ) : null}

      {account.address ? (
        <InfoSection title="Địa chỉ" palette={palette} styles={styles}>
          <ContactRow icon="place" label={account.address} palette={palette} styles={styles} />
        </InfoSection>
      ) : null}

      <KoolaButton
        title="Nhắn tin"
        icon="chat-bubble-outline"
        variant="primary"
        loading={messaging}
        disabled={messaging}
        onPress={handleMessage}
        style={styles.actionBtn}
      />
    </ScrollView>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

interface ContactRowProps {
  icon: string;
  label: string;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
  onPress?: () => void;
}

const ContactRow: React.FC<ContactRowProps> = ({ icon, label, palette, styles, onPress }) => (
  <Pressable
    style={styles.contactRow}
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}>
    <MaterialIcons name={icon} size={18} color={palette.primary} />
    <KoolaText tone={onPress ? 'primary' : 'muted'} style={styles.contactText}>
      {label}
    </KoolaText>
  </Pressable>
);

interface InfoSectionProps {
  title: string;
  children: React.ReactNode;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
}

const InfoSection: React.FC<InfoSectionProps> = ({ title, children, palette, styles }) => (
  <KoolaSurface variant="flat" style={styles.section}>
    <KoolaText variant="caption" tone="primary" weight="800" style={styles.sectionTitle}>
      {title.toUpperCase()}
    </KoolaText>
    {children}
  </KoolaSurface>
);

// ─── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    centerState: {
      flex: 1,
    },
    loadingCard: {
      margin: 16,
      padding: 18,
    },
    loadingCardItem: {
      marginBottom: 14,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
      marginBottom: 12,
      ...koolaShadows.sm,
    },
    nameSection: {
      flex: 1,
      marginLeft: 16,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    name: {
      flex: 1,
      marginRight: 6,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 8,
    },
    badgeItem: {
      marginRight: 8,
      marginBottom: 8,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    typeRowLabel: {
      marginLeft: 8,
    },
    section: {
      marginBottom: 12,
    },
    sectionTitle: {
      marginBottom: 9,
    },
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
    },
    contactText: {
      flex: 1,
      marginLeft: 9,
    },
    actionBtn: {
      marginTop: 6,
    },
  });

export default BusinessProfileScreen;
