import type { TerminalView } from "../../terminal/TerminalView";
import type { VFS, VNode, FileType } from "../../vfs/VFS";
import { charWidth } from "../../terminal/wcwidth";

export interface EmacsOptions {
  term: TerminalView;
  vfs: VFS;
  cwd: string;
  args: string[];
  onExit: () => void;
}

interface Pos {
  row: number;
  col: number;
}

/** dired (ディレクトリエディタ) の1行ぶんのメタ情報。 */
interface DiredEntry {
  name: string;
  type: FileType;
  mode: number;
  owner: string;
  group: string;
  size: number;
  mtime: Date;
}
interface DiredState {
  dir: string;
  entries: DiredEntry[];
  line: number;
  top: number;
}
/** C-x d で dired に入るとき、戻れるようファイルバッファを退避する。 */
interface FileSnapshot {
  buffer: string[];
  filename: string;
  absPath: string | null;
  bufferName: string;
  point: Pos;
  top: number;
  modified: boolean;
}

const RESET = "\x1b[0m";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Emacs デフォルトキーバインドのエディタ (非モーダル, alt-screen 描画)。 */
export class EmacsEditor {
  private term: TerminalView;
  private vfs: VFS;
  private cwd: string;
  private onExit: () => void;

  private buffer: string[] = [""];
  private filename: string;
  private absPath: string | null;
  private bufferName: string;
  private modified = false;

  private point: Pos = { row: 0, col: 0 };
  private mark: Pos | null = null;
  private top = 0;
  private goalCol = 0;

  private killRing: string[] = [];
  private lastWasKill = false;

  private prefixCx = false;
  private escPending = false;
  private mini: null | "find-file" | "write-file" | "execute" | "goto" | "dired" = null;
  private miniPrompt = "";
  private miniInput = "";
  private echo = "";

  // dired / tab-line
  private dired: DiredState | null = null;
  private tabLine = false;
  private fileSnapshot: FileSnapshot | null = null;

  // isearch
  private isearch: null | { dir: number; query: string; start: Pos } = null;

  private undoStack: Array<{ buffer: string[]; point: Pos }> = [];
  private redoStack: Array<{ buffer: string[]; point: Pos }> = [];
  private done = false;

  constructor(opts: EmacsOptions) {
    this.term = opts.term;
    this.vfs = opts.vfs;
    this.cwd = opts.cwd;
    this.onExit = opts.onExit;
    const arg = opts.args.find((a) => !a.startsWith("-"));
    this.filename = arg ?? "*scratch*";
    this.bufferName = arg ? arg.split("/").pop()! : "*scratch*";
    this.absPath = arg ? this.vfs.resolve(this.cwd, arg) : null;
    // 引数がディレクトリなら dired を開く (ネイティブ emacs と同じ挙動)。
    if (this.absPath) {
      const node = this.vfs.stat(this.absPath);
      if (node && node.type === "dir") {
        this.openDired(this.absPath);
        this.absPath = null; // ディレクトリはファイルバッファではない
        return;
      }
    }
    this.loadFile();
  }

  private loadFile(): void {
    if (this.absPath) {
      const node = this.vfs.stat(this.absPath);
      if (node && node.type === "file") {
        const endsNL = node.content.endsWith("\n");
        const lines = node.content.split("\n");
        if (endsNL) lines.pop();
        this.buffer = lines.length ? lines : [""];
        return;
      }
      this.echo = "(New file)";
    }
    this.buffer = [""];
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[6 q");
    if (!this.dired) this.echo = this.absPath && !this.echo ? `${this.filename}` : this.echo;
    this.draw();
  }
  dispose(): void {
    this.term.term.write("\x1b[?1049l\x1b[0 q");
  }
  fit(): void {
    this.draw();
  }

  /** dired かファイルバッファかで描画を振り分ける。 */
  private draw(): void {
    if (this.dired) this.renderDired();
    else this.render();
  }

  // ===== 入力 =====
  onData(data: string): void {
    for (const token of this.tokenize(data)) {
      this.handleKey(token);
      if (this.done) return;
    }
    if (!this.done) this.draw();
  }

  private tokenize(data: string): string[] {
    const out: string[] = [];
    let i = 0;
    while (i < data.length) {
      const c = data[i];
      if (c === "\x1b") {
        const three = data.substr(i, 3);
        if (three === "\x1b[A") {
          out.push("Up");
          i += 3;
          continue;
        }
        if (three === "\x1b[B") {
          out.push("Down");
          i += 3;
          continue;
        }
        if (three === "\x1b[C") {
          out.push("Right");
          i += 3;
          continue;
        }
        if (three === "\x1b[D") {
          out.push("Left");
          i += 3;
          continue;
        }
        if (data.substr(i, 4) === "\x1b[3~") {
          out.push("C-d");
          i += 4;
          continue;
        }
        if (three === "\x1b[H") {
          out.push("C-a");
          i += 3;
          continue;
        }
        if (three === "\x1b[F") {
          out.push("C-e");
          i += 3;
          continue;
        }
        const nx = data[i + 1];
        if (nx === undefined) {
          out.push("ESC");
          i += 1;
          continue;
        }
        if (nx === "\x7f" || nx === "\x08") {
          out.push("M-DEL");
          i += 2;
          continue;
        }
        out.push("M-" + nx);
        i += 2;
        continue;
      }
      const code = c.charCodeAt(0);
      if (code === 0) out.push("C-Space");
      else if (code === 13 || code === 10) out.push("RET");
      else if (code === 9) out.push("TAB");
      else if (code === 127 || code === 8) out.push("DEL");
      else if (code === 31) out.push("C-/");
      else if (code < 32) out.push("C-" + String.fromCharCode(code + 96));
      else out.push(c);
      i++;
    }
    return out;
  }

  private handleKey(token: string): void {
    if (this.isearch) {
      this.handleIsearch(token);
      return;
    }
    if (this.mini) {
      this.handleMini(token);
      return;
    }
    // ESC を Meta プレフィックスとして扱う (ネイティブ emacs と同じ: ESC x = M-x)。
    if (this.escPending) {
      this.escPending = false;
      if (token === "DEL") token = "M-DEL";
      else if (token.length === 1) token = "M-" + token;
      // それ以外 (矢印/RET 等) はそのまま処理
    } else if (token === "ESC") {
      this.escPending = true;
      this.echo = "ESC-";
      return;
    }
    if (this.prefixCx) {
      this.prefixCx = false;
      this.handleCx(token);
      return;
    }
    if (this.dired) {
      this.handleDired(token);
      return;
    }
    this.echo = "";
    const wasKill = this.lastWasKill;
    this.lastWasKill = false;
    this.dispatch(token, wasKill);
  }

  private dispatch(token: string, wasKill: boolean): void {
    switch (token) {
      case "C-x":
        this.prefixCx = true;
        this.echo = "C-x-";
        break;
      case "C-f":
      case "Right":
        this.moveChar(1);
        break;
      case "C-b":
      case "Left":
        this.moveChar(-1);
        break;
      case "C-n":
      case "Down":
        this.moveLine(1);
        break;
      case "C-p":
      case "Up":
        this.moveLine(-1);
        break;
      case "C-a":
        this.point.col = 0;
        this.goalCol = 0;
        break;
      case "C-e":
        this.point.col = this.line().length;
        this.goalCol = this.point.col;
        break;
      case "M-f":
        this.point = this.wordForward();
        break;
      case "M-b":
        this.point = this.wordBack();
        break;
      case "M-<":
        this.point = { row: 0, col: 0 };
        break;
      case "M->":
        this.point = { row: this.buffer.length - 1, col: this.buffer[this.buffer.length - 1].length };
        break;
      case "C-v":
        this.scroll(this.textRows() - 2);
        break;
      case "M-v":
        this.scroll(-(this.textRows() - 2));
        break;
      case "C-d":
        this.deleteChar();
        break;
      case "DEL":
        this.backspace();
        break;
      case "M-d":
        this.killWordForward();
        this.lastWasKill = true;
        break;
      case "M-DEL":
        this.killWordBack();
        this.lastWasKill = true;
        break;
      case "C-k":
        this.killLine(wasKill);
        this.lastWasKill = true;
        break;
      case "C-y":
        this.yank();
        break;
      case "M-w":
        this.copyRegion();
        break;
      case "C-w":
        this.killRegion();
        break;
      case "C-Space":
      case "C-@":
        this.mark = { ...this.point };
        this.echo = "Mark set";
        break;
      case "C-/":
      case "C-_":
        this.undo();
        break;
      case "C-s":
        this.startIsearch(1);
        break;
      case "C-r":
        this.startIsearch(-1);
        break;
      case "M-x":
        this.mini = "execute";
        this.miniPrompt = "M-x ";
        this.miniInput = "";
        break;
      case "M-g":
        this.mini = "goto";
        this.miniPrompt = "Goto line: ";
        this.miniInput = "";
        break;
      case "C-g":
        this.mark = null;
        this.echo = "Quit";
        break;
      case "C-l":
        this.top = Math.max(0, this.point.row - Math.floor(this.textRows() / 2));
        break;
      case "RET":
        this.insertNewline();
        break;
      case "TAB":
        this.insertText("  ");
        break;
      case "ESC":
        break;
      default:
        if (token.length === 1 && token >= " ") this.insertText(token);
        else if (token.startsWith("C-") || token.startsWith("M-")) this.echo = `${token} is undefined`;
        break;
    }
    this.clampPoint();
  }

  private handleCx(token: string): void {
    this.echo = "";
    switch (token) {
      case "C-s":
        this.save(this.absPath);
        break;
      case "C-c":
        this.quit();
        break;
      case "C-f":
        this.mini = "find-file";
        this.miniPrompt = "Find file: ";
        this.miniInput = this.miniDirDefault();
        break;
      case "C-w":
        this.mini = "write-file";
        this.miniPrompt = "Write file: ";
        this.miniInput = this.cwd.endsWith("/") ? this.cwd : this.cwd + "/";
        break;
      case "d":
        // C-x d: dired を開く
        this.mini = "dired";
        this.miniPrompt = "Dired (directory): ";
        this.miniInput = this.miniDirDefault();
        break;
      case "Left":
        // C-x <left>: tab-line の前のファイルへ (previous-buffer 相当)
        this.switchTab(-1);
        break;
      case "Right":
        // C-x <right>: tab-line の次のファイルへ (next-buffer 相当)
        this.switchTab(1);
        break;
      case "u":
        this.undo();
        break;
      case "b":
        this.echo = "(バッファは1つ: " + this.bufferName + ")";
        break;
      case "k":
        this.echo = "(C-x k: 単一バッファのため C-x C-c で終了)";
        break;
      case "2":
      case "3":
      case "o":
      case "1":
      case "0":
        this.echo = "ウィンドウ分割は ghostty キー(ctrl+shift+v 等)を使用";
        break;
      case "C-x":
        // C-x C-x: point と mark を交換
        if (this.mark) {
          const t = this.point;
          this.point = this.mark;
          this.mark = t;
        }
        break;
      default:
        this.echo = `C-x ${token} is undefined`;
    }
    this.clampPoint();
  }

  // ===== ミニバッファ =====
  private handleMini(token: string): void {
    if (token === "C-g" || token === "ESC") {
      this.mini = null;
      this.echo = "Quit";
      return;
    }
    if (token === "RET") {
      const input = this.miniInput.trim();
      const which = this.mini;
      this.mini = null;
      if (which === "find-file") {
        const abs = this.vfs.resolve(this.cwd, input);
        const node = this.vfs.stat(abs);
        if (node && node.type === "dir") {
          // ディレクトリを開いたら dired (ネイティブ emacs と同じ)
          this.captureFileSnapshotIfFile();
          this.openDired(abs);
        } else {
          this.visitFile(abs, input);
        }
      } else if (which === "dired") {
        this.captureFileSnapshotIfFile();
        this.openDired(this.vfs.resolve(this.cwd, input));
      } else if (which === "write-file") {
        this.save(this.vfs.resolve(this.cwd, input));
        this.absPath = this.vfs.resolve(this.cwd, input);
        this.filename = input;
      } else if (which === "goto") {
        const n = parseInt(input, 10);
        if (n > 0) this.point = { row: Math.min(n - 1, this.buffer.length - 1), col: 0 };
      } else if (which === "execute") {
        this.runExtended(input);
      }
      this.clampPoint();
      return;
    }
    if (token === "DEL") {
      this.miniInput = this.miniInput.slice(0, -1);
      return;
    }
    if (token === "TAB") {
      this.completeMiniPath();
      return;
    }
    if (token.length === 1 && token >= " ") this.miniInput += token;
  }

  private completeMiniPath(): void {
    if (this.mini !== "find-file" && this.mini !== "write-file" && this.mini !== "dired") return;
    const input = this.miniInput;
    const slash = input.lastIndexOf("/");
    const dirPart = slash >= 0 ? input.slice(0, slash + 1) : "";
    const base = slash >= 0 ? input.slice(slash + 1) : input;
    const dirNode = this.vfs.stat(this.vfs.resolve(this.cwd, dirPart || "."));
    if (!dirNode || !dirNode.children) return;
    const matches = [...dirNode.children.entries()].filter(([n]) => n.startsWith(base));
    if (matches.length === 1) {
      const [n, child] = matches[0];
      this.miniInput = dirPart + n + (child.type === "dir" ? "/" : "");
    } else if (matches.length > 1) {
      let prefix = matches[0][0];
      for (const [n] of matches) {
        let k = 0;
        while (k < prefix.length && k < n.length && prefix[k] === n[k]) k++;
        prefix = prefix.slice(0, k);
      }
      this.miniInput = dirPart + prefix;
      this.echo = matches.map(([n]) => n).join(" ");
    }
  }

  private runExtended(cmd: string): void {
    switch (cmd) {
      case "save-buffer":
        this.save(this.absPath);
        break;
      case "goto-line":
        this.mini = "goto";
        this.miniPrompt = "Goto line: ";
        this.miniInput = "";
        break;
      case "undo":
        this.undo();
        break;
      case "kill-region":
        this.killRegion();
        break;
      case "what-line":
        this.echo = `Line ${this.point.row + 1}`;
        break;
      case "dired":
        this.mini = "dired";
        this.miniPrompt = "Dired (directory): ";
        this.miniInput = this.miniDirDefault();
        break;
      case "tab-line-mode":
      case "global-tab-line-mode":
        this.tabLine = !this.tabLine;
        this.echo = `Tab-Line mode ${this.tabLine ? "enabled" : "disabled"}`;
        break;
      default:
        this.echo = `No command: ${cmd}`;
    }
  }

  // ===== dired (ディレクトリエディタ) =====
  private miniDirDefault(): string {
    const base = this.dired ? this.dired.dir : this.cwd;
    return base.endsWith("/") ? base : base + "/";
  }

  private dirOf(absFile: string): string {
    return this.vfs.resolve(absFile, "..");
  }

  /** dir 内のファイル (タブ表示/タブ切替に使う)。名前順。 */
  private dirFiles(dir: string): Array<{ name: string; abs: string }> {
    const node = this.vfs.stat(dir);
    if (!node || node.type !== "dir" || !node.children) return [];
    const out: Array<{ name: string; abs: string }> = [];
    for (const [n, c] of node.children) {
      if (c.type === "file") out.push({ name: n, abs: this.vfs.resolve(dir, n) });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  private diredEntry(node: VNode, name: string): DiredEntry {
    return {
      name,
      type: node.type,
      mode: node.mode,
      owner: node.owner,
      group: node.group,
      size: node.type === "dir" ? 4096 : node.content.length,
      mtime: node.mtime,
    };
  }

  private openDired(absDir: string): void {
    const node = this.vfs.stat(absDir);
    if (!node || node.type !== "dir" || !node.children) {
      this.echo = `${absDir} is not a directory`;
      return;
    }
    const entries: DiredEntry[] = [this.diredEntry(node, ".")];
    if (node.parent) entries.push(this.diredEntry(node.parent, ".."));
    const names = [...node.children.keys()].sort((a, b) => a.localeCompare(b));
    for (const n of names) entries.push(this.diredEntry(node.children.get(n)!, n));
    const firstReal = Math.min(entries.length - 1, node.parent ? 2 : 1);
    this.dired = { dir: absDir, entries, line: Math.max(0, firstReal), top: 0 };
    this.bufferName = absDir.split("/").filter(Boolean).pop() || "/";
    this.echo = "";
  }

  private handleDired(token: string): void {
    const d = this.dired!;
    this.echo = "";
    switch (token) {
      case "C-x":
        this.prefixCx = true;
        this.echo = "C-x-";
        break;
      case "C-n":
      case "Down":
      case "n":
        d.line = Math.min(d.line + 1, d.entries.length - 1);
        break;
      case "C-p":
      case "Up":
      case "p":
        d.line = Math.max(d.line - 1, 0);
        break;
      case "M-<":
        d.line = 0;
        break;
      case "M->":
        d.line = d.entries.length - 1;
        break;
      case "RET":
      case "f":
      case "e":
        this.diredOpen();
        break;
      case "^":
        this.openDired(this.vfs.resolve(d.dir, ".."));
        break;
      case "g":
        this.openDired(d.dir);
        break;
      case "q":
        this.diredQuit();
        break;
      case "C-g":
        this.echo = "Quit";
        break;
      default:
        if (token.startsWith("C-") || token.startsWith("M-")) this.echo = `${token} is undefined`;
        break;
    }
  }

  private diredOpen(): void {
    const d = this.dired!;
    const e = d.entries[d.line];
    if (!e) return;
    const abs = this.vfs.resolve(d.dir, e.name);
    const node = this.vfs.stat(abs);
    if (node && node.type === "dir") {
      this.openDired(abs);
    } else if (node && node.type === "file") {
      this.visitFile(abs, e.name === "." ? this.filename : abs);
    } else {
      this.echo = `${e.name}: no such file`;
    }
  }

  private diredQuit(): void {
    if (this.fileSnapshot) this.restoreFileSnapshot();
    else this.quit();
  }

  /** dired/タブ切替からファイルを開く (バッファ差し替え)。 */
  private visitFile(abs: string, display: string): void {
    this.dired = null;
    this.fileSnapshot = null;
    this.absPath = abs;
    this.filename = display;
    this.bufferName = abs.split("/").pop() || abs;
    this.point = { row: 0, col: 0 };
    this.top = 0;
    this.mark = null;
    this.goalCol = 0;
    this.modified = false;
    this.undoStack = [];
    this.redoStack = [];
    this.echo = "";
    this.loadFile();
  }

  private captureFileSnapshotIfFile(): void {
    if (this.dired || !this.absPath) return;
    this.fileSnapshot = {
      buffer: [...this.buffer],
      filename: this.filename,
      absPath: this.absPath,
      bufferName: this.bufferName,
      point: { ...this.point },
      top: this.top,
      modified: this.modified,
    };
  }

  private restoreFileSnapshot(): void {
    const s = this.fileSnapshot!;
    this.dired = null;
    this.buffer = s.buffer;
    this.filename = s.filename;
    this.absPath = s.absPath;
    this.bufferName = s.bufferName;
    this.point = s.point;
    this.top = s.top;
    this.modified = s.modified;
    this.fileSnapshot = null;
    this.echo = "";
    this.clampPoint();
  }

  /** tab-line: 同ディレクトリの前後のファイルへ移動。 */
  private switchTab(delta: number): void {
    if (!this.absPath) {
      this.echo = "No file in this buffer";
      return;
    }
    const dir = this.dirOf(this.absPath);
    const files = this.dirFiles(dir);
    if (files.length <= 1) {
      this.echo = "No other file in this directory";
      return;
    }
    const cur = files.findIndex((f) => f.abs === this.absPath);
    let idx = (cur < 0 ? 0 : cur + delta) % files.length;
    if (idx < 0) idx += files.length;
    this.visitFile(files[idx].abs, files[idx].name);
  }

  // ===== isearch =====
  private startIsearch(dir: number): void {
    this.isearch = { dir, query: "", start: { ...this.point } };
    this.echo = "";
  }
  private handleIsearch(token: string): void {
    const s = this.isearch!;
    if (token === "C-g") {
      this.point = { ...s.start };
      this.isearch = null;
      this.echo = "Quit";
      this.clampPoint();
      return;
    }
    if (token === "RET" || token.startsWith("C-") === false && (token === "Left" || token === "Right" || token === "Up" || token === "Down")) {
      this.isearch = null;
      this.echo = "";
      if (token !== "RET") this.dispatch(token, false);
      return;
    }
    if (token === "C-s") {
      s.dir = 1;
      this.searchNext(s, true);
      return;
    }
    if (token === "C-r") {
      s.dir = -1;
      this.searchNext(s, true);
      return;
    }
    if (token === "DEL") {
      s.query = s.query.slice(0, -1);
      this.searchNext(s, false);
      return;
    }
    if (token.length === 1 && token >= " ") {
      s.query += token;
      this.searchNext(s, false);
      return;
    }
    // その他のキーは isearch を抜けて実行
    this.isearch = null;
    this.handleKey(token);
  }
  private searchNext(s: { dir: number; query: string; start: Pos }, advance: boolean): void {
    if (!s.query) return;
    const q = s.query;
    const ic = q === q.toLowerCase();
    let { row, col } = this.point;
    if (advance) col += s.dir;
    const n = this.buffer.length;
    for (let step = 0; step <= n; step++) {
      const r = ((row + (step === 0 ? 0 : s.dir * step)) % n + n) % n;
      const hay = ic ? this.buffer[r].toLowerCase() : this.buffer[r];
      const needle = ic ? q.toLowerCase() : q;
      if (s.dir > 0) {
        const from = step === 0 ? Math.max(0, col) : 0;
        const idx = hay.indexOf(needle, from);
        if (idx >= 0) {
          this.point = { row: r, col: idx };
          this.echo = `I-search: ${q}`;
          return;
        }
      } else {
        const to = step === 0 ? Math.min(hay.length, col + needle.length) : hay.length;
        const idx = hay.lastIndexOf(needle, to);
        if (idx >= 0) {
          this.point = { row: r, col: idx };
          this.echo = `I-search backward: ${q}`;
          return;
        }
      }
    }
    this.echo = `Failing I-search: ${q}`;
  }

  // ===== 移動 =====
  private line(r = this.point.row): string {
    return this.buffer[r] ?? "";
  }
  private moveChar(dir: number): void {
    let { row, col } = this.point;
    col += dir;
    if (col < 0) {
      if (row > 0) {
        row--;
        col = this.buffer[row].length;
      } else col = 0;
    } else if (col > this.line(row).length) {
      if (row < this.buffer.length - 1) {
        row++;
        col = 0;
      } else col = this.line(row).length;
    }
    this.point = { row, col };
    this.goalCol = col;
  }
  private moveLine(dir: number): void {
    const row = Math.min(Math.max(this.point.row + dir, 0), this.buffer.length - 1);
    this.point = { row, col: Math.min(this.goalCol, this.line(row).length) };
  }
  private wordForward(): Pos {
    let { row, col } = this.point;
    let l = this.buffer[row];
    while (row < this.buffer.length) {
      l = this.buffer[row];
      while (col < l.length && !/\w/.test(l[col])) col++;
      if (col < l.length) {
        while (col < l.length && /\w/.test(l[col])) col++;
        return { row, col };
      }
      if (row < this.buffer.length - 1) {
        row++;
        col = 0;
      } else return { row, col: l.length };
    }
    return { row, col };
  }
  private wordBack(): Pos {
    let { row, col } = this.point;
    while (row >= 0) {
      const l = this.buffer[row];
      col = Math.min(col, l.length);
      while (col > 0 && !/\w/.test(l[col - 1])) col--;
      if (col > 0) {
        while (col > 0 && /\w/.test(l[col - 1])) col--;
        return { row, col };
      }
      if (row > 0) {
        row--;
        col = this.buffer[row].length;
      } else return { row: 0, col: 0 };
    }
    return { row, col };
  }

  private clampPoint(): void {
    this.point.row = Math.min(Math.max(this.point.row, 0), this.buffer.length - 1);
    this.point.col = Math.min(Math.max(this.point.col, 0), this.line(this.point.row).length);
  }

  // ===== 編集 =====
  private snapshot(): void {
    this.undoStack.push({ buffer: [...this.buffer], point: { ...this.point } });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }
  private undo(): void {
    const s = this.undoStack.pop();
    if (!s) {
      this.echo = "No further undo information";
      return;
    }
    this.redoStack.push({ buffer: [...this.buffer], point: { ...this.point } });
    this.buffer = s.buffer;
    this.point = s.point;
    this.clampPoint();
    this.echo = "Undo!";
  }

  private insertText(text: string): void {
    this.snapshot();
    const l = this.line();
    this.buffer[this.point.row] = l.slice(0, this.point.col) + text + l.slice(this.point.col);
    this.point.col += text.length;
    this.goalCol = this.point.col;
    this.modified = true;
  }
  private insertNewline(): void {
    this.snapshot();
    const l = this.line();
    const head = l.slice(0, this.point.col);
    const tail = l.slice(this.point.col);
    this.buffer[this.point.row] = head;
    this.buffer.splice(this.point.row + 1, 0, tail);
    this.point = { row: this.point.row + 1, col: 0 };
    this.goalCol = 0;
    this.modified = true;
  }
  private deleteChar(): void {
    const l = this.line();
    if (this.point.col < l.length) {
      this.snapshot();
      this.buffer[this.point.row] = l.slice(0, this.point.col) + l.slice(this.point.col + 1);
      this.modified = true;
    } else if (this.point.row < this.buffer.length - 1) {
      this.snapshot();
      this.buffer[this.point.row] = l + this.buffer[this.point.row + 1];
      this.buffer.splice(this.point.row + 1, 1);
      this.modified = true;
    }
  }
  private backspace(): void {
    if (this.point.col > 0) {
      this.snapshot();
      const l = this.line();
      this.buffer[this.point.row] = l.slice(0, this.point.col - 1) + l.slice(this.point.col);
      this.point.col--;
      this.modified = true;
    } else if (this.point.row > 0) {
      this.snapshot();
      const prev = this.buffer[this.point.row - 1];
      const cur = this.line();
      this.point = { row: this.point.row - 1, col: prev.length };
      this.buffer[this.point.row] = prev + cur;
      this.buffer.splice(this.point.row + 1, 1);
      this.modified = true;
    }
    this.goalCol = this.point.col;
  }
  private killLine(append: boolean): void {
    this.snapshot();
    const l = this.line();
    let killed: string;
    if (this.point.col >= l.length) {
      // 行末: 改行を削除
      if (this.point.row < this.buffer.length - 1) {
        killed = "\n";
        this.buffer[this.point.row] = l + this.buffer[this.point.row + 1];
        this.buffer.splice(this.point.row + 1, 1);
      } else killed = "";
    } else {
      killed = l.slice(this.point.col);
      this.buffer[this.point.row] = l.slice(0, this.point.col);
    }
    if (append && this.killRing.length) this.killRing[this.killRing.length - 1] += killed;
    else this.killRing.push(killed);
    this.modified = true;
  }
  private killWordForward(): void {
    this.snapshot();
    const end = this.wordForward();
    this.killRing.push(this.extractRange(this.point, end));
    this.deleteRange(this.point, end);
    this.modified = true;
  }
  private killWordBack(): void {
    this.snapshot();
    const start = this.wordBack();
    this.killRing.push(this.extractRange(start, this.point));
    this.deleteRange(start, this.point);
    this.point = start;
    this.modified = true;
  }
  private region(): { start: Pos; end: Pos } | null {
    if (!this.mark) return null;
    let a = this.mark;
    let b = this.point;
    if (b.row < a.row || (b.row === a.row && b.col < a.col)) [a, b] = [b, a];
    return { start: { ...a }, end: { ...b } };
  }
  private copyRegion(): void {
    const r = this.region();
    if (!r) {
      this.echo = "The mark is not set now";
      return;
    }
    this.killRing.push(this.extractRange(r.start, r.end));
    this.echo = "Copied";
  }
  private killRegion(): void {
    const r = this.region();
    if (!r) {
      this.echo = "The mark is not set now";
      return;
    }
    this.snapshot();
    this.killRing.push(this.extractRange(r.start, r.end));
    this.deleteRange(r.start, r.end);
    this.point = r.start;
    this.mark = null;
    this.modified = true;
  }
  private yank(): void {
    if (this.killRing.length === 0) return;
    this.snapshot();
    const text = this.killRing[this.killRing.length - 1];
    const parts = text.split("\n");
    const l = this.line();
    if (parts.length === 1) {
      this.buffer[this.point.row] = l.slice(0, this.point.col) + text + l.slice(this.point.col);
      this.point.col += text.length;
    } else {
      const tail = l.slice(this.point.col);
      this.buffer[this.point.row] = l.slice(0, this.point.col) + parts[0];
      const mid = parts.slice(1);
      mid[mid.length - 1] += tail;
      this.buffer.splice(this.point.row + 1, 0, ...mid);
      this.point = { row: this.point.row + parts.length - 1, col: parts[parts.length - 1].length };
    }
    this.modified = true;
  }
  private extractRange(a: Pos, b: Pos): string {
    if (a.row === b.row) return this.buffer[a.row].slice(a.col, b.col);
    let out = this.buffer[a.row].slice(a.col) + "\n";
    for (let r = a.row + 1; r < b.row; r++) out += this.buffer[r] + "\n";
    out += this.buffer[b.row].slice(0, b.col);
    return out;
  }
  private deleteRange(a: Pos, b: Pos): void {
    if (a.row === b.row) {
      this.buffer[a.row] = this.buffer[a.row].slice(0, a.col) + this.buffer[a.row].slice(b.col);
    } else {
      const head = this.buffer[a.row].slice(0, a.col);
      const tail = this.buffer[b.row].slice(b.col);
      this.buffer.splice(a.row, b.row - a.row + 1, head + tail);
    }
  }

  // ===== ファイル/終了 =====
  private save(target: string | null): void {
    if (!target) {
      this.mini = "write-file";
      this.miniPrompt = "Write file: ";
      this.miniInput = this.cwd + "/";
      return;
    }
    const content = this.buffer.join("\n") + "\n";
    const node = this.vfs.stat(target);
    if (node && node.type === "file") {
      node.content = content;
      node.mtime = new Date();
    } else this.vfs.createFile(target, content);
    this.modified = false;
    if (!this.absPath) this.absPath = target;
    this.echo = `Wrote ${target}`;
  }
  private quit(): void {
    this.done = true;
    this.onExit();
  }

  // ===== 描画 =====
  private textRows(): number {
    const tab = this.tabLine && !this.dired ? 1 : 0;
    return Math.max(1, this.term.rows - 2 - tab);
  }
  private scroll(delta: number): void {
    this.point.row = Math.min(Math.max(this.point.row + delta, 0), this.buffer.length - 1);
    this.point.col = Math.min(this.goalCol, this.line(this.point.row).length);
  }
  private ensureVisible(): void {
    const rows = this.textRows();
    if (this.point.row < this.top) this.top = this.point.row;
    else if (this.point.row >= this.top + rows) this.top = this.point.row - rows + 1;
    if (this.top < 0) this.top = 0;
  }
  private displayCol(row: number, col: number): number {
    const l = this.buffer[row] ?? "";
    let w = 0;
    for (let i = 0; i < col && i < l.length; i++) w += l[i] === "\t" ? 8 : charWidth(l[i]);
    return w;
  }

  private render(): void {
    this.ensureVisible();
    const cols = this.term.cols;
    const rows = this.term.rows;
    const showTab = this.tabLine;
    const textRows = this.textRows();
    const reg = this.region();
    let out = "\x1b[H";
    if (showTab) out += "\x1b[K" + this.tabLineStr(cols) + "\r\n";
    for (let i = 0; i < textRows; i++) {
      const idx = this.top + i;
      out += "\x1b[K";
      if (idx < this.buffer.length) out += this.renderLine(idx, reg, cols);
      out += "\r\n";
    }
    out += "\x1b[K" + this.modeLine(cols) + "\r\n";
    out += "\x1b[K" + this.echoLine(cols);

    if (this.mini) {
      const col = 1 + this.miniPrompt.length + this.miniInput.length;
      out += `\x1b[${rows};${col}H`;
    } else {
      const sr = this.point.row - this.top + 1 + (showTab ? 1 : 0);
      const sc = this.displayCol(this.point.row, this.point.col) + 1;
      out += `\x1b[${sr};${sc}H`;
    }
    this.term.term.write(out);
  }

  /** tab-line-mode: 現在ディレクトリのファイルをタブとして上部に並べる。 */
  private tabLineStr(cols: number): string {
    const baseBg = "\x1b[48;2;26;30;44m";
    const dir = this.absPath ? this.dirOf(this.absPath) : this.cwd;
    const files = this.dirFiles(dir);
    let s = baseBg;
    let width = 0;
    if (files.length === 0) {
      const label = ` (no files) `;
      s += "\x1b[38;2;120;128;150m" + label;
      width = label.length;
    }
    for (const f of files) {
      const label = ` ${f.name} `;
      if (width + label.length > cols - 1) {
        s += "\x1b[38;2;120;128;150m…";
        width += 1;
        break;
      }
      if (f.abs === this.absPath) {
        s += "\x1b[48;2;72;82;122m\x1b[38;2;240;244;255m" + label + RESET + baseBg;
      } else {
        s += "\x1b[38;2;150;160;185m" + label;
      }
      width += label.length;
    }
    if (width < cols) s += " ".repeat(cols - width);
    return s + RESET;
  }

  // ===== dired 描画 =====
  private renderDired(): void {
    const d = this.dired!;
    const cols = this.term.cols;
    const textRows = Math.max(1, this.term.rows - 2);
    const headerLines = 2;
    const listRows = Math.max(1, textRows - headerLines);
    if (d.line < d.top) d.top = d.line;
    else if (d.line >= d.top + listRows) d.top = d.line - listRows + 1;
    if (d.top < 0) d.top = 0;

    let out = "\x1b[H";
    out += "\x1b[K" + `\x1b[38;2;120;200;255m${d.dir}:` + RESET + "\r\n";
    out += "\x1b[K" + `  total ${d.entries.length}` + "\r\n";
    for (let i = 0; i < listRows; i++) {
      const idx = d.top + i;
      out += "\x1b[K";
      if (idx < d.entries.length) out += this.diredLine(d.entries[idx], cols, idx === d.line);
      out += "\r\n";
    }
    out += "\x1b[K" + this.diredModeLine(cols) + "\r\n";
    out += "\x1b[K" + this.echoLine(cols);

    if (this.mini) {
      const col = 1 + this.miniPrompt.length + this.miniInput.length;
      out += `\x1b[${this.term.rows};${col}H`;
    } else {
      const sr = d.line - d.top + headerLines + 1;
      out += `\x1b[${sr};1H`;
    }
    this.term.term.write(out);
  }

  private permString(e: DiredEntry): string {
    const t = e.type === "dir" ? "d" : e.type === "symlink" ? "l" : "-";
    const rwx = (b: number): string => (b & 4 ? "r" : "-") + (b & 2 ? "w" : "-") + (b & 1 ? "x" : "-");
    return t + rwx((e.mode >> 6) & 7) + rwx((e.mode >> 3) & 7) + rwx(e.mode & 7);
  }

  private fmtDate(dt: Date): string {
    const day = String(dt.getDate()).padStart(2, " ");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${MON[dt.getMonth()]} ${day} ${hh}:${mm}`;
  }

  private diredLine(e: DiredEntry, cols: number, current: boolean): string {
    const prefix = `  ${this.permString(e)} ${e.owner.padEnd(6).slice(0, 6)} ${e.group.padEnd(6).slice(0, 6)} ${String(e.size).padStart(8)} ${this.fmtDate(e.mtime)} `;
    const plain = prefix + e.name;
    if (current) {
      const padded = plain.length < cols ? plain + " ".repeat(cols - plain.length) : plain.slice(0, cols);
      return "\x1b[48;2;60;70;110m\x1b[38;2;235;240;252m" + padded + RESET;
    }
    const name =
      e.type === "dir"
        ? "\x1b[38;2;100;200;255m" + e.name + RESET
        : e.type === "symlink"
          ? "\x1b[38;2;235;150;255m" + e.name + RESET
          : e.name;
    return prefix + name;
  }

  private diredModeLine(cols: number): string {
    const left = `-UUU:%%--  ${this.bufferName}`;
    const right = `(Dired by name) `;
    const mid = `   ${this.dired && this.dired.entries.length <= this.term.rows - 4 ? "All" : this.dired && this.dired.top === 0 ? "Top" : "Bot"}   `;
    let bar = left + mid + right;
    if (bar.length < cols) bar += "-".repeat(cols - bar.length);
    return "\x1b[48;2;55;62;90m\x1b[38;2;220;225;240m" + bar.slice(0, cols) + RESET;
  }

  private renderLine(idx: number, reg: { start: Pos; end: Pos } | null, cols: number): string {
    const l = (this.buffer[idx] ?? "").replace(/\t/g, "        ");
    let selS = -1;
    let selE = -1;
    if (reg && idx >= reg.start.row && idx <= reg.end.row) {
      selS = idx === reg.start.row ? reg.start.col : 0;
      selE = idx === reg.end.row ? reg.end.col : l.length;
    }
    let out = "";
    for (let i = 0; i < l.length && i < cols; i++) {
      if (i >= selS && i < selE) out += "\x1b[48;2;60;70;110m" + l[i] + RESET;
      else out += l[i];
    }
    return out;
  }

  private modeLine(cols: number): string {
    const mod = this.modified ? "**" : "--";
    const pos = this.buffer.length <= this.textRows() ? "All" : this.top === 0 ? "Top" : "Bot";
    const left = `-UUU:${mod}-  ${this.bufferName}`;
    const right = `L${this.point.row + 1}  (Fundamental) `;
    const mid = `   ${pos}   `;
    let bar = left + mid + right;
    if (bar.length < cols) bar += "-".repeat(cols - bar.length);
    return "\x1b[48;2;55;62;90m\x1b[38;2;220;225;240m" + bar.slice(0, cols) + RESET;
  }

  private echoLine(cols: number): string {
    if (this.mini) return this.miniPrompt + this.miniInput;
    if (this.echo) return "\x1b[38;2;200;205;225m" + this.echo.slice(0, cols) + RESET;
    return "";
  }
}
