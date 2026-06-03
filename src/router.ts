import { Emitter } from "./util/emitter";

/** 端末画面とレッスン画面の切替。 */
export type ViewId = "terminal" | "lessons";

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
