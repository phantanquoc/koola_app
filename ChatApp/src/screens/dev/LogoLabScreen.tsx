/**
 * LogoLabScreen.tsx
 *
 * __DEV__ only — not registered in production builds.
 *
 * Visual playground for comparing KoolaLogo 3D-style variants:
 *   flat | extruded | tilt | hero
 *
 * Controls: background toggle (light/dark), size presets, replay (remounts
 * animated variants to re-trigger one-shot intro).
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KoolaLogo, type KoolaLogoVariant, type KoolaLogoFont, type KoolaLogoAnimation } from '../../ui/KoolaLogo';
import { KoolaText, KoolaSurface, useTheme } from '../../ui';
import { getCardElevation, setCardElevation, subscribeCardElevation } from './cardElevation';
import { koolaCardElevations, type Palette, type CardElevationId } from '../../ui/theme';
import { PersonalCard } from '../main/components/personal/PersonalCard';
import { LightFieldBackground } from '../main/components/personal/LightFieldBackground';

const VARIANTS: { key: KoolaLogoVariant; label: string }[] = [
  { key: 'flat', label: 'Flat (mặc định)' },
  { key: 'extruded', label: 'Extruded (khối 3D)' },
  { key: 'tilt', label: 'Tilt (xoay vào)' },
  { key: 'hero', label: 'Hero (khối + xoay)' },
  { key: 'outline', label: 'Outline (viền rỗng)' },
  { key: 'bevel', label: 'Bevel (dập nổi)' },
  { key: 'longshadow', label: 'Long-shadow (bóng dài)' },
  { key: 'sticker', label: 'Sticker (miếng dán)' },
  { key: 'mono', label: 'Mono (đơn sắc)' },
  { key: 'underline', label: 'Underline (gạch chân)' },
];

const FONT_OPTIONS: { key: KoolaLogoFont; label: string }[] = [
  { key: 'system', label: 'Hệ thống' },
  { key: 'montserrat', label: 'Montserrat' },
  { key: 'poppins', label: 'Poppins' },
  { key: 'nunito', label: 'Nunito' },
  { key: 'sora', label: 'Sora' },
  { key: 'rubik', label: 'Rubik' },
  { key: 'outfit', label: 'Outfit' },
  { key: 'baloo2', label: 'Baloo 2' },
  { key: 'righteous', label: 'Righteous' },
  { key: 'archivoblack', label: 'Archivo Black' },
];

const SIZE_PRESETS = [24, 32, 44, 60];

const ANIM_OPTIONS: { key: KoolaLogoAnimation; label: string }[] = [
  { key: 'none', label: 'Tắt' },
  { key: 'stagger-rise', label: 'Trồi lên' },
  { key: 'stagger-drop', label: 'Rơi xuống' },
  { key: 'stagger-pop', label: 'Phóng to' },
  { key: 'fade-slide', label: 'Mờ + trượt' },
];

const ELEV_LABELS: Record<CardElevationId, string> = {
  A: 'A — trắng + bóng trung tính',
  B: 'B — trắng + viền hairline, bóng rất nhẹ',
  C: 'C — trắng, không bóng (tách bằng màu)',
};

const ELEV_DESCS: Record<CardElevationId, string> = {
  A: 'Shadow #101828 0.08 r18, elevation 6 — nổi rõ, mềm',
  B: 'Border #E4E7EC 0.5px, shadow 0.05 r12, elevation 3 — kiểu Apple tinh tế',
  C: 'Chỉ dựa độ trắng so với nền xám — tối giản, không bóng',
};

const LogoLabScreen: React.FC = () => {
  const { palette } = useTheme();
  const s = useMemo(() => makeStyles(palette), [palette]);

  const [darkBg, setDarkBg] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(1); // default 32
  const [replayKey, setReplayKey] = useState(0);
  const [font, setFont] = useState<KoolaLogoFont>('system');
  const [anim, setAnim] = useState<KoolaLogoAnimation>('none');
  const elevId = React.useSyncExternalStore(subscribeCardElevation, getCardElevation, getCardElevation) as CardElevationId;

  const markSize = SIZE_PRESETS[sizeIdx];
  const bgColor = darkBg ? '#1C2026' : '#F7F9FC';

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <KoolaText variant="caption" tone="muted" style={s.subtitle}>
        DEV only — thí nghiệm logo 3D. Metro reload, không cần rebuild.
      </KoolaText>

      {/* ─── Controls ──────────────────────────────────────────── */}
      <KoolaSurface variant="raised" style={s.controlsSection}>
        {/* Background toggle */}
        <View style={s.controlRow}>
          <KoolaText variant="label">Nền:</KoolaText>
          <View style={s.buttonGroup}>
            <Pressable
              style={[s.chipBtn, !darkBg && s.chipBtnActive]}
              onPress={() => setDarkBg(false)}
              accessibilityRole="button"
              accessibilityLabel="Light background"
            >
              <KoolaText variant="caption" weight={!darkBg ? '700' : '500'} tone={!darkBg ? 'primary' : 'muted'}>
                Sáng
              </KoolaText>
            </Pressable>
            <Pressable
              style={[s.chipBtn, darkBg && s.chipBtnActive]}
              onPress={() => setDarkBg(true)}
              accessibilityRole="button"
              accessibilityLabel="Dark background"
            >
              <KoolaText variant="caption" weight={darkBg ? '700' : '500'} tone={darkBg ? 'primary' : 'muted'}>
                Tối
              </KoolaText>
            </Pressable>
          </View>
        </View>

        {/* Size presets */}
        <View style={s.controlRow}>
          <KoolaText variant="label">Kích thước:</KoolaText>
          <View style={s.buttonGroup}>
            {SIZE_PRESETS.map((sz, idx) => (
              <Pressable
                key={sz}
                style={[s.chipBtn, idx === sizeIdx && s.chipBtnActive]}
                onPress={() => setSizeIdx(idx)}
                accessibilityRole="button"
                accessibilityLabel={`Size ${sz}px`}
              >
                <KoolaText variant="caption" weight={idx === sizeIdx ? '700' : '500'} tone={idx === sizeIdx ? 'primary' : 'muted'}>
                  {sz}
                </KoolaText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Font picker */}
        <View style={s.controlRow}>
          <KoolaText variant="label">Phông:</KoolaText>
          <View style={s.buttonGroupWrap}>
            {FONT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[s.chipBtn, font === opt.key && s.chipBtnActive]}
                onPress={() => setFont(opt.key)}
                accessibilityRole="button"
                accessibilityLabel={`Font ${opt.label}`}
              >
                <KoolaText variant="caption" weight={font === opt.key ? '700' : '500'} tone={font === opt.key ? 'primary' : 'muted'}>
                  {opt.label}
                </KoolaText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Replay button */}
        <Pressable
          style={s.replayBtn}
          onPress={() => setReplayKey((k) => k + 1)}
          accessibilityRole="button"
          accessibilityLabel="Replay animations"
        >
          <KoolaText variant="label" tone="primary">Phát lại animation</KoolaText>
        </Pressable>
      </KoolaSurface>

      {/* ─── Card elevation (DEV, A/B/C) ──────────────────────── */}
      <KoolaSurface variant="raised" style={s.variantCard}>
        <KoolaText variant="label">Card nền — độ nổi (chọn để áp dụng tab Cá nhân)</KoolaText>
        <KoolaText variant="caption" tone="muted" style={{ marginTop: 4 }}>
          Đang dùng: <KoolaText variant="caption" weight="700">{ELEV_LABELS[elevId]}</KoolaText>
        </KoolaText>
        {(Object.keys(koolaCardElevations) as CardElevationId[]).map((id) => {
          const active = elevId === id;
          return (
            <Pressable
              key={id}
              style={[s.elevTile, active && s.elevTileActive]}
              onPress={() => setCardElevation(id)}
              accessibilityRole="button"
              accessibilityLabel={`Card elevation ${id}`}
            >
              {/* Real light-field canvas behind each sample card so contrast
                  reads the way it does on the Personal tab. Each tile renders
                  its OWN preset style (not the store value) for honest
                  side-by-side comparison. */}
              <View style={s.elevStage}>
                <LightFieldBackground />
                <KoolaSurface style={[s.elevSampleCard, koolaCardElevations[id]]}>
                  <KoolaText variant="label">Ví dụ thẻ {id}</KoolaText>
                  <KoolaText variant="caption" tone="muted">
                    {ELEV_DESCS[id]}
                  </KoolaText>
                </KoolaSurface>
              </View>
              <KoolaText variant="caption" weight={active ? '700' : '500'} tone={active ? 'primary' : 'muted'}>
                {active ? 'Đang dùng' : ELEV_LABELS[id]}
              </KoolaText>
            </Pressable>
          );
        })}
      </KoolaSurface>

      {/* ─── Animation showcase (extruded 3D) ─────────────────── */}
      <KoolaSurface variant="raised" style={s.variantCard}>
        <KoolaText variant="label">Hiệu ứng động (khối 3D)</KoolaText>
        <View style={s.buttonGroupWrap}>
          {ANIM_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[s.chipBtn, anim === opt.key && s.chipBtnActive]}
              onPress={() => setAnim(opt.key)}
              accessibilityRole="button"
              accessibilityLabel={`Animation ${opt.label}`}
            >
              <KoolaText variant="caption" weight={anim === opt.key ? '700' : '500'} tone={anim === opt.key ? 'primary' : 'muted'}>
                {opt.label}
              </KoolaText>
            </Pressable>
          ))}
        </View>
        <View style={[s.logoBox, { backgroundColor: bgColor, marginTop: 12 }]}>
          <KoolaLogo
            key={`anim-${anim}-${replayKey}`}
            variant="extruded"
            animation={anim}
            font={font}
            markSize={markSize}
            wordmarkSize={markSize}
            showMark={false}
            showWordmark
          />
        </View>
      </KoolaSurface>

      {/* ─── Variant showcase ─────────────────────────────────── */}
      {VARIANTS.map(({ key, label }) => (
        <KoolaSurface key={key} variant="raised" style={s.variantCard}>
          <KoolaText variant="label" style={s.variantLabel}>{label}</KoolaText>
          <View style={[s.logoBox, { backgroundColor: bgColor }]}>
            <KoolaLogo
              key={`${key}-${replayKey}`}
              variant={key}
              markSize={markSize}
              wordmarkSize={markSize}
              showMark
              showWordmark
              font={font}
            />
          </View>
          {/* Wordmark-only version */}
          <KoolaText variant="caption" tone="muted" style={s.subLabel}>Chỉ wordmark:</KoolaText>
          <View style={[s.logoBox, s.logoBoxSmall, { backgroundColor: bgColor }]}>
            <KoolaLogo
              key={`${key}-wm-${replayKey}`}
              variant={key}
              showMark={false}
              showWordmark
              markSize={markSize}
              wordmarkSize={markSize}
              font={font}
            />
          </View>
        </KoolaSurface>
      ))}

      <View style={s.bottomPad} />
    </ScrollView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.canvas },
    content: { paddingHorizontal: 16, paddingTop: 12 },
    subtitle: { marginBottom: 12 },
    controlsSection: { padding: 16, marginBottom: 16 },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    buttonGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    buttonGroupWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      flexShrink: 1,
    },
    chipBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      marginLeft: 8,
      marginBottom: 4,
      backgroundColor: p.canvas,
    },
    chipBtnActive: {
      backgroundColor: p.primarySoft,
    },
    replayBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: p.primarySoft,
      marginTop: 4,
    },
    variantCard: { padding: 16, marginBottom: 16 },
    elevStage: { position: 'relative', borderRadius: 16, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    elevSampleCard: { borderRadius: 16, padding: 16, gap: 6 },
    elevTile: { flexDirection: 'column', paddingVertical: 8 },
    elevTileActive: { opacity: 0.97 },
    variantLabel: { marginBottom: 10 },
    subLabel: { marginTop: 10, marginBottom: 6 },
    logoBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
      borderRadius: 12,
    },
    logoBoxSmall: {
      paddingVertical: 16,
    },
    bottomPad: { height: 40 },
  });

export default LogoLabScreen;