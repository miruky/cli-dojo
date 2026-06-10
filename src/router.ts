import { Emitter } from "./util/emitter";

/** 端末 / レッスン / カード問題集 の画面切替。 */
export type ViewId = "terminal" | "lessons" | "cards";

export class Router {
  private current: ViewId = "terminal";
  readonly changed = new Emitter<ViewId>();

  get view(): ViewId {
    return this.current;
  }

  go(view: ViewId): void {
    if (view === this.current) return;
    this.current = view;
    this.changed.emit(view);
  }
}
