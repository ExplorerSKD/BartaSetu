import { create } from 'zustand';
import { appEvents } from '../lib/events';
import { database } from '../services/db';
import { mesh } from '../services/mesh';
import { ChatMessage, Contact, Conversation, SendMode } from '../types';

interface ChatState {
  conversations: Conversation[];
  contacts: Contact[];
  /** Messages of the conversation currently on screen. */
  activePeerId: string | null;
  messages: ChatMessage[];

  refreshConversations: () => Promise<void>;
  refreshContacts: () => Promise<void>;
  openConversation: (peerId: string) => Promise<void>;
  closeConversation: () => void;
  send: (contact: Contact, text: string, mode: SendMode) => Promise<void>;
  saveContact: (contact: Omit<Contact, 'updatedAt'>) => Promise<Contact>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  contacts: [],
  activePeerId: null,
  messages: [],

  refreshConversations: async () => {
    if (!database.isOpen()) return;
    const summaries = await database.getConversationSummaries();
    const conversations: Conversation[] = [];
    for (const s of summaries) {
      const contact = (await database.getContact(s.peerId)) ?? {
        userId: s.peerId,
        bsId: '',
        displayName: 'Unknown user',
        updatedAt: 0,
      };
      conversations.push({ contact, lastMessage: s.last, unread: s.unread });
    }
    set({ conversations });
  },

  refreshContacts: async () => {
    if (!database.isOpen()) return;
    set({ contacts: await database.getContacts() });
  },

  openConversation: async (peerId) => {
    set({ activePeerId: peerId, messages: [] });
    await database.markConversationRead(peerId);
    set({ messages: await database.getConversation(peerId) });
    void get().refreshConversations();
  },

  closeConversation: () => set({ activePeerId: null, messages: [] }),

  send: async (contact, text, mode) => {
    await mesh.sendChat(contact, text, mode);
  },

  saveContact: async (contact) => {
    const saved = await database.upsertContact(contact);
    await get().refreshContacts();
    return saved;
  },
}));

// Keep lists live as messages arrive or change status (from server, mesh, or our own sends)
let refreshQueued = false;
appEvents.on('messageChanged', async ({ peerId, messageId }) => {
  if (!database.isOpen()) return;
  const state = useChatStore.getState();
  if (state.activePeerId === peerId) {
    const message = await database.getMessage(messageId);
    if (message) {
      const current = useChatStore.getState().messages;
      const exists = current.some((m) => m.id === messageId);
      const next = exists ? current.map((m) => (m.id === messageId ? message : m)) : [...current, message];
      next.sort((a, b) => a.createdAt - b.createdAt);
      useChatStore.setState({ messages: next });
      if (message.direction === 'in') await database.markConversationRead(peerId);
    }
  }
  if (!refreshQueued) {
    refreshQueued = true;
    setTimeout(() => {
      refreshQueued = false;
      void useChatStore.getState().refreshConversations();
    }, 150);
  }
});

appEvents.on('contactsChanged', () => {
  void useChatStore.getState().refreshContacts();
  void useChatStore.getState().refreshConversations();
});
