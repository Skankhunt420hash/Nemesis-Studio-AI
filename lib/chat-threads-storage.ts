export type ChatThreadMessage = { role: "user" | "assistant"; content: string };

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatThreadMessage[];
  updatedAt: number;
};

export type ChatThreadsStore = {
  threads: ChatThread[];
  activeId: string;
};

const LS_KEY = "nemesis_chat_threads_v1";

export function genThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function titleFromMessages(messages: ChatThreadMessage[]): string {
  const u = messages.find((x) => x.role === "user");
  if (!u) return "Neuer Chat";
  const s = u.content.trim().replace(/\s+/g, " ");
  if (!s) return "Neuer Chat";
  return s.length <= 48 ? s : `${s.slice(0, 45)}…`;
}

export function loadChatThreads(): ChatThreadsStore {
  try {
    if (typeof localStorage === "undefined") throw new Error("no ls");
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as ChatThreadsStore;
    if (!Array.isArray(parsed.threads) || parsed.threads.length === 0) throw new Error("bad");
    if (typeof parsed.activeId !== "string") throw new Error("bad active");
    if (!parsed.threads.some((t) => t.id === parsed.activeId)) {
      parsed.activeId = parsed.threads[0].id;
    }
    return parsed;
  } catch {
    const id = genThreadId();
    return {
      activeId: id,
      threads: [{ id, title: "Neuer Chat", messages: [], updatedAt: Date.now() }],
    };
  }
}

export function saveChatThreads(store: ChatThreadsStore) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* Quota oder Private Mode */
  }
}
