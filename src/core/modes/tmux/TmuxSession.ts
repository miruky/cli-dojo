import { clear, el } from "../../../util/dom";
import { Pane, type AppInstance } from "../../panes/Pane";
import type { History } from "../../terminal/History";
import type { VFS } from "../../vfs/VFS";

type Dir = "left" | "right" | "up" | "down";
type Leaf = { kind: "leaf"; pane: Pane };
type Split = { kind: "split"; dir: "row" | "col"; a: Node; b: Node; ratio: number };
type Node = Leaf | Split;

interface TmuxWindow {
  name: string;
  root: Node;
  active: Pane;
}

export interface TmuxOptions {
  history: History;
  vfs: VFS;
  onExit: () => void;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** tmux セッション: ウィンドウ/ペイン多重化 + ステータスバー + prefix Ctrl-b。 */
export class TmuxSession implements AppInstance {
  readonly el: HTMLElement;
  private content: HTMLElement;
  private statusBar: HTMLElement;
  private windows: TmuxWindow[] = [];
  private current = 0;
  private prefixPending = false;
  private cmdMode = false;
  private cmdBuffer = "";
  private timer: number;

  constructor(private opts: TmuxOptions) {
    this.content = el("div", { class: "tmux-content" });
    this.statusBar = el("div", { class: "tmux-status" });
    this.el = el("div", { class: "tmux-session" }, [this.content, this.statusBar]);
    this.timer = window.setInterval(() => this.renderStatus(), 30000);
  }

  start(): void {
    this.newWindow("bash");
    this.renderStatus();
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }

  // ---- ウィンドウ ----
  private newWindow(name: string): void {
    const pane = this.newPane();
    const win: TmuxWindow = { name, root: { kind: "leaf", pane }, active: pane };
    this.windows.push(win);
    this.current = this.windows.length - 1;
    this.renderContent();
    pane.mount();
    this.wirePane(pane);
    this.fit();
    this.setActive(pane);
    this.renderStatus();
  }

  private selectWindow(i: number): void {
    if (i < 0 || i >= this.windows.length || i === this.current) return;
    this.current = i;
    this.renderContent();
    this.fit();
    this.setActive(this.win().active);
    this.renderStatus();
  }

  private win(): TmuxWindow {
    return this.windows[this.current];
  }

  // ---- ペイン ----
  private newPane(): Pane {
    return new Pane({
      history: this.opts.history,
      vfs: this.opts.vfs,
      onFocusRequest: (p) => this.setActive(p),
    });
  }

  private wirePane(pane: Pane): void {
    // Ctrl-b を横取りするため、データハンドラを差し替える
    pane.terminal.setDataHandler((d) => this.handleData(pane, d));
  }

  private collect(node: Node = this.win().root, out: Pane[] = []): Pane[] {
    if (node.kind === "leaf") out.push(node.pane);
    else {
      this.collect(node.a, out);
      this.collect(node.b, out);
    }
    return out;
  }

  private findLeaf(pane: Pane, node: Node = this.win().root): Leaf | null {
    if (node.kind === "leaf") return node.pane === pane ? node : null;
    return this.findLeaf(pane, node.a) ?? this.findLeaf(pane, node.b);
  }
  private findParent(target: Node, node: Node = this.win().root, parent: Split | null = null): Split | null {
    if (node === target) return parent;
    if (node.kind === "split") return this.findParent(target, node.a, node) ?? this.findParent(target, node.b, node);
    return null;
  }
  private replaceNode(target: Node, replacement: Node): void {
    const w = this.win();
    if (w.root === target) {
      w.root = replacement;
      return;
    }
    const parent = this.findParent(target);
    if (!parent) return;
    if (parent.a === target) parent.a = replacement;
    else parent.b = replacement;
  }

  private setActive(pane: Pane): void {
    this.win().active = pane;
    for (const p of this.collect()) p.setActive(p === pane);
    pane.focus();
  }

  private split(dir: "row" | "col"): void {
    const active = this.win().active;
    const leaf = this.findLeaf(active);
    if (!leaf) return;
    const np = this.newPane();
    const split: Split = { kind: "split", dir, a: { kind: "leaf", pane: active }, b: { kind: "leaf", pane: np }, ratio: 0.5 };
    this.replaceNode(leaf, split);
    this.renderContent();
    np.mount();
    this.wirePane(np);
    this.fit();
    this.setActive(np);
  }

  private killPane(): void {
    const panes = this.collect();
    if (panes.length <= 1) {
      this.killWindow();
      return;
    }
    const leaf = this.findLeaf(this.win().active);
    if (!leaf) return;
    const parent = this.findParent(leaf);
    if (!parent) return;
    const sibling = parent.a === leaf ? parent.b : parent.a;
    this.replaceNode(parent, sibling);
    this.renderContent();
    this.fit();
    this.setActive(this.collect()[0]);
  }

  private killWindow(): void {
    this.windows.splice(this.current, 1);
    if (this.windows.length === 0) {
      this.detach();
      return;
    }
    this.current = Math.min(this.current, this.windows.length - 1);
    this.renderContent();
    this.fit();
    this.setActive(this.win().active);
    this.renderStatus();
  }

  private cyclePane(): void {
    const panes = this.collect();
    const idx = panes.indexOf(this.win().active);
    this.setActive(panes[(idx + 1) % panes.length]);
  }

  private navigate(dir: Dir): void {
    const cur = this.win().active.rect();
    const cx = cur.left + cur.width / 2;
    const cy = cur.top + cur.height / 2;
    let best: Pane | null = null;
    let bestDist = Infinity;
    for (const p of this.collect()) {
      if (p === this.win().active) continue;
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
    if (best) this.setActive(best);
  }

  private detach(): void {
    this.opts.onExit();
  }

  // ---- レンダリング ----
  private buildDom(node: Node): HTMLElement {
    if (node.kind === "leaf") return node.pane.el;
    const aEl = this.buildDom(node.a);
    const bEl = this.buildDom(node.b);
    aEl.style.flex = `${node.ratio} 1 0`;
    bEl.style.flex = `${1 - node.ratio} 1 0`;
    const divider = el("div", { class: "pane-divider " + (node.dir === "row" ? "pane-divider-v" : "pane-divider-h") });
    return el("div", { class: `pane-split pane-split-${node.dir}` }, [aEl, divider, bEl]);
  }
  private renderContent(): void {
    clear(this.content);
    this.content.append(this.buildDom(this.win().root));
    this.content.classList.toggle("has-splits", this.collect().length > 1);
  }

  private renderStatus(): void {
    clear(this.statusBar);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const dateStr = `${hh}:${mm} ${String(now.getDate()).padStart(2, "0")}-${MON[now.getMonth()]}-${String(now.getFullYear()).slice(2)}`;

    const session = el("span", { class: "tmux-session-name", text: "[0] " });
    const tabs = el("div", { class: "tmux-tabs" });
    this.windows.forEach((w, i) => {
      const flag = i === this.current ? "*" : i === this.windows.length - 1 ? "-" : "";
      tabs.append(
        el("span", { class: "tmux-tab" + (i === this.current ? " tmux-tab-active" : ""), text: ` ${i}:${w.name}${flag} ` }),
      );
    });
    const right = el("span", { class: "tmux-status-right", text: `"cli-dojo" ${dateStr} ` });
    this.statusBar.append(session, tabs, el("span", { class: "tmux-spacer" }), right);
  }

  fit(): void {
    for (const p of this.collect()) p.fit();
  }
  focus(): void {
    this.win().active.focus();
  }

  // ---- 入力 (prefix Ctrl-b) ----
  private handleData(pane: Pane, data: string): void {
    if (this.cmdMode) {
      this.handleCmdInput(data);
      return;
    }
    if (this.prefixPending) {
      this.prefixPending = false;
      this.handlePrefixKey(data);
      return;
    }
    if (data === "\x02") {
      this.prefixPending = true;
      return;
    }
    pane.editor.onData(data);
  }

  private handlePrefixKey(key: string): void {
    if (/^[0-9]$/.test(key)) {
      this.selectWindow(parseInt(key, 10));
      return;
    }
    switch (key) {
      case "c":
        this.newWindow("bash");
        break;
      case "n":
        this.selectWindow((this.current + 1) % this.windows.length);
        break;
      case "p":
        this.selectWindow((this.current - 1 + this.windows.length) % this.windows.length);
        break;
      case "%":
        this.split("row");
        break;
      case '"':
        this.split("col");
        break;
      case "o":
        this.cyclePane();
        break;
      case "x":
        this.killPane();
        break;
      case "&":
        this.killWindow();
        break;
      case "d":
        this.detach();
        break;
      case "\x1b[A":
        this.navigate("up");
        break;
      case "\x1b[B":
        this.navigate("down");
        break;
      case "\x1b[C":
        this.navigate("right");
        break;
      case "\x1b[D":
        this.navigate("left");
        break;
      case "[":
        this.win().active.terminal.term.scrollLines(-10);
        break;
      case "z":
        break; // zoom (未実装)
      case ":":
        this.enterCmdMode();
        break;
      case "\x02":
        this.win().active.editor.onData("\x02"); // Ctrl-b 自体を送る
        break;
      default:
        break;
    }
  }

  private enterCmdMode(): void {
    this.cmdMode = true;
    this.cmdBuffer = "";
    this.statusBar.classList.add("tmux-cmd");
    clear(this.statusBar);
    this.statusBar.append(el("span", { class: "tmux-cmd-prompt", text: ":" }), el("span", { class: "tmux-cmd-text", text: "" }));
  }
  private handleCmdInput(data: string): void {
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        this.runTmuxCommand(this.cmdBuffer.trim());
        this.exitCmdMode();
        return;
      }
      if (ch === "\x1b") {
        this.exitCmdMode();
        return;
      }
      if (ch === "\x7f") this.cmdBuffer = this.cmdBuffer.slice(0, -1);
      else if (ch >= " ") this.cmdBuffer += ch;
    }
    const text = this.statusBar.querySelector(".tmux-cmd-text");
    if (text) text.textContent = this.cmdBuffer;
  }
  private exitCmdMode(): void {
    this.cmdMode = false;
    this.statusBar.classList.remove("tmux-cmd");
    this.renderStatus();
  }
  private runTmuxCommand(cmd: string): void {
    const parts = cmd.split(/\s+/);
    const c = parts[0];
    if (c === "new-window" || c === "neww") this.newWindow(parts.includes("-n") ? parts[parts.indexOf("-n") + 1] : "bash");
    else if (c === "split-window" || c === "splitw") this.split(parts.includes("-h") ? "row" : "col");
    else if (c === "kill-pane" || c === "killp") this.killPane();
    else if (c === "kill-window" || c === "killw") this.killWindow();
    else if (c === "detach" || c === "detach-client") this.detach();
    else if (c === "rename-window" || c === "renamew") this.win().name = parts[1] ?? this.win().name;
    else if (c === "next-window" || c === "next") this.selectWindow((this.current + 1) % this.windows.length);
    else if (c === "previous-window" || c === "prev") this.selectWindow((this.current - 1 + this.windows.length) % this.windows.length);
  }
}
