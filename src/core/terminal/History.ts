/** コマンド履歴。localStorage に永続化する。 */
export class History {
  private items: string[] = [];
  private storeKey: string;
  private max = 500;

  constructor(storeKey: string) {
    this.storeKey = storeKey;
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(this.storeKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.items = parsed.filter((x) => typeof x === "string");
      }
    } catch {
      /* localStorage 不可時は無視 */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(this.storeKey, JSON.stringify(this.items.slice(-this.max)));
    } catch {
      /* 無視 */
    }
  }

  add(line: string): void {
    const t = line.trim();
    if (!t) return;
    if (this.items[this.items.length - 1] === t) return;
    this.items.push(t);
    if (this.items.length > this.max) this.items = this.items.slice(-this.max);
    this.save();
  }

  get length(): number {
    return this.items.length;
  }

  get(i: number): string {
    return this.items[i] ?? "";
  }

  all(): readonly string[] {
    return this.items;
  }
}
