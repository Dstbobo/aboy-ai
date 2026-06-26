import * as StoreReview from 'expo-store-review';

/**
 * Native Google Play in-app review prompt.
 *
 * We *ask* after the 2nd successful answer in an app session, but Google's
 * In-App Review API decides whether to actually show the card and throttles it
 * to roughly once every few days per user — we cannot force it more often, and
 * that's by design (protects the app from looking spammy). Counters live at
 * module scope, so they reset when the app is fully restarted = one "session".
 */
let answersThisSession = 0;
let askedThisSession = false;

export function resetReviewSession(): void {
  answersThisSession = 0;
  askedThisSession = false;
}

/** Call once per successfully-completed answer. */
export async function maybeAskForReview(): Promise<void> {
  answersThisSession += 1;
  if (askedThisSession || answersThisSession !== 2) return;
  askedThisSession = true;
  try {
    const available = await StoreReview.isAvailableAsync();
    const hasAction = await StoreReview.hasAction();
    if (available && hasAction) {
      await StoreReview.requestReview();
    }
  } catch {
    // Never let a review prompt failure affect the chat flow.
  }
}
