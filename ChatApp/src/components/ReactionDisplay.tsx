import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { MessageReaction } from '../types';

interface Props {
  reactions: MessageReaction[];
  currentUserId: string;
  onPress: (emoji: string) => void;
  isRight?: boolean;
}

interface GroupedReaction {
  emoji: string;
  count: number;
  hasOwn: boolean;
}

const ReactionDisplay: React.FC<Props> = ({ reactions, currentUserId, onPress, isRight }) => {
  if (!reactions || reactions.length === 0) return null;

  const grouped: GroupedReaction[] = [];
  for (const r of reactions) {
    const existing = grouped.find((g) => g.emoji === r.emoji);
    if (existing) {
      existing.count++;
      if (r.userId === currentUserId) existing.hasOwn = true;
    } else {
      grouped.push({ emoji: r.emoji, count: 1, hasOwn: r.userId === currentUserId });
    }
  }

  return (
    <View style={[styles.container, { justifyContent: isRight ? 'flex-end' : 'flex-start' }]}>
      {grouped.map((g) => (
        <TouchableOpacity
          key={g.emoji}
          style={[styles.pill, g.hasOwn && styles.pillOwn]}
          onPress={() => onPress(g.emoji)}>
          <Text style={styles.emoji}>{g.emoji}</Text>
          {g.count > 1 && <Text style={styles.count}>{g.count}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 4,
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pillOwn: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  emoji: { fontSize: 14 },
  count: { fontSize: 12, color: '#666', marginLeft: 2 },
});

export default ReactionDisplay;
