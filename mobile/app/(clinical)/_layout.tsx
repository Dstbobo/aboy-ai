import { Stack } from 'expo-router';

export default function ClinicalLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' } }}>
      <Stack.Screen name="chat" />
      <Stack.Screen name="history" />
      <Stack.Screen name="study" />
      <Stack.Screen name="guidelines" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
