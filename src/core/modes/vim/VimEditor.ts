import type { TerminalView } from "../../terminal/TerminalView";
import type { VFS } from "../../vfs/VFS";
import { makeRegex } from "../../shell/regex";
import { charWidth } from "../../terminal/wcwidth";

export interface VimOptions {
  term: TerminalView;
  vfs: VFS;
  cwd: string;
  args: string[];
  flavor: "vim" | "nvim";
  onExit: () => void;
}

type Mode = "normal" | "insert" | "visual" | "vline" | "command" | "replace";

interface Pos {
  row: number;
  col: number;
}
interface Motion {
  row: number;
  col: number;
  type: "exclusive" | "inclusive" | "linewise";
}
interface Register {
  text: string;
  linewise: boolean;
}

const RESET = "\x1b[0m";

export class VimEditor {
  private term: TerminalView;
  private vfs: VFS;
  private cwd: string;
  private flavor: "vim" | "nvim";
  private onExit: () => void;

  private buffer: string[] = [""];
  private filename: string;
  private absPath: string | null;
  private modified = false;
  private isNewFile = false;

  private mode: Mode = "normal";
  private cursor: Pos = { row: 0, col: 0 };
  private top = 0;
  private desiredCol = 0;

  private count = "";
  private pendingOp: string | null = null;
  private pendingG = false;
  private awaitChar: string | null = null; // f F t T r の待ち
  private awaitObj: "i" | "a" | null = null; // テキストオブジェクトの i/a 待ち
  private lastFind: { cmd: string; ch: string } | null = null;
  private register: Register = { text: "", linewise: false };

  private cmdline = "";
  private cmdPrefix = ":"; // : / ?
  private lastSearch = "";
  private lastSearchDir = 1;

  private undoStack: Array<{ buffer: string[]; cursor: Pos }> = [];
  private redoStack: Array<{ buffer: string[]; cursor: Pos }> = [];
  private dirtySnapshot = false;

  // 設定
  private numberOpt = true;
  private relativeNumber: boolean;
  private hlsearch = true;
  private showSearch = true;

  // visual
  private vStart: Pos = { row: 0, col: 0 };

  // dot-repeat
  private lastChange: (() => void) | null = null;
  private insertedText = "";
  private insertStartCmd: (() => void) | null = null;
  private statusMsg = "";

  // which-key (leader)
  private leaderPending = false;
  private done = false;

  constructor(opts: VimOptions) {
    this.term = opts.term;
    this.vfs = opts.vfs;
    this.cwd = opts.cwd;
    this.flavor = opts.flavor;
    this.onExit = opts.onExit;
    this.relativeNumber = opts.flavor === "nvim";
    const arg = opts.args.find((a) => !a.startsWith("-"));
    this.filename = arg ?? "[No Name]";
    this.absPath = arg ? this.vfs.resolve(this.cwd, arg) : null;
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
      this.isNewFile = true;
    }
    this.buffer = [""];
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[?25h");
    this.applyCursorShape();
    this.statusMsg = this.isNewFile
      ? `"${this.filename}" [New]`
      : `"${this.filename}" ${this.buffer.length}L`;
    this.render();
  }

  dispose(): void {
    this.term.term.write("\x1b[?1049l\x1b[0 q");
  }

  fit(): void {
    this.render();
  }

  // ===== 入力 =====
  onData(data: string): void {
    let i = 0;
    while (i < data.length) {
      let key: string;
      let len = 1;
      if (data[i] === "\x1b") {
        const three = data.substr(i, 3);
        if (three === "\x1b[A") {
          key = "<Up>";
          len = 3;
        } else if (three === "\x1b[B") {
          key = "<Down>";
          len = 3;
        } else if (three === "\x1b[C") {
          key = "<Right>";
          len = 3;
        } else if (three === "\x1b[D") {
          key = "<Left>";
          len = 3;
        } else if (data.substr(i, 4) === "\x1b[3~") {
          key = "<Del>";
          len = 4;
        } else if (three === "\x1b[H") {
          key = "<Home>";
          len = 3;
        } else if (three === "\x1b[F") {
          key = "<End>";
          len = 3;
        } else {
          key = "<Esc>";
          len = 1;
        }
      } else {
        const c = data[i];
        const code = c.charCodeAt(0);
        if (code === 13 || code === 10) key = "<CR>";
        else if (code === 127 || code === 8) key = "<BS>";
        else if (code === 9) key = "<Tab>";
        else if (code === 23) key = "<C-w>";
        else if (code === 18) key = "<C-r>";
        else if (code === 17) key = "<C-q>";
        else if (code === 22) key = "<C-v>";
        else if (code < 32) key = "<C-" + String.fromCharCode(code + 96) + ">";
        else key = c;
      }
      this.dispatch(key);
      if (this.done) return;
      i += len;
    }
    this.render();
  }

  private dispatch(key: string): void {
    switch (this.mode) {
      case "insert":
      case "replace":
        this.handleInsert(key);
        break;
      case "command":
        this.handleCmdline(key);
        break;
      case "visual":
      case "vline":
        this.handleVisual(key);
        break;
      default:
        this.handleNormal(key);
    }
  }

  // ===== スナップショット/undo =====
  private snapshot(): void {
    this.undoStack.push({ buffer: [...this.buffer], cursor: { ...this.cursor } });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }
  private undo(): void {
    const s = this.undoStack.pop();
    if (!s) {
      this.statusMsg = "Already at oldest change";
      return;
    }
    this.redoStack.push({ buffer: [...this.buffer], cursor: { ...this.cursor } });
    this.buffer = s.buffer;
    this.cursor = this.clampPos(s.cursor);
  }
  private redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push({ buffer: [...this.buffer], cursor: { ...this.cursor } });
    this.buffer = s.buffer;
    this.cursor = this.clampPos(s.cursor);
  }

  // ===== 位置ユーティリティ =====
  private line(r = this.cursor.row): string {
    return this.buffer[r] ?? "";
  }
  private clampPos(p: Pos): Pos {
    const row = Math.min(Math.max(p.row, 0), this.buffer.length - 1);
    const maxCol = Math.max(0, this.line(row).length - (this.mode === "insert" ? 0 : 1));
    return { row, col: Math.min(Math.max(p.col, 0), maxCol) };
  }
  private clampCursor(): void {
    this.cursor = this.clampPos(this.cursor);
  }

  // ===== Normal モード =====
  private handleNormal(key: string): void {
    this.statusMsg = "";
    // 待機: f/F/t/T/r の対象文字
    if (this.awaitChar) {
      const cmd = this.awaitChar;
      this.awaitChar = null;
      if (cmd === "r") {
        this.doReplaceChar(key);
        return;
      }
      this.lastFind = { cmd, ch: key };
      this.applyMotionOrOp(this.findCharMotion(cmd, key));
      return;
    }
    // テキストオブジェクト待ち (op の後の i/a の後)
    if (this.awaitObj) {
      const type = this.awaitObj;
      this.awaitObj = null;
      const range = this.textObject(type, key);
      if (range) this.applyOpRange(range);
      this.resetPending();
      return;
    }
    // leader (space) which-key
    if (this.leaderPending) {
      this.leaderPending = false;
      this.handleLeader(key);
      return;
    }

    // カウント
    if (/^[1-9]$/.test(key) || (key === "0" && this.count !== "")) {
      this.count += key;
      return;
    }

    const n = this.count ? parseInt(this.count, 10) : 1;

    // g プレフィックス
    if (this.pendingG) {
      this.pendingG = false;
      if (key === "g") {
        this.gotoLine(this.count ? n : 1);
      } else if (key === "_") {
        this.cursor.col = Math.max(0, this.lastNonBlank(this.cursor.row));
      } else if (key === "u" || key === "U" || key === "~") {
        // gu/gU/g~ + motion (簡略: 行)
        this.statusMsg = "";
      }
      this.resetPending();
      return;
    }

    // オペレータ
    if (key === "d" || key === "c" || key === "y" || key === ">" || key === "<" || key === "=") {
      if (this.pendingOp === key) {
        // dd cc yy >> <<
        this.applyLinewise(key, n);
        this.resetPending();
        return;
      }
      if (this.pendingOp) {
        this.resetPending();
        return;
      }
      this.pendingOp = key;
      return;
    }

    // op のあとの i/a → テキストオブジェクト
    if (this.pendingOp && (key === "i" || key === "a")) {
      this.awaitObj = key;
      return;
    }

    // f/F/t/T → 対象文字待ち
    if (key === "f" || key === "F" || key === "t" || key === "T") {
      this.awaitChar = key;
      return;
    }
    if (key === "r") {
      this.awaitChar = "r";
      return;
    }

    // モーション
    const m = this.computeMotion(key, n);
    if (m) {
      this.applyMotionOrOp(m);
      return;
    }

    // pendingOp 中に非モーションが来たらキャンセル
    if (this.pendingOp) {
      this.resetPending();
    }

    // 通常コマンド
    this.normalCommand(key, n);
    this.count = "";
  }

  private resetPending(): void {
    this.count = "";
    this.pendingOp = null;
    this.awaitObj = null;
  }

  private applyMotionOrOp(m: Motion | null): void {
    if (!m) {
      this.resetPending();
      return;
    }
    if (this.pendingOp) {
      this.applyOpRange(this.motionToRange(m));
      this.resetPending();
    } else {
      this.cursor = { row: m.row, col: m.col };
      this.desiredCol = m.col;
      this.clampCursor();
      this.count = "";
    }
  }

  private motionToRange(m: Motion): { start: Pos; end: Pos; linewise: boolean } {
    const a = { ...this.cursor };
    const b = { row: m.row, col: m.col };
    let start = a;
    let end = b;
    if (b.row < a.row || (b.row === a.row && b.col < a.col)) {
      start = b;
      end = a;
    }
    if (m.type === "linewise") return { start, end, linewise: true };
    // inclusive は終端を1つ含める
    if (m.type === "inclusive") end = { row: end.row, col: end.col + 1 };
    return { start, end, linewise: false };
  }

  // ===== モーション計算 =====
  private computeMotion(key: string, n: number): Motion | null {
    const c = this.cursor;
    const lineLen = this.line().length;
    switch (key) {
      case "h":
      case "<Left>":
      case "<BS>":
        return { row: c.row, col: Math.max(0, c.col - n), type: "exclusive" };
      case "l":
      case "<Right>":
      case " ":
        return { row: c.row, col: Math.min(lineLen, c.col + n), type: "exclusive" };
      case "j":
      case "<Down>":
      case "<C-n>": {
        const row = Math.min(this.buffer.length - 1, c.row + n);
        return { row, col: Math.min(this.desiredCol, Math.max(0, this.line(row).length - 1)), type: "linewise" };
      }
      case "k":
      case "<Up>":
      case "<C-p>": {
        const row = Math.max(0, c.row - n);
        return { row, col: Math.min(this.desiredCol, Math.max(0, this.line(row).length - 1)), type: "linewise" };
      }
      case "0":
      case "<Home>":
        return { row: c.row, col: 0, type: "exclusive" };
      case "^":
        return { row: c.row, col: this.firstNonBlank(c.row), type: "exclusive" };
      case "$":
      case "<End>": {
        const row = Math.min(this.buffer.length - 1, c.row + (n - 1));
        return { row, col: Math.max(0, this.line(row).length - 1), type: "inclusive" };
      }
      case "w":
        return { ...this.wordForward(n, false), type: "exclusive" };
      case "W":
        return { ...this.wordForward(n, true), type: "exclusive" };
      case "b":
        return { ...this.wordBack(n, false), type: "exclusive" };
      case "B":
        return { ...this.wordBack(n, true), type: "exclusive" };
      case "e":
        return { ...this.wordEnd(n, false), type: "inclusive" };
      case "E":
        return { ...this.wordEnd(n, true), type: "inclusive" };
      case "G": {
        const row = this.count ? n - 1 : this.buffer.length - 1;
        return { row: Math.min(Math.max(row, 0), this.buffer.length - 1), col: this.firstNonBlank(row), type: "linewise" };
      }
      case "{":
        return { ...this.paragraph(-n), type: "exclusive" };
      case "}":
        return { ...this.paragraph(n), type: "exclusive" };
      case "H":
        return { row: this.top, col: 0, type: "linewise" };
      case "L":
        return { row: Math.min(this.buffer.length - 1, this.top + this.textRows() - 1), col: 0, type: "linewise" };
      case "M":
        return { row: Math.min(this.buffer.length - 1, this.top + Math.floor(this.textRows() / 2)), col: 0, type: "linewise" };
      case "%":
        return this.matchPair();
      case ";":
        return this.lastFind ? this.findCharMotion(this.lastFind.cmd, this.lastFind.ch) : null;
      case ",":
        return this.lastFind ? this.findCharMotion(this.flipFind(this.lastFind.cmd), this.lastFind.ch) : null;
      case "g":
        this.pendingG = true;
        return null;
      default:
        return null;
    }
  }

  private flipFind(cmd: string): string {
    return { f: "F", F: "f", t: "T", T: "t" }[cmd] ?? cmd;
  }

  private findCharMotion(cmd: string, ch: string): Motion | null {
    const l = this.line();
    let col = this.cursor.col;
    if (cmd === "f" || cmd === "t") {
      let i = col + 1;
      if (cmd === "t" && this.lastFind && this.lastFind.cmd === "t") i = col + 2;
      for (; i < l.length; i++) {
        if (l[i] === ch) return { row: this.cursor.row, col: cmd === "t" ? i - 1 : i, type: "inclusive" };
      }
    } else {
      let i = col - 1;
      if (cmd === "T" && this.lastFind && this.lastFind.cmd === "T") i = col - 2;
      for (; i >= 0; i--) {
        if (l[i] === ch) return { row: this.cursor.row, col: cmd === "T" ? i + 1 : i, type: "exclusive" };
      }
    }
    return null;
  }

  // 単語移動
  private charClass(ch: string): number {
    if (ch === undefined || ch === " " || ch === "\t" || ch === "") return 0;
    if (/[A-Za-z0-9_]/.test(ch)) return 1;
    return 2;
  }
  private wordForward(n: number, big: boolean): Pos {
    let { row, col } = this.cursor;
    for (let k = 0; k < n; k++) {
      let l = this.buffer[row];
      const cls = big ? (l[col] === " " || l[col] === "\t" ? 0 : 1) : this.charClass(l[col]);
      col++;
      while (true) {
        l = this.buffer[row];
        if (col >= l.length) {
          if (row < this.buffer.length - 1) {
            row++;
            col = 0;
            if (this.buffer[row].length === 0) break;
            if (this.charClass(this.buffer[row][0]) !== 0) break;
            continue;
          } else {
            col = Math.max(0, l.length - 1);
            break;
          }
        }
        const cc = big ? (l[col] === " " || l[col] === "\t" ? 0 : 1) : this.charClass(l[col]);
        if (cc !== 0 && cc !== cls) break;
        if (cc !== 0 && cls === 0) break;
        col++;
      }
    }
    return { row, col };
  }
  private wordBack(n: number, big: boolean): Pos {
    let { row, col } = this.cursor;
    for (let k = 0; k < n; k++) {
      col--;
      while (true) {
        if (col < 0) {
          if (row > 0) {
            row--;
            col = this.buffer[row].length - 1;
            if (col < 0) {
              col = 0;
              break;
            }
          } else {
            col = 0;
            break;
          }
        }
        const l = this.buffer[row];
        const cc = big ? (l[col] === " " || l[col] === "\t" ? 0 : 1) : this.charClass(l[col]);
        if (cc === 0) {
          col--;
          continue;
        }
        // 単語先頭まで戻る
        const cls = cc;
        while (col > 0) {
          const pc = big ? (l[col - 1] === " " || l[col - 1] === "\t" ? 0 : 1) : this.charClass(l[col - 1]);
          if (pc === cls) col--;
          else break;
        }
        break;
      }
    }
    return { row, col: Math.max(0, col) };
  }
  private wordEnd(n: number, big: boolean): Pos {
    let { row, col } = this.cursor;
    for (let k = 0; k < n; k++) {
      col++;
      while (true) {
        const l = this.buffer[row];
        if (col >= l.length) {
          if (row < this.buffer.length - 1) {
            row++;
            col = 0;
            continue;
          } else {
            col = Math.max(0, l.length - 1);
            break;
          }
        }
        const cc = big ? (l[col] === " " || l[col] === "\t" ? 0 : 1) : this.charClass(l[col]);
        if (cc === 0) {
          col++;
          continue;
        }
        const cls = cc;
        while (col < l.length - 1) {
          const nc = big ? (l[col + 1] === " " || l[col + 1] === "\t" ? 0 : 1) : this.charClass(l[col + 1]);
          if (nc === cls) col++;
          else break;
        }
        break;
      }
    }
    return { row, col };
  }

  private paragraph(dir: number): Pos {
    let row = this.cursor.row;
    const step = dir < 0 ? -1 : 1;
    let cnt = Math.abs(dir);
    while (cnt > 0) {
      row += step;
      while (row > 0 && row < this.buffer.length - 1 && this.buffer[row].trim() !== "") row += step;
      cnt--;
    }
    row = Math.min(Math.max(row, 0), this.buffer.length - 1);
    return { row, col: 0 };
  }

  private matchPair(): Motion | null {
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
    const rpairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    const l = this.line();
    let col = this.cursor.col;
    while (col < l.length && !pairs[l[col]] && !rpairs[l[col]]) col++;
    if (col >= l.length) return null;
    const ch = l[col];
    let row = this.cursor.row;
    if (pairs[ch]) {
      let depth = 0;
      for (let r = row; r < this.buffer.length; r++) {
        const ln = this.buffer[r];
        for (let i = r === row ? col : 0; i < ln.length; i++) {
          if (ln[i] === ch) depth++;
          else if (ln[i] === pairs[ch]) {
            depth--;
            if (depth === 0) return { row: r, col: i, type: "inclusive" };
          }
        }
      }
    } else {
      const open = rpairs[ch];
      let depth = 0;
      for (let r = row; r >= 0; r--) {
        const ln = this.buffer[r];
        for (let i = r === row ? col : ln.length - 1; i >= 0; i--) {
          if (ln[i] === ch) depth++;
          else if (ln[i] === open) {
            depth--;
            if (depth === 0) return { row: r, col: i, type: "inclusive" };
          }
        }
      }
    }
    return null;
  }

  private firstNonBlank(row: number): number {
    const l = this.buffer[row] ?? "";
    const m = /\S/.exec(l);
    return m ? m.index : 0;
  }
  private lastNonBlank(row: number): number {
    const l = this.buffer[row] ?? "";
    return Math.max(0, l.trimEnd().length - 1);
  }

  private gotoLine(n: number): void {
    const row = Math.min(Math.max(n - 1, 0), this.buffer.length - 1);
    this.cursor = { row, col: this.firstNonBlank(row) };
  }

  // ===== オペレータ適用 =====
  private applyOpRange(range: { start: Pos; end: Pos; linewise: boolean }): void {
    const op = this.pendingOp;
    if (!op) return;
    this.snapshot();
    if (range.linewise) {
      const r1 = range.start.row;
      const r2 = range.end.row;
      const lines = this.buffer.slice(r1, r2 + 1);
      if (op === "y") {
        this.register = { text: lines.join("\n") + "\n", linewise: true };
        this.cursor = { row: r1, col: this.firstNonBlank(r1) };
      } else if (op === "d" || op === "c") {
        this.register = { text: lines.join("\n") + "\n", linewise: true };
        this.buffer.splice(r1, r2 - r1 + 1);
        if (op === "c") {
          this.buffer.splice(r1, 0, "");
          this.cursor = { row: r1, col: 0 };
          this.enterInsert();
        } else {
          if (this.buffer.length === 0) this.buffer = [""];
          this.cursor = { row: Math.min(r1, this.buffer.length - 1), col: 0 };
          this.cursor.col = this.firstNonBlank(this.cursor.row);
        }
        this.modified = true;
      } else if (op === ">" || op === "<") {
        for (let r = r1; r <= r2; r++) {
          if (op === ">") this.buffer[r] = "  " + this.buffer[r];
          else this.buffer[r] = this.buffer[r].replace(/^ {1,2}/, "");
        }
        this.cursor = { row: r1, col: this.firstNonBlank(r1) };
        this.modified = true;
      }
    } else {
      const text = this.extractRange(range.start, range.end);
      if (op === "y") {
        this.register = { text, linewise: false };
        this.cursor = { ...range.start };
      } else if (op === "d" || op === "c") {
        this.register = { text, linewise: false };
        this.deleteRange(range.start, range.end);
        this.cursor = { ...range.start };
        this.modified = true;
        if (op === "c") this.enterInsert();
      }
    }
    this.clampCursor();
  }

  private extractRange(start: Pos, end: Pos): string {
    if (start.row === end.row) return this.buffer[start.row].slice(start.col, end.col);
    let out = this.buffer[start.row].slice(start.col) + "\n";
    for (let r = start.row + 1; r < end.row; r++) out += this.buffer[r] + "\n";
    out += this.buffer[end.row].slice(0, end.col);
    return out;
  }
  private deleteRange(start: Pos, end: Pos): void {
    if (start.row === end.row) {
      const l = this.buffer[start.row];
      this.buffer[start.row] = l.slice(0, start.col) + l.slice(end.col);
    } else {
      const head = this.buffer[start.row].slice(0, start.col);
      const tail = this.buffer[end.row].slice(end.col);
      this.buffer.splice(start.row, end.row - start.row + 1, head + tail);
    }
  }

  private applyLinewise(op: string, n: number): void {
    const r1 = this.cursor.row;
    const r2 = Math.min(this.buffer.length - 1, r1 + n - 1);
    this.applyOpRange({ start: { row: r1, col: 0 }, end: { row: r2, col: 0 }, linewise: true });
    this.lastChange = () => {
      this.pendingOp = op;
      this.applyLinewise(op, n);
    };
  }

  // ===== テキストオブジェクト =====
  private textObject(type: "i" | "a", obj: string): { start: Pos; end: Pos; linewise: boolean } | null {
    const row = this.cursor.row;
    const l = this.line();
    const col = this.cursor.col;
    if (obj === "w" || obj === "W") {
      const big = obj === "W";
      let s = col;
      let e = col;
      const cls = this.charClass(l[col]);
      while (s > 0 && (big ? l[s - 1] !== " " : this.charClass(l[s - 1]) === cls) && this.charClass(l[s - 1]) !== 0) s--;
      while (e < l.length - 1 && (big ? l[e + 1] !== " " : this.charClass(l[e + 1]) === cls) && this.charClass(l[e + 1]) !== 0) e++;
      if (type === "a") while (e < l.length - 1 && (l[e + 1] === " " || l[e + 1] === "\t")) e++;
      return { start: { row, col: s }, end: { row, col: e + 1 }, linewise: false };
    }
    const quotePairs: Record<string, string> = { '"': '"', "'": "'", "`": "`" };
    const openClose: Record<string, [string, string]> = {
      "(": ["(", ")"], ")": ["(", ")"], b: ["(", ")"],
      "{": ["{", "}"], "}": ["{", "}"], B: ["{", "}"],
      "[": ["[", "]"], "]": ["[", "]"],
      "<": ["<", ">"], ">": ["<", ">"],
    };
    if (quotePairs[obj]) {
      let s = -1;
      let e = -1;
      for (let i = 0; i < l.length; i++) {
        if (l[i] === obj) {
          if (s === -1 || i <= col) {
            if (e === -1 || s === -1) {
              if (s === -1) s = i;
              else if (e === -1 && i > s) {
                e = i;
                if (col <= e) break;
                s = -1;
                e = -1;
              }
            }
          }
        }
      }
      // 簡易: col を含む最初のペア
      const idxs: number[] = [];
      for (let i = 0; i < l.length; i++) if (l[i] === obj) idxs.push(i);
      for (let k = 0; k + 1 < idxs.length; k += 2) {
        if (col >= idxs[k] && col <= idxs[k + 1]) {
          s = idxs[k];
          e = idxs[k + 1];
          break;
        }
      }
      if (s < 0 || e < 0) return null;
      if (type === "i") return { start: { row, col: s + 1 }, end: { row, col: e }, linewise: false };
      return { start: { row, col: s }, end: { row, col: e + 1 }, linewise: false };
    }
    if (openClose[obj]) {
      const [open, close] = openClose[obj];
      const sPos = this.findUnmatched(open, close, true);
      const ePos = this.findUnmatched(open, close, false);
      if (!sPos || !ePos) return null;
      if (type === "i") {
        return { start: { row: sPos.row, col: sPos.col + 1 }, end: { row: ePos.row, col: ePos.col }, linewise: false };
      }
      return { start: sPos, end: { row: ePos.row, col: ePos.col + 1 }, linewise: false };
    }
    if (obj === "p") {
      let r1 = row;
      let r2 = row;
      while (r1 > 0 && this.buffer[r1 - 1].trim() !== "") r1--;
      while (r2 < this.buffer.length - 1 && this.buffer[r2 + 1].trim() !== "") r2++;
      return { start: { row: r1, col: 0 }, end: { row: r2, col: 0 }, linewise: true };
    }
    return null;
  }

  private findUnmatched(open: string, close: string, backward: boolean): Pos | null {
    let depth = 0;
    let { row, col } = this.cursor;
    if (backward) {
      for (let r = row; r >= 0; r--) {
        const l = this.buffer[r];
        for (let i = r === row ? col : l.length - 1; i >= 0; i--) {
          if (l[i] === close && !(r === row && i === col)) depth++;
          else if (l[i] === open) {
            if (depth === 0) return { row: r, col: i };
            depth--;
          }
        }
      }
    } else {
      for (let r = row; r < this.buffer.length; r++) {
        const l = this.buffer[r];
        for (let i = r === row ? col : 0; i < l.length; i++) {
          if (l[i] === open && !(r === row && i === col)) depth++;
          else if (l[i] === close) {
            if (depth === 0) return { row: r, col: i };
            depth--;
          }
        }
      }
    }
    return null;
  }

  // ===== 通常コマンド =====
  private normalCommand(key: string, n: number): void {
    switch (key) {
      case "i":
        this.startInsert(() => {});
        break;
      case "I":
        this.cursor.col = this.firstNonBlank(this.cursor.row);
        this.startInsert(() => {});
        break;
      case "a":
        this.cursor.col = Math.min(this.line().length, this.cursor.col + 1);
        this.startInsert(() => {});
        break;
      case "A":
        this.cursor.col = this.line().length;
        this.startInsert(() => {});
        break;
      case "o":
        this.snapshot();
        this.buffer.splice(this.cursor.row + 1, 0, "");
        this.cursor = { row: this.cursor.row + 1, col: 0 };
        this.modified = true;
        this.enterInsert();
        break;
      case "O":
        this.snapshot();
        this.buffer.splice(this.cursor.row, 0, "");
        this.cursor = { row: this.cursor.row, col: 0 };
        this.modified = true;
        this.enterInsert();
        break;
      case "x":
      case "<Del>":
        this.doDeleteChars(n);
        break;
      case "X":
        this.doDeleteBefore(n);
        break;
      case "s":
        this.snapshot();
        this.doDeleteChars(n);
        this.enterInsert();
        break;
      case "S":
        this.pendingOp = "c";
        this.applyLinewise("c", n);
        break;
      case "D":
        this.pendingOp = "d";
        this.applyOpRange({ start: { ...this.cursor }, end: { row: this.cursor.row, col: this.line().length }, linewise: false });
        this.pendingOp = null;
        break;
      case "C":
        this.pendingOp = "c";
        this.applyOpRange({ start: { ...this.cursor }, end: { row: this.cursor.row, col: this.line().length }, linewise: false });
        this.pendingOp = null;
        break;
      case "Y":
        this.register = { text: this.line() + "\n", linewise: true };
        break;
      case "p":
        this.paste(true);
        break;
      case "P":
        this.paste(false);
        break;
      case "u":
        this.undo();
        break;
      case "<C-r>":
        this.redo();
        break;
      case ".":
        if (this.lastChange) this.lastChange();
        break;
      case "J":
        this.joinLines(n);
        break;
      case "~":
        this.toggleCase(n);
        break;
      case "R":
        this.snapshot();
        this.mode = "replace";
        this.applyCursorShape();
        break;
      case "v":
        this.vStart = { ...this.cursor };
        this.mode = "visual";
        break;
      case "V":
        this.vStart = { ...this.cursor };
        this.mode = "vline";
        break;
      case "n":
        this.searchNext(this.lastSearchDir);
        break;
      case "N":
        this.searchNext(-this.lastSearchDir);
        break;
      case "*":
        this.searchWord(1);
        break;
      case "#":
        this.searchWord(-1);
        break;
      case ":":
        this.mode = "command";
        this.cmdPrefix = ":";
        this.cmdline = "";
        break;
      case "/":
        this.mode = "command";
        this.cmdPrefix = "/";
        this.cmdline = "";
        break;
      case "?":
        this.mode = "command";
        this.cmdPrefix = "?";
        this.cmdline = "";
        break;
      case "<C-d>":
        this.scroll(Math.floor(this.textRows() / 2));
        break;
      case "<C-u>":
        this.scroll(-Math.floor(this.textRows() / 2));
        break;
      case "<C-f>":
        this.scroll(this.textRows() - 2);
        break;
      case "<C-b>":
        this.scroll(-(this.textRows() - 2));
        break;
      case "<C-e>":
        this.top = Math.min(this.buffer.length - 1, this.top + 1);
        break;
      case "<C-y>":
        this.top = Math.max(0, this.top - 1);
        break;
      case " ":
        this.leaderPending = true; // <leader> (space)
        break;
      case "z":
        // zz (center) — 簡易
        this.top = Math.max(0, this.cursor.row - Math.floor(this.textRows() / 2));
        break;
      case "<Esc>":
        break;
      case "<C-w>":
        this.statusMsg = "(ペイン操作は ctrl+shift+v 等のグローバルキー)";
        break;
      default:
        break;
    }
  }

  private doDeleteChars(n: number): void {
    this.snapshot();
    const l = this.line();
    const end = Math.min(l.length, this.cursor.col + n);
    this.register = { text: l.slice(this.cursor.col, end), linewise: false };
    this.buffer[this.cursor.row] = l.slice(0, this.cursor.col) + l.slice(end);
    this.modified = true;
    this.clampCursor();
    this.lastChange = () => this.doDeleteChars(n);
  }
  private doDeleteBefore(n: number): void {
    this.snapshot();
    const l = this.line();
    const start = Math.max(0, this.cursor.col - n);
    this.buffer[this.cursor.row] = l.slice(0, start) + l.slice(this.cursor.col);
    this.cursor.col = start;
    this.modified = true;
  }
  private doReplaceChar(ch: string): void {
    if (ch.length !== 1 || ch < " ") return;
    this.snapshot();
    const l = this.line();
    if (this.cursor.col < l.length) {
      this.buffer[this.cursor.row] = l.slice(0, this.cursor.col) + ch + l.slice(this.cursor.col + 1);
      this.modified = true;
    }
    this.lastChange = () => this.doReplaceChar(ch);
  }
  private joinLines(n: number): void {
    this.snapshot();
    const cnt = Math.max(1, n - 1) || 1;
    for (let k = 0; k < cnt; k++) {
      if (this.cursor.row >= this.buffer.length - 1) break;
      const cur = this.buffer[this.cursor.row];
      const next = this.buffer[this.cursor.row + 1].replace(/^\s+/, "");
      this.cursor.col = cur.length;
      this.buffer[this.cursor.row] = cur.replace(/\s+$/, "") + (cur.trim() && next ? " " : "") + next;
      this.buffer.splice(this.cursor.row + 1, 1);
    }
    this.modified = true;
    this.lastChange = () => this.joinLines(n);
  }
  private toggleCase(n: number): void {
    this.snapshot();
    const l = this.line();
    let s = "";
    const end = Math.min(l.length, this.cursor.col + n);
    for (let i = this.cursor.col; i < end; i++) {
      const ch = l[i];
      s += ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
    }
    this.buffer[this.cursor.row] = l.slice(0, this.cursor.col) + s + l.slice(end);
    this.cursor.col = Math.min(end, Math.max(0, this.line().length - 1));
    this.modified = true;
    this.lastChange = () => this.toggleCase(n);
  }

  private paste(after: boolean): void {
    this.snapshot();
    if (this.register.linewise) {
      const lines = this.register.text.replace(/\n$/, "").split("\n");
      const at = after ? this.cursor.row + 1 : this.cursor.row;
      this.buffer.splice(at, 0, ...lines);
      this.cursor = { row: at, col: this.firstNonBlank(at) };
    } else {
      const l = this.line();
      const at = after ? Math.min(l.length, this.cursor.col + 1) : this.cursor.col;
      const parts = this.register.text.split("\n");
      if (parts.length === 1) {
        this.buffer[this.cursor.row] = l.slice(0, at) + this.register.text + l.slice(at);
        this.cursor.col = at + this.register.text.length - 1;
      } else {
        const tail = l.slice(at);
        this.buffer[this.cursor.row] = l.slice(0, at) + parts[0];
        const mid = parts.slice(1);
        mid[mid.length - 1] += tail;
        this.buffer.splice(this.cursor.row + 1, 0, ...mid);
        this.cursor = { row: this.cursor.row + 1, col: 0 };
      }
    }
    this.modified = true;
    this.clampCursor();
    this.lastChange = () => this.paste(after);
  }

  // ===== insert / replace =====
  private startInsert(_pre: () => void): void {
    this.snapshot();
    this.enterInsert();
  }
  private enterInsert(): void {
    this.mode = "insert";
    this.insertedText = "";
    this.applyCursorShape();
  }
  private handleInsert(key: string): void {
    if (key === "<Esc>" || key === "<C-c>") {
      this.mode = "normal";
      this.cursor.col = Math.max(0, this.cursor.col - 1);
      this.clampCursor();
      this.applyCursorShape();
      const inserted = this.insertedText;
      this.lastChange = () => {
        this.snapshot();
        for (const ch of inserted) this.insertChar(ch === "\n" ? "<CR>" : ch);
        this.mode = "normal";
        this.cursor.col = Math.max(0, this.cursor.col - 1);
      };
      return;
    }
    if (key === "<CR>") {
      this.insertNewline();
      this.insertedText += "\n";
      return;
    }
    if (key === "<BS>") {
      this.insertBackspace();
      return;
    }
    if (key === "<Tab>") {
      this.insertText("  ");
      this.insertedText += "  ";
      return;
    }
    if (key === "<Left>") {
      this.cursor.col = Math.max(0, this.cursor.col - 1);
      return;
    }
    if (key === "<Right>") {
      this.cursor.col = Math.min(this.line().length, this.cursor.col + 1);
      return;
    }
    if (key === "<Up>") {
      this.cursor.row = Math.max(0, this.cursor.row - 1);
      this.cursor.col = Math.min(this.cursor.col, this.line().length);
      return;
    }
    if (key === "<Down>") {
      this.cursor.row = Math.min(this.buffer.length - 1, this.cursor.row + 1);
      this.cursor.col = Math.min(this.cursor.col, this.line().length);
      return;
    }
    if (key.startsWith("<")) return; // 他の制御は無視
    if (this.mode === "replace") {
      const l = this.line();
      if (this.cursor.col < l.length) this.buffer[this.cursor.row] = l.slice(0, this.cursor.col) + key + l.slice(this.cursor.col + 1);
      else this.buffer[this.cursor.row] = l + key;
      this.cursor.col++;
      this.modified = true;
      return;
    }
    this.insertChar(key);
    this.insertedText += key;
  }
  private insertChar(key: string): void {
    if (key === "<CR>") {
      this.insertNewline();
      return;
    }
    this.insertText(key);
  }
  private insertText(text: string): void {
    const l = this.line();
    this.buffer[this.cursor.row] = l.slice(0, this.cursor.col) + text + l.slice(this.cursor.col);
    this.cursor.col += text.length;
    this.modified = true;
  }
  private insertNewline(): void {
    const l = this.line();
    const head = l.slice(0, this.cursor.col);
    const tail = l.slice(this.cursor.col);
    this.buffer[this.cursor.row] = head;
    this.buffer.splice(this.cursor.row + 1, 0, tail);
    this.cursor = { row: this.cursor.row + 1, col: 0 };
    this.modified = true;
  }
  private insertBackspace(): void {
    if (this.cursor.col > 0) {
      const l = this.line();
      this.buffer[this.cursor.row] = l.slice(0, this.cursor.col - 1) + l.slice(this.cursor.col);
      this.cursor.col--;
    } else if (this.cursor.row > 0) {
      const prev = this.buffer[this.cursor.row - 1];
      const cur = this.buffer[this.cursor.row];
      this.cursor = { row: this.cursor.row - 1, col: prev.length };
      this.buffer[this.cursor.row] = prev + cur;
      this.buffer.splice(this.cursor.row + 1, 1);
    }
    this.modified = true;
  }

  // ===== visual =====
  private handleVisual(key: string): void {
    if (key === "<Esc>") {
      this.mode = "normal";
      this.clampCursor();
      return;
    }
    if (key === "o") {
      const t = this.cursor;
      this.cursor = this.vStart;
      this.vStart = t;
      return;
    }
    if (key === "v") {
      this.mode = this.mode === "visual" ? "vline" : "visual";
      return;
    }
    if (key === "d" || key === "x" || key === "y" || key === "c" || key === ">" || key === "<" || key === "~" || key === "u" || key === "U") {
      this.visualOperate(key);
      return;
    }
    if (key === ":") {
      this.mode = "command";
      this.cmdPrefix = ":";
      this.cmdline = "'<,'>";
      return;
    }
    if (key === "i" || key === "a") {
      this.awaitObj = key;
      this.pendingOp = "_v"; // visual textobj marker
      this.handleVisualTextobjWait();
      return;
    }
    if (/^[1-9]$/.test(key) || (key === "0" && this.count !== "")) {
      this.count += key;
      return;
    }
    const n = this.count ? parseInt(this.count, 10) : 1;
    const m = this.computeMotion(key, n);
    if (m) {
      this.cursor = { row: m.row, col: m.col };
      this.desiredCol = m.col;
    } else if (key === "f" || key === "F" || key === "t" || key === "T") {
      this.awaitChar = key;
    }
    this.count = "";
  }

  private handleVisualTextobjWait(): void {
    // 次のキーで textObject を取る (awaitObj は handleNormal 経由でなく visual 用に処理)
    const orig = this.awaitObj;
    this.awaitObj = null;
    this.pendingOp = null;
    void orig;
  }

  private visualOperate(key: string): void {
    let { start, end } = this.visualRange();
    const linewise = this.mode === "vline";
    this.pendingOp = key === "x" ? "d" : key === "U" ? "c" : key;
    if (key === "y" || key === "d" || key === "x" || key === "c") {
      this.applyOpRange({ start, end, linewise });
    } else if (key === ">" || key === "<") {
      this.pendingOp = key;
      this.applyOpRange({ start: { row: start.row, col: 0 }, end: { row: end.row, col: 0 }, linewise: true });
    } else if (key === "~" || key === "u" || key === "U") {
      this.snapshot();
      for (let r = start.row; r <= end.row; r++) {
        const l = this.buffer[r];
        const s = r === start.row && !linewise ? start.col : 0;
        const e = r === end.row && !linewise ? end.col : l.length;
        let out = l.slice(0, s);
        for (let i = s; i < e; i++) {
          const ch = l[i];
          out += key === "u" ? ch.toLowerCase() : key === "U" ? ch.toUpperCase() : ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
        }
        out += l.slice(e);
        this.buffer[r] = out;
      }
      this.cursor = { ...start };
      this.modified = true;
    }
    this.pendingOp = null;
    this.mode = "normal";
    this.clampCursor();
  }

  private visualRange(): { start: Pos; end: Pos } {
    let a = this.vStart;
    let b = this.cursor;
    if (b.row < a.row || (b.row === a.row && b.col < a.col)) [a, b] = [b, a];
    return { start: { ...a }, end: { row: b.row, col: b.col + 1 } };
  }

  // ===== command line / ex / search =====
  private handleCmdline(key: string): void {
    if (key === "<Esc>") {
      this.mode = "normal";
      this.cmdline = "";
      return;
    }
    if (key === "<CR>") {
      const cmd = this.cmdline;
      const prefix = this.cmdPrefix;
      this.mode = "normal";
      this.cmdline = "";
      if (prefix === ":") this.execEx(cmd);
      else this.doSearch(cmd, prefix === "/" ? 1 : -1);
      return;
    }
    if (key === "<BS>") {
      if (this.cmdline === "") {
        this.mode = "normal";
        return;
      }
      this.cmdline = this.cmdline.slice(0, -1);
      return;
    }
    if (key.length === 1 && key >= " ") this.cmdline += key;
  }

  private execEx(cmd: string): void {
    cmd = cmd.trim();
    const rangeMatch = /^('<,'>|%|\d+(?:,\d+)?)?\s*(.*)$/.exec(cmd);
    const range = rangeMatch?.[1] ?? "";
    const rest = rangeMatch?.[2] ?? cmd;
    // 数字だけ → 行移動
    if (/^\d+$/.test(cmd)) {
      this.gotoLine(parseInt(cmd, 10));
      return;
    }
    if (cmd === "$") {
      this.gotoLine(this.buffer.length);
      return;
    }
    const sub = /^s(.)(.*)$/.exec(rest) || /^substitute(.)(.*)$/.exec(rest);
    if (sub || /^%?s[\/#|]/.test(rest)) {
      this.doSubstitute(range || (cmd.startsWith("%") ? "%" : ""), rest);
      return;
    }
    const parts = rest.split(/\s+/);
    const c = parts[0];
    const bang = c.endsWith("!");
    const base = bang ? c.slice(0, -1) : c;
    switch (base) {
      case "w":
      case "write":
        this.save(parts[1]);
        break;
      case "wq":
      case "x":
      case "xit":
        this.save(parts[1]);
        this.quit();
        break;
      case "q":
      case "quit":
        if (this.modified && !bang) this.statusMsg = "E37: No write since last change (add ! to override)";
        else this.quit();
        break;
      case "qa":
      case "qall":
      case "quitall":
        this.quit();
        break;
      case "wa":
        this.save(undefined);
        break;
      case "set":
        this.doSet(parts.slice(1));
        break;
      case "noh":
      case "nohl":
      case "nohlsearch":
        this.showSearch = false;
        break;
      case "e":
      case "edit":
        if (parts[1]) {
          this.absPath = this.vfs.resolve(this.cwd, parts[1]);
          this.filename = parts[1];
          this.isNewFile = false;
          this.loadFile();
          this.cursor = { row: 0, col: 0 };
          this.top = 0;
        }
        break;
      case "d":
      case "delete":
        this.snapshot();
        this.buffer.splice(this.cursor.row, 1);
        if (this.buffer.length === 0) this.buffer = [""];
        this.clampCursor();
        this.modified = true;
        break;
      default:
        this.statusMsg = `E492: Not an editor command: ${rest}`;
    }
  }

  private doSet(opts: string[]): void {
    for (const o of opts) {
      if (o === "nu" || o === "number") this.numberOpt = true;
      else if (o === "nonu" || o === "nonumber") this.numberOpt = false;
      else if (o === "rnu" || o === "relativenumber") this.relativeNumber = true;
      else if (o === "nornu" || o === "norelativenumber") this.relativeNumber = false;
      else if (o === "hls" || o === "hlsearch") {
        this.hlsearch = true;
        this.showSearch = true;
      } else if (o === "nohls" || o === "nohlsearch") this.hlsearch = false;
    }
  }

  private doSubstitute(range: string, expr: string): void {
    const m = /^%?s(.)(.*)$/.exec(expr);
    if (!m) return;
    const delim = m[1];
    const parts: string[] = [];
    let cur = "";
    const body = m[2];
    for (let i = 0; i < body.length; i++) {
      if (body[i] === "\\" && body[i + 1] === delim) {
        cur += delim;
        i++;
      } else if (body[i] === delim) {
        parts.push(cur);
        cur = "";
      } else cur += body[i];
    }
    parts.push(cur);
    const pat = parts[0];
    const rep = parts[1] ?? "";
    const flags = parts[2] ?? "";
    const global = flags.includes("g");
    const ic = flags.includes("i");
    let re: RegExp;
    try {
      re = makeRegex(pat, { extended: false, ignoreCase: ic, global: true });
    } catch {
      this.statusMsg = "E486: Pattern error";
      return;
    }
    let r1 = this.cursor.row;
    let r2 = this.cursor.row;
    if (range === "%") {
      r1 = 0;
      r2 = this.buffer.length - 1;
    } else if (range === "'<,'>") {
      const vr = this.visualRange();
      r1 = vr.start.row;
      r2 = vr.end.row;
    } else if (/^\d+,\d+$/.test(range)) {
      const [a, b] = range.split(",").map((x) => parseInt(x, 10) - 1);
      r1 = a;
      r2 = b;
    }
    this.snapshot();
    let count = 0;
    const replJs = rep.replace(/\\(\d)/g, "$$$1").replace(/&/g, "$$&").replace(/\\n/g, "\n");
    for (let r = r1; r <= r2 && r < this.buffer.length; r++) {
      const orig = this.buffer[r];
      re.lastIndex = 0;
      if (global) {
        this.buffer[r] = orig.replace(re, (...a) => {
          count++;
          return this.expandRepl(replJs, a);
        });
      } else {
        let done = false;
        this.buffer[r] = orig.replace(re, (...a) => {
          if (done) return a[0];
          done = true;
          count++;
          return this.expandRepl(replJs, a);
        });
      }
    }
    this.modified = count > 0;
    this.clampCursor();
    this.statusMsg = count ? `${count} substitution(s)` : "E486: Pattern not found: " + pat;
  }
  private expandRepl(tmpl: string, matchArgs: unknown[]): string {
    const groups = matchArgs.slice(0, -2) as string[];
    return tmpl.replace(/\$(\d|&)/g, (_, g: string) => {
      if (g === "&") return groups[0] ?? "";
      return groups[parseInt(g, 10)] ?? "";
    });
  }

  private doSearch(pat: string, dir: number): void {
    if (pat) {
      this.lastSearch = pat;
      this.lastSearchDir = dir;
    }
    this.showSearch = true;
    this.searchNext(dir);
  }
  private searchNext(dir: number): void {
    if (!this.lastSearch) return;
    let re: RegExp;
    try {
      re = makeRegex(this.lastSearch, { extended: false, global: true });
    } catch {
      return;
    }
    const total = this.buffer.length;
    let { row, col } = this.cursor;
    for (let step = 0; step <= total; step++) {
      const r = ((row + dir * step) % total + total) % total;
      const l = this.buffer[r];
      const matches: number[] = [];
      re.lastIndex = 0;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(l)) !== null) {
        matches.push(mm.index);
        if (mm.index === re.lastIndex) re.lastIndex++;
      }
      if (matches.length === 0) {
        col = dir > 0 ? -1 : Infinity;
        continue;
      }
      if (dir > 0) {
        const target = matches.find((x) => step === 0 ? x > this.cursor.col : true);
        if (target !== undefined) {
          this.cursor = { row: r, col: target };
          return;
        }
      } else {
        const cand = matches.filter((x) => (step === 0 ? x < this.cursor.col : true));
        if (cand.length) {
          this.cursor = { row: r, col: cand[cand.length - 1] };
          return;
        }
      }
      col = dir > 0 ? -1 : Infinity;
    }
    this.statusMsg = "E486: Pattern not found: " + this.lastSearch;
  }
  private searchWord(dir: number): void {
    const l = this.line();
    let s = this.cursor.col;
    let e = this.cursor.col;
    while (s > 0 && /\w/.test(l[s - 1])) s--;
    while (e < l.length && /\w/.test(l[e])) e++;
    const word = l.slice(s, e);
    if (!word) return;
    this.lastSearch = "\\<" + word + "\\>";
    this.lastSearchDir = dir;
    this.showSearch = true;
    this.searchNext(dir);
  }

  // ===== ファイル保存/終了 =====
  private save(name?: string): void {
    const target = name ? this.vfs.resolve(this.cwd, name) : this.absPath;
    if (!target) {
      this.statusMsg = "E32: No file name";
      return;
    }
    const content = this.buffer.join("\n") + "\n";
    const node = this.vfs.stat(target);
    if (node && node.type === "file") {
      node.content = content;
      node.mtime = new Date();
    } else {
      this.vfs.createFile(target, content);
    }
    this.modified = false;
    if (!this.absPath) this.absPath = target;
    this.statusMsg = `"${name ?? this.filename}" ${this.buffer.length}L written`;
  }
  private quit(): void {
    this.done = true;
    this.onExit();
  }

  // ===== leader (which-key) =====
  private handleLeader(key: string): void {
    switch (key) {
      case "w":
        this.save(undefined);
        break;
      case "q":
        if (this.modified) this.statusMsg = "未保存の変更があります (:q! で破棄)";
        else this.quit();
        break;
      case "/":
        this.showSearch = false;
        break;
      case "e":
      case "f":
        this.statusMsg = `<leader>${key}: ファイル操作 (neo-tree/telescope) はサンドボックスでは簡略化`;
        break;
      default:
        this.statusMsg = `<leader>${key}`;
    }
  }

  private applyCursorShape(): void {
    // insert=bar, それ以外=block
    this.term.term.write(this.mode === "insert" ? "\x1b[6 q" : "\x1b[2 q");
  }

  // ===== 描画 =====
  private textRows(): number {
    return Math.max(1, this.term.rows - 2);
  }
  private gutterWidth(): number {
    if (!this.numberOpt && !this.relativeNumber) return 0;
    return Math.max(4, String(this.buffer.length).length + 1) + 1;
  }
  private scroll(delta: number): void {
    this.cursor.row = Math.min(this.buffer.length - 1, Math.max(0, this.cursor.row + delta));
    this.clampCursor();
  }
  private ensureVisible(): void {
    const rows = this.textRows();
    if (this.cursor.row < this.top) this.top = this.cursor.row;
    else if (this.cursor.row >= this.top + rows) this.top = this.cursor.row - rows + 1;
    if (this.top < 0) this.top = 0;
  }

  private render(): void {
    this.ensureVisible();
    const cols = this.term.cols;
    const rows = this.term.rows;
    const textRows = this.textRows();
    const gw = this.gutterWidth();
    let out = "\x1b[H";

    const sel = this.selectionBounds();
    for (let i = 0; i < textRows; i++) {
      const lineIdx = this.top + i;
      out += "\x1b[K";
      if (lineIdx < this.buffer.length) {
        out += this.renderGutter(lineIdx) + this.renderLine(lineIdx, sel, cols - gw);
      } else {
        out += "\x1b[38;2;60;70;100m~" + RESET;
      }
      out += "\r\n";
    }
    out += "\x1b[K" + this.statusLine(cols) + "\r\n";
    out += "\x1b[K" + this.bottomLine(cols);

    // カーソル位置
    if (this.mode === "command") {
      const col = 1 + this.cmdPrefix.length + this.cmdline.length;
      out += `\x1b[${rows};${col}H`;
    } else {
      const screenRow = this.cursor.row - this.top + 1;
      const dcol = gw + this.displayCol(this.cursor.row, this.cursor.col) + 1;
      out += `\x1b[${screenRow};${dcol}H`;
    }
    this.term.term.write(out);
  }

  private displayCol(row: number, col: number): number {
    const l = this.buffer[row] ?? "";
    let w = 0;
    for (let i = 0; i < col && i < l.length; i++) w += l[i] === "\t" ? 8 : charWidth(l[i]);
    return w;
  }

  private renderGutter(lineIdx: number): string {
    if (!this.numberOpt && !this.relativeNumber) return "";
    const width = this.gutterWidth() - 1;
    const isCur = lineIdx === this.cursor.row;
    let num: number;
    if (this.relativeNumber && !isCur) num = Math.abs(lineIdx - this.cursor.row);
    else num = lineIdx + 1;
    let str: string;
    if (this.relativeNumber && isCur && this.numberOpt) str = String(num).padEnd(width);
    else str = String(num).padStart(width);
    const color = isCur ? "\x1b[38;2;225;215;120m" : "\x1b[38;2;90;100;130m";
    return color + str + RESET + " ";
  }

  private selectionBounds(): { active: boolean; line: boolean; start: Pos; end: Pos } {
    if (this.mode !== "visual" && this.mode !== "vline") return { active: false, line: false, start: this.cursor, end: this.cursor };
    let a = this.vStart;
    let b = this.cursor;
    if (b.row < a.row || (b.row === a.row && b.col < a.col)) [a, b] = [b, a];
    return { active: true, line: this.mode === "vline", start: { ...a }, end: { ...b } };
  }

  private renderLine(lineIdx: number, sel: { active: boolean; line: boolean; start: Pos; end: Pos }, maxw: number): string {
    let l = (this.buffer[lineIdx] ?? "").replace(/\t/g, (_m, _o) => "        ");
    let searchRanges: Array<[number, number]> = [];
    if (this.showSearch && this.hlsearch && this.lastSearch) {
      try {
        const re = makeRegex(this.lastSearch, { extended: false, global: true });
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(l)) !== null) {
          searchRanges.push([mm.index, mm.index + mm[0].length]);
          if (mm.index === re.lastIndex) re.lastIndex++;
        }
      } catch {
        /* ignore */
      }
    }
    let selStart = -1;
    let selEnd = -1;
    if (sel.active && lineIdx >= sel.start.row && lineIdx <= sel.end.row) {
      if (sel.line) {
        selStart = 0;
        selEnd = l.length;
      } else {
        selStart = lineIdx === sel.start.row ? sel.start.col : 0;
        selEnd = lineIdx === sel.end.row ? sel.end.col + 1 : l.length;
      }
    }
    let out = "";
    for (let i = 0; i < l.length && i < maxw; i++) {
      const inSel = i >= selStart && i < selEnd;
      const inSearch = searchRanges.some(([s, e]) => i >= s && i < e);
      if (inSel) out += "\x1b[48;2;60;70;110m" + l[i] + RESET;
      else if (inSearch) out += "\x1b[48;2;120;100;30m\x1b[38;2;20;20;20m" + l[i] + RESET;
      else out += l[i];
    }
    if (sel.line && selStart >= 0) out += "\x1b[48;2;60;70;110m \x1b[0m";
    return out;
  }

  private statusLine(cols: number): string {
    const modeMap: Record<string, [string, string]> = {
      normal: ["NORMAL", "\x1b[48;2;122;162;247m\x1b[38;2;20;22;30m"],
      insert: ["INSERT", "\x1b[48;2;158;206;106m\x1b[38;2;20;22;30m"],
      visual: ["VISUAL", "\x1b[48;2;187;154;247m\x1b[38;2;20;22;30m"],
      vline: ["V-LINE", "\x1b[48;2;187;154;247m\x1b[38;2;20;22;30m"],
      replace: ["REPLACE", "\x1b[48;2;247;118;142m\x1b[38;2;20;22;30m"],
      command: ["COMMAND", "\x1b[48;2;122;162;247m\x1b[38;2;20;22;30m"],
    };
    const [label, color] = modeMap[this.mode] ?? modeMap.normal;
    const modeSeg = `${color} ${label} ${RESET}`;
    const fileSeg = `\x1b[48;2;40;44;62m\x1b[38;2;200;205;225m ${this.filename}${this.modified ? " [+]" : ""} ${RESET}`;
    const pos = `${this.cursor.row + 1}:${this.cursor.col + 1}`;
    const pct = this.buffer.length <= 1 ? "All" : `${Math.floor((this.cursor.row / (this.buffer.length - 1)) * 100)}%`;
    const right = `\x1b[48;2;40;44;62m\x1b[38;2;200;205;225m ${this.flavor === "nvim" ? "" : "vim"} ${pct} ${pos} ${RESET}`;
    const leftLen = label.length + 2 + this.filename.length + (this.modified ? 4 : 0) + 2;
    const rightLen = pos.length + pct.length + 8;
    const pad = Math.max(0, cols - leftLen - rightLen);
    return modeSeg + fileSeg + "\x1b[48;2;30;33;48m" + " ".repeat(pad) + RESET + right;
  }

  private bottomLine(cols: number): string {
    if (this.mode === "command") {
      return this.cmdPrefix + this.cmdline;
    }
    if (this.statusMsg) return "\x1b[38;2;200;205;225m" + this.statusMsg.slice(0, cols) + RESET;
    return "";
  }
}
