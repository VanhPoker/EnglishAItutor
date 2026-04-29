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
  kind?: "text" | "quiz_widget";
  corrections?: CorrectionItem[];
  quizWidget?: InlineQuizWidget;
}

export interface CorrectionItem {
  errorType: string;
  original: string;
  correction: string;
  explanation: string;
}

export interface InlineQuizChoice {
  id: string;
  text: string;
}

export interface InlineQuizQuestion {
  id: string;
  prompt: string;
  focus: string;
  question_type: "multiple_choice";
  choices: InlineQuizChoice[];
  correct_choice_id: string;
  explanation: string;
  source_text?: string;
}

export interface InlineQuizWidget {
  id: string;
  type?: "exercise_set";
  title: string;
  description?: string;
  topic?: string;
  level?: string;
  questions: InlineQuizQuestion[];
  answers?: Record<string, string>;
  submitted?: boolean;

  // Legacy single-question payload support for old agent containers.
  prompt?: string;
  focus?: string;
  question_type?: "multiple_choice";
  choices?: InlineQuizChoice[];
  correct_choice_id?: string;
  explanation?: string;
  source_text?: string;
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
  addQuizWidget: (widget: InlineQuizWidget) => void;
  answerQuizWidget: (widgetId: string, questionId: string, choiceId: string) => void;
  submitQuizWidget: (widgetId: string) => void;
  clearMessages: () => void;
}

function normalizeQuizWidget(widget: InlineQuizWidget): InlineQuizWidget {
  if (widget.questions?.length) {
    return { ...widget, answers: widget.answers ?? {} };
  }

  if (widget.prompt && widget.choices?.length && widget.correct_choice_id) {
    return {
      id: widget.id,
      type: "exercise_set",
      title: widget.title || "Bộ bài tập nhanh trong phiên",
      description: "Làm nhanh câu hỏi vừa được tạo trong phiên luyện nói.",
      questions: [
        {
          id: "q-legacy",
          prompt: widget.prompt,
          focus: widget.focus || "grammar",
          question_type: "multiple_choice",
          choices: widget.choices,
          correct_choice_id: widget.correct_choice_id,
          explanation: widget.explanation || "Đây là đáp án tự nhiên hơn trong ngữ cảnh vừa luyện.",
          source_text: widget.source_text,
        },
      ],
      answers: {},
      submitted: widget.submitted,
    };
  }

  return { ...widget, questions: [], answers: widget.answers ?? {} };
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
  addQuizWidget: (widget) =>
    set((state) => {
      const normalizedWidget = normalizeQuizWidget(widget);
      if (!normalizedWidget.questions.length) return state;

      const existing = state.messages.find(
        (message) => message.kind === "quiz_widget" && message.quizWidget?.id === normalizedWidget.id
      );
      if (existing) return state;

      return {
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            kind: "quiz_widget",
            timestamp: Date.now(),
            quizWidget: normalizedWidget,
          },
        ],
      };
    }),
  answerQuizWidget: (widgetId, questionId, choiceId) =>
    set((state) => ({
      messages: state.messages.map((message) => {
        if (message.kind !== "quiz_widget" || message.quizWidget?.id !== widgetId) {
          return message;
        }

        const answers = message.quizWidget.answers ?? {};
        return {
          ...message,
          quizWidget: {
            ...message.quizWidget,
            answers: {
              ...answers,
              [questionId]: choiceId,
            },
          },
        };
      }),
    })),
  submitQuizWidget: (widgetId) =>
    set((state) => ({
      messages: state.messages.map((message) => {
        if (message.kind !== "quiz_widget" || message.quizWidget?.id !== widgetId) {
          return message;
        }

        return {
          ...message,
          quizWidget: {
            ...message.quizWidget,
            submitted: true,
          },
        };
      }),
    })),
  clearMessages: () => set({ messages: [] }),
}));
