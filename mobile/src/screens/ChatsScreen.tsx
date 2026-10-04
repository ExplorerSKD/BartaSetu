import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader, Avatar, Button, EmptyState, IconButton, Screen } from '../components/ui';
import { ConnectionBanner, StatusTicks, TRANSPORT_INFO } from '../components/messaging';
import { colors, radius, shadow, spacing, type } from '../theme';
import { formatTime } from '../lib/format';
import { useChatStore } from '../store/useChatStore';
import { useMeshStore } from '../store/useMeshStore';
import { useAuthStore } from '../store/useAuthStore';
import { Conversation } from '../types';
import { RootStackParamList } from '../navigation/types';

export default function ChatsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const refreshConversations = useChatStore((s) => s.refreshConversations);
  const peers = useMeshStore((s) => s.peers);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      void refreshConversations();
    }, [refreshConversations]),
  );

  const nearbyUserIds = useMemo(
    () => new Set(Object.values(peers).filter((p) => p.userId).map((p) => p.userId!)),
    [peers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.contact.displayName.toLowerCase().includes(q) || c.contact.bsId.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const renderItem = ({ item }: { item: Conversation }) => {
    const last = item.lastMessage;
    const isNearby = nearbyUserIds.has(item.contact.userId);
    const preview = last
      ? last.body ?? 'Encrypted message (unable to decrypt)'
      : 'No messages yet';
    return (
      <Pressable
        onPress={() => navigation.navigate('Conversation', { peerId: item.contact.userId })}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
      >
        <Avatar name={item.contact.displayName} id={item.contact.userId} size={52} badge={isNearby ? 'nearby' : null} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{item.contact.displayName}</Text>
            {last ? <Text style={[type.small, item.unread > 0 && { color: colors.primary }]}>{formatTime(last.createdAt)}</Text> : null}
          </View>
          <View style={styles.rowBottom}>
            {last?.direction === 'out' ? (
              <View style={{ marginRight: 4 }}>
                <StatusTicks status={last.status} color={last.status === 'DELIVERED' ? colors.primary : colors.textMuted} />
              </View>
            ) : null}
            {last && last.transport !== 'internet' ? (
              <Ionicons name={TRANSPORT_INFO[last.transport].icon} size={13} color={TRANSPORT_INFO[last.transport].color} style={{ marginRight: 4 }} />
            ) : null}
            <Text style={[type.caption, { flex: 1 }, !last?.body && last ? { fontStyle: 'italic' } : null]} numberOfLines={1}>
              {preview}
            </Text>
            {item.unread > 0 ? (
              <View style={styles.unread}>
                <Text style={styles.unreadText}>{item.unread > 99 ? '99+' : item.unread}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen>
      <AppHeader
        title="Chats"
        subtitle={user ? `Your ID: ${user.bs_id}` : undefined}
        right={<IconButton icon="help-circle-outline" label="How it works" onPress={() => navigation.navigate('HowItWorks')} />}
      />
      <ConnectionBanner />

      {conversations.length > 0 ? (
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search chats"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.contact.userId}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          query ? (
            <EmptyState icon="search" title="No matches" body={`No chats match "${query}".`} />
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="No conversations yet"
              body="Find someone by their BartaSetu ID, or pick a person nearby, to start your first chat."
              action={<Button title="Start a new chat" icon="person-add-outline" onPress={() => navigation.navigate('FindUser')} />}
            />
          )
        }
      />

      {conversations.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.96 }] }]}
          onPress={() => navigation.navigate('FindUser')}
          accessibilityLabel="New chat"
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 82 },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: spacing.sm,
  },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
});
