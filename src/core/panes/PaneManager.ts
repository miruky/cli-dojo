import { clear, el } from "../../util/dom";
import { Pane } from "./Pane";
import type { History } from "../terminal/History";
import { VFS } from "../vfs/VFS";
import { buildInitialFS } from "../vfs/seed";
import type { ModeId } from "../modes/types";

type Dir = "left" | "right" | "up" | "down";
type LeafNode = { kind: "leaf"; pane: Pane };
type SplitNode = { kind: "split"; dir: "row" | "col"; a: LayoutNode; b: LayoutNode; ratio: number };
type LayoutNode = LeafNode | SplitNode;

/**
 * ペインの分割ツリーとレイアウトを管理。キーバインドは利用者の ghostty 設定に準拠:
 * ctrl+h/j/k/l 移動 / ctrl+shift+v 右分割 / ctrl+shift+h 下分割 / ctrl+x 閉じる /
 * ctrl+,/./;/' リサイズ / ctrl+shift+k/j スクロール。
 */
export class PaneManager {
  private root: LayoutNode;
  private active: Pane;
  private vfs: VFS;
  private history: History;
  private container: HTMLElement;
  private onActiveChange?: () => void;
  private onModeChange?: (pane: Pane, mode: ModeId | null) => void;

  constructor(
    container: HTMLElement,
    history: History,
    opts?: {
      onActiveChange?: () => void;
      onModeChange?: (pane: Pane, mode: ModeId | null) => void;
    },
  ) {
    this.container = container;
    this.history = history;
    this.vfs = buildInitialFS();
    this.onActiveChange = opts?.onActiveChange;
    this.onModeChange = opts?.onModeChange;
    const pane = this.newPane();
    this.root = { kind: "leaf", pane };
    this.active = pane;
    this.render();
    pane.mount();
    this.setActive(pane);
    window.addEventListener("keydown", (e) => this.onKey(e), true);
    window.addEventListener("resize", () => this.fitAll());
  }

  get activePane(): Pane {
    return this.active;
  }

  private newPane(): Pane {
    return new Pane({
      history: this.history,
      vfs: this.vfs,
      onFocusRequest: (p) => this.setActive(p),
      onModeChange: (p, m) => this.onModeChange?.(p, m),
    });
  }

  // ---- DOM ----
  private buildDom(node: LayoutNode): HTMLElement {
    if (node.kind === "leaf") return node.pane.el;
    const aEl = this.buildDom(node.a);
    const bEl = this.buildDom(node.b);
    aEl.style.flex = `${node.ratio} 1 0`;
    bEl.style.flex = `${1 - node.ratio} 1 0`;
    const divider = el("div", {
      class: "pane-divider " + (node.dir === "row" ? "pane-divider-v" : "pane-divider-h"),
    });
    return el("div", { class: `pane-split pane-split-${node.dir}` }, [aEl, divider, bEl]);
  }

  private render(): void {
    clear(this.container);
    this.container.append(this.buildDom(this.root));
    this.container.classList.toggle("has-splits", this.paneCount() > 1);
  }

  private fitAll(): void {
    for (const p of this.collectPanes()) p.fit();
  }

  private collectPanes(node: LayoutNode = this.root, out: Pane[] = []): Pane[] {
    if (node.kind === "leaf") out.push(node.pane);
    else {
      this.collectPanes(node.a, out);
      this.collectPanes(node.b, out);
    }
    return out;
  }

  paneCount(): number {
    return this.collectPanes().length;
  }

  private setActive(pane: Pane): void {
    this.active = pane;
    for (const p of this.collectPanes()) p.setActive(p === pane);
    pane.focus();
    this.onActiveChange?.();
  }

  // ---- ツリー操作 ----
  private findParent(target: LayoutNode, node: LayoutNode = this.root, parent: SplitNode | null = null): SplitNode | null {
    if (node === target) return parent;
    if (node.kind === "split") {
      return this.findParent(target, node.a, node) ?? this.findParent(target, node.b, node);
    }
    return null;
  }
  private findLeaf(pane: Pane, node: LayoutNode = this.root): LeafNode | null {
    if (node.kind === "leaf") return node.pane === pane ? node : null;
    return this.findLeaf(pane, node.a) ?? this.findLeaf(pane, node.b);
  }
  private replaceNode(target: LayoutNode, replacement: LayoutNode): void {
    if (this.root === target) {
      this.root = replacement;
      return;
    }
    const parent = this.findParent(target);
    if (!parent) return;
    if (parent.a === target) parent.a = replacement;
    else if (parent.b === target) parent.b = replacement;
  }

  split(dir: "row" | "col"): void {
    const leaf = this.findLeaf(this.active);
    if (!leaf) return;
    const newPane = this.newPane();
    const split: SplitNode = {
      kind: "split",
      dir,
      a: { kind: "leaf", pane: leaf.pane },
      b: { kind: "leaf", pane: newPane },
      ratio: 0.5,
    };
    this.replaceNode(leaf, split);
    this.render();
    newPane.mount();
    this.fitAll();
    this.setActive(newPane);
  }

  closeActive(): void {
    if (this.paneCount() <= 1) return;
    const leaf = this.findLeaf(this.active);
    if (!leaf) return;
    const parent = this.findParent(leaf);
    if (!parent) return;
    const sibling = parent.a === leaf ? parent.b : parent.a;
    this.replaceNode(parent, sibling);
    this.render();
    this.fitAll();
    this.setActive(this.collectPanes()[0]);
  }

  resize(dirKey: string): void {
    const wantRow = dirKey === "," || dirKey === ".";
    let node: LayoutNode | null = this.findLeaf(this.active);
    if (!node) return;
    let parent = this.findParent(node);
    while (parent && (parent.dir === "row") !== wantRow) {
      node = parent;
      parent = this.findParent(node);
    }
    if (!parent) return;
    const grow = dirKey === "." || dirKey === ";"; // 右/下 = アクティブを拡大
    const activeIsA = parent.a === node;
    const sign = grow === activeIsA ? 1 : -1;
    parent.ratio = Math.min(0.85, Math.max(0.15, parent.ratio + sign * 0.06));
    this.render();
    this.fitAll();
    this.setActive(this.active);
  }

  scrollActive(lines: number): void {
    this.active.terminal.term.scrollLines(lines);
  }

  // ---- 空間ナビゲーション ----
  navigate(dir: Dir): boolean {
    const cur = this.active.rect();
    const cx = cur.left + cur.width / 2;
    const cy = cur.top + cur.height / 2;
    let best: Pane | null = null;
    let bestDist = Infinity;
    for (const p of this.collectPanes()) {
      if (p === this.active) continue;
      const r = p.rect();
      let ok = false;
      if (dir === "left") ok = r.right <= cur.left + 2 && r.top < cy && r.bottom > cy;
      else if (dir === "right") ok = r.left >= cur.right - 2 && r.top < cy && r.bottom > cy;
      else if (dir === "up") ok = r.bottom <= cur.top + 2 && r.left < cx && r.right > cx;
      else ok = r.top >= cur.bottom - 2 && r.left < cx && r.right > cx;
      if (!ok) continue;
      const dist = Math.abs(r.left + r.width / 2 - cx) + Math.abs(r.top + r.height / 2 - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    if (best) {
      this.setActive(best);
      return true;
    }
    return false;
  }

  // ---- キーバインド (ghostty 準拠) ----
  private onKey(e: KeyboardEvent): void {
    if (!e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const shift = e.shiftKey;
    const consume = (): void => {
      e.preventDefault();
      e.stopPropagation();
    };

    // 移動 (対象が無ければ素通し → 単一ペインでは readline が ctrl-h/k/l 等を使える)
    if (!shift && (k === "h" || k === "j" || k === "k" || k === "l")) {
      const dir: Dir = k === "h" ? "left" : k === "j" ? "down" : k === "k" ? "up" : "right";
      if (this.navigate(dir)) consume();
      return;
    }
    // 分割
    if (shift && k === "v") {
      consume();
      this.split("row");
      return;
    }
    if (shift && k === "h") {
      consume();
      this.split("col");
      return;
    }
    // 閉じる
    if (!shift && k === "x") {
      if (this.paneCount() > 1) {
        consume();
        this.closeActive();
      }
      return;
    }
    // スクロール
    if (shift && (k === "k" || k === "j")) {
      consume();
      this.scrollActive(k === "k" ? -3 : 3);
      return;
    }
    // リサイズ
    if (!shift && (e.key === "," || e.key === "." || e.key === ";" || e.key === "'")) {
      if (this.paneCount() > 1) {
        consume();
        this.resize(e.key);
      }
      return;
    }
  }
}
