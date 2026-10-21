/** Turns calendar dates selected in the UI into an inclusive São Paulo date range. */
export function saoPauloDateRange(start?: string, end?: string) {
  return {
    ...(start ? { gte: new Date(`${start}T00:00:00-03:00`) } : {}),
    ...(end ? { lt: new Date(`${nextDate(end)}T00:00:00-03:00`) } : {}),
  };
}

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
