import { parse, type CommandList, type Pipeline, type SimpleCommand } from "./parser";
import { expandWord, expandSingle, type ExpandCtx } from "./expand";
import {
  BreakSignal,
  ContinueSignal,
  ExitSignal,
  ReturnSignal,
  looksLikeScript,
  parseScript,
  type Block,
  type Stmt,
} from "./script";
import type { VFS } from "../vfs/VFS";
import type { Environment } from "./Environment";
import type { Command, ExecContext, ShellServices } from "./types";

export interface ExecIO {
  print: (s: string) => void;
  printErr: (s: string) => void;
}

/** Damerau-Levenshtein (隣接文字の入れ替えを距離1として扱う)。 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

const SIGNAL_BUILTINS = new Set(["return", "break", "continue", "exit"]);
const SCRIPT_BUILTINS = new Set(["source", ".", "eval", "bash", "sh"]);
const SIMPLE_BUILTINS = new Set(["local", "shift", "set", "read", "declare", "typeset"]);

function caseMatch(s: string, pattern: string): boolean {
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if (c === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close < 0) re += "\\[";
      else {
        let inner = pattern.slice(i + 1, close);
        let neg = false;
        if (inner.startsWith("!") || inner.startsWith("^")) {
          neg = true;
          inner = inner.slice(1);
        }
        re += "[" + (neg ? "^" : "") + inner.replace(/\\/g, "\\\\") + "]";
        i = close;
      }
    } else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  re += "$";
  try {
    return new RegExp(re).test(s);
  } catch {
    return s === pattern;
  }
}

/** パイプライン・リダイレクト・&&/||・コマンド置換・スクリプト制御構文を解釈。 */
export class Executor {
  private functions = new Map<string, Block>();
  private localStack: Array<Array<[string, string | undefined]>> = [];
  /** パイプの右辺が複合コマンドのとき、内部の read が消費する入力 */
  private pipeInput: { lines: string[]; idx: number } | null = null;

  constructor(
    private vfs: VFS,
    private env: Environment,
    private registry: Map<string, Command>,
    private services: ShellServices,
    private aliases: Map<string, string>,
  ) {}

  run(line: string, io: ExecIO): number {
    try {
      if (looksLikeScript(line)) this.runBlock(parseScript(line), io);
      else this.runList(parse(line).list, io);
    } catch (e) {
      if (e instanceof ExitSignal) this.env.lastExit = e.code;
      else if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) {
        /* スクリプト外の制御文は無視 */
      } else throw e;
    }
    return this.env.lastExit;
  }

  // ===== スクリプト実行 =====
  private runScriptText(text: string, io: ExecIO): void {
    this.runBlock(parseScript(text), io);
  }

  private runBlock(block: Block, io: ExecIO): void {
    for (const stmt of block) this.execStmt(stmt, io);
  }

  private execStmt(stmt: Stmt, io: ExecIO): void {
    switch (stmt.kind) {
      case "pipes":
        this.runList(stmt.list, io);
        return;
      case "group":
        this.runBlock(stmt.body, io);
        return;
      case "func":
        this.functions.set(stmt.name, stmt.body);
        this.env.lastExit = 0;
        return;
      case "if": {
        for (const clause of stmt.clauses) {
          this.runBlock(clause.cond, io);
          if (this.env.lastExit === 0) {
            this.runBlock(clause.body, io);
            return;
          }
        }
        if (stmt.elseBody) this.runBlock(stmt.elseBody, io);
        return;
      }
      case "for": {
        const ectx = this.expandCtx();
        const values: string[] = [];
        for (const w of stmt.words) values.push(...expandWord(w, ectx));
        for (const val of values) {
          this.env.set(stmt.varName, val);
          try {
            this.runBlock(stmt.body, io);
          } catch (e) {
            if (e instanceof BreakSignal) {
              if (e.n > 1) {
                e.n--;
                throw e;
              }
              break;
            }
            if (e instanceof ContinueSignal) {
              if (e.n > 1) {
                e.n--;
                throw e;
              }
              continue;
            }
            throw e;
          }
        }
        return;
      }
      case "loop": {
        let guard = 0;
        for (;;) {
          this.runBlock(stmt.cond, io);
          const condTrue = this.env.lastExit === 0;
          if (stmt.until ? condTrue : !condTrue) break;
          if (++guard > 1000000) break;
          try {
            this.runBlock(stmt.body, io);
          } catch (e) {
            if (e instanceof BreakSignal) {
              if (e.n > 1) {
                e.n--;
                throw e;
              }
              break;
            }
            if (e instanceof ContinueSignal) {
              if (e.n > 1) {
                e.n--;
                throw e;
              }
              continue;
            }
            throw e;
          }
        }
        return;
      }
      case "pipeComp": {
        let captured = "";
        this.runList(stmt.left, { print: (s) => (captured += s), printErr: (s) => io.printErr(s) });
        const prev = this.pipeInput;
        const endsNL = captured.endsWith("\n");
        const lines = captured.split("\n");
        if (endsNL) lines.pop();
        this.pipeInput = { lines, idx: 0 };
        try {
          this.execStmt(stmt.right, io);
        } finally {
          this.pipeInput = prev;
        }
        return;
      }
      case "case": {
        const ectx = this.expandCtx();
        const subject = expandSingle(stmt.word, ectx);
        for (const item of stmt.items) {
          for (const pat of item.patterns) {
            if (caseMatch(subject, expandSingle(pat, ectx))) {
              this.runBlock(item.body, io);
              return;
            }
          }
        }
        this.env.lastExit = 0;
        return;
      }
    }
  }

  private runFunction(name: string, args: string[], io: ExecIO): number {
    const body = this.functions.get(name)!;
    const savedParams = this.env.positional;
    const savedName = this.env.scriptName;
    this.env.positional = args;
    const restore: Array<[string, string | undefined]> = [];
    this.localStack.push(restore);
    try {
      this.runBlock(body, io);
      return this.env.lastExit;
    } catch (e) {
      if (e instanceof ReturnSignal) {
        this.env.lastExit = e.code;
        return e.code;
      }
      throw e;
    } finally {
      for (const [k, v] of restore.slice().reverse()) {
        if (v === undefined) this.env.unset(k);
        else this.env.set(k, v);
      }
      this.localStack.pop();
      this.env.positional = savedParams;
      this.env.scriptName = savedName;
    }
  }

  // ===== パイプライン =====
  private runList(list: CommandList, io: ExecIO): number {
    let last = this.env.lastExit;
    for (const item of list) {
      if (item.op === "&&" && this.env.lastExit !== 0) continue;
      if (item.op === "||" && this.env.lastExit === 0) continue;
      const code = this.runPipeline(item.pipeline, io);
      this.env.lastExit = code;
      last = code;
    }
    return last;
  }

  private runPipeline(pipeline: Pipeline, io: ExecIO): number {
    const cmds = pipeline.commands.filter(
      (c) => c.words.length > 0 || c.assignments.length > 0 || c.redirs.length > 0,
    );
    if (cmds.length === 0) return 0;
    let input = "";
    let code = 0;
    for (let i = 0; i < cmds.length; i++) {
      const isLast = i === cmds.length - 1;
      const res = this.runSimple(cmds[i], input, isLast, io);
      code = res.code;
      input = res.stdout;
    }
    return code;
  }

  private expandCtx(): ExpandCtx {
    return { env: this.env, vfs: this.vfs, runSub: (command) => this.runSub(command) };
  }

  private runSub(command: string): string {
    let buf = "";
    const io: ExecIO = { print: (s) => (buf += s), printErr: () => {} };
    try {
      this.run(command, io);
    } catch {
      /* ignore */
    }
    return buf.replace(/\n+$/, "");
  }

  private resolvePath(p: string): string {
    return this.vfs.resolve(this.env.cwd, p);
  }

  private suggest(name: string): string | null {
    if (name.length < 2) return null;
    let best: string | null = null;
    let bestD = 3;
    for (const c of [...this.registry.keys(), ...this.aliases.keys()]) {
      if (Math.abs(c.length - name.length) > 2) continue;
      const d = levenshtein(name, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private writeFile(abs: string, content: string, append: boolean): boolean {
    const lst = this.vfs.lstat(abs);
    if (lst && lst.type === "dir") return false;
    const target = lst && lst.type === "symlink" ? this.vfs.stat(abs) : lst;
    if (target && target.type === "file") {
      target.content = append ? target.content + content : content;
      target.mtime = new Date();
      return true;
    }
    return this.vfs.createFile(abs, content) != null;
  }

  private runSimple(
    cmd: SimpleCommand,
    stdinFromPipe: string,
    isLast: boolean,
    io: ExecIO,
  ): { code: number; stdout: string } {
    const ectx = this.expandCtx();
    const argv: string[] = [];
    for (const w of cmd.words) argv.push(...expandWord(w, ectx));
    const assignKV: Array<[string, string]> = cmd.assignments.map((a) => [
      a.name,
      expandSingle(a.value, ectx),
    ]);

    let stdin = stdinFromPipe;
    for (const r of cmd.redirs) {
      if (r.op !== "<") continue;
      const node = this.vfs.stat(this.resolvePath(expandSingle(r.target, ectx)));
      if (!node || node.type !== "file") {
        io.printErr(`bash: ${expandSingle(r.target, ectx)}: No such file or directory\n`);
        return { code: 1, stdout: "" };
      }
      stdin = node.content;
    }

    if (argv.length === 0) {
      for (const [k, v] of assignKV) this.env.set(k, v);
      this.env.lastExit = 0;
      return { code: 0, stdout: "" };
    }

    // エイリアス展開
    const alias = this.aliases.get(argv[0]);
    if (alias !== undefined) {
      const parts = alias.trim().split(/\s+/).filter(Boolean);
      if (parts.length) argv.splice(0, 1, ...parts);
    }
    const name = argv[0];

    // 制御シグナル系
    if (SIGNAL_BUILTINS.has(name)) {
      const n = parseInt(argv[1] ?? "", 10);
      if (name === "return") throw new ReturnSignal(Number.isNaN(n) ? this.env.lastExit : n);
      if (name === "exit") throw new ExitSignal(Number.isNaN(n) ? this.env.lastExit : n);
      if (name === "break") throw new BreakSignal(Number.isNaN(n) ? 1 : n);
      throw new ContinueSignal(Number.isNaN(n) ? 1 : n);
    }

    let outBuf = "";
    let errBuf = "";
    const hasStdoutRedir = cmd.redirs.some((r) => r.op === ">" || r.op === ">>" || r.op === "&>");
    const subIO: ExecIO = { print: (s) => (outBuf += s), printErr: (s) => (errBuf += s) };

    const saved: Array<[string, string | undefined]> = assignKV.map(([k]) => [k, this.env.get(k)]);
    for (const [k, v] of assignKV) this.env.set(k, v);

    let code = 0;
    try {
      if (this.functions.has(name)) {
        code = this.runFunction(name, argv.slice(1), subIO);
      } else if (SCRIPT_BUILTINS.has(name)) {
        code = this.runScriptBuiltin(name, argv, stdin, subIO);
      } else if (SIMPLE_BUILTINS.has(name)) {
        code = this.runSimpleBuiltin(name, argv, stdin, subIO);
      } else if ((name.includes("/") || name.startsWith("./")) && this.tryRunScriptFile(name, argv, subIO) !== null) {
        code = this.env.lastExit;
      } else {
        const impl = this.registry.get(name);
        if (!impl) {
          // prefix-assign を戻して command not found
          for (const [k, v] of saved) (v === undefined ? this.env.unset(k) : this.env.set(k, v));
          const hint = this.suggest(name);
          io.printErr(`${name}: command not found${hint ? ` (もしかして: ${hint}?)` : ""}\n`);
          return { code: 127, stdout: "" };
        }
        const ctx: ExecContext = {
          vfs: this.vfs,
          env: this.env,
          args: argv,
          stdin,
          out: (s) => (outBuf += s),
          err: (s) => (errBuf += s),
          services: this.services,
          cols: this.services.cols(),
          tty: isLast && !hasStdoutRedir,
          resolve: (p) => this.resolvePath(p),
        };
        code = impl.run(ctx);
      }
    } catch (e) {
      if (
        e instanceof ReturnSignal || e instanceof BreakSignal ||
        e instanceof ContinueSignal || e instanceof ExitSignal
      ) {
        for (const [k, v] of saved) (v === undefined ? this.env.unset(k) : this.env.set(k, v));
        throw e;
      }
      io.printErr(`${name}: ${(e as Error).message}\n`);
      code = 1;
    }

    for (const [k, v] of saved) (v === undefined ? this.env.unset(k) : this.env.set(k, v));

    let stdoutRedirected = false;
    for (const r of cmd.redirs) {
      const abs = this.resolvePath(expandSingle(r.target, ectx));
      if (r.op === ">" || r.op === ">>") {
        if (!this.writeFile(abs, outBuf, r.op === ">>")) io.printErr(`bash: cannot write\n`);
        stdoutRedirected = true;
      } else if (r.op === "&>") {
        this.writeFile(abs, outBuf + errBuf, false);
        errBuf = "";
        stdoutRedirected = true;
      } else if (r.op === "2>" || r.op === "2>>") {
        this.writeFile(abs, errBuf, r.op === "2>>");
        errBuf = "";
      }
    }

    if (errBuf) io.printErr(errBuf);
    if (isLast && !stdoutRedirected) io.print(outBuf);
    return { code, stdout: stdoutRedirected ? "" : outBuf };
  }

  // ===== 特殊ビルトイン =====
  private runScriptBuiltin(name: string, argv: string[], stdin: string, io: ExecIO): number {
    if (name === "eval") {
      this.runScriptText(argv.slice(1).join(" "), io);
      return this.env.lastExit;
    }
    if (name === "source" || name === ".") {
      const node = this.vfs.stat(this.resolvePath(argv[1] ?? ""));
      if (!node || node.type !== "file") {
        io.printErr(`bash: ${argv[1]}: No such file or directory\n`);
        return 1;
      }
      const savedP = this.env.positional;
      if (argv.length > 2) this.env.positional = argv.slice(2);
      try {
        this.runScriptText(node.content, io);
      } finally {
        this.env.positional = savedP;
      }
      return this.env.lastExit;
    }
    // bash / sh
    const ci = argv.indexOf("-c");
    if (ci >= 0) {
      this.runScriptText(argv[ci + 1] ?? "", io);
      return this.env.lastExit;
    }
    const fileArg = argv.slice(1).find((a) => !a.startsWith("-"));
    if (fileArg) return this.runScriptFile(fileArg, argv.slice(argv.indexOf(fileArg) + 1), io);
    return 0;
  }

  private tryRunScriptFile(name: string, argv: string[], io: ExecIO): number | null {
    const node = this.vfs.stat(this.resolvePath(name));
    if (!node || node.type !== "file") return null;
    if (!(node.mode & 0o111)) {
      io.printErr(`bash: ${name}: Permission denied\n`);
      this.env.lastExit = 126;
      return 126;
    }
    return this.runScriptFile(name, argv.slice(1), io);
  }

  private runScriptFile(path: string, args: string[], io: ExecIO): number {
    const node = this.vfs.stat(this.resolvePath(path));
    if (!node || node.type !== "file") {
      io.printErr(`bash: ${path}: No such file or directory\n`);
      return 127;
    }
    const savedP = this.env.positional;
    const savedN = this.env.scriptName;
    this.env.positional = args;
    this.env.scriptName = path;
    try {
      let content = node.content;
      if (content.startsWith("#!")) content = content.slice(content.indexOf("\n") + 1);
      this.runScriptText(content, io);
    } catch (e) {
      if (e instanceof ExitSignal) this.env.lastExit = e.code;
      else throw e;
    } finally {
      this.env.positional = savedP;
      this.env.scriptName = savedN;
    }
    return this.env.lastExit;
  }

  private runSimpleBuiltin(name: string, argv: string[], stdin: string, io: ExecIO): number {
    if (name === "shift") {
      const n = parseInt(argv[1] ?? "1", 10) || 1;
      this.env.positional = this.env.positional.slice(n);
      return 0;
    }
    if (name === "set") {
      const rest = argv.slice(1);
      const dd = rest.indexOf("--");
      if (dd >= 0) this.env.positional = rest.slice(dd + 1);
      else if (rest.length && !rest[0].startsWith("-") && !rest[0].startsWith("+")) this.env.positional = rest;
      return 0;
    }
    if (name === "local" || name === "declare" || name === "typeset") {
      const frame = this.localStack[this.localStack.length - 1];
      for (const a of argv.slice(1)) {
        if (a.startsWith("-")) continue;
        const eq = a.indexOf("=");
        const key = eq >= 0 ? a.slice(0, eq) : a;
        const val = eq >= 0 ? a.slice(eq + 1) : "";
        if (name === "local" && frame) frame.push([key, this.env.get(key)]);
        if (eq >= 0 || name === "local") this.env.set(key, val);
      }
      return 0;
    }
    if (name === "read") {
      const vars = argv.slice(1).filter((a) => !a.startsWith("-"));
      let line: string;
      if (this.pipeInput) {
        if (this.pipeInput.idx >= this.pipeInput.lines.length) return 1;
        line = this.pipeInput.lines[this.pipeInput.idx++];
      } else {
        if (stdin === "") return 1;
        line = stdin.split("\n")[0] ?? "";
      }
      if (vars.length === 0) {
        this.env.set("REPLY", line);
        return 0;
      }
      const parts = line.trim().split(/\s+/);
      vars.forEach((v, i) => {
        if (i === vars.length - 1) this.env.set(v, parts.slice(i).join(" "));
        else this.env.set(v, parts[i] ?? "");
      });
      return 0;
    }
    return 0;
  }
}
