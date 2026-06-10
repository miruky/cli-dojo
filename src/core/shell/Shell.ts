import { VFS } from "../vfs/VFS";
import { buildInitialFS } from "../vfs/seed";
import { Environment } from "./Environment";
import { Executor, type ExecIO } from "./Executor";
import { allCommands, buildRegistry } from "./commands";
import { ensureSeedRepos } from "./commands/git";
import { recordUsage } from "./usage";
import { loadAliases } from "./aliasStore";
import type { Command, ExecContext, LaunchPayload, ShellServices } from "./types";
import type { History } from "../terminal/History";
import type { CompletionResult } from "../terminal/LineEditor";

const SHELL_KEYWORDS = new Set([
  "if", "then", "elif", "else", "fi", "for", "while", "until", "do", "done",
  "case", "esac", "in", "function", "source", ".", "eval", "local", "shift",
  "set", "read", "declare", "typeset", "return", "break", "continue", "exit",
  "bash", "sh", "test", "[", "[[", ":", "true", "false",
]);

export interface ShellOptions {
  write: (s: string) => void;
  cols: () => number;
  history: History;
  /** 複数ペインで共有する VFS。省略時は新規作成。 */
  vfs?: VFS;
  /** 対話アプリ起動要求 (tmux/vim/emacs/less/htop ...) */
  onLaunch?: (name: string, args: string[], payload?: LaunchPayload) => void;
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
  /** 保存済みエイリアスがあれば復元、なければデフォルト。 */
  private aliases = loadAliases() ?? new Map<string, string>(DEFAULT_ALIASES);
  private executor: Executor;
  private writeFn: (s: string) => void;
  private colsFn: () => number;
  private history: History;

  constructor(opts: ShellOptions) {
    this.vfs = opts.vfs ?? buildInitialFS();
    ensureSeedRepos(this.vfs);
    this.writeFn = opts.write;
    this.colsFn = opts.cols;
    this.history = opts.history;

    const services: ShellServices = {
      history: () => this.history.all(),
      listCommands: () => allCommands.map((c) => ({ name: c.name, summary: c.summary })),
      cols: () => this.colsFn(),
      aliases: () => this.aliases,
      launch: (name, args, payload) => opts.onLaunch?.(name, args, payload),
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
    recordUsage(line, (n) => this.registry.has(n) || this.aliases.has(n));
    const io: ExecIO = {
      print: (s) => this.writeFn(s.replace(/\n/g, "\r\n")),
      printErr: (s) =>
        this.writeFn("\x1b[38;2;255;98;140m" + s.replace(/\n/g, "\r\n") + "\x1b[0m"),
    };
    return this.executor.run(line, io);
  }

  /** コマンド行を実行し、出力を端末へ流さず文字列で返す (watch 等の再実行用)。 */
  capture(line: string): { output: string; code: number } {
    let output = "";
    const io: ExecIO = {
      print: (s) => {
        output += s;
      },
      printErr: (s) => {
        output += s;
      },
    };
    const code = this.executor.run(line, io);
    return { output, code };
  }

  /** 2行目のプロンプト記号 (直前コマンドの成否で色が変わる)。 */
  prompt(): string {
    const ok = this.env.lastExit === 0;
    const color = ok ? "38;2;126;214;126" : "38;2;240;110;130";
    return `\x1b[${color}m\x1b[1m→\x1b[0m `;
  }

  /** Powerline 風のセグメント行 (プロンプトの上に表示)。 */
  promptHeader(): string {
    const SEP = "";
    const seg = (bg: string, fg: string, text: string): string =>
      `\x1b[48;2;${bg}m\x1b[38;2;${fg}m ${text} \x1b[0m`;
    const sep = (from: string, to: string): string =>
      `\x1b[38;2;${from}m\x1b[48;2;${to}m${SEP}\x1b[0m`;
    const sepEnd = (from: string): string => `\x1b[38;2;${from}m${SEP}\x1b[0m`;

    const userBg = "201;162;75", userFg = "20;18;12";
    const pathBg = "62;138;72", pathFg = "235;245;235";
    const gitBg = "139;195;74", gitFg = "20;26;12";
    const timeBg = "60;62;72", timeFg = "206;210;222";

    const home = this.env.get("HOME") ?? "";
    let cwd = this.env.cwd;
    if (home && (cwd === home || cwd.startsWith(home + "/"))) cwd = "~" + cwd.slice(home.length);
    const parts = cwd.split("/").filter(Boolean);
    let disp = cwd;
    if (parts.length > 3) disp = " " + parts.slice(-1)[0];
    else disp = " " + (cwd === "/" ? "/" : parts.length ? parts[parts.length - 1] : "~");

    const branch = this.gitBranch();
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    let s = seg(userBg, userFg, " " + this.env.user);
    s += sep(userBg, pathBg) + seg(pathBg, pathFg, " " + disp);
    if (branch) {
      s += sep(pathBg, gitBg) + seg(gitBg, gitFg, " " + branch);
      s += sep(gitBg, timeBg);
    } else {
      s += sep(pathBg, timeBg);
    }
    s += seg(timeBg, timeFg, " " + time) + sepEnd(timeBg);
    return s;
  }

  private gitBranch(): string | null {
    let dir = this.env.cwd;
    for (let i = 0; i < 25; i++) {
      const head = this.vfs.stat((dir === "/" ? "" : dir) + "/.git/HEAD");
      if (head && head.type === "file") {
        const m = /ref:\s*refs\/heads\/(.+)/.exec(head.content);
        return m ? m[1].trim() : "HEAD";
      }
      if (dir === "/") break;
      dir = dir.replace(/\/[^/]*\/?$/, "") || "/";
    }
    return null;
  }

  /** 入力コマンドの fish 風シンタックスハイライト (可視文字は不変)。 */
  highlight(line: string): string {
    const R = "\x1b[0m";
    const C = {
      cmd: "\x1b[1m\x1b[38;2;126;214;126m",
      bad: "\x1b[38;2;240;120;130m",
      flag: "\x1b[38;2;120;190;235m",
      str: "\x1b[38;2;225;205;120m",
      varc: "\x1b[38;2;205;150;240m",
      op: "\x1b[1m\x1b[38;2;130;165;235m",
      path: "\x1b[38;2;190;205;235m",
    };
    const n = line.length;
    let out = "";
    let i = 0;
    let cmdPos = true;
    while (i < n) {
      const c = line[i];
      if (c === " " || c === "\t") {
        out += c;
        i++;
        continue;
      }
      if ("|&;<>".includes(c)) {
        let j = i;
        while (j < n && "|&;<>".includes(line[j])) j++;
        const op = line.slice(i, j);
        out += C.op + op + R;
        cmdPos = /[|;&]/.test(op);
        i = j;
        continue;
      }
      if (c === "'") {
        let j = i + 1;
        while (j < n && line[j] !== "'") j++;
        j = Math.min(j + 1, n);
        out += C.str + line.slice(i, j) + R;
        i = j;
        cmdPos = false;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        while (j < n && line[j] !== '"') {
          if (line[j] === "\\") j++;
          j++;
        }
        j = Math.min(j + 1, n);
        out += C.str + line.slice(i, j) + R;
        i = j;
        cmdPos = false;
        continue;
      }
      if (c === "$") {
        let j = i + 1;
        if (line[j] === "{") {
          while (j < n && line[j] !== "}") j++;
          j = Math.min(j + 1, n);
        } else {
          while (j < n && /[A-Za-z0-9_?@#$]/.test(line[j])) j++;
          if (j === i + 1) j = i + 2;
        }
        out += C.varc + line.slice(i, Math.min(j, n)) + R;
        i = Math.min(j, n);
        cmdPos = false;
        continue;
      }
      let j = i;
      while (j < n && !" \t|&;<>'\"$".includes(line[j])) j++;
      const word = line.slice(i, j);
      if (cmdPos) {
        out += (this.isValidCommand(word) ? C.cmd : C.bad) + word + R;
        cmdPos = false;
      } else if (word.startsWith("-")) {
        out += C.flag + word + R;
      } else {
        out += C.path + word + R;
      }
      i = j;
    }
    return out;
  }

  private isValidCommand(word: string): boolean {
    if (word === "") return false;
    if (this.registry.has(word) || this.aliases.has(word)) return true;
    return SHELL_KEYWORDS.has(word) || word.includes("/") || /=/.test(word);
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
