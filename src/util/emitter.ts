/** 最小の型付きイベントエミッタ。on() は購読解除関数を返す。 */
export class Emitter<T> {
  private handlers = new Set<(value: T) => void>();

  on(fn: (value: T) => void): () => void {
    this.handlers.add(fn);
    return () => {
      this.handlers.delete(fn);
    };
  }

  emit(value: T): void {
    for (const fn of [...this.handlers]) fn(value);
  }

  clear(): void {
    this.handlers.clear();
  }
}
