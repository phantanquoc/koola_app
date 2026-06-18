import React, { useCallback, useEffect, useState } from 'react';
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
import { CATEGORY_LABELS } from './constants';
import {
  KoolaBadge,
  KoolaButton,
  KoolaSkeleton,
  KoolaState,
  KoolaSurface,
  KoolaText,
  koolaColors,
  koolaRadii,
} from '../../ui';

type BusinessProfileRouteProp = RouteProp<
  ConnectTabStackParamList,
  'BusinessProfile'
>;

type BusinessProfileNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

const LOGO_COLORS = [
  koolaColors.primary,
  koolaColors.accent,
  koolaColors.warm,
  '#7C3AED',
  '#0EA5E9',
];

const BusinessProfileScreen: React.FC = () => {
  const route = useRoute<BusinessProfileRouteProp>();
  const navigation = useNavigation<BusinessProfileNavProp>();
  const { businessId } = route.params;

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
      console.warn('Failed to load business account:', err);
      setFetchError(
        (err as Error)?.message || 'Không thể tải thông tin doanh nghiệp',
      );
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
      console.warn('Start direct chat failed:', err);
    } finally {
      setMessaging(false);
    }
  }, [account, navigation]);

  if (loading) {
    return (
      <View style={styles.container}>
        <KoolaSurface variant="raised" style={styles.loadingCard}>
          <KoolaSkeleton width={72} height={72} radius={16} />
          <KoolaSkeleton width="62%" height={22} />
          <KoolaSkeleton width="44%" height={14} />
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

  const bgColor = LOGO_COLORS[account.displayName.charCodeAt(0) % LOGO_COLORS.length];
  const categoryLabel =
    (account.businessCategory ? CATEGORY_LABELS[account.businessCategory] : undefined) ||
    account.businessCategory ||
    '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <KoolaSurface variant="raised" style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: bgColor }]}>
          <MaterialIcons name="business" size={36} color="#FFFFFF" />
        </View>
        <View style={styles.nameSection}>
          <View style={styles.nameRow}>
            <KoolaText variant="heading" weight="800" numberOfLines={2} style={styles.name}>
              {account.displayName}
            </KoolaText>
            {account.verificationStatus === 'verified' ? (
              <MaterialIcons name="verified" size={21} color={koolaColors.success} />
            ) : null}
          </View>
          <View style={styles.badgeRow}>
            {categoryLabel ? <KoolaBadge label={categoryLabel} tone="primary" /> : null}
            {account.province ? <KoolaBadge label={account.province} tone="muted" /> : null}
          </View>
        </View>
      </KoolaSurface>

      {account.relationshipType ? (
        <KoolaSurface variant="soft" style={styles.typeRow}>
          <MaterialIcons
            name={account.relationshipType === 'partner' ? 'handshake' : 'local-shipping'}
            size={17}
            color={koolaColors.muted}
          />
          <KoolaText variant="caption" tone="muted" weight="800">
            {account.relationshipType === 'partner' ? 'Đối tác' : 'Nhà cung cấp'}
          </KoolaText>
        </KoolaSurface>
      ) : null}

      {account.tagline ? (
        <InfoSection title="Giới thiệu">
          <KoolaText variant="body" tone="muted">
            {account.tagline}
          </KoolaText>
        </InfoSection>
      ) : null}

      {account.website || account.contactEmail || account.contactPhone ? (
        <InfoSection title="Liên hệ">
          {account.website ? (
            <ContactRow
              icon="language"
              label={account.website}
              onPress={() => Linking.openURL(account.website!)}
            />
          ) : null}
          {account.contactEmail ? (
            <ContactRow
              icon="email"
              label={account.contactEmail}
              onPress={() => Linking.openURL(`mailto:${account.contactEmail}`)}
            />
          ) : null}
          {account.contactPhone ? (
            <ContactRow
              icon="phone"
              label={account.contactPhone}
              onPress={() => Linking.openURL(`tel:${account.contactPhone}`)}
            />
          ) : null}
        </InfoSection>
      ) : null}

      {account.address ? (
        <InfoSection title="Địa chỉ">
          <ContactRow icon="place" label={account.address} />
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

interface ContactRowProps {
  icon: string;
  label: string;
  onPress?: () => void;
}

const ContactRow: React.FC<ContactRowProps> = ({ icon, label, onPress }) => (
  <Pressable
    style={styles.contactRow}
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}>
    <MaterialIcons name={icon} size={18} color={koolaColors.primary} />
    <KoolaText tone={onPress ? 'primary' : 'muted'} style={styles.contactText}>
      {label}
    </KoolaText>
  </Pressable>
);

const InfoSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <KoolaSurface variant="flat" style={styles.section}>
    <KoolaText variant="caption" tone="primary" weight="800" style={styles.sectionTitle}>
      {title.toUpperCase()}
    </KoolaText>
    {children}
  </KoolaSurface>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
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
    gap: 14,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    marginBottom: 12,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: koolaRadii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameSection: {
    flex: 1,
    marginLeft: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
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
    gap: 9,
    paddingVertical: 5,
  },
  contactText: {
    flex: 1,
  },
  actionBtn: {
    marginTop: 6,
  },
});

export default BusinessProfileScreen;
