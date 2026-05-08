import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { ConnectTabStackParamList } from '../../navigation/types';
import type { Business } from '../../types';
import { businessesApi } from '../../services/api/apiService';
import ConnectedUsersStack from '../../components/connect/ConnectedUsersStack';
import { CATEGORY_LABELS } from './constants';

type BusinessProfileRouteProp = RouteProp<ConnectTabStackParamList, 'BusinessProfile'>;

const LOGO_COLORS = ['#3B5DC9', '#2E9E5A', '#E05A2D', '#7E57C2', '#26A69A'];

const BusinessProfileScreen: React.FC = () => {
  const route = useRoute<BusinessProfileRouteProp>();
  const { businessId } = route.params;

  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await businessesApi.getById(businessId);
        setBusiness(data);
      } catch (err) {
        console.warn('Failed to load business:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [businessId]);

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
      }
    }
    setConnecting(false);
  }, [business]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
      </View>
    );
  }

  if (!business) {
    return (
      <View style={styles.loadingContainer}>
        <MaterialIcons name="error-outline" size={48} color="#ccc" />
        <Text style={styles.errorText}>Không tìm thấy doanh nghiệp</Text>
      </View>
    );
  }

  const bgColor = LOGO_COLORS[business.name.charCodeAt(0) % LOGO_COLORS.length];
  const categoryLabel = CATEGORY_LABELS[business.category] || business.category;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Logo */}
      <View style={styles.logoSection}>
        <View style={[styles.logo, { backgroundColor: bgColor }]}>
          <MaterialIcons name="business" size={36} color="#FFFFFF" />
        </View>
        <View style={styles.nameSection}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{business.name}</Text>
            {business.isVerified && (
              <MaterialIcons name="verified" size={20} color="#1565C0" style={styles.verifiedIcon} />
            )}
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{categoryLabel}</Text>
            </View>
            <View style={styles.locationBadge}>
              <MaterialIcons name="location-on" size={14} color="#6B7280" />
              <Text style={styles.locationText}>{business.province}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Type */}
      <View style={styles.typeRow}>
        <MaterialIcons
          name={business.relationshipType === 'partner' ? 'handshake' : 'local-shipping'}
          size={16}
          color="#6B7280"
        />
        <Text style={styles.typeText}>
          {business.relationshipType === 'partner' ? 'Đối tác' : 'Nhà cung cấp'}
        </Text>
      </View>

      {/* Description */}
      {business.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Giới thiệu</Text>
          <Text style={styles.description}>{business.description}</Text>
        </View>
      ) : business.tagline ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Giới thiệu</Text>
          <Text style={styles.description}>{business.tagline}</Text>
        </View>
      ) : null}

      {/* Contact info */}
      {(business.website || business.contactEmail || business.contactPhone) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Liên hệ</Text>
          {business.website ? (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(business.website!)}>
              <MaterialIcons name="language" size={18} color="#1565C0" />
              <Text style={styles.contactLink}>{business.website}</Text>
            </TouchableOpacity>
          ) : null}
          {business.contactEmail ? (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(`mailto:${business.contactEmail}`)}>
              <MaterialIcons name="email" size={18} color="#1565C0" />
              <Text style={styles.contactLink}>{business.contactEmail}</Text>
            </TouchableOpacity>
          ) : null}
          {business.contactPhone ? (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(`tel:${business.contactPhone}`)}>
              <MaterialIcons name="phone" size={18} color="#1565C0" />
              <Text style={styles.contactLink}>{business.contactPhone}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Address */}
      {business.address ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Địa chỉ</Text>
          <View style={styles.contactRow}>
            <MaterialIcons name="place" size={18} color="#6B7280" />
            <Text style={styles.addressText}>{business.address}</Text>
          </View>
        </View>
      ) : null}

      {/* Connected users */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kết nối</Text>
        <View style={styles.connectedRow}>
          <ConnectedUsersStack
            users={business.connectedUsers || []}
            totalCount={business.connectionCount}
          />
          <Text style={styles.connectedCount}>
            {business.connectionCount} người đã kết nối
          </Text>
        </View>
      </View>

      {/* Connect/Disconnect button */}
      <TouchableOpacity
        style={[
          styles.actionBtn,
          business.isConnected && styles.actionBtnConnected,
        ]}
        onPress={handleConnect}
        activeOpacity={0.7}
        disabled={connecting}>
        {connecting ? (
          <ActivityIndicator
            size="small"
            color={business.isConnected ? '#1565C0' : '#FFFFFF'}
          />
        ) : (
          <>
            <MaterialIcons
              name={business.isConnected ? 'check-circle' : 'handshake'}
              size={20}
              color={business.isConnected ? '#1565C0' : '#FFFFFF'}
            />
            <Text
              style={[
                styles.actionBtnText,
                business.isConnected && styles.actionBtnTextConnected,
              ]}>
              {business.isConnected ? 'Đã kết nối' : 'Kết nối ngay'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#999',
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameSection: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  verifiedIcon: {
    marginLeft: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1565C0',
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  locationText: {
    fontSize: 12,
    color: '#6B7280',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  typeText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  contactLink: {
    fontSize: 14,
    color: '#1565C0',
    flex: 1,
  },
  addressText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectedCount: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1565C0',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  actionBtnConnected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#1565C0',
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtnTextConnected: {
    color: '#1565C0',
  },
});

export default BusinessProfileScreen;
