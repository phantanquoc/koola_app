import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect as SvgRect, Stop } from 'react-native-svg';
import { getOrDownload } from '../../services/media/mediaCacheService';
import { useNavigation, useRoute } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ProfileScreenNavigationProp,
  ProfileScreenRouteProp,
} from '../../navigation/types';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { conversationsApi, usersApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import ConversationCallHistorySheet from '../../components/ConversationCallHistorySheet';
import type { User } from '../../types';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { LightFieldBackground } from './components/personal/LightFieldBackground';
import {
  KoolaBadge,
  KoolaButton,
  KoolaDivider,
  KoolaState,
  KoolaSurface,
  KoolaText,
  KoolaSkeleton,
  koolaRadii,
  koolaShadows,
  koolaDarkShadows,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import type { SemanticTokens } from '../../ui/tokens/semantic';

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute<ProfileScreenRouteProp>();
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const { tokens, resolvedScheme } = useTheme();
  const semantic = tokens.semantic;
  const isDark = resolvedScheme === 'dark';
  const palette = (tokens as unknown as { palette: Palette }).palette ?? (tokens as any);
  const styles = useMemo(() => makeStyles(semantic, resolvedScheme), [semantic, resolvedScheme]);
  const headerH = getNotchHeaderHeight(insets.top, 'nav');

  // Scroll chrome — dual-layer fade 0-96 identical to ShoppingStorefront
  const scrollY = useRef(new Animated.Value(0)).current;
  const chromeOpacity = useMemo(
    () =>
      (scrollY as any).interpolate({
        inputRange: [0, 48, 96],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp' as const,
      }),
    [scrollY],
  );

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [callHistoryConversationId, setCallHistoryConversationId] = useState<string | null>(null);
  const [callHistoryVisible, setCallHistoryVisible] = useState(false);

  useEffect(() => {
    if (profileUser?.coverPhoto) {
      getOrDownload(profileUser.coverPhoto)
        .then(setCoverUri)
        .catch(() => setCoverUri(null));
    } else {
      setCoverUri(null);
    }
  }, [profileUser?.coverPhoto]);

  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const u = await usersApi.getUserById(userId);
        if (cancelled) return;
        if (u) {
          setProfileUser({
            _id: u._id,
            email: u.email,
            displayName: u.displayName,
            avatar: u.avatar || '',
            username: u.username,
            bio: u.bio,
            isOnline: u.isOnline,
            lastSeen: u.lastSeen,
            settings: u.settings || { notificationsEnabled: true },
            coverPhoto: u.coverPhoto || undefined,
          });
        }
      } catch {
        // Empty state handles this below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleStartChat = useCallback(async () => {
    setChatLoading(true);
    try {
      const { conversation } = await conversationsApi.startDirectChat(userId);
      const parent = navigation.getParent();
      parent?.navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId: conversation._id },
      } as never);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      if (__DEV__) console.warn('Start chat failed:', error.response?.data?.message);
      Alert.alert(
        'Không thể bắt đầu trò chuyện',
        'Đã xảy ra lỗi khi tạo cuộc trò chuyện. Bạn thử lại nhé.',
      );
    } finally {
      setChatLoading(false);
    }
  }, [userId, navigation]);

  const handleOpenCallHistory = useCallback(async () => {
    try {
      const { conversation } = await conversationsApi.startDirectChat(userId);
      setCallHistoryConversationId(conversation._id);
      setCallHistoryVisible(true);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải lịch sử cuộc gọi');
    }
  }, [userId]);

  const lastSeenText = profileUser?.isOnline
    ? 'Đang hoạt động'
    : profileUser?.lastSeen
      ? `Hoạt động ${formatDistanceToNow(new Date(profileUser.lastSeen), {
          addSuffix: true,
          locale: vi,
        })}`
      : 'Đang ngoại tuyến';

  const headerTitle = profileUser?.displayName ?? 'Hồ sơ';

  // ── Inline header — identical structure to ShoppingStorefront ────────────
  const inlineHeader = (
    <View style={[styles.inlineHeader, { height: headerH, paddingTop: insets.top }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)', opacity: chromeOpacity }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { opacity: (chromeOpacity as any).interpolate({ inputRange: [0, 1], outputRange: [0, 0.72], extrapolate: 'clamp' } as any) }]}>
          <LightFieldBackground windowSized />
        </Animated.View>
      </View>
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: -18, height: 18, opacity: chromeOpacity }}>
        <Svg width="100%" height={18}>
          <Defs>
            <SvgLinearGradient id="profileHeaderShadow" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity={isDark ? '0.48' : '0.18'} />
              <Stop offset="1" stopColor="#000000" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          <SvgRect width="100%" height={18} fill="url(#profileHeaderShadow)" />
        </Svg>
      </Animated.View>
      {/* Transparent layer — fades out */}
      <Animated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingTop: insets.top,
          opacity: (chromeOpacity as any).interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' } as any),
        }}>
        <View style={[styles.inlineBackBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
          <MaterialIcons name="arrow-back" size={22} color="#FFFFFF" />
        </View>
        <KoolaText weight="800" numberOfLines={1} style={[styles.inlineHeaderTitle, { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }]}>
          {headerTitle}
        </KoolaText>
        <View style={styles.inlineHeaderActions}>
          <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
            <MaterialIcons name="search" size={20} color="#FFFFFF" />
          </View>
          <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
            <MaterialIcons name="share" size={18} color="#FFFFFF" />
          </View>
          <View style={[styles.inlineIconBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}>
            <MaterialIcons name="more-vert" size={18} color="#FFFFFF" />
          </View>
        </View>
      </Animated.View>
      {/* Solid layer — fades in */}
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingTop: insets.top,
          opacity: chromeOpacity,
        }}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={[styles.inlineBackBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
          <MaterialIcons name="arrow-back" size={22} color={semantic.text.primary} />
        </Pressable>
        <KoolaText weight="800" numberOfLines={1} style={[styles.inlineHeaderTitle, { color: semantic.text.primary, textShadowColor: 'transparent' }]}>
          {headerTitle}
        </KoolaText>
        <View style={styles.inlineHeaderActions}>
          <Pressable hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
            <MaterialIcons name="search" size={20} color={semantic.text.primary} />
          </Pressable>
          <Pressable hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
            <MaterialIcons name="share" size={18} color={semantic.text.primary} />
          </Pressable>
          <Pressable hitSlop={8} style={[styles.inlineIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,20,25,0.06)' }]}>
            <MaterialIcons name="more-vert" size={18} color={semantic.text.primary} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {inlineHeader}
        <Animated.ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingTop: headerH + 12, paddingBottom: tabBarInset + 18 }]}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}>
          <View
            style={[
              styles.coverWrap,
              styles.coverPlaceholder,
              { marginTop: -headerH - 12, height: 72 + headerH, paddingTop: headerH },
            ]}
          />
          <KoolaSurface variant="raised" style={[styles.hero, styles.heroFullBleed, styles.heroOverCover]}>
            <View style={styles.heroHeader}>
              <View style={styles.avatarOverlapWrap}>
                <KoolaSkeleton width={65} height={65} radius={32.5} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <KoolaSkeleton width="60%" height={16} radius={6} />
              </View>
            </View>
          </KoolaSurface>
          <KoolaSurface variant="raised" style={[styles.loadingCard, { marginTop: 12 }]}>
            <KoolaSkeleton width="52%" height={22} style={styles.loadingItem} />
            <KoolaSkeleton width="68%" height={14} style={styles.loadingItem} />
            <KoolaSkeleton width="44%" height={32} radius={16} style={styles.loadingItem} />
            <KoolaSkeleton width="100%" height={84} radius={14} />
          </KoolaSurface>
        </Animated.ScrollView>
      </View>
    );
  }

  if (!profileUser) {
    return (
      <View style={styles.container}>
        {inlineHeader}
        <View style={[styles.stateWrap, { paddingTop: headerH + 24 }]}>
          <KoolaState
            icon="person-off"
            title="Không tìm thấy người dùng"
            message="Hồ sơ này không tồn tại hoặc bạn không có quyền xem."
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {inlineHeader}
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarInset + 18, paddingTop: 0 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}>
        {/* Cover — full-bleed behind transparent header + status bar */}
        <View
          style={[
            styles.coverWrap,
            coverUri ? null : styles.coverPlaceholder,
            { marginTop: -headerH - 40, height: 230 + headerH, paddingTop: headerH },
          ]}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={StyleSheet.absoluteFillObject}>
              <FakeGradientBand palette={palette} />
            </View>
          )}
          <View style={styles.coverScrim} />
        </View>

        {/* Hero — avatar gối 1/3 lên banner, cùng format Shop */}
        <KoolaSurface variant="raised" style={[styles.hero, styles.heroFullBleed, styles.heroOverCover]}>
          <View style={styles.heroHeader}>
            <View style={styles.avatarOverlapWrap}>
              <UserAvatar
                displayName={profileUser.displayName}
                avatar={profileUser.avatar || undefined}
                size={65}
              />
            </View>
            <View style={styles.heroNameWrap}>
              <KoolaText numberOfLines={2} style={styles.companyName}>
                {profileUser.displayName}
              </KoolaText>
              {profileUser.isOnline ? (
                <MaterialIcons
                  name="verified"
                  size={14}
                  color={semantic.status.success}
                  style={{ marginLeft: 5, marginTop: 1 }}
                />
              ) : null}
            </View>
          </View>

          <View style={styles.badgeRow}>
            {profileUser.username ? (
              <View style={styles.badgeItem}>
                <KoolaBadge label={`@${profileUser.username}`} tone="primary" />
              </View>
            ) : null}
            <View style={styles.badgeItem}>
              <KoolaBadge
                label={profileUser.isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
                tone={profileUser.isOnline ? 'success' : 'muted'}
              />
            </View>
            {profileUser.bio ? (
              <View style={styles.badgeItem}>
                <KoolaBadge label="Có tiểu sử" tone="muted" />
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            {profileUser.email ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="alternate-email" size={14} color={semantic.text.faint} />
                <KoolaText variant="caption" tone="muted" weight="700" style={{ marginLeft: 4 }} numberOfLines={1}>
                  {profileUser.email}
                </KoolaText>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <MaterialIcons
                name={profileUser.isOnline ? 'radio-button-checked' : 'schedule'}
                size={14}
                color={profileUser.isOnline ? semantic.status.success : semantic.text.faint}
              />
              <KoolaText variant="caption" weight="700" tone={profileUser.isOnline ? 'success' : 'muted'} style={{ marginLeft: 4 }}>
                {lastSeenText}
              </KoolaText>
            </View>
          </View>

          {profileUser.bio ? (
            <View style={styles.typeRow}>
              <MaterialIcons name="format-quote" size={17} color={semantic.text.faint} />
              <KoolaText
                variant="label"
                tone="muted"
                weight="500"
                style={[styles.typeRowLabel, { fontStyle: 'italic', flex: 1 }]}
                numberOfLines={3}>
                {profileUser.bio}
              </KoolaText>
            </View>
          ) : null}
        </KoolaSurface>

        {/* Stats — 3 cols cùng format Shop */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <KoolaText variant="title" weight="800" style={{ textAlign: 'center' }}>
              {profileUser.isOnline ? '●' : '○'}
            </KoolaText>
            <KoolaText variant="caption" tone="muted" weight="500" style={{ textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}>
              Trạng thái
            </KoolaText>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statItem}>
            <KoolaText variant="heading" weight="700" style={{ textAlign: 'center' }}>
              {profileUser.isOnline ? 'Online' : 'Offline'}
            </KoolaText>
            <KoolaText variant="caption" tone="muted" weight="500" style={{ textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}>
              Hoạt động
            </KoolaText>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statItem}>
            <KoolaText variant="heading" weight="700" style={{ textAlign: 'center' }}>
              {profileUser.email ? '1' : '—'}
            </KoolaText>
            <KoolaText variant="caption" tone="muted" weight="500" style={{ textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}>
              Liên hệ
            </KoolaText>
          </View>
        </View>

        {/* Header actions — cùng format Shop: Theo dõi / Nhắn tin */}
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleOpenCallHistory}
            accessibilityRole="button"
            style={[
              styles.followBtn,
              {
                borderColor: semantic.border.strong,
                backgroundColor: 'transparent',
              },
            ]}
            android_ripple={{ color: semantic.border.subtle }}>
            <MaterialIcons name="phone" size={16} color={semantic.text.primary} />
            <KoolaText variant="label" weight="700" style={{ marginLeft: 6, color: semantic.text.primary }}>
              Gọi
            </KoolaText>
          </Pressable>
          <Pressable
            onPress={handleStartChat}
            disabled={chatLoading}
            accessibilityRole="button"
            accessibilityLabel={`Nhắn tin với ${profileUser.displayName}`}
            style={[styles.msgBtnSmall, { backgroundColor: semantic.action.primary, opacity: chatLoading ? 0.6 : 1 }]}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
            <MaterialIcons name="chat-bubble-outline" size={16} color={semantic.text.onAction} />
            <KoolaText variant="label" weight="700" style={{ marginLeft: 6, color: semantic.text.onAction }}>
              Nhắn tin
            </KoolaText>
          </Pressable>
        </View>

        <KoolaSurface variant="outline" style={styles.infoCard}>
          <View style={styles.sectionIntro}>
            <KoolaText variant="heading" weight="700" style={{ marginBottom: koolaSpacing.xs }}>
              Thông tin hồ sơ
            </KoolaText>
            <KoolaText variant="caption" tone="muted">
              Những thông tin giúp bạn nhận diện và liên hệ đúng người.
            </KoolaText>
          </View>
          <InfoRow
            icon="alternate-email"
            label="Email"
            value={profileUser.email}
            palette={palette}
          />
          <KoolaDivider />
          <InfoRow
            icon="schedule"
            label="Hoạt động"
            value={lastSeenText}
            palette={palette}
          />
          <KoolaDivider />
          <InfoRow
            icon="verified-user"
            label="Trạng thái"
            value={profileUser.isOnline ? 'Có thể nhắn ngay' : 'Sẽ nhận tin nhắn khi quay lại'}
            palette={palette}
          />
          <KoolaDivider />
          <Pressable
            onPress={handleOpenCallHistory}
            android_ripple={{ color: palette.line }}
            style={({ pressed }) => [infoRowStyles.infoRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Lịch sử cuộc gọi">
            <View style={[infoRowStyles.infoIcon, { backgroundColor: palette.primarySoft }]}>
              <MaterialIcons name="phone" size={19} color={palette.primary} />
            </View>
            <View style={infoRowStyles.infoCopy}>
              <KoolaText variant="label">Lịch sử cuộc gọi</KoolaText>
              <KoolaText variant="caption" tone="muted">Xem các cuộc gọi trong cuộc trò chuyện này</KoolaText>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={palette.faint} />
          </Pressable>
        </KoolaSurface>
      </Animated.ScrollView>
      <ConversationCallHistorySheet
        conversationId={callHistoryConversationId}
        isVisible={callHistoryVisible}
        onClose={() => setCallHistoryVisible(false)}
      />
    </View>
  );
};

// ─── FakeGradientBand ───
interface FakeGradientBandProps {
  palette: Palette;
}

const FakeGradientBand: React.FC<FakeGradientBandProps> = ({ palette }) => {
  const bandStyles = useMemo(() => makeGradBandStyles(palette), [palette]);
  return (
    <>
      <View style={StyleSheet.absoluteFillObject as object} />
      <View style={bandStyles.band1} />
      <View style={bandStyles.band2} />
      <View style={bandStyles.band3} />
      <View style={bandStyles.band4} />
      <View style={bandStyles.band5} />
    </>
  );
};

const makeGradBandStyles = (p: Palette) => {
  const fadeTarget = p.surface;
  return StyleSheet.create({
    band1: { ...StyleSheet.absoluteFillObject, backgroundColor: p.primarySoft },
    band2: { position: 'absolute', left: 0, right: 0, top: '25%', bottom: -1, backgroundColor: fadeTarget, opacity: 0.25 },
    band3: { position: 'absolute', left: 0, right: 0, top: '50%', bottom: -1, backgroundColor: fadeTarget, opacity: 0.5 },
    band4: { position: 'absolute', left: 0, right: 0, top: '70%', bottom: -1, backgroundColor: fadeTarget, opacity: 0.7 },
    band5: { position: 'absolute', left: 0, right: 0, top: '85%', bottom: 0, backgroundColor: fadeTarget, opacity: 0.85 },
  });
};

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  palette: Palette;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, palette }) => (
  <View style={infoRowStyles.infoRow}>
    <View style={[infoRowStyles.infoIcon, { backgroundColor: palette.primarySoft }]}>
      <MaterialIcons name={icon} size={19} color={palette.primary} />
    </View>
    <View style={infoRowStyles.infoCopy}>
      <KoolaText variant="caption" tone="muted" numberOfLines={1} style={infoRowStyles.infoLabel}>
        {label}
      </KoolaText>
      <KoolaText variant="label" numberOfLines={2}>
        {value}
      </KoolaText>
    </View>
  </View>
);

const infoRowStyles = StyleSheet.create({
  infoRow: {
    minHeight: 74,
    paddingHorizontal: koolaSpacing.lg,
    paddingVertical: koolaSpacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: koolaRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: koolaSpacing.md,
  },
  infoCopy: {
    flex: 1,
  },
  infoLabel: {
    marginBottom: koolaSpacing.xs,
  },
});

const makeStyles = (semantic: SemanticTokens, scheme: string) => {
  const shadow = scheme === 'dark' ? koolaDarkShadows.sm : koolaShadows.sm;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: semantic.bg.canvas,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: koolaSpacing.lg,
      // paddingTop handled via cover negative margin + headerH
    },
    // ── Inline header (shop format) ──
    inlineHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 5,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    inlineBackBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    inlineHeaderTitle: {
      flex: 1,
      marginLeft: 30,
      color: '#FFFFFF',
      fontSize: 14,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    inlineHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 8 },
    inlineIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    // ── Cover — same as shop ──
    coverWrap: {
      height: 188,
      marginHorizontal: -16,
      marginBottom: 12,
      overflow: 'hidden',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    coverPlaceholder: {
      backgroundColor: semantic.border.subtle,
    },
    coverImage: { width: '100%', height: '100%' },
    coverScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
    // ── Hero — same as shop ──
    hero: {
      paddingHorizontal: 12,
      paddingTop: 0,
      paddingBottom: 12,
      marginBottom: 12,
      ...shadow,
    },
    heroHeader: { flexDirection: 'row', alignItems: 'center' },
    avatarOverlapWrap: {
      width: 69,
      height: 69,
      marginTop: -20,
      borderRadius: 34.5,
      borderWidth: 3,
      borderColor: semantic.surface.level1,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level1,
      ...shadow,
    },
    heroNameWrap: { flex: 1, marginLeft: 10, flexDirection: 'row', alignItems: 'center' },
    heroFullBleed: {
      marginHorizontal: -16,
      borderRadius: 0,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    },
    heroOverCover: { marginTop: -40 },
    companyName: { flex: 1, fontSize: 12.5, fontWeight: '800', lineHeight: 16, color: semantic.text.primary },
    badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    badgeItem: { marginRight: 8, marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' },
    metaItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 0,
      marginTop: 10,
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
    },
    typeRowLabel: { marginLeft: 8 },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.lg,
      borderWidth: 1,
      borderColor: semantic.border.subtle,
      paddingVertical: 14,
      marginBottom: 12,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statsDivider: { width: StyleSheet.hairlineWidth, backgroundColor: semantic.border.subtle, alignSelf: 'stretch', marginHorizontal: 8 },
    headerActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    followBtn: {
      flex: 1,
      height: 44,
      borderRadius: koolaRadii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    msgBtnSmall: {
      flex: 1,
      height: 44,
      borderRadius: koolaRadii.pill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    // ── legacy ──
    loadingCard: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 18,
    },
    loadingItem: {
      marginBottom: 14,
    },
    stateWrap: {
      flex: 1,
      justifyContent: 'center',
    },
    infoCard: {
      marginTop: 0,
      overflow: 'hidden',
      borderRadius: koolaRadii.lg,
    },
    sectionIntro: {
      paddingHorizontal: koolaSpacing.lg,
      paddingTop: koolaSpacing.lg,
      paddingBottom: koolaSpacing.md,
    },
  });
};

export default ProfileScreen;
