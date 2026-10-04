/** Tiny typed event bus so services can notify stores without import cycles. */

type AppEvents = {
  messageChanged: { peerId: string; messageId: string };
  contactsChanged: undefined;
  peersChanged: undefined;
  sosReceived: undefined;
  incomingMessage: { peerId: string; name: string; body: string | null };
  sessionExpired: undefined;
};

type Handler<T> = (payload: T) => void;

const handlers = new Map<keyof AppEvents, Set<Handler<any>>>();

export const appEvents = {
  on<K extends keyof AppEvents>(event: K, handler: Handler<AppEvents[K]>): () => void {
    let set = handlers.get(event);
    if (!set) {
      set = new Set();
      handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  },
  emit<K extends keyof AppEvents>(event: K, ...args: AppEvents[K] extends undefined ? [] : [AppEvents[K]]): void {
    handlers.get(event)?.forEach((handler) => {
      try {
        handler(args[0]);
      } catch (err) {
        console.warn(`[events] ${event} handler failed`, err);
      }
    });
  },
};
