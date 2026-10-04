/**
 * useMessageStore.ts
 * Zustand state store for Messages and Store-and-Forward synchronization in BartaSetu mobile.
 * Manages conversation histories, pending offline message queues,
 * and handles real-time status updates from WebSocket & BLE mesh.
 */

import { create } from 'zustand';
import { messageService } from '../services/MessageService';
import { webSocketService } from '../services/WebSocketService';
import { dbService } from '../database/DatabaseService';
import { LocalMessage, MessagePriority, MessageResponse, MessageStatus } from '../types';

interface MessageState {
  messages: LocalMessage[];
  pendingCount: number;
  activeConversation: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setActiveConversation: (peerId: string | null) => void;
  loadMessages: () => Promise<void>;
  sendMessage: (
    recipientId: string,
    content: string,
    priority?: MessagePriority
  ) => Promise<LocalMessage | null>;
  updateStatus: (messageId: string, status: MessageStatus) => Promise<void>;
  syncPending: () => Promise<void>;
  addIncomingMessage: (msg: LocalMessage | MessageResponse) => Promise<void>;
  acknowledgeMessage: (messageId: string, status?: string) => Promise<void>;
  clearMessages: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => {
  // Setup real-time listeners for message updates and WebSocket notifications
  messageService.onMessageUpdate((updatedMsg: LocalMessage) => {
    const currentMessages = get().messages;
    const exists = currentMessages.some((m) => m.id === updatedMsg.id);

    let nextMessages: LocalMessage[];
    if (exists) {
      nextMessages = currentMessages.map((m) => (m.id === updatedMsg.id ? updatedMsg : m));
    } else {
      nextMessages = [...currentMessages, updatedMsg];
    }

    const pending = nextMessages.filter((m) => m.status === 'PENDING' || m.is_synced === 0).length;
    set({ messages: nextMessages, pendingCount: pending });
  });

  // Listen to WebSocket incoming messages
  webSocketService.onNewMessage(async (msg: MessageResponse) => {
    await get().addIncomingMessage(msg);
  });

  // Listen to WebSocket delivery acks
  webSocketService.onDeliveryAck(async (ack) => {
    await get().updateStatus(ack.message_id, ack.status as MessageStatus);
  });

  return {
    messages: [],
    pendingCount: 0,
    activeConversation: null,
    isLoading: false,
    error: null,

    setActiveConversation: (peerId: string | null) => {
      set({ activeConversation: peerId });
    },

    loadMessages: async () => {
      set({ isLoading: true, error: null });
      try {
        const allMessages = await dbService.getAllMessages();
        const pending = allMessages.filter((m) => m.status === 'PENDING' || m.is_synced === 0).length;
        set({
          messages: allMessages,
          pendingCount: pending,
          isLoading: false
        });
      } catch (err: any) {
        set({
          isLoading: false,
          error: err?.message || 'Failed to load local messages from SQLite'
        });
      }
    },

    sendMessage: async (recipientId: string, content: string, priority: MessagePriority = 'normal') => {
      set({ error: null });
      try {
        const sent = await messageService.sendMessage({
          recipientId,
          content,
          priority
        });

        // Store will automatically receive update via messageService.onMessageUpdate
        return sent;
      } catch (err: any) {
        set({ error: err?.message || 'Failed to send message' });
        return null;
      }
    },

    updateStatus: async (messageId: string, status: MessageStatus) => {
      try {
        await dbService.updateMessageStatus(messageId, status);
        const currentMessages = get().messages;
        const nextMessages = currentMessages.map((m) =>
          m.id === messageId ? { ...m, status } : m
        );
        const pending = nextMessages.filter((m) => m.status === 'PENDING' || m.is_synced === 0).length;
        set({ messages: nextMessages, pendingCount: pending });
      } catch (err: any) {
        console.warn('Error updating message status in store:', err);
      }
    },

    syncPending: async () => {
      set({ isLoading: true, error: null });
      try {
        await messageService.syncPendingMessages();
        await get().loadMessages();
      } catch (err: any) {
        set({
          isLoading: false,
          error: err?.message || 'Failed to sync pending messages with backend'
        });
      }
    },

    addIncomingMessage: async (msg: LocalMessage | MessageResponse) => {
      try {
        let plaintext: string | undefined = (msg as any).plaintext;

        // Try simple base64 plaintext decode if available
        if (!plaintext && msg.encrypted_content) {
          try {
            const parsed = JSON.parse(msg.encrypted_content);
            if (parsed.ciphertext) {
              plaintext = decodeURIComponent(escape(atob(parsed.ciphertext)));
            }
          } catch {
            // Not a JSON base64 ciphertext
          }
        }

        const localMsg = await messageService.handleIncomingMessage(msg, plaintext);

        const currentMessages = get().messages;
        const exists = currentMessages.some((m) => m.id === localMsg.id);
        const nextMessages = exists
          ? currentMessages.map((m) => (m.id === localMsg.id ? localMsg : m))
          : [...currentMessages, localMsg];

        const pending = nextMessages.filter((m) => m.status === 'PENDING' || m.is_synced === 0).length;
        set({ messages: nextMessages, pendingCount: pending });
      } catch (err) {
        console.error('Error adding incoming message to store:', err);
      }
    },

    acknowledgeMessage: async (messageId: string, status: string = 'DELIVERED') => {
      try {
        await messageService.acknowledgeMessage(messageId, status);
        await get().updateStatus(messageId, status as MessageStatus);
      } catch (err) {
        console.warn('Error acknowledging message:', err);
      }
    },

    clearMessages: () => {
      set({ messages: [], pendingCount: 0 });
    }
  };
});
