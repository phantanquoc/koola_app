/**
 * AudienceListEditorScreen.tsx
 *
 * Create / rename / delete audience lists and manage their members.
 * Accessible from composer audience picker and from settings.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { ChatTabStackParamList } from '../../navigation/types';
import { KoolaText, KoolaButton, KoolaState, koolaColors, koolaRadii } from '../../ui';
import { momentsService } from '../../services/moments/momentsService';
import { usersApi } from '../../services/api/apiService';
import type { AudienceList } from '../../services/moments/momentsApi';
import type { UserSearchResult } from '../../types';

type NavProp = NativeStackNavigationProp<ChatTabStackParamList>;
type EditorRouteProp = RouteProp<ChatTabStackParamList, 'AudienceListEditor'>;

const AudienceListEditorScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<EditorRouteProp>();
  const { listId } = route.params;

  const [lists, setLists] = useState<AudienceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeList, setActiveList] = useState<AudienceList | null>(null);

  // Create / rename modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingList, setEditingList] = useState<AudienceList | null>(null);
  const [listName, setListName] = useState('');
  const [saving, setSaving] = useState(false);

  // Member picker
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<UserSearchResult[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [memberSearchTimeout, setMemberSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await momentsService.loadAudienceLists();
      setLists(data);
      if (listId) {
        const target = data.find((l) => l._id === listId) ?? null;
        setActiveList(target);
      }
    } catch {
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const handleCreateOrRename = useCallback(async () => {
    if (!listName.trim()) return;
    setSaving(true);
    try {
      if (editingList) {
        const updated = await momentsService.updateAudienceList(editingList._id, { name: listName.trim() });
        setLists((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
        if (activeList?._id === updated._id) setActiveList(updated);
      } else {
        const newList = await momentsService.createAudienceList({ name: listName.trim() });
        setLists((prev) => [...prev, newList]);
        setActiveList(newList);
      }
      setShowCreateModal(false);
      setEditingList(null);
      setListName('');
    } catch {
      Alert.alert('Lỗi', 'Không thể lưu danh sách. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }, [listName, editingList, activeList]);

  const handleDeleteList = useCallback((list: AudienceList) => {
    Alert.alert(
      'Xóa danh sách',
      `Xóa "${list.name}"? Hành động này không thể hoàn tác.`,
      [
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await momentsService.deleteAudienceList(list._id);
              setLists((prev) => prev.filter((l) => l._id !== list._id));
              if (activeList?._id === list._id) setActiveList(null);
            } catch {
              Alert.alert('Lỗi', 'Không thể xóa danh sách.');
            }
          },
        },
        { text: 'Hủy', style: 'cancel' },
      ],
    );
  }, [activeList]);

  const handleMemberSearch = useCallback(
    (q: string) => {
      setMemberQuery(q);
      if (memberSearchTimeout) clearTimeout(memberSearchTimeout);
      if (!q.trim()) {
        setMemberResults([]);
        return;
      }
      const t = setTimeout(async () => {
        try {
          const result = await usersApi.searchUsers(q, undefined);
          setMemberResults(result.items);
        } catch {
          setMemberResults([]);
        }
      }, 300);
      setMemberSearchTimeout(t);
    },
    [memberSearchTimeout],
  );

  const toggleMemberSelection = useCallback((userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }, []);

  const handleSaveMembers = useCallback(async () => {
    if (!activeList) return;
    const currentIds = activeList.memberIds;
    const toAdd = selectedUserIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !selectedUserIds.includes(id));

    try {
      const updated = await momentsService.updateAudienceList(activeList._id, {
        addMemberIds: toAdd.length ? toAdd : undefined,
        removeMemberIds: toRemove.length ? toRemove : undefined,
      });
      setLists((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
      setActiveList(updated);
      setShowMemberPicker(false);
    } catch {
      Alert.alert('Lỗi', 'Không thể lưu thành viên.');
    }
  }, [activeList, selectedUserIds]);

  const openMemberPicker = useCallback((list: AudienceList) => {
    setActiveList(list);
    setSelectedUserIds([...list.memberIds]);
    setMemberQuery('');
    setMemberResults([]);
    setShowMemberPicker(true);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={koolaColors.primary} accessibilityLabel="Đang tải danh sách" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <KoolaText tone="primary">Quay lại</KoolaText>
        </TouchableOpacity>
        <KoolaText variant="label" weight="700">
          Danh sách đối tượng
        </KoolaText>
        <TouchableOpacity
          onPress={() => {
            setEditingList(null);
            setListName('');
            setShowCreateModal(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Tạo danh sách mới">
          <KoolaText tone="primary">Tạo mới</KoolaText>
        </TouchableOpacity>
      </View>

      {lists.length === 0 ? (
        <View style={styles.center}>
          <KoolaState
            icon="group"
            title="Bạn chưa có danh sách nào"
            message="Tạo danh sách để chọn ai có thể xem khoảnh khắc của bạn."
            actionLabel="Tạo danh sách"
            onActionPress={() => {
              setEditingList(null);
              setListName('');
              setShowCreateModal(true);
            }}
          />
        </View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <View style={styles.listItemInfo}>
                <KoolaText variant="body" tone="ink" weight="600">
                  {item.name}
                </KoolaText>
                <KoolaText variant="caption" tone="muted">
                  {item.memberIds.length} thành viên
                </KoolaText>
              </View>
              <View style={styles.listItemActions}>
                <TouchableOpacity
                  onPress={() => openMemberPicker(item)}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Chỉnh sửa thành viên của ${item.name}`}>
                  <KoolaText tone="primary" variant="caption">
                    Sửa
                  </KoolaText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEditingList(item);
                    setListName(item.name);
                    setShowCreateModal(true);
                  }}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Đổi tên ${item.name}`}>
                  <KoolaText tone="primary" variant="caption">
                    Đổi tên
                  </KoolaText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteList(item)}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa ${item.name}`}>
                  <KoolaText tone="danger" variant="caption">
                    Xóa
                  </KoolaText>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Create/rename modal */}
      <Modal
        visible={showCreateModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalBackdrop} accessibilityViewIsModal>
          <View style={styles.createModal}>
            <KoolaText variant="label" weight="700" align="center">
              {editingList ? 'Đổi tên danh sách' : 'Tạo danh sách mới'}
            </KoolaText>
            <TextInput
              style={styles.nameInput}
              value={listName}
              onChangeText={setListName}
              placeholder="Tên danh sách (vd: Bạn thân)"
              placeholderTextColor={koolaColors.faint}
              maxLength={50}
              autoFocus
              accessibilityLabel="Nhập tên danh sách"
            />
            <View style={styles.createActions}>
              <KoolaButton
                title="Hủy"
                variant="secondary"
                onPress={() => setShowCreateModal(false)}
                style={styles.actionBtn}
              />
              <KoolaButton
                title={editingList ? 'Lưu' : 'Tạo'}
                loading={saving}
                onPress={handleCreateOrRename}
                style={styles.actionBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Member picker modal */}
      <Modal
        visible={showMemberPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMemberPicker(false)}>
        <View style={styles.memberPickerContainer} accessibilityViewIsModal>
          <View style={styles.memberPickerHeader}>
            <TouchableOpacity
              onPress={() => setShowMemberPicker(false)}
              accessibilityRole="button"
              accessibilityLabel="Hủy">
              <KoolaText tone="primary">Hủy</KoolaText>
            </TouchableOpacity>
            <KoolaText variant="label" weight="700">
              Chọn thành viên
            </KoolaText>
            <TouchableOpacity
              onPress={handleSaveMembers}
              accessibilityRole="button"
              accessibilityLabel="Lưu danh sách thành viên">
              <KoolaText tone="primary" weight="700">
                Lưu
              </KoolaText>
            </TouchableOpacity>
          </View>

          <View style={styles.memberSearchBar}>
            <TextInput
              style={styles.memberSearchInput}
              value={memberQuery}
              onChangeText={handleMemberSearch}
              placeholder="Tìm người dùng..."
              placeholderTextColor={koolaColors.faint}
              accessibilityLabel="Tìm kiếm người dùng"
            />
          </View>

          <FlatList
            data={memberResults}
            keyExtractor={(item) => item._id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => {
              const isSelected = selectedUserIds.includes(item._id);
              return (
                <TouchableOpacity
                  style={[styles.memberItem, isSelected && styles.memberItemSelected]}
                  onPress={() => toggleMemberSelection(item._id)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={item.displayName}
                  accessibilityState={{ checked: isSelected }}>
                  <KoolaText
                    tone={isSelected ? 'primary' : 'ink'}
                    weight={isSelected ? '700' : '400'}>
                    {item.displayName}
                  </KoolaText>
                  {isSelected && (
                    <KoolaText tone="primary" style={styles.checkMark}>
                      ✓
                    </KoolaText>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              memberQuery.length > 0 ? (
                <View style={styles.memberEmpty}>
                  <KoolaText tone="muted" align="center">
                    Không tìm thấy người dùng.
                  </KoolaText>
                </View>
              ) : (
                <View style={styles.memberEmpty}>
                  <KoolaText tone="muted" align="center">
                    Nhập tên để tìm kiếm.
                  </KoolaText>
                </View>
              )
            }
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  listItemInfo: {
    flex: 1,
    gap: 2,
  },
  listItemActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createModal: {
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.md,
    padding: 24,
    width: 300,
    gap: 16,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: koolaColors.line,
    borderRadius: koolaRadii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: koolaColors.ink,
  },
  createActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
  },
  memberPickerContainer: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  memberPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  memberSearchBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  memberSearchInput: {
    backgroundColor: koolaColors.canvas,
    borderRadius: koolaRadii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: koolaColors.ink,
    borderWidth: 1,
    borderColor: koolaColors.line,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  memberItemSelected: {
    backgroundColor: koolaColors.primarySoft,
  },
  checkMark: {
    fontSize: 16,
  },
  memberEmpty: {
    padding: 40,
  },
});

export default AudienceListEditorScreen;
