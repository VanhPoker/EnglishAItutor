import { create } from "zustand";

function normalizeMessageContent(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isSimilarMessage(a: string, b: string) {
  const normalizedA = normalizeMessageContent(a);
  const normalizedB = normalizeMessageContent(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;
  const minLength = Math.min(normalizedA.length, normalizedB.length);
  return minLength >= 24 && (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA));
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  corrections?: CorrectionItem[];
}

export interface CorrectionItem {
  errorType: string;
  original: string;
  correction: string;
  explanation: string;
}

interface ChatState {
  messages: ChatMessage[];
  isConnected: boolean;
  isAgentSpeaking: boolean;
  isUserSpeaking: boolean;
  currentTranscript: string;

  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateLastAssistantMessage: (content: string) => void;
  setConnected: (val: boolean) => void;
  setAgentSpeaking: (val: boolean) => void;
  setUserSpeaking: (val: boolean) => void;
  setCurrentTranscript: (val: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isConnected: false,
  isAgentSpeaking: false,
  isUserSpeaking: false,
  currentTranscript: "",

  addMessage: (msg) =>
    set((s) => ({
      messages: (() => {
        const now = Date.now();
        const messages = [...s.messages];

        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const existing = messages[index];
          if (now - existing.timestamp > 12_000) break;
          if (existing.role !== msg.role) continue;
          if (!isSimilarMessage(existing.content, msg.content)) continue;

          const existingText = normalizeMessageContent(existing.content);
          const nextText = normalizeMessageContent(msg.content);
          if (nextText.length > existingText.length && nextText.includes(existingText)) {
            messages[index] = { ...existing, content: msg.content, timestamp: now };
          }
          return messages;
        }

        messages.push({ ...msg, id: crypto.randomUUID(), timestamp: now });
        return messages;
      })(),
    })),

  updateLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + content };
      } else {
        msgs.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          timestamp: Date.now(),
        });
      }
      return { messages: msgs };
    }),

  setConnected: (val) => set({ isConnected: val }),
  setAgentSpeaking: (val) => set({ isAgentSpeaking: val }),
  setUserSpeaking: (val) => set({ isUserSpeaking: val }),
  setCurrentTranscript: (val) => set({ currentTranscript: val }),
  clearMessages: () => set({ messages: [] }),
}));
