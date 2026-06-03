import { parse, type CommandList, type Pipeline, type SimpleCommand } from "./parser";
import { expandWord, type ExpandCtx } from "./expand";
import type { VFS } from "../vfs/VFS";
import type { Environment } from "./Environment";
import type { Command, ExecContext, ShellServices } from "./types";

export interface ExecIO {
  print: (s: string) => void;
  printErr: (s: string) => void;
}

/** パイプライン・リダイレクト・&&/||・コマンド置換を解釈して実行する。すべて同期。 */
export class Executor {
  constructor(
    private vfs: VFS,
    private env: Environment,
    private registry: Map<string, Command>,
    private services: ShellServices,
    private aliases: Map<string, string>,
  ) {}

  run(line: string, io: ExecIO): number {
    const { list } = parse(line);
    return this.runList(list, io);
  }

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
    return {
      env: this.env,
      vfs: this.vfs,
      runSub: (command) => this.runSub(command),
    };
  }

  /** コマンド置換: サブシェルで実行し stdout を返す。 */
  private runSub(command: string): string {
    let buf = "";
    const io: ExecIO = {
      print: (s) => {
        buf += s;
      },
      printErr: () => {
        /* コマンド置換中の stderr は破棄 (簡略化) */
      },
    };
    this.runList(parse(command).list, io);
    return buf.replace(/\n+$/, "");
  }

  private resolvePath(p: string): string {
    return this.vfs.resolve(this.env.cwd, p);
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
    if (target && target.type === "dir") return false;
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
      expandWord(a.value, ectx).join(" "),
    ]);

    // 入力リダイレクト (<)
    let stdin = stdinFromPipe;
    for (const r of cmd.redirs) {
      if (r.op !== "<") continue;
      const tgt = expandWord(r.target, ectx).join("");
      const node = this.vfs.stat(this.resolvePath(tgt));
      if (!node || node.type !== "file") {
        io.printErr(`bash: ${tgt}: No such file or directory\n`);
        return { code: 1, stdout: "" };
      }
      stdin = node.content;
    }

    // コマンド語が無い → 代入のみ
    if (argv.length === 0) {
      for (const [k, v] of assignKV) this.env.set(k, v);
      return { code: 0, stdout: "" };
    }

    // エイリアス展開 (1段のみ)
    const alias = this.aliases.get(argv[0]);
    if (alias !== undefined) {
      const parts = alias.trim().split(/\s+/).filter(Boolean);
      if (parts.length) argv.splice(0, 1, ...parts);
    }

    const name = argv[0];
    const impl = this.registry.get(name);
    if (!impl) {
      io.printErr(`${name}: command not found\n`);
      return { code: 127, stdout: "" };
    }

    let outBuf = "";
    let errBuf = "";
    const hasStdoutRedir = cmd.redirs.some(
      (r) => r.op === ">" || r.op === ">>" || r.op === "&>",
    );
    const tty = isLast && !hasStdoutRedir;

    const ctx: ExecContext = {
      vfs: this.vfs,
      env: this.env,
      args: argv,
      stdin,
      out: (s) => {
        outBuf += s;
      },
      err: (s) => {
        errBuf += s;
      },
      services: this.services,
      cols: this.services.cols(),
      tty,
      resolve: (p) => this.resolvePath(p),
    };

    // 前置代入 (VAR=v cmd) は一時的に設定
    const saved: Array<[string, string | undefined]> = assignKV.map(([k]) => [k, this.env.get(k)]);
    for (const [k, v] of assignKV) this.env.set(k, v);

    let code = 0;
    try {
      code = impl.run(ctx);
    } catch (e) {
      io.printErr(`${name}: ${(e as Error).message}\n`);
      code = 1;
    }

    for (const [k, v] of saved) {
      if (v === undefined) this.env.unset(k);
      else this.env.set(k, v);
    }

    // 出力リダイレクト
    let stdoutRedirected = false;
    for (const r of cmd.redirs) {
      const tgt = expandWord(r.target, ectx).join("");
      const abs = this.resolvePath(tgt);
      if (r.op === ">" || r.op === ">>") {
        if (!this.writeFile(abs, outBuf, r.op === ">>")) {
          io.printErr(`bash: ${tgt}: cannot write\n`);
        }
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
}
