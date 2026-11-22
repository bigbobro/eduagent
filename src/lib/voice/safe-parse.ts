export function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
