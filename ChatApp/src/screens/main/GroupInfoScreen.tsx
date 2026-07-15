import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import apiClient, { conversationsApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import AddMemberModal from '../../components/AddMemberModal';
import { useAuth } from '../../contexts/AuthContext';
import { KoolaText, koolaColors } from '../../ui';
import type { ChatTabStackParamList } from '../../navigation/types';
import type { Conversation, User } from '../../types';

const memberUserId = (m: any): string =>
  typeof m?.userId === 'object' && m?.userId !== null
    ? String((m.userId as any)._id || '')
    : String(m?.userId || '');

const GroupInfoScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const route = useRoute<{ key: string; name: string; params: { conversationId: string } }>();
  const { conversationId } = route.params;
  const { user: currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const isAdmin = conversation?.members.some(
    (m) => memberUserId(m) === currentUser?._id && m.role === 'admin',
  );

  const fetchDetails = useCallback(async () => {
    try {
      const data = await conversationsApi.getDetails(conversationId);
      const conv = (data.conversation || data) as Conversation;
      setConversation(conv);
    } catch (err) {
      console.warn('[GroupInfo] fetchDetails error:', err);
      Alert.alert('Lỗi', 'Không thể tải thông tin nhóm');
    }
    finally { setLoading(false); }
  }, [conversationId]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  const handleUpdateName = async () => {
    if (!newName.trim()) return;
    try {
      await apiClient.put(`/conversations/${conversationId}`, { name: newName.trim() });
      setConversation((p) => p ? { ...p, name: newName.trim() } : p);
      setEditingName(false);
    } catch { Alert.alert('Lỗi', 'Không thể cập nhật tên nhóm'); }
  };

  const handleAddMembers = useCallback(async (userIds: string[]) => {
    const results: { userId: string; ok: boolean; error?: string }[] = [];
    for (const userId of userIds) {
      try {
        await apiClient.post(`/conversations/${conversationId}/members`, { userId });
        results.push({ userId, ok: true });
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        results.push({ userId, ok: false, error: e.response?.data?.message || 'Unknown error' });
      }
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0 && failed.length < userIds.length) {
      Alert.alert('Cảnh báo', `Đã thêm ${results.length - failed.length} thành viên. ${failed.length} thất bại.`);
    } else if (failed.length === userIds.length) {
      Alert.alert('Lỗi', 'Không thể thêm thành viên. Vui lòng thử lại.');
    }
    setAddingMember(false);
    fetchDetails();
  }, [conversationId, fetchDetails]);

  const handleRemoveMember = (userId: string, name: string) => {
    Alert.alert('Xóa thành viên', `Xóa ${name} khỏi nhóm?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`/conversations/${conversationId}/members/${userId}`); fetchDetails(); }
        catch { Alert.alert('Lỗi', 'Không thể xóa thành viên'); }
      }},
    ]);
  };

  const handleOpenProfile = useCallback((userId: string) => {
    if (!userId.trim()) return;
    navigation.navigate('Profile', { userId });
  }, [navigation]);

  const handleLeaveGroup = () => {
    Alert.alert('Rời nhóm', 'Bạn có chắc chắn muốn rời nhóm?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Rời', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`/conversations/${conversationId}/members/me`); navigation.goBack(); }
        catch { Alert.alert('Lỗi', 'Không thể rời nhóm'); }
      }},
    ]);
  };

  const renderHeader = () => (
    <View style={[s.topHeader, { paddingTop: insets.top }]}>
      <View style={s.topHeaderRow}>
        <Pressable
          onPress={navigation.goBack}
          hitSlop={12}
          android_ripple={{ color: koolaColors.line, borderless: true, radius: 22 }}
          style={({ pressed }) => [s.topHeaderBack, pressed && s.topHeaderBackPressed]}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <MaterialIcons name="arrow-back" size={24} color={koolaColors.ink} />
        </Pressable>
        <KoolaText variant="heading" weight="700" style={s.topHeaderTitle} numberOfLines={1}>
          Thông tin nhóm
        </KoolaText>
        <View style={s.topHeaderSpacer} />
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.ctr} edges={['bottom','left','right']}>
        {renderHeader()}
        <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!conversation) {
    return (
      <SafeAreaView style={s.ctr} edges={['bottom','left','right']}>
        {renderHeader()}
        <Text style={s.err}>Không tìm thấy nhóm</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.ctr} edges={['bottom','left','right']}>
      {renderHeader()}
      <View style={s.hdr}>
        <UserAvatar displayName={conversation.name || 'Nhóm'} size={72} />
        {editingName ? (
          <View style={s.editRow}>
            <TextInput style={s.editIn} value={newName} onChangeText={setNewName} placeholder="Tên mới" placeholderTextColor="#999" autoFocus />
            <TouchableOpacity onPress={handleUpdateName} style={s.saveBtn}><Text style={s.saveTxt}>Lưu</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingName(false)}><Text style={s.cancel}>✕</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => { if (isAdmin) { setNewName(conversation.name || ''); setEditingName(true); } }}>
            <Text style={s.gName}>{conversation.name || 'Nhóm chat'}</Text>
            {isAdmin && <Text style={s.hint}>Nhấn để sửa</Text>}
          </TouchableOpacity>
        )}
        <Text style={s.mCount}>{conversation.members.length} thành viên</Text>
      </View>
      <View style={s.secHdr}><Text style={s.secT}>Thành viên</Text>
        {isAdmin && <TouchableOpacity onPress={() => setAddingMember(true)}><Text style={s.addBtn}>+ Thêm</Text></TouchableOpacity>}
      </View>
      {addingMember && (
        <AddMemberModal
          visible={addingMember}
          existingMemberIds={conversation.members.map((m) => memberUserId(m))}
          currentUserId={currentUser?._id || ''}
          onClose={() => setAddingMember(false)}
          onAdd={handleAddMembers}
        />
      )}
      {/* Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount */}
      <FlatList data={conversation.members} keyExtractor={(i) => memberUserId(i)} removeClippedSubviews={false}
        renderItem={({ item }) => {
          const uid = memberUserId(item);
          const u = (typeof item.userId === 'object' ? item.userId : item.user) as User | undefined;
          const nm = u?.displayName || uid;
          const self = uid === currentUser?._id;
          return (
            <View style={s.mi}>
              <Pressable
                onPress={() => handleOpenProfile(uid)}
                disabled={!uid}
                android_ripple={{ color: '#f0f0f0' }}
                style={({ pressed }) => [s.miProfile, pressed && s.miProfilePressed]}
                accessibilityRole="button"
                accessibilityLabel={`Mở hồ sơ của ${nm}${self ? ' (Bạn)' : ''}`}>
                <UserAvatar displayName={nm} avatar={u?.avatar || undefined} size={40} />
                <View style={s.miInfo}><Text style={s.miName}>{nm}{self ? ' (Bạn)' : ''}</Text><Text style={s.miRole}>{item.role === 'admin' ? 'Quản trị' : 'Thành viên'}</Text></View>
              </Pressable>
              {isAdmin && !self && <TouchableOpacity onPress={() => handleRemoveMember(uid, nm)}><Text style={s.rmBtn}>Xóa</Text></TouchableOpacity>}
            </View>);
        }} ItemSeparatorComponent={() => <View style={s.sep} />} />
      <TouchableOpacity style={s.leave} onPress={handleLeaveGroup}><Text style={s.leaveTxt}>Rời nhóm</Text></TouchableOpacity>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  ctr: { flex: 1, backgroundColor: '#fff' },
  topHeader: {
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  topHeaderRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  topHeaderBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderBackPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  topHeaderTitle: {
    flex: 1,
    textAlign: 'center',
  },
  topHeaderSpacer: {
    width: 44,
  },
  hdr: { alignItems: 'center', paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  gName: { fontSize: 22, fontWeight: 'bold', color: '#333', marginTop: 12, textAlign: 'center' },
  hint: { fontSize: 12, color: '#2196F3', textAlign: 'center', marginTop: 2 },
  mCount: { fontSize: 14, color: '#999', marginTop: 4 },
  editRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 24 },
  editIn: { flex: 1, height: 40, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, fontSize: 16, color: '#333' },
  saveBtn: { marginLeft: 8, backgroundColor: '#2196F3', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveTxt: { color: '#fff', fontWeight: '600' },
  cancel: { marginLeft: 8, fontSize: 18, color: '#999', padding: 4 },
  secHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  secT: { fontSize: 16, fontWeight: '600', color: '#333' },
  addBtn: { fontSize: 14, color: '#2196F3', fontWeight: '600' },
  mi: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  miProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  miProfilePressed: { opacity: 0.72 },
  miInfo: { flex: 1, marginLeft: 12 },
  miName: { fontSize: 15, fontWeight: '500', color: '#333' },
  miRole: { fontSize: 12, color: '#999', marginTop: 2 },
  rmBtn: { color: '#ff4444', fontSize: 13, fontWeight: '600' },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 68 },
  leave: { margin: 16, paddingVertical: 14, backgroundColor: '#ff4444', borderRadius: 8, alignItems: 'center' },
  leaveTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  err: { fontSize: 16, color: '#999', textAlign: 'center', marginTop: 60 },
});

export default GroupInfoScreen;
