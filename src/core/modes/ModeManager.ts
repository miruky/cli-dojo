import { Emitter } from "../../util/emitter";
import { MODES, type ModeId, type ModeMeta } from "./types";

/** 現在のモードを保持し、変更を通知する。挙動の差し替えは後続フェーズで各モードが購読する。 */
export class ModeManager {
  private current: ModeId = "linux";
  readonly changed = new Emitter<ModeMeta>();

  get id(): ModeId {
    return this.current;
  }

  get meta(): ModeMeta {
    return MODES[this.current];
  }

  set(id: ModeId): void {
    if (id === this.current) return;
    this.current = id;
    this.changed.emit(MODES[id]);
  }
}
