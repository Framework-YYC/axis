export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}
