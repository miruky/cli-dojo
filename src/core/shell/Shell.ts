import { VFS } from "../vfs/VFS";
import { buildInitialFS } from "../vfs/seed";
import { Environment } from "./Environment";
import { Executor, type ExecIO } from "./Executor";
import { allCommands, buildRegistry } from "./commands";
import type { Command, ExecContext, ShellServices } from "./types";
import type { History } from "../terminal/History";
import type { CompletionResult } from "../terminal/LineEditor";
import { blue, green } from "../terminal/ansi";

export interface ShellOptions {
  write: (s: string) => void;
  cols: () => number;
  history: History;
  /** 複数ペインで共有する VFS。省略時は新規作成。 */
  vfs?: VFS;
}

const DEFAULT_ALIASES: Array<[string, string]> = [
  ["ll", "ls -alF"],
  ["la", "ls -A"],
  ["l", "ls -CF"],
  ["..", "cd .."],
  ["...", "cd ../.."],
  ["grep", "grep --color=auto"],
];

/** VFS・環境・コマンド・実行器・補完をまとめるシェルのファサード。 */
export class Shell {
  readonly vfs: VFS;
  readonly env = new Environment();
  private registry: Map<string, Command> = buildRegistry();
  private aliases = new Map<string, string>(DEFAULT_ALIASES);
  private executor: Executor;
  private writeFn: (s: string) => void;
  private colsFn: () => number;
  private history: History;

  constructor(opts: ShellOptions) {
    this.vfs = opts.vfs ?? buildInitialFS();
    this.writeFn = opts.write;
    this.colsFn = opts.cols;
    this.history = opts.history;

    const services: ShellServices = {
      history: () => this.history.all(),
      listCommands: () => allCommands.map((c) => ({ name: c.name, summary: c.summary })),
      cols: () => this.colsFn(),
      aliases: () => this.aliases,
      runArgv: (argv, stdin) => {
        const impl = this.registry.get(argv[0]);
        if (!impl) return { stdout: "", stderr: `${argv[0]}: command not found\n`, code: 127 };
        let out = "";
        let err = "";
        const ctx2: ExecContext = {
          vfs: this.vfs,
          env: this.env,
          args: argv,
          stdin,
          out: (s) => {
            out += s;
          },
          err: (s) => {
            err += s;
          },
          services,
          cols: this.colsFn(),
          tty: false,
          resolve: (p) => this.vfs.resolve(this.env.cwd, p),
        };
        let code = 0;
        try {
          code = impl.run(ctx2);
        } catch (e) {
          err += (e as Error).message + "\n";
          code = 1;
        }
        return { stdout: out, stderr: err, code };
      },
    };
    this.executor = new Executor(this.vfs, this.env, this.registry, services, this.aliases);
  }

  run(line: string): number {
    const io: ExecIO = {
      print: (s) => this.writeFn(s.replace(/\n/g, "\r\n")),
      printErr: (s) =>
        this.writeFn("\x1b[38;2;255;98;140m" + s.replace(/\n/g, "\r\n") + "\x1b[0m"),
    };
    return this.executor.run(line, io);
  }

  /** cwd を反映した bash 風プロンプト。 */
  prompt(): string {
    const home = this.env.get("HOME") ?? "";
    let cwd = this.env.cwd;
    if (home && (cwd === home || cwd.startsWith(home + "/"))) cwd = "~" + cwd.slice(home.length);
    return `${green(`${this.env.user}@${this.env.host}`)}:${blue(cwd)}$ `;
  }

  /** Tab 補完: 先頭語はコマンド名、それ以外はパス。 */
  complete(line: string, cursor: number): CompletionResult | null {
    const chars = [...line];
    let start = cursor;
    while (start > 0 && chars[start - 1] !== " ") start--;
    const token = chars.slice(start, cursor).join("");
    const before = chars.slice(0, start).join("").trim();
    const isCommand =
      before === "" ||
      before.endsWith("|") ||
      before.endsWith("&&") ||
      before.endsWith("||") ||
      before.endsWith(";");

    if (isCommand && !token.includes("/")) {
      const names = new Set<string>([...this.registry.keys(), ...this.aliases.keys()]);
      const items = [...names].filter((n) => n.startsWith(token)).sort();
      return items.length ? { items, replaceFrom: start } : null;
    }

    return this.completePath(token, start);
  }

  private completePath(token: string, start: number): CompletionResult | null {
    const slash = token.lastIndexOf("/");
    const dirPart = slash >= 0 ? token.slice(0, slash + 1) : "";
    const basePart = slash >= 0 ? token.slice(slash + 1) : token;
    let dirAbs = dirPart ? this.vfs.resolve(this.env.cwd, dirPart) : this.env.cwd;
    if (dirPart.startsWith("~")) dirAbs = this.vfs.resolve(this.env.cwd, (this.env.get("HOME") ?? "") + dirPart.slice(1));
    const dirNode = this.vfs.stat(dirAbs);
    if (!dirNode || !dirNode.children) return null;
    const items: string[] = [];
    for (const [name, child] of dirNode.children) {
      if (name.startsWith(".") && !basePart.startsWith(".")) continue;
      if (name.startsWith(basePart)) {
        items.push(dirPart + name + (child.type === "dir" ? "/" : ""));
      }
    }
    items.sort();
    return items.length ? { items, replaceFrom: start } : null;
  }
}
