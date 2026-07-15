import React from 'react';
import { StyleSheet, View } from 'react-native';
import { KoolaSkeleton, KoolaSurface } from '../../ui';

const BusinessCardSkeleton: React.FC = () => {
  return (
    <KoolaSurface variant="raised" style={styles.card}>
      <KoolaSkeleton width={40} height={40} radius={8} />
      <View style={styles.contentCol}>
        <KoolaSkeleton width="65%" height={14} />
        <KoolaSkeleton width="85%" height={11} style={styles.line} />
        <KoolaSkeleton width="70%" height={11} style={styles.line} />
      </View>
      <KoolaSkeleton width={92} height={36} radius={10} />
    </KoolaSurface>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  contentCol: {
    flex: 1,
    marginLeft: 10,
  },
  line: {
    marginTop: 6,
  },
});

export default BusinessCardSkeleton;
