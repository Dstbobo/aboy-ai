import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device-local nudges that drive the daily-return habit. These are scheduled
 * on-device (no server cron needed) and refreshed every time the user opens
 * the app, so they only fire if the user has NOT come back:
 *
 *  - Streak-at-risk: tomorrow late-morning if they're on a streak.
 *  - Evening study reminder: tonight if they haven't been active.
 *
 * Re-opening the app reschedules (pushing the fire time forward), so an active
 * user never actually receives them — only a lapsing user does.
 */
const NUDGE_KEY = 'aboy-nudge-name';

async function ensurePermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

function nextAt(hour: number, addDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

export async function setNudgeName(name: string) {
  try {
    await AsyncStorage.setItem(NUDGE_KEY, name.split(' ')[0] || '');
  } catch {}
}

async function name(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(NUDGE_KEY)) || 'there';
  } catch {
    return 'there';
  }
}

export async function scheduleStreakNudges(streak: number): Promise<void> {
  if (!(await ensurePermission())) return;
  const who = await name();

  // Clear previously-scheduled nudges so we always push the fire time forward.
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    return;
  }

  const schedule = async (title: string, body: string, when: Date) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    } catch {}
  };

  // 1) Streak-at-risk — only if there's a streak worth protecting.
  if (streak >= 1) {
    await schedule(
      'Keep your streak alive 🔥',
      `You're on a ${streak} day streak, ${who}. Do not break it — a quick session today keeps it going.`,
      nextAt(11, 1),
    );
  }

  // 2) Evening study reminder for tonight.
  await schedule(
    `Good evening, ${who}`,
    '10 minutes of study before bed? Pick up where you left off.',
    nextAt(20),
  );
}
