import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppHeader, Avatar, Banner, IconButton, Pill, Screen, SectionLabel } from '../components/ui';
import { colors, radius, spacing, type } from '../theme';
import { isValidBsId, normalizeBsId, timeAgo } from '../lib/format';
import { api } from '../services/api';
import { useChatStore } from '../store/useChatStore';
import { useMeshStore, isReachable } from '../store/useMeshStore';
import { useAuthStore } from '../store/useAuthStore';
import { PublicUser } from '../types';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FindUser'>;

interface Row {
  userId: string;
  bsId: string;
  name: string;
  publicKey?: string | null;
  source: 'search' | 'nearby' | 'contact';
  detail: string;
  online?: boolean;
}

export default function FindUserScreen({ navigation }: Props) {
  const me = useAuthStore((s) => s.user);
  const online = useMeshStore((s) => s.online);
  const peers = useMeshStore((s) => s.peers);
  const contacts = useChatStore((s) => s.contacts);
  const refreshContacts = useChatStore((s) => s.refreshContacts);
  const saveContact = useChatStore((s) => s.saveContact);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    void refreshContacts();
  }, [refreshContacts]);

  // Live search while typing (online only)
  useEffect(() => {
    const term = query.trim();
    setMessage(null);
    if (term.length < 2 || !online) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        let found: PublicUser[] = [];
        if (isValidBsId(term)) {
          try {
            found = [await api.lookupByBsId(normalizeBsId(term))];
          } catch {
            found = [];
          }
        } else {
          found = await api.searchUsers(term);
        }
        if (seq !== searchSeq.current) return;
        setResults(found.filter((u) => u.id !== me?.id));
        if (found.length === 0) setMessage(`No one found for "${term}". Check the ID and try again.`);
      } catch {
        if (seq === searchSeq.current) setMessage('Search failed. Check your internet connection.');
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, online, me?.id]);

  const nearbyRows: Row[] = useMemo(
    () =>
      Object.values(peers)
        .filter((p) => p.userId && p.userId !== me?.id)
        .map((p) => ({
          userId: p.userId!,
          bsId: p.bsId,
          name: p.displayName || p.bsId,
          publicKey: p.publicKey,
          source: 'nearby' as const,
          detail: isReachable(p) ? 'Nearby now · can chat without internet' : `Seen ${timeAgo(p.lastSeen)}`,
        })),
    [peers, me?.id],
  );

  const searchRows: Row[] = results.map((u) => ({
    userId: u.id,
    bsId: u.bs_id ?? '',
    name: u.display_name || u.username,
    publicKey: u.public_key,
    source: 'search',
    detail: `@${u.username}`,
    online: u.is_online,
  }));

  const q = query.trim().toLowerCase();
  const contactRows: Row[] = contacts
    .filter((c) => c.userId !== me?.id)
    .filter((c) => !q || c.displayName.toLowerCase().includes(q) || c.bsId.toLowerCase().includes(q))
    .map((c) => ({ userId: c.userId, bsId: c.bsId, name: c.displayName, publicKey: c.publicKey, source: 'contact', detail: c.bsId }));

  const open = async (row: Row) => {
    await saveContact({ userId: row.userId, bsId: row.bsId, displayName: row.name, publicKey: row.publicKey ?? null });
    navigation.replace('Conversation', { peerId: row.userId });
  };

  const renderRow = (row: Row) => (
    <Pressable key={`${row.source}-${row.userId}`} onPress={() => open(row)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
      <Avatar name={row.name} id={row.userId} size={46} badge={row.source === 'nearby' ? 'nearby' : row.online ? 'online' : null} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{row.name}</Text>
        <Text style={type.caption} numberOfLines={1}>{row.detail}</Text>
      </View>
      {row.source === 'nearby' ? (
        <Pill label="Nearby" icon="bluetooth" color={colors.nearby} background={colors.nearbySoft} />
      ) : row.bsId ? (
        <Text style={[type.mono, { fontSize: 13, color: colors.textSecondary }]}>{row.bsId}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <Screen>
      <AppHeader
        title="New chat"
        subtitle="Find people by their BartaSetu ID"
        left={<IconButton icon="arrow-back" label="Back" onPress={() => navigation.goBack()} />}
      />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="BartaSetu ID (BS-XXXXXX) or username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          style={styles.searchInput}
        />
        {searching ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      <FlatList
        data={[0]}
        keyExtractor={() => 'content'}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        renderItem={() => (
          <View>
            {!online ? (
              <Banner tone="warning" icon="cloud-offline-outline" style={styles.banner}>
                You're offline, so searching by ID is unavailable. You can still chat with saved contacts and people nearby.
              </Banner>
            ) : null}
            {message ? <Text style={[type.caption, styles.message]}>{message}</Text> : null}

            {searchRows.length > 0 ? (
              <>
                <SectionLabel style={styles.section}>Search results</SectionLabel>
                {searchRows.map(renderRow)}
              </>
            ) : null}

            {nearbyRows.length > 0 ? (
              <>
                <SectionLabel style={styles.section}>People nearby</SectionLabel>
                {nearbyRows.map(renderRow)}
              </>
            ) : null}

            {contactRows.length > 0 ? (
              <>
                <SectionLabel style={styles.section}>Your contacts</SectionLabel>
                {contactRows.map(renderRow)}
              </>
            ) : null}

            {searchRows.length === 0 && nearbyRows.length === 0 && contactRows.length === 0 && !message ? (
              <View style={styles.tip}>
                <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
                <Text style={[type.caption, { flex: 1 }]}>
                  Ask your friend for their BartaSetu ID. They can find it on their Profile tab. People using BartaSetu near you will also appear here.
                </Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 16, color: colors.text },
  banner: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  message: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  section: { marginHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  tip: {
    flexDirection: 'row',
    gap: 10,
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
