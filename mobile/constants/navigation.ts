import { isAdmin, isProRole, type UserRole } from './roles';

export interface DrawerItem {
  key: string;
  label: string;
  icon: string; // MaterialCommunityIcons name
  route: string;
}

const NEW_CHAT: DrawerItem = { key: 'new', label: 'New Chat', icon: 'plus', route: '/(clinical)/chat' };
const HISTORY: DrawerItem = { key: 'history', label: 'History', icon: 'history', route: '/(clinical)/history' };
const STUDY: DrawerItem = { key: 'study', label: 'Study', icon: 'book-open-variant', route: '/(clinical)/study' };
const GUIDELINES: DrawerItem = { key: 'guidelines', label: 'Guidelines', icon: 'clipboard-text', route: '/(clinical)/guidelines' };
const USERS: DrawerItem = { key: 'users', label: 'Users', icon: 'account-group', route: '/(admin)/users' };
const AUDIT: DrawerItem = { key: 'audit', label: 'Audit Log', icon: 'shield-check', route: '/(admin)/audit' };
const SETTINGS: DrawerItem = { key: 'settings', label: 'Settings', icon: 'cog', route: '/(clinical)/settings' };

/**
 * Role-aware side-drawer items:
 *   Students      → New Chat, History, Study, Settings
 *   Professionals → New Chat, History, Guidelines, Settings
 *   Admin         → New Chat, History, Users, Audit Log, Settings
 */
export function getDrawerItems(role: UserRole): DrawerItem[] {
  if (isAdmin(role)) {
    return [NEW_CHAT, HISTORY, USERS, AUDIT, SETTINGS];
  }
  if (isProRole(role)) {
    return [NEW_CHAT, HISTORY, GUIDELINES, SETTINGS];
  }
  return [NEW_CHAT, HISTORY, STUDY, SETTINGS];
}
