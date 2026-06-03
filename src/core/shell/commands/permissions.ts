import type { Command, ExecContext } from "../types";
import { type VNode } from "../../vfs/VFS";
import { fileSize, humanSize } from "../../vfs/format";
import { parseArgs } from "./util";

function applySymbolic(mode: number, spec: string, isDir: boolean): number {
  let m = mode;
  for (const clause of spec.split(",")) {
    const mm = /^([ugoa]*)([+\-=])([rwxXst]*)$/.exec(clause.trim());
    if (!mm) continue;
    const who = mm[1] || "a";
    const op = mm[2];
    const perms = mm[3];
    let bits = 0;
    for (const p of perms) {
      if (p === "r") bits |= 4;
      else if (p === "w") bits |= 2;
      else if (p === "x") bits |= 1;
      else if (p === "X") {
        if (isDir || m & 0o111) bits |= 1;
      }
    }
    const classes = new Set<string>();
    if (who.includes("a")) {
      classes.add("u");
      classes.add("g");
      classes.add("o");
    }
    for (const c of who) if (c !== "a") classes.add(c);
    for (const cls of classes) {
      const shift = cls === "u" ? 6 : cls === "g" ? 3 : 0;
      const cur = (m >> shift) & 7;
      let next: number;
      if (op === "+") next = cur | bits;
      else if (op === "-") next = cur & ~bits;
      else next = bits;
      m = (m & ~(7 << shift)) | (next << shift);
    }
    if (perms.includes("s")) {
      if (classes.has("u")) m = op === "-" ? m & ~0o4000 : m | 0o4000;
      if (classes.has("g")) m = op === "-" ? m & ~0o2000 : m | 0o2000;
    }
    if (perms.includes("t")) m = op === "-" ? m & ~0o1000 : m | 0o1000;
  }
  return m;
}

function eachTarget(ctx: ExecContext, paths: string[], recursive: boolean, fn: (n: VNode) => void): number {
  let code = 0;
  const visit = (node: VNode): void => {
    fn(node);
    if (recursive && node.type === "dir" && node.children) {
      for (const c of node.children.values()) visit(c);
    }
  };
  for (const p of paths) {
    const node = ctx.vfs.lstat(ctx.resolve(p));
    if (!node) {
      ctx.err(`cannot access '${p}': No such file or directory\n`);
      code = 1;
      continue;
    }
    visit(node);
  }
  return code;
}

const chmod: Command = {
  name: "chmod",
  summary: "パーミッションを変更 (記号/8進)",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    const recursive = flags.has("R") || flags.has("recursive");
    const spec = rest[0];
    const paths = rest.slice(1);
    if (!spec || paths.length === 0) {
      ctx.err("chmod: missing operand\n");
      return 1;
    }
    const octal = /^[0-7]{1,4}$/.test(spec);
    return eachTarget(ctx, paths, recursive, (node) => {
      if (octal) node.mode = parseInt(spec, 8) & 0o7777;
      else node.mode = applySymbolic(node.mode, spec, node.type === "dir");
      node.mtime = node.mtime;
    });
  },
};

const chown: Command = {
  name: "chown",
  summary: "所有者/グループを変更",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    const recursive = flags.has("R") || flags.has("recursive");
    const spec = rest[0];
    const paths = rest.slice(1);
    if (!spec || paths.length === 0) {
      ctx.err("chown: missing operand\n");
      return 1;
    }
    const [owner, group] = spec.split(":");
    return eachTarget(ctx, paths, recursive, (node) => {
      if (owner) node.owner = owner;
      if (group !== undefined && group !== "") node.group = group;
      else if (spec.includes(":") && group === "") node.group = owner;
    });
  },
};

const chgrp: Command = {
  name: "chgrp",
  summary: "グループを変更",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    const recursive = flags.has("R") || flags.has("recursive");
    const group = rest[0];
    const paths = rest.slice(1);
    if (!group || paths.length === 0) {
      ctx.err("chgrp: missing operand\n");
      return 1;
    }
    return eachTarget(ctx, paths, recursive, (node) => {
      node.group = group;
    });
  },
};

const umask: Command = {
  name: "umask",
  summary: "ファイル作成マスクを表示/設定",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    if (rest.length === 0) {
      if (flags.has("S")) {
        const m = ~ctx.env.umask & 0o777;
        const part = (b: number): string => (b & 4 ? "r" : "") + (b & 2 ? "w" : "") + (b & 1 ? "x" : "");
        ctx.out(`u=${part((m >> 6) & 7)},g=${part((m >> 3) & 7)},o=${part(m & 7)}\n`);
      } else {
        ctx.out("0" + ctx.env.umask.toString(8).padStart(3, "0") + "\n");
      }
      return 0;
    }
    if (/^[0-7]{1,4}$/.test(rest[0])) {
      ctx.env.umask = parseInt(rest[0], 8) & 0o777;
      return 0;
    }
    ctx.err("umask: 無効なマスクです\n");
    return 1;
  },
};

function duWalk(
  node: VNode,
  path: string,
  depth: number,
  opts: { human: boolean; all: boolean; summary: boolean; maxDepth: number | null },
  out: string[],
): number {
  let bytes = node.type === "dir" ? 4096 : fileSize(node);
  if (node.type === "dir" && node.children) {
    for (const [name, child] of [...node.children.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      bytes += duWalk(child, path + "/" + name, depth + 1, opts, out);
    }
  }
  const isDir = node.type === "dir";
  const withinDepth = opts.maxDepth == null || depth <= opts.maxDepth;
  if (!opts.summary && (isDir || opts.all) && withinDepth) {
    const size = opts.human ? humanSize(bytes) : String(Math.max(1, Math.ceil(bytes / 1024)));
    out.push(`${size}\t${path}`);
  }
  return bytes;
}

const du: Command = {
  name: "du",
  summary: "ディスク使用量を表示",
  run(ctx) {
    const { flags, values, rest } = parseArgs(ctx.args);
    const opts = {
      human: flags.has("h"),
      all: flags.has("a"),
      summary: flags.has("s"),
      maxDepth: values.has("max-depth") ? parseInt(values.get("max-depth")!, 10) : null,
    };
    const paths = rest.length ? rest : ["."];
    const out: string[] = [];
    let code = 0;
    for (const p of paths) {
      const node = ctx.vfs.stat(ctx.resolve(p));
      if (!node) {
        ctx.err(`du: cannot access '${p}': No such file or directory\n`);
        code = 1;
        continue;
      }
      const bytes = duWalk(node, p, 0, opts, out);
      if (opts.summary) {
        const size = opts.human ? humanSize(bytes) : String(Math.max(1, Math.ceil(bytes / 1024)));
        out.push(`${size}\t${p}`);
      }
    }
    ctx.out(out.join("\n") + (out.length ? "\n" : ""));
    return code;
  },
};

export const permissionCommands: Command[] = [chmod, chown, chgrp, umask, du];
