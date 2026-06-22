import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { UserRole } from '@/constants/roles';
import { markOnboardedOnServer } from '@/services/auth.service';

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
  needsOnboarding: boolean;
  setAuth: (user: User, token: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  beginOnboarding: () => Promise<void>;
  updateRoleInfo: (role: UserRole, subRole: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

const TOKEN_KEY      = 'aboy_auth_token';
const USER_KEY       = 'aboy_user';
const ONBOARDING_KEY = 'aboy_needs_onboarding';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  needsOnboarding: false,

  setAuth: async (user, token) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
    set({ user, token, isAuthenticated: true, needsOnboarding: true });
  },

  completeOnboarding: async () => {
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    set({ needsOnboarding: false });
    // Persist server-side so a returning Google user (even on a fresh install)
    // skips onboarding next time.
    try {
      await markOnboardedOnServer();
    } catch {}
  },

  // Used by "Change Role" — re-enters the onboarding flow for an already
  // authenticated user so the AuthGuard permits the onboarding screens.
  beginOnboarding: async () => {
    await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
    set({ needsOnboarding: true });
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
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    set({ user: null, token: null, isAuthenticated: false, needsOnboarding: false });
  },

  loadFromStorage: async () => {
    try {
      const [token, userStr, onboardingFlag] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
        SecureStore.getItemAsync(ONBOARDING_KEY),
      ]);
      if (token && userStr) {
        const user: User = JSON.parse(userStr);
        const needsOnboarding = onboardingFlag === 'true';
        set({ user, token, isAuthenticated: true, needsOnboarding, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
