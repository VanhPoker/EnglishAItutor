import { create } from "zustand";

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
      messages: [
        ...s.messages,
        { ...msg, id: crypto.randomUUID(), timestamp: Date.now() },
      ],
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
