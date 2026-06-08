import { useAuthStore } from '@/stores/auth.store';
import { isStudentRole, isProRole, isAdmin, type UserRole } from '@/constants/roles';

export function useRole() {
  const user = useAuthStore((s) => s.user);
  const role = (user?.role ?? 'student_med') as UserRole;

  return {
    role,
    isStudent: isStudentRole(role),
    isPro: isProRole(role),
    isAdmin: isAdmin(role),
    can: (allowedRoles: UserRole[]) => allowedRoles.includes(role),
  };
}
