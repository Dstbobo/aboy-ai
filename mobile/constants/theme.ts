import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const COLORS = {
  primary: '#0a5f52',
  primaryLight: '#1a8a78',
  primaryDark: '#064038',
  secondary: '#e8f5f2',
  accent: '#f0a500',
  error: '#d32f2f',
  warning: '#f57c00',
  success: '#388e3c',
  surface: '#ffffff',
  background: '#f5f7fa',
  text: '#1a1a2e',
  textSecondary: '#6b7280',
  border: '#e5e7eb',
  emergency: '#d32f2f',
  emergencyLight: '#ffebee',
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: COLORS.primary,
    secondary: COLORS.primaryLight,
    background: COLORS.background,
    surface: COLORS.surface,
    error: COLORS.error,
    onPrimary: '#ffffff',
    onSurface: COLORS.text,
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: COLORS.primaryLight,
    secondary: COLORS.primary,
    background: '#0f0f1a',
    surface: '#1a1a2e',
    error: '#ef5350',
    onPrimary: '#ffffff',
    onSurface: '#f1f5f9',
  },
};
