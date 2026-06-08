import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth.store';
import { ROLE_TABS } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

const TAB_ICONS: Record<string, string> = {
  Chat: 'chat-processing',
  History: 'history',
  Study: 'book-open-variant',
  Guidelines: 'clipboard-text',
  Cases: 'stethoscope',
  'Care Plans': 'heart-pulse',
};

export default function ClinicalLayout() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'student_med';
  const tabs = ROLE_TABS[role] ?? ['Chat', 'History', 'Study'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: { borderTopColor: COLORS.border },
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      {tabs.includes('Chat') && (
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="chat-processing" size={size} color={color} />
            ),
          }}
        />
      )}
      {tabs.includes('History') && (
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="history" size={size} color={color} />
            ),
          }}
        />
      )}
      {tabs.includes('Study') && (
        <Tabs.Screen
          name="study"
          options={{
            title: 'Study',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="book-open-variant" size={size} color={color} />
            ),
          }}
        />
      )}
    </Tabs>
  );
}
