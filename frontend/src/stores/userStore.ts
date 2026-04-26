import { create } from "zustand";

interface UserState {
  userId: string;
  userName: string;
  level: string;
  topic: string;
  sessionStats: {
    totalSessions: number;
    totalMinutes: number;
    averageScore: number;
  };

  setUser: (userId: string, userName: string) => void;
  setLevel: (level: string) => void;
  setTopic: (topic: string) => void;
  updateStats: (stats: Partial<UserState["sessionStats"]>) => void;
}

export const useUserStore = create<UserState>((set) => ({
  userId: `user-${Date.now()}`,
  userName: "Học viên",
  level: "B1",
  topic: "free_conversation",
  sessionStats: {
    totalSessions: 0,
    totalMinutes: 0,
    averageScore: 0,
  },

  setUser: (userId, userName) => set({ userId, userName }),
  setLevel: (level) => set({ level }),
  setTopic: (topic) => set({ topic }),
  updateStats: (stats) =>
    set((s) => ({ sessionStats: { ...s.sessionStats, ...stats } })),
}));
