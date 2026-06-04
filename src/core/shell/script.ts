import { parseTokens, tokenize, type CommandList, type Token, type Word } from "./parser";

// ===== 制御フロー用シグナル =====
export class BreakSignal {
  constructor(public n = 1) {}
}
export class ContinueSignal {
  constructor(public n = 1) {}
}
export class ReturnSignal {
  constructor(public code = 0) {}
}
export class ExitSignal {
  constructor(public code = 0) {}
}

// ===== AST =====
export type Block = Stmt[];
export type Stmt =
  | { kind: "pipes"; list: CommandList }
  | { kind: "if"; clauses: Array<{ cond: Block; body: Block }>; elseBody: Block | null }
  | { kind: "for"; varName: string; words: Word[]; body: Block }
  | { kind: "loop"; until: boolean; cond: Block; body: Block }
  | { kind: "case"; word: Word; items: Array<{ patterns: Word[]; body: Block }> }
  | { kind: "func"; name: string; body: Block }
  | { kind: "group"; body: Block }
  | { kind: "pipeComp"; left: CommandList; right: Stmt };

const STRUCTURAL = new Set([
  "if", "then", "elif", "else", "fi", "for", "while", "until",
  "do", "done", "case", "esac", "in", "function", "{", "}",
]);

/** 単一の無クォートリテラル語ならその文字列、そうでなければ null。 */
function wordText(word: Word): string | null {
  if (word.length === 1 && word[0].kind === "lit" && word[0].quote === "none") return word[0].text;
  return null;
}
function plainText(word: Word): string {
  return word.map((f) => (f.kind === "lit" ? f.text : "")).join("");
}

class ScriptParser {
  private pos = 0;
  constructor(private toks: Token[]) {}

  private peek(o = 0): Token | undefined {
    return this.toks[this.pos + o];
  }
  private isOp(v: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === "op" && t.op === v;
  }
  private kwHere(): string | null {
    const t = this.peek();
    return t && t.t === "word" ? wordText(t.word) : null;
  }
  private isKw(kw: string): boolean {
    return this.kwHere() === kw;
  }
  private expectKw(kw: string): void {
    if (this.isKw(kw)) this.pos++;
  }
  private isDoubleSemi(): boolean {
    return this.isOp(";") && this.isOp(";", 1);
  }
  private skipSeps(stopDoubleSemi = false): void {
    while (this.isOp(";")) {
      if (stopDoubleSemi && this.isOp(";", 1)) break;
      this.pos++;
    }
  }

  parseProgram(): Block {
    return this.parseBlock(new Set());
  }

  private parseBlock(terminators: Set<string>, stopDoubleSemi = false): Block {
    const stmts: Block = [];
    for (;;) {
      this.skipSeps(stopDoubleSemi);
      const t = this.peek();
      if (!t) break;
      if (stopDoubleSemi && this.isDoubleSemi()) break;
      if (t.t === "word") {
        const kw = wordText(t.word);
        if (kw && terminators.has(kw)) break;
      }
      const before = this.pos;
      const stmt = this.parseStmt();
      if (!stmt || this.pos === before) {
        if (this.pos === before) this.pos++; // 無限ループ防止
        continue;
      }
      stmts.push(stmt);
    }
    return stmts;
  }

  private isCompoundKw(t: Token | undefined): boolean {
    if (!t || t.t !== "word") return false;
    const kw = wordText(t.word);
    return (
      kw === "if" || kw === "for" || kw === "while" || kw === "until" ||
      kw === "case" || kw === "function" || kw === "{" ||
      (!!kw && /^[A-Za-z_]\w*\(\)\{?$/.test(kw))
    );
  }

  private parseCompoundStmt(): Stmt | null {
    const t = this.peek();
    if (!t || t.t !== "word") return null;
    const kw = wordText(t.word);
    if (kw === "if") return this.parseIf();
    if (kw === "for") return this.parseFor();
    if (kw === "while") return this.parseLoop(false);
    if (kw === "until") return this.parseLoop(true);
    if (kw === "case") return this.parseCase();
    if (kw === "function") return this.parseFunctionKw();
    if (kw === "{") return this.parseGroup();
    const fm = kw ? /^([A-Za-z_]\w*)\(\)(\{?)$/.exec(kw) : null;
    if (fm) {
      this.pos++;
      return this.finishFunc(fm[1], fm[2] === "{");
    }
    return null;
  }

  private parseStmt(): Stmt | null {
    if (this.isCompoundKw(this.peek())) return this.parseCompoundStmt();
    const leaf = this.parsePipeLeaf();
    if (!leaf) return null;
    if (leaf.pipedCompound) {
      if (this.isOp("|")) this.pos++;
      const compound = this.parseCompoundStmt();
      if (compound) return { kind: "pipeComp", left: leaf.list, right: compound };
    }
    return { kind: "pipes", list: leaf.list };
  }

  private parsePipeLeaf(): { list: CommandList; pipedCompound: boolean } | null {
    const start = this.pos;
    let cmdPos = true;
    let pipedCompound = false;
    while (this.pos < this.toks.length) {
      const t = this.toks[this.pos];
      if (t.t === "op") {
        if (t.op === ";" && this.isOp(";", 1)) break; // ;;
        if (t.op === "|") {
          if (this.isCompoundKw(this.toks[this.pos + 1])) {
            pipedCompound = true;
            break;
          }
          cmdPos = true;
          this.pos++;
          continue;
        }
        if (t.op === ";" || t.op === "&&" || t.op === "||") {
          cmdPos = true;
          this.pos++;
          continue;
        }
        if ([">", ">>", "<", "2>", "2>>", "&>"].includes(t.op)) {
          this.pos++;
          if (this.toks[this.pos]?.t === "word") this.pos++;
          cmdPos = false;
          continue;
        }
        break;
      }
      if (cmdPos) {
        const kw = wordText(t.word);
        if (kw && STRUCTURAL.has(kw)) break;
      }
      cmdPos = false;
      this.pos++;
    }
    if (this.pos === start) return null;
    const slice = this.toks.slice(start, this.pos);
    return { list: parseTokens(slice), pipedCompound };
  }

  private parseIf(): Stmt {
    this.expectKw("if");
    const clauses: Array<{ cond: Block; body: Block }> = [];
    const cond = this.parseBlock(new Set(["then"]));
    this.expectKw("then");
    const body = this.parseBlock(new Set(["elif", "else", "fi"]));
    clauses.push({ cond, body });
    while (this.isKw("elif")) {
      this.pos++;
      const c = this.parseBlock(new Set(["then"]));
      this.expectKw("then");
      const b = this.parseBlock(new Set(["elif", "else", "fi"]));
      clauses.push({ cond: c, body: b });
    }
    let elseBody: Block | null = null;
    if (this.isKw("else")) {
      this.pos++;
      elseBody = this.parseBlock(new Set(["fi"]));
    }
    this.expectKw("fi");
    return { kind: "if", clauses, elseBody };
  }

  private parseFor(): Stmt {
    this.expectKw("for");
    const v = this.peek();
    const varName = v && v.t === "word" ? plainText(v.word) : "i";
    this.pos++;
    const words: Word[] = [];
    if (this.isKw("in")) {
      this.pos++;
      while (this.pos < this.toks.length) {
        const t = this.toks[this.pos];
        if (t.t === "op") {
          if (t.op === ";") break;
          this.pos++;
          continue;
        }
        if (wordText(t.word) === "do") break;
        words.push(t.word);
        this.pos++;
      }
    } else {
      words.push([{ kind: "lit", text: "$@", quote: "none" }]);
    }
    this.skipSeps();
    this.expectKw("do");
    const body = this.parseBlock(new Set(["done"]));
    this.expectKw("done");
    return { kind: "for", varName, words, body };
  }

  private parseLoop(until: boolean): Stmt {
    this.expectKw(until ? "until" : "while");
    const cond = this.parseBlock(new Set(["do"]));
    this.expectKw("do");
    const body = this.parseBlock(new Set(["done"]));
    this.expectKw("done");
    return { kind: "loop", until, cond, body };
  }

  private parseCase(): Stmt {
    this.expectKw("case");
    const wt = this.peek();
    const word = wt && wt.t === "word" ? wt.word : [];
    this.pos++;
    this.expectKw("in");
    const items: Array<{ patterns: Word[]; body: Block }> = [];
    this.skipSeps();
    while (!this.isKw("esac") && this.pos < this.toks.length) {
      this.skipSeps();
      if (this.isKw("esac")) break;
      if (this.isOp("(")) this.pos++;
      const patterns: Word[] = [];
      // パターン: word ( "|" word )* 最後の word は ")" 付き
      for (;;) {
        const pt = this.peek();
        if (!pt || pt.t !== "word") break;
        let w = pt.word;
        const txt = plainText(w);
        const closes = txt.endsWith(")");
        if (closes) {
          // 末尾の ) を除去
          w = stripTrailingParen(w);
        }
        patterns.push(w);
        this.pos++;
        if (closes) break;
        if (this.isOp("|")) {
          this.pos++;
          continue;
        }
        if (this.isOp(")")) {
          this.pos++;
          break;
        }
        break;
      }
      const body = this.parseBlock(new Set(["esac"]), true);
      items.push({ patterns, body });
      // ;; を消費
      if (this.isDoubleSemi()) {
        this.pos += 2;
      }
    }
    this.expectKw("esac");
    return { kind: "case", word, items };
  }

  private parseFunctionKw(): Stmt {
    this.expectKw("function");
    const nt = this.peek();
    const raw = nt && nt.t === "word" ? plainText(nt.word) : "f";
    this.pos++;
    const m = /^([A-Za-z_]\w*)(?:\(\))?(\{?)$/.exec(raw);
    if (m) return this.finishFunc(m[1], m[2] === "{");
    return this.finishFunc(raw.replace(/\(\)$/, ""));
  }

  private finishFunc(name: string, braceGlued = false): Stmt {
    this.skipSeps();
    if (!braceGlued) this.expectKw("{");
    const body = this.parseBlock(new Set(["}"]));
    this.expectKw("}");
    return { kind: "func", name, body };
  }

  private parseGroup(): Stmt {
    this.expectKw("{");
    const body = this.parseBlock(new Set(["}"]));
    this.expectKw("}");
    return { kind: "group", body };
  }
}

function stripTrailingParen(word: Word): Word {
  const out = word.map((f) => ({ ...f }));
  for (let i = out.length - 1; i >= 0; i--) {
    const f = out[i];
    if (f.kind === "lit" && f.text.endsWith(")")) {
      f.text = f.text.slice(0, -1);
      break;
    }
    if (f.kind === "lit" && f.text === "") continue;
    break;
  }
  return out.filter((f) => !(f.kind === "lit" && f.text === "" && f.quote === "none")) as Word;
}

export function parseScript(input: string): Block {
  return new ScriptParser(tokenize(input)).parseProgram();
}

/** 制御構文/関数定義/算術を含むか (含めばスクリプト実行に回す)。 */
export function looksLikeScript(input: string): boolean {
  const toks = tokenize(input);
  let cmdPos = true;
  for (const t of toks) {
    if (t.t === "op") {
      cmdPos = t.op === ";" || t.op === "&&" || t.op === "||" || t.op === "|";
      continue;
    }
    const kw = wordText(t.word);
    if (cmdPos && kw && (STRUCTURAL.has(kw) || /^[A-Za-z_]\w*\(\)\{?$/.test(kw))) {
      if (kw !== "{" && kw !== "}") return true;
      if (kw === "{") return true;
    }
    cmdPos = false;
  }
  return false;
}
