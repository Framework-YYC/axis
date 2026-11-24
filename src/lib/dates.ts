/** Device-aware calendar dates as YYYY-MM-DD in the viewer's own timezone. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const localToday = () => ymd(new Date());
export function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + days));
}
export function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function pretty(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  return new Intl.DateTimeFormat(undefined, opts).format(parse(date));
}
export function relative(date: string, today = localToday()): string {
  const diff = Math.round((parse(date).getTime() - parse(today).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days overdue`;
  if (diff < 7) return pretty(date, { weekday: "long" });
  return pretty(date);
}
