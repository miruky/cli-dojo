import type { Command, ExecContext } from "../types";
import { VFS, type VNode } from "../../vfs/VFS";
import { fileSize } from "../../vfs/format";
import { makeRegex } from "../regex";

interface FileCtx {
  node: VNode;
  path: string;
  depth: number;
  setPrune: () => void;
}
type Pred = (f: FileCtx) => boolean;

function fnmatch(name: string, pattern: string, ci: boolean, slash: boolean): boolean {
  let re = "^";
  for (const c of pattern) {
    if (c === "*") re += slash ? ".*" : "[^/]*";
    else if (c === "?") re += slash ? "." : "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  re += "$";
  return new RegExp(re, ci ? "i" : "").test(name);
}

const SIZE_UNITS: Record<string, number> = { c: 1, w: 2, b: 512, k: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

function cmpNum(sign: string, actual: number, n: number): boolean {
  if (sign === "+") return actual > n;
  if (sign === "-") return actual < n;
  return actual === n;
}

export const find: Command = {
  name: "find",
  summary: "ファイルを再帰検索 (-name/-type/-size/-exec ...)",
  run(ctx: ExecContext) {
    const args = ctx.args.slice(1);
    // パス部分 (式の開始まで)
    const paths: string[] = [];
    let i = 0;
    while (i < args.length && !args[i].startsWith("-") && args[i] !== "!" && args[i] !== "(" && args[i] !== ")") {
      paths.push(args[i]);
      i++;
    }
    if (paths.length === 0) paths.push(".");
    const expr = args.slice(i);

    let maxDepth = Infinity;
    let minDepth = 0;
    let hasAction = false;
    let out = "";
    let errOut = "";
    let code = 0;
    const batched: Array<{ cmd: string[]; paths: string[] }> = [];

    // ---- 式パーサ ----
    let pos = 0;
    const peek = (): string | undefined => expr[pos];
    const eat = (): string => expr[pos++];

    const now = Date.now();

    const parsePrimary = (): Pred => {
      const tok = peek();
      if (tok === "(") {
        eat();
        const e = parseOr();
        if (peek() === ")") eat();
        return e;
      }
      if (tok === "!" || tok === "-not") {
        eat();
        const e = parsePrimary();
        return (f) => !e(f);
      }
      eat();
      switch (tok) {
        case "-name": {
          const p = eat();
          return (f) => fnmatch(VFS.basename(f.path), p, false, false);
        }
        case "-iname": {
          const p = eat();
          return (f) => fnmatch(VFS.basename(f.path), p, true, false);
        }
        case "-path":
        case "-wholename": {
          const p = eat();
          return (f) => fnmatch(f.path, p, false, true);
        }
        case "-ipath": {
          const p = eat();
          return (f) => fnmatch(f.path, p, true, true);
        }
        case "-regex": {
          const p = eat();
          const re = makeRegex(p, { extended: true });
          return (f) => {
            const m = re.exec(f.path);
            return !!m && m[0] === f.path;
          };
        }
        case "-type": {
          const t = eat();
          return (f) =>
            (t === "f" && f.node.type === "file") ||
            (t === "d" && f.node.type === "dir") ||
            (t === "l" && f.node.type === "symlink");
        }
        case "-size": {
          const s = eat();
          const m = /^([+-]?)(\d+)([cwbkMGT]?)$/.exec(s);
          if (!m) return () => false;
          const factor = SIZE_UNITS[m[3] || "b"] ?? 512;
          return (f) => cmpNum(m[1], Math.ceil(fileSize(f.node) / factor), parseInt(m[2], 10));
        }
        case "-empty":
          return (f) =>
            (f.node.type === "file" && f.node.content === "") ||
            (f.node.type === "dir" && (!f.node.children || f.node.children.size === 0));
        case "-mtime": {
          const s = eat();
          const m = /^([+-]?)(\d+)$/.exec(s) ?? ["", "", "0"];
          return (f) => cmpNum(m[1], Math.floor((now - f.node.mtime.getTime()) / 86400000), parseInt(m[2], 10));
        }
        case "-mmin": {
          const s = eat();
          const m = /^([+-]?)(\d+)$/.exec(s) ?? ["", "", "0"];
          return (f) => cmpNum(m[1], Math.floor((now - f.node.mtime.getTime()) / 60000), parseInt(m[2], 10));
        }
        case "-newer": {
          const ref = ctx.vfs.stat(ctx.resolve(eat()));
          const t = ref ? ref.mtime.getTime() : 0;
          return (f) => f.node.mtime.getTime() > t;
        }
        case "-maxdepth":
          maxDepth = parseInt(eat(), 10);
          return () => true;
        case "-mindepth":
          minDepth = parseInt(eat(), 10);
          return () => true;
        case "-prune":
          return (f) => {
            f.setPrune();
            return true;
          };
        case "-print":
          hasAction = true;
          return (f) => {
            out += f.path + "\n";
            return true;
          };
        case "-print0":
          hasAction = true;
          return (f) => {
            out += f.path + "\0";
            return true;
          };
        case "-delete":
          hasAction = true;
          return (f) => {
            ctx.vfs.unlink(f.node);
            return true;
          };
        case "-true":
          return () => true;
        case "-false":
          return () => false;
        case "-exec":
        case "-execdir": {
          const cmd: string[] = [];
          while (pos < expr.length && expr[pos] !== ";" && expr[pos] !== "+") cmd.push(eat());
          const term = eat();
          hasAction = true;
          if (term === "+") {
            const entry = { cmd, paths: [] as string[] };
            batched.push(entry);
            return (f) => {
              entry.paths.push(f.path);
              return true;
            };
          }
          return (f) => {
            const argv = cmd.map((a) => (a === "{}" ? f.path : a));
            const r = ctx.services.runArgv(argv, "");
            out += r.stdout;
            errOut += r.stderr;
            return r.code === 0;
          };
        }
        default:
          errOut += `find: unknown predicate \`${tok}'\n`;
          return () => true;
      }
    };

    const parseAnd = (): Pred => {
      let left = parsePrimary();
      while (pos < expr.length && peek() !== "-o" && peek() !== "-or" && peek() !== ")") {
        if (peek() === "-a" || peek() === "-and") eat();
        const right = parsePrimary();
        const l = left;
        left = (f) => l(f) && right(f);
      }
      return left;
    };
    const parseOr = (): Pred => {
      let left = parseAnd();
      while (peek() === "-o" || peek() === "-or") {
        eat();
        const right = parseAnd();
        const l = left;
        left = (f) => l(f) || right(f);
      }
      return left;
    };

    const predicate: Pred = expr.length ? parseOr() : () => true;
    const evalNode = (f: FileCtx): void => {
      const r = predicate(f);
      if (!hasAction && r) out += f.path + "\n";
    };

    const join = (base: string, name: string): string => (base === "/" ? "/" + name : base + "/" + name);

    const recurse = (node: VNode, dispPath: string, depth: number): void => {
      let pruned = false;
      if (depth >= minDepth) {
        evalNode({ node, path: dispPath, depth, setPrune: () => (pruned = true) });
      }
      if (node.type === "dir" && depth < maxDepth && !pruned && node.children) {
        for (const [name, child] of [...node.children.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
          recurse(child, join(dispPath, name), depth + 1);
        }
      }
    };

    for (const p of paths) {
      const startAbs = ctx.resolve(p);
      const startNode = ctx.vfs.lstat(startAbs);
      if (!startNode) {
        errOut += `find: '${p}': No such file or directory\n`;
        code = 1;
        continue;
      }
      recurse(startNode, p.replace(/\/+$/, "") || p, 0);
    }

    // -exec ... + のバッチ実行
    for (const b of batched) {
      const argv: string[] = [];
      for (const a of b.cmd) {
        if (a === "{}") argv.push(...b.paths);
        else argv.push(a);
      }
      const r = ctx.services.runArgv(argv, "");
      out += r.stdout;
      errOut += r.stderr;
    }

    if (errOut) ctx.err(errOut);
    ctx.out(out);
    return code;
  },
};
