import type { Terminal } from "@xterm/xterm";
import { charWidth } from "./wcwidth";
import { dim, stripAnsi } from "./ansi";
import { parseKeys, type KeyAction } from "./keys";
import type { History } from "./History";

export interface CompletionResult {
  /** 候補一覧 */
  items: string[];
  /** 置換開始位置 (コードポイント単位の index) */
  replaceFrom: number;
}

export type Completer = (line: string, cursor: number) => CompletionResult | null;

export interface LineEditorOptions {
  prompt: () => string;
  onSubmit: (line: string) => void;
  history: History;
  completer?: Completer;
}

interface Pos {
  row: number;
  col: number;
}

/** 1文字ずつ配置して、offset 位置の (row,col) を求める (eager-wrap)。 */
function layoutPos(chars: string[], offset: number, cols: number): Pos {
  let row = 0;
  let col = 0;
  for (let k = 0; k < offset; k++) {
    const w = charWidth(chars[k]);
    if (col + w > cols) {
      row++;
      col = 0;
    }
    col += w;
    if (col === cols) {
      row++;
      col = 0;
    }
  }
  return { row, col };
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function commonPrefix(items: string[]): string {
  if (items.length === 0) return "";
  let prefix = items[0];
  for (const s of items) {
    let i = 0;
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
}

/**
 * bash の readline 風ライン編集。
 * 行折返し・全角幅・履歴・補完・逆 i-search に対応する。
 */
export class LineEditor {
  private term: Terminal;
  private opts: LineEditorOptions;

  private chars: string[] = [];
  private cursor = 0;
  private lastCursorRow = 0;
  private reading = false;
  private killRing = "";

  private histIndex = 0;
  private draft = "";

  // 逆 i-search
  private searching = false;
  private searchQuery = "";
  private searchMatchIndex = -1;

  constructor(term: Terminal, opts: LineEditorOptions) {
    this.term = term;
    this.opts = opts;
  }

  get line(): string {
    return this.chars.join("");
  }

  get isReading(): boolean {
    return this.reading;
  }

  /** 新しいプロンプトを表示して入力受付を開始。 */
  prompt(): void {
    this.chars = [];
    this.cursor = 0;
    this.lastCursorRow = 0;
    this.reading = true;
    this.searching = false;
    this.histIndex = this.opts.history.length;
    this.draft = "";
    this.term.write(this.opts.prompt());
  }

  /** 出力行をそのまま表示 (コマンド結果用)。 */
  println(text: string): void {
    this.term.write(text.replace(/\n/g, "\r\n") + "\r\n");
  }

  /** システム通知 (モード切替案内など) を表示して再プロンプト。 */
  systemNotice(text: string): void {
    if (this.reading) {
      this.moveToEnd();
      this.term.write("\r\n");
    }
    this.term.write(dim(text) + "\r\n");
    this.prompt();
  }

  onData(data: string): void {
    if (!this.reading) return;
    for (const action of parseKeys(data)) {
      if (this.searching) this.handleSearchKey(action);
      else this.handleKey(action);
    }
  }

  // ---- 描画 ----
  private render(): void {
    const cols = Math.max(this.term.cols, 1);
    const promptVisible = stripAnsi(this.opts.prompt());
    const promptChars = [...promptVisible];
    const allChars = promptChars.concat(this.chars);
    const cursorOffset = promptChars.length + this.cursor;

    let seq = "";
    if (this.lastCursorRow > 0) seq += `\x1b[${this.lastCursorRow}A`;
    seq += "\r\x1b[J";
    seq += this.opts.prompt() + this.chars.join("");

    const end = layoutPos(allChars, allChars.length, cols);
    const cur = layoutPos(allChars, cursorOffset, cols);
    if (end.row > cur.row) seq += `\x1b[${end.row - cur.row}A`;
    seq += "\r";
    if (cur.col > 0) seq += `\x1b[${cur.col}C`;

    this.term.write(seq);
    this.lastCursorRow = cur.row;
  }

  private moveToEnd(): void {
    this.cursor = this.chars.length;
    this.render();
  }

  // ---- 編集操作 ----
  private insert(text: string): void {
    const cp = [...text];
    this.chars.splice(this.cursor, 0, ...cp);
    this.cursor += cp.length;
    this.render();
  }

  private backspace(): void {
    if (this.cursor > 0) {
      this.chars.splice(this.cursor - 1, 1);
      this.cursor--;
      this.render();
    }
  }

  private deleteChar(): void {
    if (this.cursor < this.chars.length) {
      this.chars.splice(this.cursor, 1);
      this.render();
    }
  }

  private move(delta: number): void {
    const next = Math.min(Math.max(this.cursor + delta, 0), this.chars.length);
    if (next !== this.cursor) {
      this.cursor = next;
      this.render();
    }
  }

  private prevWord(): number {
    let i = this.cursor;
    while (i > 0 && isSpace(this.chars[i - 1])) i--;
    while (i > 0 && !isSpace(this.chars[i - 1])) i--;
    return i;
  }

  private nextWord(): number {
    let i = this.cursor;
    const n = this.chars.length;
    while (i < n && isSpace(this.chars[i])) i++;
    while (i < n && !isSpace(this.chars[i])) i++;
    return i;
  }

  private kill(from: number, to: number): void {
    if (from >= to) return;
    this.killRing = this.chars.slice(from, to).join("");
    this.chars.splice(from, to - from);
    this.cursor = from;
    this.render();
  }

  private transpose(): void {
    const n = this.chars.length;
    if (n < 2) return;
    let i = this.cursor;
    if (i === 0) return;
    if (i >= n) i = n - 1;
    const tmp = this.chars[i - 1];
    this.chars[i - 1] = this.chars[i];
    this.chars[i] = tmp;
    this.cursor = Math.min(i + 1, n);
    this.render();
  }

  private clearScreen(): void {
    this.term.write("\x1b[2J\x1b[3J\x1b[H");
    this.lastCursorRow = 0;
    this.render();
  }

  private submit(): void {
    this.moveToEnd();
    this.term.write("\r\n");
    const line = this.line;
    this.reading = false;
    this.opts.history.add(line);
    this.opts.onSubmit(line);
  }

  // ---- 履歴 ----
  private setBuffer(text: string): void {
    this.chars = [...text];
    this.cursor = this.chars.length;
    this.render();
  }

  private historyPrev(): void {
    const h = this.opts.history;
    if (this.histIndex === 0) return;
    if (this.histIndex === h.length) this.draft = this.line;
    this.histIndex--;
    this.setBuffer(h.get(this.histIndex));
  }

  private historyNext(): void {
    const h = this.opts.history;
    if (this.histIndex >= h.length) return;
    this.histIndex++;
    const text = this.histIndex === h.length ? this.draft : h.get(this.histIndex);
    this.setBuffer(text);
  }

  // ---- 補完 ----
  private complete(): void {
    const completer = this.opts.completer;
    if (!completer) return;
    const res = completer(this.line, this.cursor);
    if (!res || res.items.length === 0) return;

    if (res.items.length === 1) {
      this.applyCompletion(res.replaceFrom, res.items[0]);
      return;
    }
    const prefix = commonPrefix(res.items);
    const typed = this.chars.slice(res.replaceFrom, this.cursor).join("");
    if (prefix.length > typed.length) {
      this.applyCompletion(res.replaceFrom, prefix);
    } else {
      this.moveToEnd();
      this.term.write("\r\n");
      this.term.write(this.formatColumns(res.items) + "\r\n");
      this.lastCursorRow = 0;
      this.render();
    }
  }

  private applyCompletion(from: number, value: string): void {
    const cp = [...value];
    this.chars.splice(from, this.cursor - from, ...cp);
    this.cursor = from + cp.length;
    this.render();
  }

  private formatColumns(items: string[]): string {
    const cols = Math.max(this.term.cols, 20);
    const gap = 3;
    const width = Math.max(...items.map((s) => stripAnsi(s).length)) + gap;
    const perRow = Math.max(1, Math.floor(cols / width));
    const lines: string[] = [];
    for (let i = 0; i < items.length; i += perRow) {
      const row = items
        .slice(i, i + perRow)
        .map((s) => s + " ".repeat(Math.max(0, width - stripAnsi(s).length)))
        .join("");
      lines.push(row.trimEnd());
    }
    return lines.join("\r\n");
  }

  // ---- 逆 i-search ----
  private startSearch(): void {
    this.searching = true;
    this.searchQuery = "";
    this.searchMatchIndex = this.opts.history.length - 1;
    this.renderSearch();
  }

  private findMatch(fromIndex: number): number {
    const all = this.opts.history.all();
    for (let i = Math.min(fromIndex, all.length - 1); i >= 0; i--) {
      if (this.searchQuery === "" || all[i].includes(this.searchQuery)) return i;
    }
    return -1;
  }

  private currentMatch(): string {
    if (this.searchMatchIndex < 0) return "";
    return this.opts.history.get(this.searchMatchIndex);
  }

  private renderSearch(): void {
    const cols = Math.max(this.term.cols, 1);
    const match = this.currentMatch();
    const text = `(reverse-i-search)\`${this.searchQuery}': ${match}`;
    const chars = [...text];

    let seq = "";
    if (this.lastCursorRow > 0) seq += `\x1b[${this.lastCursorRow}A`;
    seq += "\r\x1b[J" + text;
    const end = layoutPos(chars, chars.length, cols);
    seq += "\r";
    this.lastCursorRow = end.row;
    this.term.write(seq);
  }

  private acceptSearch(): void {
    const match = this.currentMatch();
    this.searching = false;
    this.lastCursorRow = 0;
    this.term.write("\r\x1b[J");
    this.chars = [...match];
    this.cursor = this.chars.length;
    this.render();
  }

  private cancelSearch(): void {
    this.searching = false;
    this.lastCursorRow = 0;
    this.term.write("\r\x1b[J");
    this.chars = [];
    this.cursor = 0;
    this.render();
  }

  private handleSearchKey(a: KeyAction): void {
    switch (a.type) {
      case "text":
        this.searchQuery += a.text;
        this.searchMatchIndex = this.findMatch(this.opts.history.length - 1);
        this.renderSearch();
        break;
      case "backspace":
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.searchMatchIndex = this.findMatch(this.opts.history.length - 1);
        this.renderSearch();
        break;
      case "rsearch": {
        const next = this.findMatch(this.searchMatchIndex - 1);
        if (next >= 0) {
          this.searchMatchIndex = next;
          this.renderSearch();
        }
        break;
      }
      case "enter":
        this.acceptSearch();
        this.submit();
        break;
      case "escape":
      case "interrupt":
        this.acceptSearch();
        break;
      default:
        // それ以外のキーは検索を確定してから通常処理
        this.acceptSearch();
        this.handleKey(a);
        break;
    }
  }

  // ---- キーディスパッチ ----
  private handleKey(a: KeyAction): void {
    switch (a.type) {
      case "text":
        this.insert(a.text);
        break;
      case "enter":
        this.submit();
        break;
      case "backspace":
        this.backspace();
        break;
      case "deletechar":
        this.deleteChar();
        break;
      case "left":
        this.move(-1);
        break;
      case "right":
        this.move(1);
        break;
      case "home":
        if (this.cursor !== 0) {
          this.cursor = 0;
          this.render();
        }
        break;
      case "end":
        if (this.cursor !== this.chars.length) {
          this.cursor = this.chars.length;
          this.render();
        }
        break;
      case "wordleft": {
        const p = this.prevWord();
        if (p !== this.cursor) {
          this.cursor = p;
          this.render();
        }
        break;
      }
      case "wordright": {
        const p = this.nextWord();
        if (p !== this.cursor) {
          this.cursor = p;
          this.render();
        }
        break;
      }
      case "up":
        this.historyPrev();
        break;
      case "down":
        this.historyNext();
        break;
      case "histtop":
        if (this.opts.history.length > 0) {
          if (this.histIndex === this.opts.history.length) this.draft = this.line;
          this.histIndex = 0;
          this.setBuffer(this.opts.history.get(0));
        }
        break;
      case "histbottom":
        this.histIndex = this.opts.history.length;
        this.setBuffer(this.draft);
        break;
      case "killline":
        this.kill(this.cursor, this.chars.length);
        break;
      case "killstart":
        this.kill(0, this.cursor);
        break;
      case "killwordback":
        this.kill(this.prevWord(), this.cursor);
        break;
      case "killwordfwd":
        this.kill(this.cursor, this.nextWord());
        break;
      case "yank":
        if (this.killRing) this.insert(this.killRing);
        break;
      case "tab":
        this.complete();
        break;
      case "clear":
        this.clearScreen();
        break;
      case "interrupt":
        this.moveToEnd();
        this.term.write("^C\r\n");
        this.reading = false;
        this.prompt();
        break;
      case "rsearch":
        this.startSearch();
        break;
      case "transpose":
        this.transpose();
        break;
      case "escape":
      case "ignore":
        break;
    }
  }
}
