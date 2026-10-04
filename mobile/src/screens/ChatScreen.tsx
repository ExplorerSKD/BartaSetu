import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMessageStore } from '../store/useMessageStore';
import { useAuthStore } from '../store/useAuthStore';
import { useMeshStore } from '../store/useMeshStore';
import { LocalMessage, MessageStatus } from '../types';

const RECIPIENT_PRESETS = [
  { id: 'gateway_central', label: '🌐 Fatima (Gateway)', role: 'Internet Bridge' },
  { id: 'admin_hq', label: '🚨 Command HQ', role: 'Emergency Control' },
  { id: 'relay_node_b', label: '🔄 Animesh (Relay)', role: 'Nearby Peer' },
  { id: 'broadcast_all', label: '📢 All Nearby Peers', role: 'Mesh Broadcast' },
];

const QUICK_PROMPTS = [
  'Trapped near road crossing',
  'Water level rising rapidly',
  'Medical supplies required',
  'Holding position, all safe',
];

export default function ChatScreen() {
  const [input, setInput] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState(RECIPIENT_PRESETS[0]);
  const user = useAuthStore((state) => state.user);
  const isOnline = useMeshStore((state) => state.isOnline);
  const { messages, pendingCount, loadMessages, sendMessage, syncPending } = useMessageStore();

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSend = async (textToSend?: string) => {
    const content = textToSend || input.trim();
    if (!content) return;
    setInput('');
    await sendMessage(selectedRecipient.id, content, 'normal');
  };

  const getStatusBadge = (status: MessageStatus) => {
    switch (status) {
      case 'DELIVERED':
        return { badge: '✓✓✓', label: 'Delivered to Recipient', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
      case 'SERVER_RECEIVED':
        return { badge: '✓✓', label: 'Server Received', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.15)' };
      case 'GATEWAY_REACHED':
        return { badge: '✓✓', label: 'Gateway Reached', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' };
      case 'RELAYING':
      case 'RELAYED':
        return { badge: '↗', label: 'Relaying via BLE', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
      case 'PENDING':
      case 'STORED':
      default:
        return { badge: '✓', label: 'Stored Locally (Offline)', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)' };
    }
  };

  const renderMessageItem = ({ item }: { item: LocalMessage }) => {
    const isMe = item.sender_id === user?.id || item.sender_id === 'citizen' || item.sender_id === 'current_user';
    const statusInfo = getStatusBadge(item.status);
    const displayText = item.plaintext || item.encrypted_content;

    return (
      <View style={[styles.bubbleWrapper, isMe ? styles.alignRight : styles.alignLeft]}>
        <View style={[styles.messageBubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <View style={styles.bubbleHeader}>
            <Text style={styles.bubbleSender}>
              {isMe ? 'You (Local Node)' : item.sender_id}
            </Text>
            {item.hop_count > 0 && (
              <Text style={styles.hopBadge}>Hop {item.hop_count}</Text>
            )}
          </View>

          <Text style={styles.messageText}>{displayText}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.timeText}>
              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMe && (
              <View style={[styles.statusBadgeWrap, { backgroundColor: statusInfo.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                  {statusInfo.badge} {statusInfo.label}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {/* Chat Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Mesh Messaging</Text>
            <Text style={styles.headerSub}>
              Channel: {isOnline ? '🌐 FastAPI Gateway (Direct)' : '📡 BLE Store-and-Forward (Offline)'}
            </Text>
          </View>
          {pendingCount > 0 && (
            <TouchableOpacity style={styles.syncBtn} onPress={() => syncPending()}>
              <Text style={styles.syncBtnText}>Sync {pendingCount}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recipient Picker Chips */}
        <View style={styles.recipientsRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={RECIPIENT_PRESETS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selectedRecipient.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.recipientChip, isSelected && styles.recipientChipActive]}
                  onPress={() => setSelectedRecipient(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.recipientChipText, isSelected && styles.recipientChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Message Feed */}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.feedContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>No messages in mesh queue</Text>
              <Text style={styles.emptySub}>
                Type below or tap a quick prompt to transmit an encrypted mesh packet.
              </Text>
            </View>
          }
        />

        {/* Quick Disaster Prompts */}
        <View style={styles.promptsRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={QUICK_PROMPTS}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.promptPill}
                onPress={() => handleSend(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.promptPillText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Input Composer Bar */}
        <View style={styles.composerBar}>
          <TextInput
            style={styles.composerInput}
            placeholder={`Message ${selectedRecipient.label}...`}
            placeholderTextColor="#64748B"
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.sendButtonIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A13',
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerSub: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  syncBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  syncBtnText: {
    color: '#070A13',
    fontSize: 11,
    fontWeight: '800',
  },
  recipientsRow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  recipientChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recipientChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  recipientChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  recipientChipTextActive: {
    color: '#34D399',
    fontWeight: '700',
  },
  feedContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexGrow: 1,
  },
  bubbleWrapper: {
    marginBottom: 12,
    maxWidth: '82%',
  },
  alignRight: {
    alignSelf: 'flex-end',
  },
  alignLeft: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  bubbleMe: {
    backgroundColor: '#1E293B',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: '#0F172A',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bubbleSender: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hopBadge: {
    color: '#06B6D4',
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  messageText: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  timeText: {
    color: '#64748B',
    fontSize: 10,
  },
  statusBadgeWrap: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 240,
    marginTop: 4,
    lineHeight: 16,
  },
  promptsRow: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  promptPill: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  promptPillText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '500',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
    maxHeight: 90,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  sendButtonDisabled: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
  },
  sendButtonIcon: {
    color: '#070A13',
    fontSize: 16,
    fontWeight: '900',
  },
});
