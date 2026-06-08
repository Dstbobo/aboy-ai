import { useAuthStore } from '@/stores/auth.store';
import { isStudent, isAdmin, STUDENT_ROLES, PRO_ROLES, type UserRole } from '@/constants/roles';

export function useRole() {
  const user = useAuthStore((s) => s.user);
  const role = (user?.role ?? 'student_med') as UserRole;

  return {
    role,
    isStudent: isStudent(role),
    isPro: PRO_ROLES.includes(role),
    isAdmin: isAdmin(role),
    can: (allowedRoles: UserRole[]) => allowedRoles.includes(role),
  };
}
