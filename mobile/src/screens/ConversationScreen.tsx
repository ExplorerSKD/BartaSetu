import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar, IconButton, Screen } from '../components/ui';
import { ConnectionBanner, RouteSheet, STATUS_INFO, StatusTicks, TRANSPORT_INFO, transportLabel } from '../components/messaging';
import { colors, radius, spacing, type } from '../theme';
import { formatClock } from '../lib/format';
import { database } from '../services/db';
import { useChatStore } from '../store/useChatStore';
import { isReachable, useMeshStore } from '../store/useMeshStore';
import { useAuthStore } from '../store/useAuthStore';
import { ChatMessage, Contact, SendMode } from '../types';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation'>;

const MODES: Array<{ key: SendMode; label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }> = [
  { key: 'auto', label: 'Auto', icon: 'flash-outline', hint: 'Internet when available, otherwise nearby phones' },
  { key: 'internet', label: 'Internet', icon: 'globe-outline', hint: 'Only through the server (waits until you are online)' },
  { key: 'nearby', label: 'Nearby', icon: 'bluetooth', hint: 'Only phone-to-phone over Bluetooth / Wi-Fi, no server' },
];

export default function ConversationScreen({ navigation, route }: Props) {
  const { peerId } = route.params;
  const me = useAuthStore((s) => s.user);
  const messages = useChatStore((s) => s.messages);
  const openConversation = useChatStore((s) => s.openConversation);
  const closeConversation = useChatStore((s) => s.closeConversation);
  const send = useChatStore((s) => s.send);
  const online = useMeshStore((s) => s.online);
  const peers = useMeshStore((s) => s.peers);

  const [contact, setContact] = useState<Contact | null>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<SendMode>('auto');
  const [showModes, setShowModes] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const contacts = useChatStore((s) => s.contacts);

  useEffect(() => {
    void openConversation(peerId);
    return () => closeConversation();
  }, [peerId, openConversation, closeConversation]);

  // Reload the contact whenever contacts change (e.g. their key arrived over the mesh)
  useEffect(() => {
    database.getContact(peerId).then(setContact);
  }, [peerId, contacts]);

  // Keep the journey sheet in sync with live status updates
  useEffect(() => {
    if (selected) {
      const fresh = messages.find((m) => m.id === selected.id);
      if (fresh && fresh.updatedAt !== selected.updatedAt) setSelected(fresh);
    }
  }, [messages, selected]);

  const peer = useMemo(() => Object.values(peers).find((p) => p.userId === peerId), [peers, peerId]);
  const peerNearby = peer ? isReachable(peer) : false;
  const name = contact?.displayName ?? 'Chat';

  const subtitle = peerNearby
    ? 'Nearby · messages go phone-to-phone'
    : contact?.bsId
      ? `${contact.bsId}${online ? '' : ' · will be delivered via nearby phones'}`
      : '';

  const onSend = async () => {
    const body = text.trim();
    if (!body || !contact) return;
    setSending(true);
    setText('');
    try {
      await send(contact, body, mode);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setText(body);
      Alert.alert('Message not sent', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const currentMode = MODES.find((m) => m.key === mode)!;

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = item.direction === 'out';
    const prev = messages[index - 1];
    const showDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(item.createdAt).toDateString();
    const failed = item.status === 'FAILED' || item.status === 'EXPIRED';
    return (
      <View>
        {showDay ? <Text style={styles.day}>{dayLabel(item.createdAt)}</Text> : null}
        <Pressable
          onLongPress={() => setSelected(item)}
          onPress={() => setSelected(item)}
          style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}
        >
          <View style={[styles.bubble, mine ? styles.bubbleOut : styles.bubbleIn, failed && styles.bubbleFailed]}>
            {item.priority === 'critical' ? (
              <Text style={[styles.critical, mine && { color: '#FEE2E2' }]}>EMERGENCY</Text>
            ) : null}
            <Text style={[styles.body, mine && { color: '#fff' }, item.body == null && styles.undecryptable]}>
              {item.body ?? 'Unable to decrypt this message'}
            </Text>
            <View style={styles.meta}>
              {item.transport !== 'internet' ? (
                <Ionicons
                  name={TRANSPORT_INFO[item.transport].icon}
                  size={11}
                  color={mine ? 'rgba(255,255,255,0.8)' : TRANSPORT_INFO[item.transport].color}
                />
              ) : null}
              {item.transport !== 'internet' ? (
                <Text style={[styles.metaText, mine && styles.metaTextOut]}>{transportLabel(item)}</Text>
              ) : null}
              <Text style={[styles.metaText, mine && styles.metaTextOut]}>{formatClock(item.createdAt)}</Text>
              {mine ? <StatusTicks status={item.status} color={item.status === 'DELIVERED' || item.status === 'READ' ? '#A7F3D0' : 'rgba(255,255,255,0.85)'} /> : null}
            </View>
          </View>
        </Pressable>
        {mine && index === messages.length - 1 ? (
          <Text style={[styles.statusLine, failed && { color: colors.danger }]}>{STATUS_INFO[item.status].label}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="arrow-back" label="Back" onPress={() => navigation.goBack()} background="transparent" />
        <Avatar name={name} id={peerId} size={40} badge={peerNearby ? 'nearby' : null} />
        <View style={{ flex: 1 }}>
          <Text style={type.heading} numberOfLines={1}>{name}</Text>
          <Text style={[type.small, peerNearby && { color: colors.nearby }]} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>
      <ConnectionBanner compact />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="lock-closed-outline" size={22} color={colors.primary} />
              <Text style={[type.caption, { textAlign: 'center', marginTop: spacing.sm }]}>
                Messages to {name} are end-to-end encrypted. Say hello! Tap any message later to see how it travelled.
              </Text>
            </View>
          }
        />

        {showModes ? (
          <View style={styles.modePanel}>
            <Text style={[type.label, { marginBottom: spacing.sm }]}>Send via</Text>
            {MODES.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => {
                  setMode(m.key);
                  setShowModes(false);
                }}
                style={[styles.modeOption, mode === m.key && styles.modeOptionActive]}
              >
                <Ionicons name={m.icon} size={20} color={mode === m.key ? colors.primary : colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyStrong, mode === m.key && { color: colors.primaryDark }]}>{m.label}</Text>
                  <Text style={type.small}>{m.hint}</Text>
                </View>
                {mode === m.key ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.composer}>
          <Pressable style={styles.modeChip} onPress={() => setShowModes((v) => !v)} accessibilityLabel="Choose how to send">
            <Ionicons name={currentMode.icon} size={16} color={colors.primaryDark} />
            <Text style={styles.modeChipText}>{currentMode.label}</Text>
            <Ionicons name={showModes ? 'chevron-down' : 'chevron-up'} size={14} color={colors.primaryDark} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={onSend}
            disabled={!text.trim() || sending || !contact}
            style={({ pressed }) => [
              styles.send,
              (!text.trim() || !contact) && { backgroundColor: colors.borderStrong },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="Send"
          >
            <Ionicons name="send" size={18} color="#fff" style={{ marginLeft: 2 }} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <RouteSheet message={selected} myId={me?.id ?? ''} peerName={name} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString();
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, flexGrow: 1 },
  day: {
    alignSelf: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginVertical: spacing.sm,
    overflow: 'hidden',
  },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 6 },
  bubbleOut: { backgroundColor: colors.bubbleOut, borderBottomRightRadius: 5 },
  bubbleIn: { backgroundColor: colors.bubbleIn, borderBottomLeftRadius: 5 },
  bubbleFailed: { backgroundColor: colors.danger },
  critical: { fontSize: 10, fontWeight: '800', color: colors.danger, letterSpacing: 1, marginBottom: 2 },
  body: { fontSize: 15.5, lineHeight: 21, color: colors.text },
  undecryptable: { fontStyle: 'italic', opacity: 0.75 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 },
  metaText: { fontSize: 11, color: colors.textMuted },
  metaTextOut: { color: 'rgba(255,255,255,0.8)' },
  statusLine: { alignSelf: 'flex-end', fontSize: 11, color: colors.textMuted, marginTop: 2, marginRight: 4 },
  emptyChat: {
    margin: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
  },
  modePanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  modeOptionActive: { backgroundColor: colors.primarySoft },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
  },
  modeChipText: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15.5,
    color: colors.text,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
