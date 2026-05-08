import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { Business } from '../../types';
import ConnectedUsersStack from './ConnectedUsersStack';
import { CATEGORY_LABELS } from '../../screens/connect/constants';

interface BusinessCardProps {
  business: Business;
  onPress: () => void;
  onConnectAndChatPress: () => void;
  onMessagePress: () => void;
  isConnecting?: boolean;
}

const LOGO_COLORS = ['#3B5DC9', '#2E9E5A', '#E05A2D', '#7E57C2', '#26A69A'];

const BusinessCard: React.FC<BusinessCardProps> = ({
  business,
  onPress,
  onConnectAndChatPress,
  onMessagePress,
  isConnecting,
}) => {
  const bgColor = LOGO_COLORS[business.name.charCodeAt(0) % LOGO_COLORS.length];
  const categoryLabel =
    CATEGORY_LABELS[business.category] || business.category;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Xem hồ sơ ${business.name}`}>
      {/* Top row: logo + name + badges */}
      <View style={styles.topRow}>
        {business.logoKey ? (
          <Image
            source={{ uri: business.logoKey }}
            style={styles.logo}
          />
        ) : (
          <View style={[styles.logo, styles.logoPlaceholder, { backgroundColor: bgColor }]}>
            <MaterialIcons name="business" size={24} color="#FFFFFF" />
          </View>
        )}

        <View style={styles.nameCol}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {business.name}
            </Text>
            {business.isVerified && (
              <MaterialIcons
                name="verified"
                size={16}
                color="#2E9E5A"
                style={styles.verifiedBadge}
              />
            )}
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{categoryLabel}</Text>
            </View>
            <Text style={styles.dot}>  </Text>
            <View style={styles.locationBadge}>
              <MaterialIcons name="location-on" size={12} color="#6B7280" />
              <Text style={styles.locationText}>{business.province}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tagline */}
      {business.tagline ? (
        <Text style={styles.tagline} numberOfLines={2}>
          {business.tagline}
        </Text>
      ) : null}

      {/* Bottom row: connected users + two action buttons */}
      <View style={styles.bottomRow}>
        <ConnectedUsersStack
          users={business.connectedUsers || []}
          totalCount={business.connectionCount}
        />

        <View style={styles.buttonsRow}>
          {/* Left button: always "Xem hồ sơ" */}
          <TouchableOpacity
            style={styles.viewProfileBtn}
            onPress={(e) => {
              e.stopPropagation();
              onPress();
            }}
            activeOpacity={0.7}>
            <Text style={styles.viewProfileText}>Xem hồ sơ</Text>
          </TouchableOpacity>

          {/* Right button: "Kết nối ngay" (unconnected) or "Nhắn tin" (connected) */}
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={(e) => {
              e.stopPropagation();
              if (business.isConnected) {
                onMessagePress();
              } else {
                onConnectAndChatPress();
              }
            }}
            activeOpacity={0.7}
            disabled={isConnecting}>
            {isConnecting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.connectBtnText}>
                {business.isConnected ? 'Nhắn tin' : 'Kết nối ngay'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  logoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameCol: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  verifiedBadge: {
    marginLeft: 4,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1565C0',
  },
  dot: {
    fontSize: 11,
    color: '#9CA3AF',
    marginHorizontal: 2,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  locationText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  tagline: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginTop: 10,
  },
  bottomRow: {
    marginTop: 12,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  spacer: {
    flex: 1,
  },
  viewProfileBtn: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#1565C0',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewProfileText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
  },
  connectBtn: {
    flex: 1.3,
    backgroundColor: '#1565C0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default BusinessCard;
