import React, { forwardRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import dayjs from 'dayjs';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { PinnedMessage } from '../types';

interface Props {
  pinnedMessages: PinnedMessage[];
  messageContents: Record<string, string>;
  onSelect: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
}

// Ref type: React.ElementRef<typeof BottomSheetModal> resolves to BottomSheetModalMethods
// (BottomSheetModalMethods is not exported from @gorhom/bottom-sheet v5 index, so we derive it)
type PinListBottomSheetRef = React.ElementRef<typeof BottomSheetModal>;

const SNAP_POINTS = ['65%', '90%'];

const PinListBottomSheet = forwardRef<PinListBottomSheetRef, Props>(
  ({ pinnedMessages, messageContents, onSelect, onUnpin }, ref) => {
    const sorted = useMemo(
      () =>
        [...pinnedMessages].sort(
          (a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime(),
        ),
      [pinnedMessages],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        enableDismissOnClose
      >
        <View style={styles.header}>
          <Text style={styles.headerText}>
            Tin nhắn đã ghim ({sorted.length})
          </Text>
        </View>

        <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
          {sorted.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Chưa có tin nhắn nào được ghim</Text>
            </View>
          ) : (
            sorted.map((pin) => {
              const content = messageContents[pin.messageId] || 'Tin nhắn được ghim';
              return (
                <TouchableOpacity
                  key={pin.messageId}
                  style={styles.row}
                  onPress={() => {
                    onSelect(pin.messageId);
                    if (ref && 'current' in ref && ref.current) {
                      ref.current.dismiss();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pinIcon}>📌</Text>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowText} numberOfLines={2}>
                      {content}
                    </Text>
                    <Text style={styles.rowTimestamp}>
                      {dayjs(pin.pinnedAt).format('DD/MM/YYYY HH:mm')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => onUnpin(pin.messageId)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.unpinBtn}
                    accessibilityLabel="Bỏ ghim"
                  >
                    <MaterialIcons
                      name="push-pin"
                      size={18}
                      color="#e53935"
                      style={styles.unpinIcon}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

PinListBottomSheet.displayName = 'PinListBottomSheet';

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#222',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  pinIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  rowContent: {
    flex: 1,
    marginRight: 8,
  },
  rowText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  rowTimestamp: {
    fontSize: 11,
    color: '#999',
    marginTop: 3,
  },
  unpinBtn: {
    padding: 4,
  },
  unpinIcon: {
    transform: [{ rotate: '45deg' }],
  },
});

export default PinListBottomSheet;
