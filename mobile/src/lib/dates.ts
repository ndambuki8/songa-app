/** Local calendar day in `YYYY-MM-DD` form, used to group journal entries. */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "Friday, 31 October" in the device language, falling back to the day key. */
export function formatDayHeading(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  if (!year || !month || !day) return dayKey;
  try {
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return dayKey;
  }
}

export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
