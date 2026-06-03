/** シェルのセッション状態: 環境変数・カレントディレクトリ・直近終了コード。 */
export class Environment {
  private vars = new Map<string, string>();
  cwd = "/home/guest";
  oldpwd = "/home/guest";
  lastExit = 0;
  umask = 0o022;
  /** 位置パラメータ $1, $2, ... ($0 は除く) */
  positional: string[] = [];
  scriptName = "bash";
  readonly user = "guest";
  readonly host = "cli-dojo";

  constructor() {
    const defaults: Record<string, string> = {
      HOME: "/home/guest",
      USER: "guest",
      LOGNAME: "guest",
      SHELL: "/bin/bash",
      PATH: "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin",
      HOSTNAME: "cli-dojo",
      TERM: "xterm-256color",
      LANG: "ja_JP.UTF-8",
      PAGER: "less",
      EDITOR: "nvim",
      PS1: "\\u@\\h:\\w$ ",
    };
    for (const [k, v] of Object.entries(defaults)) this.vars.set(k, v);
  }

  get(name: string): string | undefined {
    switch (name) {
      case "PWD":
        return this.cwd;
      case "OLDPWD":
        return this.oldpwd;
      case "?":
        return String(this.lastExit);
      case "$":
        return "4242";
      case "0":
        return this.scriptName;
      case "#":
        return String(this.positional.length);
      case "@":
      case "*":
        return this.positional.join(" ");
      default:
        if (/^[1-9][0-9]*$/.test(name)) return this.positional[parseInt(name, 10) - 1] ?? "";
        return this.vars.get(name);
    }
  }

  set(name: string, value: string): void {
    if (name === "PWD") {
      this.cwd = value;
      return;
    }
    if (name === "OLDPWD") {
      this.oldpwd = value;
      return;
    }
    this.vars.set(name, value);
  }

  unset(name: string): void {
    this.vars.delete(name);
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  /** env コマンド等で使う一覧 (PWD を含めソート)。 */
  entries(): Array<[string, string]> {
    const m = new Map(this.vars);
    m.set("PWD", this.cwd);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
}
