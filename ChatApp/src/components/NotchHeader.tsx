import React from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import UserAvatar from './UserAvatar';
import {
  KoolaIconButton,
  KoolaText,
  koolaIconWell,
  koolaOpacity,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../ui';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';

/** Structured config for the chat variant — data only, never a rendered
 *  node, so the band's own render identity doesn't change on every
 *  ChatScreen render (see ChatHeaderContext). */
export interface NotchHeaderChatConfig {
  title: string;
  status: string | null;
  avatarKey: string;
  onBack: () => void;
  onHeaderPress: () => void;
  onStartCall: (callType: 'audio' | 'video') => void;
}

export interface NotchHeaderProps {
  style?: StyleProp<ViewStyle>;
  /** When set, renders centered title instead of KOOLA wordmark */
  title?: string;
  /** When set, renders a back icon + left-aligned title row instead of the
   *  centered wordmark/title — used by screens that take over the shared
   *  notch band (see PersonalHeaderContext). */
  onBack?: () => void;
  /** When set, renders the chat variant (back + avatar + name + status +
   *  call actions) instead of the wordmark or nav bands — used by ChatScreen
   *  taking over the shared band (see ChatHeaderContext). Takes precedence
   *  over `onBack`/`title`. */
  chat?: NotchHeaderChatConfig;
}

export const NOTCH_WING_INSET = 4;

/** Slightly taller than original 22 — trimmed bottom only on request */
export const NOTCH_HEADER_CONTENT_H = 24;
/** Taller variant used when the band hosts a back button + title row */
export const NOTCH_HEADER_NAV_CONTENT_H = 36;
/** Chat variant's content height: koolaSpacing.sm top gap + the header row +
 *  koolaSpacing.xs bottom gap. The row height is the tallest element in it,
 *  the KoolaIconButton at size 40 — taller than the 38px avatar and than the
 *  name (label lineHeight 20) stacked on the reserved 16px status line. */
const CHAT_ROW_H = 40;
export const NOTCH_HEADER_CHAT_CONTENT_H =
  koolaSpacing.sm + CHAT_ROW_H + koolaSpacing.xs;
/** Total header height given the device top inset — single source of truth
 *  for consumers that need to offset below the header (ChatHome, Shopping,
 *  Settings, Chat). Pair with `useSafeAreaInsets().top`. */
export const getNotchHeaderHeight = (
  topInset: number,
  variant: 'wordmark' | 'nav' | 'chat' = 'wordmark',
) =>
  topInset +
  NOTCH_WING_INSET +
  (variant === 'chat'
    ? NOTCH_HEADER_CHAT_CONTENT_H
    : variant === 'nav'
      ? NOTCH_HEADER_NAV_CONTENT_H
      : NOTCH_HEADER_CONTENT_H);

export const NotchHeader: React.FC<NotchHeaderProps> = ({ style, title, onBack, chat }) => {
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const flatH = getNotchHeaderHeight(insets.top, chat ? 'chat' : onBack ? 'nav' : 'wordmark');
  const isDark = resolvedScheme === 'dark';

  if (chat) {
    return (
      <View style={[styles.host, { height: flatH, overflow: 'hidden' as const }, style]}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)',
          }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.72, overflow: 'hidden' }}>
          <LightFieldBackground windowSized />
        </View>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: insets.top,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: koolaSpacing.lg,
            paddingTop: koolaSpacing.sm,
          }}>
          <KoolaIconButton
            icon="arrow-back"
            tone="primary"
            variant="ghost"
            size={40}
            iconSize={24}
            onPress={chat.onBack}
            accessibilityLabel="Quay lại"
          />
          <Pressable
            style={chatStyles.headerCenter}
            onPress={chat.onHeaderPress}
            accessibilityRole="button"
            accessibilityLabel={`Xem thông tin ${chat.title}`}>
            <View>
              <UserAvatar displayName={chat.title} avatar={chat.avatarKey || undefined} size={38} />
              {chat.status === 'Đang hoạt động' && (
                <View
                  style={[
                    chatStyles.onlineDot,
                    {
                      backgroundColor: tokens.semantic.status.success,
                      borderColor: tokens.semantic.surface.level1,
                    },
                  ]}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: koolaSpacing.sm }}>
              <KoolaText variant="label" tone="ink" weight="600" numberOfLines={1}>
                {chat.title}
              </KoolaText>
              {/* Fixed minHeight always reserves space for the status line so
                  late-arriving status does not shift name/avatar/call actions. */}
              <View style={chatStyles.statusLine}>
                {chat.status ? (
                  <KoolaText
                    variant="caption"
                    tone={chat.status === 'Đang hoạt động' ? 'success' : 'muted'}
                    numberOfLines={1}>
                    {chat.status}
                  </KoolaText>
                ) : null}
              </View>
            </View>
          </Pressable>
          <View style={chatStyles.headerRight}>
            <KoolaIconButton
              icon="call"
              tone="primary"
              variant="soft"
              size={40}
              iconSize={22}
              onPress={() => chat.onStartCall('audio')}
              accessibilityLabel="Gọi thoại"
            />
            <KoolaIconButton
              icon="videocam"
              tone="primary"
              variant="soft"
              size={40}
              iconSize={22}
              onPress={() => chat.onStartCall('video')}
              accessibilityLabel="Gọi video"
            />
          </View>
        </View>
      </View>
    );
  }

  if (onBack) {
    return (
      <View style={[styles.host, { height: flatH, overflow: 'hidden' as const }, style]}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)',
          }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.72, overflow: 'hidden' }}>
          <LightFieldBackground windowSized />
        </View>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: insets.top,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
          }}>
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={({ pressed }) => [
              navStyles.backBtn,
              { backgroundColor: koolaIconWell[resolvedScheme] },
              pressed && { opacity: koolaOpacity.pressed },
            ]}>
            <MaterialIcons name="arrow-back" size={22} color={tokens.semantic.text.primary} />
          </Pressable>
          <KoolaText
            variant="heading"
            weight="700"
            style={{ color: tokens.semantic.text.primary, marginLeft: 8 }}>
            {title}
          </KoolaText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.host, { height: flatH, overflow: 'hidden' as const }, style]}>
      {/* Frosted base: lets scrolled content show faintly underneath */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)',
        }}
      />
      {/* Bloom slice kept but softened so the frost reads, still aligns with page field */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.72, overflow: 'hidden' }}>
        <LightFieldBackground windowSized />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: insets.top,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 2,
        }}>
        {title ? (
          <KoolaText variant="label" weight="700" style={{ color: tokens.semantic.text.primary }}>
            {title}
          </KoolaText>
        ) : (
          <Image
            source={require('../assets/logo_koola_wordmark.png')}
            style={{ width: 99, height: 17 }}
            resizeMode="contain"
            accessibilityLabel="KOOLA"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  host: { width: '100%', zIndex: 10 },
});

const navStyles = StyleSheet.create({
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: koolaRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const chatStyles = StyleSheet.create({
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: koolaSpacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: koolaSpacing.xs,
  },
  statusLine: {
    minHeight: 16,
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: koolaRadii.pill,
    borderWidth: 2,
  },
});
