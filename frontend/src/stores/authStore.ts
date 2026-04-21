import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  native_language: string;
  cefr_level: string;
  role: "learner" | "admin";
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isBootstrapped: boolean;

  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
  setBootstrapped: (value: boolean) => void;
  updateUser: (updates: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isBootstrapped: false,

      setSession: (token, user) =>
        set({
          token,
          user,
          isAuthenticated: true,
          isBootstrapped: true,
        }),

      clearSession: () =>
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          isBootstrapped: true,
        }),

      setBootstrapped: (value) => set({ isBootstrapped: value }),

      updateUser: (updates) =>
        set((s) => ({
          user: s.user ? { ...s.user, ...updates } : null,
        })),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }),
    }
  )
);
