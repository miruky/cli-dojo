import type { Command } from "../types";
import { parseArgs, formatColumns, visibleWidth } from "./util";
import { cyan, dim, yellow } from "../../terminal/ansi";

const BUILTINS = new Set([
  "cd", "pwd", "export", "unset", "alias", "unalias", "history", "help",
  "type", "echo", "true", "false", ":", "source", ".", "set", "read", "test",
]);

const help: Command = {
  name: "help",
  summary: "コマンド一覧とヘルプを表示",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    const cmds = [...ctx.services.listCommands()].sort((a, b) =>
      a.name < b.name ? -1 : 1,
    );
    if (rest.length) {
      let code = 0;
      for (const nm of rest) {
        const c = cmds.find((x) => x.name === nm);
        if (c) ctx.out(`${c.name} - ${c.summary}\n`);
        else {
          ctx.err(`help: no help topics match \`${nm}'\n`);
          code = 1;
        }
      }
      return code;
    }
    ctx.out(yellow("cli-dojo シェル") + dim(" — 利用可能なコマンド\n\n"));
    const items = cmds.map((c) => ({ text: cyan(c.name), w: visibleWidth(c.name) }));
    ctx.out(formatColumns(items, ctx.cols) + "\n\n");
    ctx.out(dim("詳しくは `help <コマンド>` / 主要オプション(-l, -r, -n …)に対応しています。\n"));
    return 0;
  },
};

const history: Command = {
  name: "history",
  summary: "コマンド履歴を表示",
  run(ctx) {
    const hist = ctx.services.history();
    const { rest } = parseArgs(ctx.args);
    let start = 0;
    if (rest[0] && /^\d+$/.test(rest[0])) start = Math.max(0, hist.length - parseInt(rest[0], 10));
    let out = "";
    for (let i = start; i < hist.length; i++) out += `${String(i + 1).padStart(5)}  ${hist[i]}\n`;
    ctx.out(out);
    return 0;
  },
};

const envCmd: Command = {
  name: "env",
  summary: "環境変数を表示",
  run(ctx) {
    let out = "";
    for (const [k, v] of ctx.env.entries()) out += `${k}=${v}\n`;
    ctx.out(out);
    return 0;
  },
};

const printenv: Command = {
  name: "printenv",
  summary: "環境変数を表示",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    if (rest.length === 0) {
      let out = "";
      for (const [k, v] of ctx.env.entries()) out += `${k}=${v}\n`;
      ctx.out(out);
      return 0;
    }
    let code = 1;
    for (const name of rest) {
      const v = ctx.env.get(name);
      if (v !== undefined) {
        ctx.out(v + "\n");
        code = 0;
      }
    }
    return code;
  },
};

const exportCmd: Command = {
  name: "export",
  summary: "環境変数を設定/エクスポート",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    if (rest.length === 0) {
      let out = "";
      for (const [k, v] of ctx.env.entries()) out += `declare -x ${k}="${v}"\n`;
      ctx.out(out);
      return 0;
    }
    for (const a of rest) {
      const eq = a.indexOf("=");
      if (eq >= 0) ctx.env.set(a.slice(0, eq), a.slice(eq + 1));
    }
    return 0;
  },
};

const unset: Command = {
  name: "unset",
  summary: "変数を削除",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    for (const a of rest) ctx.env.unset(a);
    return 0;
  },
};

const alias: Command = {
  name: "alias",
  summary: "エイリアスを定義/表示",
  run(ctx) {
    const aliases = ctx.services.aliases();
    const { rest } = parseArgs(ctx.args);
    if (rest.length === 0) {
      const out = [...aliases.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([k, v]) => `alias ${k}='${v}'`)
        .join("\n");
      if (out) ctx.out(out + "\n");
      return 0;
    }
    let code = 0;
    for (const a of rest) {
      const eq = a.indexOf("=");
      if (eq >= 0) aliases.set(a.slice(0, eq), a.slice(eq + 1));
      else {
        const v = aliases.get(a);
        if (v !== undefined) ctx.out(`alias ${a}='${v}'\n`);
        else {
          ctx.err(`alias: ${a}: not found\n`);
          code = 1;
        }
      }
    }
    return code;
  },
};

const unalias: Command = {
  name: "unalias",
  summary: "エイリアスを削除",
  run(ctx) {
    const aliases = ctx.services.aliases();
    const { rest } = parseArgs(ctx.args);
    for (const a of rest) aliases.delete(a);
    return 0;
  },
};

const which: Command = {
  name: "which",
  summary: "コマンドの実体パスを表示",
  run(ctx) {
    const names = new Set(ctx.services.listCommands().map((c) => c.name));
    const { rest } = parseArgs(ctx.args);
    let code = 0;
    for (const a of rest) {
      if (names.has(a)) ctx.out(`/usr/bin/${a}\n`);
      else code = 1;
    }
    return code;
  },
};

const typeCmd: Command = {
  name: "type",
  summary: "コマンドの種別を表示",
  run(ctx) {
    const aliases = ctx.services.aliases();
    const names = new Set(ctx.services.listCommands().map((c) => c.name));
    const { rest } = parseArgs(ctx.args);
    let code = 0;
    for (const a of rest) {
      if (aliases.has(a)) ctx.out(`${a} is aliased to \`${aliases.get(a)}'\n`);
      else if (BUILTINS.has(a)) ctx.out(`${a} is a shell builtin\n`);
      else if (names.has(a)) ctx.out(`${a} is /usr/bin/${a}\n`);
      else {
        ctx.err(`type: ${a}: not found\n`);
        code = 1;
      }
    }
    return code;
  },
};

const whoami: Command = {
  name: "whoami",
  summary: "現在のユーザー名を表示",
  run(ctx) {
    ctx.out(ctx.env.user + "\n");
    return 0;
  },
};

const idCmd: Command = {
  name: "id",
  summary: "ユーザー/グループ ID を表示",
  run(ctx) {
    ctx.out(`uid=1000(${ctx.env.user}) gid=1000(${ctx.env.user}) groups=1000(${ctx.env.user}),27(sudo),998(docker)\n`);
    return 0;
  },
};

const groups: Command = {
  name: "groups",
  summary: "所属グループを表示",
  run(ctx) {
    ctx.out(`${ctx.env.user} sudo docker\n`);
    return 0;
  },
};

const hostname: Command = {
  name: "hostname",
  summary: "ホスト名を表示",
  run(ctx) {
    ctx.out(ctx.env.host + "\n");
    return 0;
  },
};

const uname: Command = {
  name: "uname",
  summary: "システム情報を表示",
  run(ctx) {
    const { flags } = parseArgs(ctx.args);
    const sysname = "Linux";
    const node = "cli-dojo";
    const release = "6.1.0-21-amd64";
    const version = "#1 SMP PREEMPT_DYNAMIC Debian 6.1.90";
    const machine = "x86_64";
    if (flags.has("a")) {
      ctx.out(`${sysname} ${node} ${release} ${version} ${machine} GNU/Linux\n`);
    } else {
      const parts: string[] = [];
      if (flags.has("s") || flags.size === 0) parts.push(sysname);
      if (flags.has("n")) parts.push(node);
      if (flags.has("r")) parts.push(release);
      if (flags.has("m")) parts.push(machine);
      ctx.out(parts.join(" ") + "\n");
    }
    return 0;
  },
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const date: Command = {
  name: "date",
  summary: "日付/時刻を表示",
  run(ctx) {
    const now = new Date();
    const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
    const fmtArg = ctx.args.find((a) => a.startsWith("+"));
    if (fmtArg) {
      const out = fmtArg.slice(1).replace(/%([YmdHMSjyAaBbpZ%])/g, (_, c: string) => {
        switch (c) {
          case "Y": return String(now.getFullYear());
          case "y": return pad(now.getFullYear() % 100);
          case "m": return pad(now.getMonth() + 1);
          case "d": return pad(now.getDate());
          case "H": return pad(now.getHours());
          case "M": return pad(now.getMinutes());
          case "S": return pad(now.getSeconds());
          case "A": return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
          case "a": return DOW[now.getDay()];
          case "B": return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][now.getMonth()];
          case "b": return MON[now.getMonth()];
          case "Z": return "JST";
          case "%": return "%";
          default: return "%" + c;
        }
      });
      ctx.out(out + "\n");
      return 0;
    }
    ctx.out(
      `${DOW[now.getDay()]} ${MON[now.getMonth()]} ${String(now.getDate()).padStart(2)} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} JST ${now.getFullYear()}\n`,
    );
    return 0;
  },
};

const seq: Command = {
  name: "seq",
  summary: "連番を生成",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    const nums = rest.map(Number);
    let first = 1;
    let step = 1;
    let last = 0;
    if (nums.length === 1) last = nums[0];
    else if (nums.length === 2) {
      first = nums[0];
      last = nums[1];
    } else if (nums.length >= 3) {
      first = nums[0];
      step = nums[1];
      last = nums[2];
    } else {
      ctx.err("seq: missing operand\n");
      return 1;
    }
    if (step === 0) return 1;
    let out = "";
    if (step > 0) for (let x = first; x <= last; x += step) out += x + "\n";
    else for (let x = first; x >= last; x += step) out += x + "\n";
    ctx.out(out);
    return 0;
  },
};

const trueCmd: Command = { name: "true", summary: "常に成功 (0)", run: () => 0 };
const falseCmd: Command = { name: "false", summary: "常に失敗 (1)", run: () => 1 };
const colon: Command = { name: ":", summary: "何もしない (成功)", run: () => 0 };

export const builtinCommands: Command[] = [
  help,
  history,
  envCmd,
  printenv,
  exportCmd,
  unset,
  alias,
  unalias,
  which,
  typeCmd,
  whoami,
  idCmd,
  groups,
  hostname,
  uname,
  date,
  seq,
  trueCmd,
  falseCmd,
  colon,
];
