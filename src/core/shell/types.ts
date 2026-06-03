import type { VFS } from "../vfs/VFS";
import type { Environment } from "./Environment";

export interface CommandInfo {
  name: string;
  summary: string;
}

/** コマンド実装から使えるシェルサービス。 */
export interface ShellServices {
  history(): readonly string[];
  listCommands(): CommandInfo[];
  cols(): number;
  aliases(): Map<string, string>;
  /** 単一コマンドを argv 指定で実行し出力を捕捉 (find -exec / xargs 用)。 */
  runArgv(argv: string[], stdin: string): { stdout: string; stderr: string; code: number };
  /** 対話アプリ(tmux/vim/emacs 等)の起動を要求 (ペインがモードに切替える)。 */
  launch(name: string, args: string[]): void;
}

export interface ExecContext {
  vfs: VFS;
  env: Environment;
  /** argv (args[0] = コマンド名)。 */
  args: string[];
  stdin: string;
  out: (s: string) => void;
  err: (s: string) => void;
  services: ShellServices;
  /** 端末桁数 (列レイアウト用)。 */
  cols: number;
  /** 標準出力が端末に向く場合 true (色付け/多段組の判断に使う)。 */
  tty: boolean;
  /** env.cwd を基準に絶対パス化。 */
  resolve: (p: string) => string;
}

export type CommandFn = (ctx: ExecContext) => number;

export interface Command {
  name: string;
  summary: string;
  run: CommandFn;
}
