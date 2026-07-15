import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, useTheme } from '../ui';
import { koolaRadii } from '../ui/theme';
import type { SemanticTokens } from '../ui/tokens/semantic';

interface Props {
  isVisible: boolean;
}

const OfflineBanner: React.FC<Props> = ({ isVisible }) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      <MaterialIcons name="wifi-off" size={17} color={tokens.semantic.action.primaryPressed} />
      <KoolaText variant="caption" tone="primary" weight="700" style={styles.text}>
        Không có kết nối mạng. Tin nhắn sẽ được gửi khi có mạng trở lại.
      </KoolaText>
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 12,
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: koolaRadii.md,
      backgroundColor: semantic.action.primarySoft,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      textAlign: 'center',
      marginLeft: 8,
    },
  });

export default OfflineBanner;
