import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { ConnectTabStackParamList } from '../../navigation/types';
import type { Business } from '../../types';
import { businessesApi } from '../../services/api/apiService';
import ConnectedUsersStack from '../../components/connect/ConnectedUsersStack';
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

const LOGO_COLORS = [
  koolaColors.primary,
  koolaColors.accent,
  koolaColors.warm,
  '#7C3AED',
  '#0EA5E9',
];

const BusinessProfileScreen: React.FC = () => {
  const route = useRoute<BusinessProfileRouteProp>();
  const { businessId } = route.params;

  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const fetchBusiness = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await businessesApi.getById(businessId);
      setBusiness(data);
    } catch (err) {
      console.warn('Failed to load business:', err);
      setFetchError(
        (err as Error)?.message || 'Không thể tải thông tin doanh nghiệp',
      );
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchBusiness();
  }, [fetchBusiness]);

  const handleConnect = useCallback(async () => {
    if (!business) return;
    setConnecting(true);

    if (business.isConnected) {
      try {
        await businessesApi.disconnect(business._id);
        setBusiness((prev) =>
          prev
            ? {
                ...prev,
                isConnected: false,
                connectionCount: Math.max(0, prev.connectionCount - 1),
              }
            : prev,
        );
      } catch (err) {
        console.warn('Disconnect failed:', err);
        Alert.alert('Lỗi', 'Không thể hủy kết nối. Vui lòng thử lại.');
      }
    } else {
      try {
        await businessesApi.connect(business._id);
        setBusiness((prev) =>
          prev
            ? {
                ...prev,
                isConnected: true,
                connectionCount: prev.connectionCount + 1,
              }
            : prev,
        );
      } catch (err) {
        console.warn('Connect failed:', err);
        Alert.alert('Lỗi', 'Không thể kết nối. Vui lòng thử lại.');
      }
    }
    setConnecting(false);
  }, [business]);

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
          onActionPress={fetchBusiness}
          style={styles.centerState}
        />
      </View>
    );
  }

  if (!business) {
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

  const bgColor = LOGO_COLORS[business.name.charCodeAt(0) % LOGO_COLORS.length];
  const categoryLabel =
    CATEGORY_LABELS[business.category] || business.category;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <KoolaSurface variant="raised" style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: bgColor }]}>
          <MaterialIcons name="business" size={36} color="#FFFFFF" />
        </View>
        <View style={styles.nameSection}>
          <View style={styles.nameRow}>
            <KoolaText variant="heading" weight="800" numberOfLines={2} style={styles.name}>
              {business.name}
            </KoolaText>
            {business.isVerified ? (
              <MaterialIcons name="verified" size={21} color={koolaColors.success} />
            ) : null}
          </View>
          <View style={styles.badgeRow}>
            <KoolaBadge label={categoryLabel} tone="primary" />
            <KoolaBadge label={business.province} tone="muted" />
          </View>
        </View>
      </KoolaSurface>

      <KoolaSurface variant="soft" style={styles.typeRow}>
        <MaterialIcons
          name={business.relationshipType === 'partner' ? 'handshake' : 'local-shipping'}
          size={17}
          color={koolaColors.muted}
        />
        <KoolaText variant="caption" tone="muted" weight="800">
          {business.relationshipType === 'partner' ? 'Đối tác' : 'Nhà cung cấp'}
        </KoolaText>
      </KoolaSurface>

      {business.description || business.tagline ? (
        <InfoSection title="Giới thiệu">
          <KoolaText variant="body" tone="muted">
            {business.description || business.tagline}
          </KoolaText>
        </InfoSection>
      ) : null}

      {business.website || business.contactEmail || business.contactPhone ? (
        <InfoSection title="Liên hệ">
          {business.website ? (
            <ContactRow
              icon="language"
              label={business.website}
              onPress={() => Linking.openURL(business.website!)}
            />
          ) : null}
          {business.contactEmail ? (
            <ContactRow
              icon="email"
              label={business.contactEmail}
              onPress={() => Linking.openURL(`mailto:${business.contactEmail}`)}
            />
          ) : null}
          {business.contactPhone ? (
            <ContactRow
              icon="phone"
              label={business.contactPhone}
              onPress={() => Linking.openURL(`tel:${business.contactPhone}`)}
            />
          ) : null}
        </InfoSection>
      ) : null}

      {business.address ? (
        <InfoSection title="Địa chỉ">
          <ContactRow icon="place" label={business.address} />
        </InfoSection>
      ) : null}

      <InfoSection title="Kết nối">
        <View style={styles.connectedRow}>
          <ConnectedUsersStack
            users={business.connectedUsers || []}
            totalCount={business.connectionCount}
          />
          <KoolaText tone="muted" weight="700">
            {business.connectionCount} người đã kết nối
          </KoolaText>
        </View>
      </InfoSection>

      <KoolaButton
        title={business.isConnected ? 'Đã kết nối' : 'Kết nối ngay'}
        icon={business.isConnected ? 'check-circle' : 'handshake'}
        variant={business.isConnected ? 'secondary' : 'primary'}
        loading={connecting}
        disabled={connecting}
        onPress={handleConnect}
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
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    marginTop: 6,
  },
});

export default BusinessProfileScreen;
