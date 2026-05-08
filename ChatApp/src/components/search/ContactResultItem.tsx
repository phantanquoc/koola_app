import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import UserAvatar from '../UserAvatar';
import type { UserSearchResult } from '../../types';

interface Props {
  contact: UserSearchResult;
  onPress: () => void;
}

const ContactResultItem: React.FC<Props> = ({ contact, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Xem hồ sơ ${contact.displayName}`}>
      <UserAvatar displayName={contact.displayName} avatar={contact.avatar} size={44} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {contact.displayName}
        </Text>
        <Text style={styles.phone} numberOfLines={1}>
          {contact.phone}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  phone: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
});

export default ContactResultItem;
