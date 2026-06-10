/** エイリアスの localStorage 永続化。alias/unalias で保存し、Shell 起動時に復元する。 */

const KEY = "cli-dojo.aliases";

export function loadAliases(): Map<string, string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch {
    return null;
  }
}

export function saveAliases(aliases: Map<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(aliases)));
  } catch {
    /* 保存不可ならセッション内のみ */
  }
}
