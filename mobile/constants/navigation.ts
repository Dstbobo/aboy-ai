import { isAdmin, type UserRole } from './roles';

export interface DrawerItem {
  key: string;
  label: string;
  icon: string; // MaterialCommunityIcons name
  route: string;
}

const NEW_CHAT: DrawerItem   = { key: 'new',        label: 'New Chat',    icon: 'plus',               route: '/(clinical)/chat' };
const HISTORY: DrawerItem    = { key: 'history',    label: 'History',     icon: 'history',            route: '/(clinical)/history' };
const STUDY: DrawerItem      = { key: 'study',      label: 'Study',       icon: 'book-open-variant',  route: '/(clinical)/study' };
const FLASHCARDS: DrawerItem = { key: 'flashcards', label: 'Flashcards',  icon: 'cards-outline',      route: '/(clinical)/flashcards' };
const QUIZ: DrawerItem       = { key: 'quiz',       label: 'Quiz',        icon: 'help-circle-outline', route: '/(clinical)/chat' };
const PROJECT: DrawerItem    = { key: 'project',    label: 'My Project',  icon: 'file-document-edit-outline', route: '/(clinical)/project' };
const GUIDELINES: DrawerItem = { key: 'guidelines', label: 'Guidelines',  icon: 'clipboard-text',     route: '/(clinical)/guidelines' };
const CASES: DrawerItem      = { key: 'cases',      label: 'Cases',       icon: 'stethoscope',        route: '/(clinical)/cases' };
const REPORTS: DrawerItem    = { key: 'reports',    label: 'Reports',     icon: 'chart-box-outline',  route: '/(clinical)/reports' };
const LITERATURE: DrawerItem = { key: 'literature', label: 'Literature',  icon: 'book-search-outline', route: '/(clinical)/literature' };
const USERS: DrawerItem      = { key: 'users',      label: 'Users',       icon: 'account-group',      route: '/(admin)/users' };
const AUDIT: DrawerItem      = { key: 'audit',      label: 'Audit Log',   icon: 'shield-check',       route: '/(admin)/audit' };

// Every user gets the same full toolkit — role NEVER restricts features.
// Adaptation happens in the answers, not in access. Admin adds admin-only tools.
const COMMON_ITEMS: DrawerItem[] = [
  NEW_CHAT, HISTORY, STUDY, FLASHCARDS, QUIZ, PROJECT, GUIDELINES, CASES, LITERATURE, REPORTS,
];

export function getDrawerItems(role: UserRole): DrawerItem[] {
  if (isAdmin(role)) return [...COMMON_ITEMS, USERS, AUDIT];
  return COMMON_ITEMS;
}
