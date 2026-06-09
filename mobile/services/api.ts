import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './auth.service';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Always attach a *fresh* access token. The Supabase client owns the session
 * and auto-refreshes it, so getSession() returns a valid (refreshed) token
 * even after the original one expired (~1h). We fall back to the legacy
 * snapshot only if there is no Supabase session.
 */
async function currentAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  } catch (e) {
    console.warn('[api] getSession failed:', (e as Error)?.message);
  }
  return SecureStore.getItemAsync('aboy_auth_token');
}

api.interceptors.request.use(async (config) => {
  const token = await currentAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (__DEV__) {
    console.log(`[api] → ${config.method?.toUpperCase()} ${config.url} (auth: ${token ? 'yes' : 'NONE'})`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (__DEV__) console.log(`[api] ← ${response.status} ${response.config.url}`);
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    const detail = error.response?.data?.detail ?? error.message;
    console.warn(`[api] ✖ ${status ?? 'network'} ${url} — ${JSON.stringify(detail)}`);

    // On 401, try a one-time forced refresh + retry before giving up.
    if (status === 401 && !error.config?._retried) {
      try {
        const { data, error: refErr } = await supabase.auth.refreshSession();
        if (!refErr && data.session?.access_token) {
          console.log('[api] refreshed session after 401 — retrying request');
          error.config._retried = true;
          error.config.headers.Authorization = `Bearer ${data.session.access_token}`;
          return api.request(error.config);
        }
      } catch (e) {
        console.warn('[api] refresh after 401 failed:', (e as Error)?.message);
      }
      // Refresh genuinely failed — clear stale creds so the guard re-routes to login.
      await SecureStore.deleteItemAsync('aboy_auth_token');
      await SecureStore.deleteItemAsync('aboy_user');
    }
    return Promise.reject(error);
  },
);
