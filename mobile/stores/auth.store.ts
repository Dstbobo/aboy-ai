import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { UserRole } from '@/constants/roles';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  subRole?: string;
  fullName?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, token: string) => Promise<void>;
  updateRoleInfo: (role: UserRole, subRole: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

const TOKEN_KEY = 'aboy_auth_token';
const USER_KEY  = 'aboy_user';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (user, token) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  updateRoleInfo: async (role, subRole) => {
    const current = get().user;
    if (!current) return;
    const updated: User = { ...current, role, subRole };
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updated));
    set({ user: updated });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadFromStorage: async () => {
    try {
      const [token, userStr] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);
      if (token && userStr) {
        const user: User = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
