import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

WebBrowser.maybeCompleteAuthSession();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // secure OAuth on mobile (code -> exchangeCodeForSession)
  },
});

// Remember the last sign-in method so the landing can show a "you used Google
// last time" hint for returning users.
const LAST_METHOD_KEY = 'aboy_last_auth_method';
export async function setLastAuthMethod(method: 'google' | 'email') {
  try { await SecureStore.setItemAsync(LAST_METHOD_KEY, method); } catch {}
}
export async function getLastAuthMethod(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(LAST_METHOD_KEY); } catch { return null; }
}

export class AuthCancelled extends Error {}

/**
 * Continue with Google via Supabase OAuth (PKCE). Opens Google in a secure
 * in-app browser, then exchanges the returned code for a session. Returns the
 * user + token and whether they have completed onboarding before.
 */
export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth-callback'); // aboyai://auth-callback
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) throw new AuthCancelled('cancelled');

  const code = Linking.parse(result.url).queryParams?.code as string | undefined;
  if (!code) throw new Error('No authorization code returned from Google.');

  const { data: sess, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;

  const u = sess.user!;
  await setLastAuthMethod('google');
  return {
    token: sess.session!.access_token,
    user: {
      id: u.id,
      email: u.email ?? '',
      role: (u.app_metadata?.role as string) ?? 'student_med',
      fullName: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string),
    },
    onboarded: Boolean(u.user_metadata?.onboarded),
  };
}

/** Mark this account as having finished onboarding (server-side, so it persists
 * across reinstalls — used to skip onboarding for returning Google users). */
export async function markOnboardedOnServer() {
  try { await supabase.auth.updateUser({ data: { onboarded: true } }); } catch {}
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const role = data.user?.app_metadata?.role ?? 'student_med';
  return {
    token: data.session!.access_token,
    user: {
      id: data.user!.id,
      email: data.user!.email!,
      role,
      fullName: data.user?.user_metadata?.full_name,
    },
  };
}

export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function refreshSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return data.session?.access_token;
}
