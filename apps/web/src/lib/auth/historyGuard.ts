// Keeps the browser's Back button from walking into pages from BEFORE the current sign-in
// (e.g. the previous user's screens in this tab). Uses the Navigation API's entry index
// (Chromium-based browsers); elsewhere it does nothing and the normal guards still apply.

const KEY = 'relay:session-start';

const currentIndex = (): number | null =>
  (globalThis as { navigation?: { currentEntry?: { index: number } } }).navigation?.currentEntry?.index ?? null;

/** Call right after signing in: history entries before this one belong to an earlier session. */
export function markSessionStart(): void {
  const index = currentIndex();
  if (index === null) return;
  try {
    sessionStorage.setItem(KEY, String(index));
  } catch {
    // Storage blocked: the guard just stays off
  }
}

export function clearSessionStart(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** How many steps forward to get back into the current session (0 = we're inside it). */
export function stepsBackIntoSession(): number {
  const index = currentIndex();
  let start: string | null = null;
  try {
    start = sessionStorage.getItem(KEY);
  } catch {
    return 0;
  }
  if (index === null || start === null) return 0;
  return Math.max(0, Number(start) - index);
}
