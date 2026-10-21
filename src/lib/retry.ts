const RETRY_BASE_MS = 60_000;

export function retryAt(attempt: number, now: Date) {
  const delay = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), 24 * 60 * 60_000);
  return new Date(now.getTime() + delay);
}
