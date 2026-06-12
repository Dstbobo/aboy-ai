import {
  isAdmin,
  isEducatorRole,
  isOpsRole,
  isProRole,
  isResearcherRole,
  type UserRole,
} from './roles';

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
const PROJECT: DrawerItem    = { key: 'project',    label: 'My Project',  icon: 'file-document-edit-outline', route: '/(clinical)/project' };
const GUIDELINES: DrawerItem = { key: 'guidelines', label: 'Guidelines',  icon: 'clipboard-text',     route: '/(clinical)/guidelines' };
const CASES: DrawerItem      = { key: 'cases',      label: 'Cases',       icon: 'stethoscope',        route: '/(clinical)/cases' };
const REPORTS: DrawerItem    = { key: 'reports',    label: 'Reports',     icon: 'chart-box-outline',  route: '/(clinical)/reports' };
const STUDENTS: DrawerItem   = { key: 'students',   label: 'My Students', icon: 'account-school-outline', route: '/(clinical)/students' };
const LITERATURE: DrawerItem = { key: 'literature', label: 'Literature',  icon: 'book-search-outline', route: '/(clinical)/literature' };
const USERS: DrawerItem      = { key: 'users',      label: 'Users',       icon: 'account-group',      route: '/(admin)/users' };
const AUDIT: DrawerItem      = { key: 'audit',      label: 'Audit Log',   icon: 'shield-check',       route: '/(admin)/audit' };

/**
 * Role-aware side-drawer items (Settings lives on the footer gear, not here):
 *   Students      → New Chat, History, Study, Flashcards, My Project
 *   Professionals → New Chat, History, Guidelines, Cases
 *   Operations    → New Chat, History, Reports
 *   Educators     → New Chat, History, Study, My Students
 *   Researchers   → New Chat, History, Literature
 *   Admin         → New Chat, History, Users, Audit Log
 */
export function getDrawerItems(role: UserRole): DrawerItem[] {
  if (isAdmin(role)) return [NEW_CHAT, HISTORY, USERS, AUDIT];
  if (isEducatorRole(role)) return [NEW_CHAT, HISTORY, STUDY, STUDENTS];
  if (isResearcherRole(role)) return [NEW_CHAT, HISTORY, LITERATURE];
  if (isOpsRole(role)) return [NEW_CHAT, HISTORY, REPORTS];
  if (isProRole(role)) return [NEW_CHAT, HISTORY, GUIDELINES, CASES];
  return [NEW_CHAT, HISTORY, STUDY, FLASHCARDS, PROJECT]; // students (default)
}

/** Flashcards are only for Students and Educators. */
export function canUseFlashcards(role: UserRole): boolean {
  return role.startsWith('student_') || isEducatorRole(role);
}
