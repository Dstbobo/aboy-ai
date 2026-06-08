import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useRole } from '@/hooks/useRole';
import type { UserRole } from '@/constants/roles';

interface Props {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback = null }: Props) {
  const { role } = useRole();
  if (!allowedRoles.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}
