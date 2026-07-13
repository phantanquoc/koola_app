import React, { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from './ThemeProvider';
import type { SemanticTokens } from './tokens/semantic';
import type { GlassSurface } from './tokens/components';
import { koolaRadii } from './theme';

export interface KoolaSheetProps {
  /** Snap points (e.g. ['25%', '50%']) */
  snapPoints: (string | number)[];
  /** Content inside the sheet */
  children: React.ReactNode;
  /** Called when sheet is dismissed */
  onClose?: () => void;
  /** Initial snap index (-1 = closed) */
  index?: number;
  /** Enable backdrop press to dismiss */
  enableBackdropDismiss?: boolean;
}

export const KoolaSheet = forwardRef<BottomSheet, KoolaSheetProps>(
  (
    {
      snapPoints,
      children,
      onClose,
      index = -1,
      enableBackdropDismiss = true,
    },
    ref,
  ) => {
    const { tokens } = useTheme();
    const styles = useMemo(
      () => makeStyles(tokens.semantic, tokens.component.sheet.surface),
      [tokens.semantic, tokens.component.sheet.surface],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior={enableBackdropDismiss ? 'close' : 'none'}
        />
      ),
      [enableBackdropDismiss],
    );

    return (
      <BottomSheet
        ref={ref}
        index={index}
        snapPoints={snapPoints}
        onClose={onClose}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.indicator}
        accessibilityViewIsModal
        accessibilityRole="none">
        <BottomSheetView style={styles.content}>
          {children}
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

KoolaSheet.displayName = 'KoolaSheet';

function makeStyles(semantic: SemanticTokens, surface: GlassSurface) {
  return StyleSheet.create({
    background: {
      backgroundColor: surface.fill,
      borderTopLeftRadius: koolaRadii.xl,
      borderTopRightRadius: koolaRadii.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: surface.hairline,
    },
    indicator: {
      backgroundColor: semantic.border.subtle,
      width: 36,
    },
    content: {
      flex: 1,
    },
  });
}

export { BottomSheet };
