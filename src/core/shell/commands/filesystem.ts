import { VFS, type VNode } from "../../vfs/VFS";
import { fileSize, humanSize, lsTime, permString } from "../../vfs/format";
import type { Command, ExecContext } from "../types";
import { classify, colorFor, formatColumns, parseArgs, visibleWidth } from "./util";

function nlink(node: VNode): number {
  if (node.type === "dir" && node.children) {
    let c = 2;
    for (const ch of node.children.values()) if (ch.type === "dir") c++;
    return c;
  }
  return 1;
}

interface Entry {
  name: string;
  node: VNode;
}

function sortEntries(entries: Entry[], flags: Set<string>): Entry[] {
  const arr = [...entries];
  if (flags.has("t")) arr.sort((a, b) => b.node.mtime.getTime() - a.node.mtime.getTime());
  else if (flags.has("S")) arr.sort((a, b) => fileSize(b.node) - fileSize(a.node));
  else arr.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (flags.has("r")) arr.reverse();
  return arr;
}

function dirEntries(node: VNode, flags: Set<string>): Entry[] {
  const out: Entry[] = [];
  if (flags.has("a")) {
    out.push({ name: ".", node });
    out.push({ name: "..", node: node.parent ?? node });
  }
  if (node.children) {
    for (const [name, child] of node.children) {
      if (name.startsWith(".") && !flags.has("a") && !flags.has("A")) continue;
      out.push({ name, node: child });
    }
  }
  return out;
}

function nameCell(e: Entry, ctx: ExecContext, flags: Set<string>): string {
  const suffix = flags.has("F") ? classify(e.node) : "";
  return colorFor(e.node, e.name, ctx.tty) + suffix;
}

function longList(entries: Entry[], ctx: ExecContext, flags: Set<string>): string {
  const rows = entries.map((e) => ({
    perm: permString(e.node),
    link: String(nlink(e.node)),
    owner: e.node.owner,
    group: e.node.group,
    size: flags.has("h") ? humanSize(fileSize(e.node)) : String(fileSize(e.node)),
    time: lsTime(e.node.mtime),
    e,
  }));
  const w = (sel: (r: (typeof rows)[number]) => string): number =>
    rows.reduce((m, r) => Math.max(m, sel(r).length), 0);
  const wl = w((r) => r.link);
  const wo = w((r) => r.owner);
  const wg = w((r) => r.group);
  const ws = w((r) => r.size);
  const lines = rows.map((r) => {
    let name = nameCell(r.e, ctx, flags);
    if (r.e.node.type === "symlink") name += ` -> ${r.e.node.target}`;
    return `${r.perm} ${r.link.padStart(wl)} ${r.owner.padEnd(wo)} ${r.group.padEnd(
      wg,
    )} ${r.size.padStart(ws)} ${r.time} ${name}`;
  });
  let total = 0;
  for (const e of entries) total += Math.ceil(fileSize(e.node) / 1024) * 4;
  return `total ${total}\n` + lines.join("\n");
}

function listOneDir(absPath: string, ctx: ExecContext, flags: Set<string>): string {
  const node = ctx.vfs.stat(absPath);
  if (!node || node.type !== "dir") return "";
  const entries = sortEntries(dirEntries(node, flags), flags);
  if (flags.has("l")) return longList(entries, ctx, flags);
  if (flags.has("1") || !ctx.tty) return entries.map((e) => nameCell(e, ctx, flags)).join("\n");
  const items = entries.map((e) => {
    const cell = nameCell(e, ctx, flags);
    return { text: cell, w: visibleWidth(e.name) + (flags.has("F") ? classify(e.node).length : 0) };
  });
  return formatColumns(items, ctx.cols);
}

const ls: Command = {
  name: "ls",
  summary: "ディレクトリ内容を一覧表示",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    const paths = rest.length ? rest : ["."];
    const files: Entry[] = [];
    const dirs: Array<{ display: string; abs: string }> = [];
    let code = 0;
    for (const p of paths) {
      const abs = ctx.resolve(p);
      const lst = ctx.vfs.lstat(abs);
      if (!lst) {
        ctx.err(`ls: cannot access '${p}': No such file or directory\n`);
        code = 2;
        continue;
      }
      if (!flags.has("d")) {
        if (lst.type === "dir") {
          dirs.push({ display: p, abs });
          continue;
        }
        if (lst.type === "symlink") {
          const tgt = ctx.vfs.stat(abs);
          if (tgt && tgt.type === "dir") {
            dirs.push({ display: p, abs });
            continue;
          }
        }
      }
      files.push({ name: p, node: lst });
    }

    const blocks: string[] = [];
    if (files.length) {
      const sorted = sortEntries(files, flags);
      if (flags.has("l")) blocks.push(longList(sorted, ctx, flags).replace(/^total .*\n/, ""));
      else if (flags.has("1") || !ctx.tty)
        blocks.push(sorted.map((e) => nameCell(e, ctx, flags)).join("\n"));
      else
        blocks.push(
          formatColumns(
            sorted.map((e) => ({ text: nameCell(e, ctx, flags), w: visibleWidth(e.name) })),
            ctx.cols,
          ),
        );
    }

    const showHeader = dirs.length + files.length > 1 || flags.has("R");
    const renderDir = (display: string, abs: string): void => {
      const body = listOneDir(abs, ctx, flags);
      if (showHeader) blocks.push(`${display}:\n${body}`.replace(/\n$/, ""));
      else blocks.push(body);
      if (flags.has("R")) {
        const node = ctx.vfs.stat(abs);
        if (node && node.children) {
          const subs = sortEntries(
            [...node.children.entries()]
              .filter(([n]) => !n.startsWith(".") || flags.has("a") || flags.has("A"))
              .map(([name, child]) => ({ name, node: child })),
            flags,
          ).filter((e) => e.node.type === "dir");
          for (const s of subs) renderDir(`${display}/${s.name}`, `${abs}/${s.name}`);
        }
      }
    };
    for (const d of dirs) renderDir(d.display, d.abs);

    const out = blocks.filter((b) => b !== "").join(showHeader ? "\n\n" : "\n");
    if (out) ctx.out(out + "\n");
    return code;
  },
};

const pwd: Command = {
  name: "pwd",
  summary: "カレントディレクトリのパスを表示",
  run(ctx) {
    ctx.out(ctx.env.cwd + "\n");
    return 0;
  },
};

const cd: Command = {
  name: "cd",
  summary: "ディレクトリを移動",
  run(ctx) {
    let target = ctx.args[1];
    if (target === undefined) target = ctx.env.get("HOME") ?? "/";
    else if (target === "-") {
      target = ctx.env.oldpwd;
      ctx.out(target + "\n");
    }
    const abs = ctx.resolve(target);
    const node = ctx.vfs.stat(abs);
    if (!node) {
      ctx.err(`cd: ${target}: No such file or directory\n`);
      return 1;
    }
    if (node.type !== "dir") {
      ctx.err(`cd: ${target}: Not a directory\n`);
      return 1;
    }
    ctx.env.oldpwd = ctx.env.cwd;
    ctx.env.cwd = ctx.vfs.pathOf(node);
    return 0;
  },
};

const mkdir: Command = {
  name: "mkdir",
  summary: "ディレクトリを作成",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    if (rest.length === 0) {
      ctx.err("mkdir: missing operand\n");
      return 1;
    }
    let code = 0;
    for (const p of rest) {
      const abs = ctx.resolve(p);
      if (flags.has("p")) {
        if (!ctx.vfs.mkdirp(abs)) {
          ctx.err(`mkdir: cannot create directory '${p}'\n`);
          code = 1;
        }
      } else {
        if (ctx.vfs.exists(abs)) {
          ctx.err(`mkdir: cannot create directory '${p}': File exists\n`);
          code = 1;
        } else if (!ctx.vfs.createDir(abs)) {
          ctx.err(`mkdir: cannot create directory '${p}': No such file or directory\n`);
          code = 1;
        }
      }
    }
    return code;
  },
};

const rmdir: Command = {
  name: "rmdir",
  summary: "空ディレクトリを削除",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    let code = 0;
    for (const p of rest) {
      const abs = ctx.resolve(p);
      const node = ctx.vfs.lstat(abs);
      if (!node || node.type !== "dir") {
        ctx.err(`rmdir: failed to remove '${p}': Not a directory\n`);
        code = 1;
      } else if (node.children && node.children.size > 0) {
        ctx.err(`rmdir: failed to remove '${p}': Directory not empty\n`);
        code = 1;
      } else {
        ctx.vfs.unlink(node);
      }
    }
    return code;
  },
};

const touch: Command = {
  name: "touch",
  summary: "ファイル作成 / 更新時刻の変更",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    if (rest.length === 0) {
      ctx.err("touch: missing file operand\n");
      return 1;
    }
    for (const p of rest) {
      const abs = ctx.resolve(p);
      const node = ctx.vfs.lstat(abs);
      if (node) node.mtime = new Date();
      else if (!ctx.vfs.createFile(abs)) ctx.err(`touch: cannot touch '${p}'\n`);
    }
    return 0;
  },
};

function removeRecursive(node: VNode, vfs: VFS): void {
  vfs.unlink(node);
}

const rm: Command = {
  name: "rm",
  summary: "ファイル/ディレクトリを削除",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    const recursive = flags.has("r") || flags.has("R");
    const force = flags.has("f");
    let code = 0;
    for (const p of rest) {
      const abs = ctx.resolve(p);
      const node = ctx.vfs.lstat(abs);
      if (!node) {
        if (!force) {
          ctx.err(`rm: cannot remove '${p}': No such file or directory\n`);
          code = 1;
        }
        continue;
      }
      if (node.type === "dir" && !recursive) {
        ctx.err(`rm: cannot remove '${p}': Is a directory\n`);
        code = 1;
        continue;
      }
      removeRecursive(node, ctx.vfs);
    }
    return code;
  },
};

function copyNode(src: VNode, vfs: VFS): VNode {
  const clone: VNode = {
    type: src.type,
    name: src.name,
    mode: src.mode,
    owner: src.owner,
    group: src.group,
    mtime: new Date(),
    content: src.content,
    target: src.target,
    children: src.type === "dir" ? new Map() : null,
    parent: null,
  };
  if (src.type === "dir" && src.children) {
    for (const child of src.children.values()) {
      const c = copyNode(child, vfs);
      vfs.link(clone, child.name, c);
    }
  }
  return clone;
}

const cp: Command = {
  name: "cp",
  summary: "ファイル/ディレクトリをコピー",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    const recursive = flags.has("r") || flags.has("R") || flags.has("a");
    if (rest.length < 2) {
      ctx.err("cp: missing destination file operand\n");
      return 1;
    }
    const sources = rest.slice(0, -1);
    const destRaw = rest[rest.length - 1];
    const destAbs = ctx.resolve(destRaw);
    const destNode = ctx.vfs.stat(destAbs);
    const destIsDir = destNode && destNode.type === "dir";
    let code = 0;
    if (sources.length > 1 && !destIsDir) {
      ctx.err(`cp: target '${destRaw}' is not a directory\n`);
      return 1;
    }
    for (const s of sources) {
      const srcAbs = ctx.resolve(s);
      const srcNode = ctx.vfs.lstat(srcAbs);
      if (!srcNode) {
        ctx.err(`cp: cannot stat '${s}': No such file or directory\n`);
        code = 1;
        continue;
      }
      if (srcNode.type === "dir" && !recursive) {
        ctx.err(`cp: -r not specified; omitting directory '${s}'\n`);
        code = 1;
        continue;
      }
      const targetAbs = destIsDir ? `${destAbs}/${VFS.basename(srcAbs)}` : destAbs;
      const { parent, base } = ctx.vfs.lookupParent(targetAbs);
      if (!parent) {
        ctx.err(`cp: cannot create '${destRaw}': No such file or directory\n`);
        code = 1;
        continue;
      }
      const existing = parent.children?.get(base);
      if (existing) ctx.vfs.unlink(existing);
      const clone = copyNode(srcNode, ctx.vfs);
      ctx.vfs.link(parent, base, clone);
    }
    return code;
  },
};

const mv: Command = {
  name: "mv",
  summary: "ファイル/ディレクトリを移動・改名",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    if (rest.length < 2) {
      ctx.err("mv: missing destination file operand\n");
      return 1;
    }
    const sources = rest.slice(0, -1);
    const destRaw = rest[rest.length - 1];
    const destAbs = ctx.resolve(destRaw);
    const destNode = ctx.vfs.stat(destAbs);
    const destIsDir = destNode && destNode.type === "dir";
    let code = 0;
    if (sources.length > 1 && !destIsDir) {
      ctx.err(`mv: target '${destRaw}' is not a directory\n`);
      return 1;
    }
    for (const s of sources) {
      const srcAbs = ctx.resolve(s);
      const srcNode = ctx.vfs.lstat(srcAbs);
      if (!srcNode) {
        ctx.err(`mv: cannot stat '${s}': No such file or directory\n`);
        code = 1;
        continue;
      }
      const targetAbs = destIsDir ? `${destAbs}/${VFS.basename(srcAbs)}` : destAbs;
      const { parent, base } = ctx.vfs.lookupParent(targetAbs);
      if (!parent) {
        ctx.err(`mv: cannot move '${s}': No such file or directory\n`);
        code = 1;
        continue;
      }
      const existing = parent.children?.get(base);
      if (existing) ctx.vfs.unlink(existing);
      ctx.vfs.unlink(srcNode);
      ctx.vfs.link(parent, base, srcNode);
    }
    return code;
  },
};

const ln: Command = {
  name: "ln",
  summary: "リンクを作成 (-s でシンボリックリンク)",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    if (rest.length < 2) {
      ctx.err("ln: missing file operand\n");
      return 1;
    }
    const target = rest[0];
    const linkName = rest[1];
    const linkAbs = ctx.resolve(linkName);
    if (flags.has("s")) {
      if (!ctx.vfs.createSymlink(linkAbs, target)) {
        ctx.err(`ln: failed to create symbolic link '${linkName}'\n`);
        return 1;
      }
    } else {
      const srcNode = ctx.vfs.stat(ctx.resolve(target));
      if (!srcNode || srcNode.type !== "file") {
        ctx.err(`ln: failed to access '${target}'\n`);
        return 1;
      }
      const created = ctx.vfs.createFile(linkAbs, srcNode.content, srcNode.mode);
      if (!created) {
        ctx.err(`ln: failed to create hard link '${linkName}'\n`);
        return 1;
      }
    }
    return 0;
  },
};

const tree: Command = {
  name: "tree",
  summary: "ディレクトリ階層をツリー表示",
  run(ctx) {
    const { flags, rest } = parseArgs(ctx.args);
    const start = ctx.resolve(rest[0] ?? ".");
    const root = ctx.vfs.stat(start);
    if (!root || root.type !== "dir") {
      ctx.err(`tree: ${rest[0] ?? "."}: Not a directory\n`);
      return 1;
    }
    let dirs = 0;
    let files = 0;
    const lines: string[] = [rest[0] ?? "."];
    const walk = (node: VNode, prefix: string): void => {
      if (!node.children) return;
      const entries = [...node.children.entries()]
        .filter(([n]) => flags.has("a") || !n.startsWith("."))
        .sort((a, b) => (a[0] < b[0] ? -1 : 1));
      entries.forEach(([name, child], i) => {
        const last = i === entries.length - 1;
        const branch = last ? "└── " : "├── ";
        lines.push(prefix + branch + colorFor(child, name, ctx.tty));
        if (child.type === "dir") {
          dirs++;
          walk(child, prefix + (last ? "    " : "│   "));
        } else {
          files++;
        }
      });
    };
    walk(root, "");
    lines.push("");
    lines.push(`${dirs} directories, ${files} files`);
    ctx.out(lines.join("\n") + "\n");
    return 0;
  },
};

const stat: Command = {
  name: "stat",
  summary: "ファイルの詳細情報を表示",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    let code = 0;
    for (const p of rest) {
      const abs = ctx.resolve(p);
      const node = ctx.vfs.lstat(abs);
      if (!node) {
        ctx.err(`stat: cannot statx '${p}': No such file or directory\n`);
        code = 1;
        continue;
      }
      const type = node.type === "dir" ? "directory" : node.type === "symlink" ? "symbolic link" : "regular file";
      const octal = (node.mode & 0o7777).toString(8).padStart(4, "0");
      ctx.out(
        [
          `  File: ${p}${node.type === "symlink" ? ` -> ${node.target}` : ""}`,
          `  Size: ${fileSize(node)}\tType: ${type}`,
          `Access: (0${octal}/${permString(node)})  Uid: ( ${node.owner} )   Gid: ( ${node.group} )`,
          `Modify: ${node.mtime.toISOString()}`,
          "",
        ].join("\n"),
      );
    }
    return code;
  },
};

const fileCmd: Command = {
  name: "file",
  summary: "ファイルの種類を推定",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    let code = 0;
    for (const p of rest) {
      const abs = ctx.resolve(p);
      const node = ctx.vfs.lstat(abs);
      if (!node) {
        ctx.out(`${p}: cannot open (No such file or directory)\n`);
        code = 1;
        continue;
      }
      let desc: string;
      if (node.type === "dir") desc = "directory";
      else if (node.type === "symlink") desc = `symbolic link to ${node.target}`;
      else if (node.content === "") desc = "empty";
      else if (node.content.startsWith("#!")) desc = `a ${node.content.slice(2).split("\n")[0].trim()} script, ASCII text executable`;
      else desc = "ASCII text";
      ctx.out(`${p}: ${desc}\n`);
    }
    return code;
  },
};

const readlink: Command = {
  name: "readlink",
  summary: "シンボリックリンクのターゲットを表示",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    let code = 0;
    for (const p of rest) {
      const node = ctx.vfs.lstat(ctx.resolve(p));
      if (!node || node.type !== "symlink") {
        code = 1;
        continue;
      }
      ctx.out(node.target + "\n");
    }
    return code;
  },
};

const realpath: Command = {
  name: "realpath",
  summary: "正規化された絶対パスを表示",
  run(ctx) {
    const { rest } = parseArgs(ctx.args);
    let code = 0;
    for (const p of rest) {
      const node = ctx.vfs.stat(ctx.resolve(p));
      if (!node) {
        ctx.err(`realpath: ${p}: No such file or directory\n`);
        code = 1;
        continue;
      }
      ctx.out(ctx.vfs.pathOf(node) + "\n");
    }
    return code;
  },
};

const basenameCmd: Command = {
  name: "basename",
  summary: "パスのファイル名部分を表示",
  run(ctx) {
    const a = ctx.args[1];
    if (a === undefined) {
      ctx.err("basename: missing operand\n");
      return 1;
    }
    let base = VFS.basename(a);
    const suffix = ctx.args[2];
    if (suffix && base.endsWith(suffix) && base !== suffix) base = base.slice(0, -suffix.length);
    ctx.out(base + "\n");
    return 0;
  },
};

const dirnameCmd: Command = {
  name: "dirname",
  summary: "パスのディレクトリ部分を表示",
  run(ctx) {
    const a = ctx.args[1];
    if (a === undefined) {
      ctx.err("dirname: missing operand\n");
      return 1;
    }
    ctx.out(VFS.dirname(a) + "\n");
    return 0;
  },
};

export const filesystemCommands: Command[] = [
  ls,
  pwd,
  cd,
  mkdir,
  rmdir,
  touch,
  rm,
  cp,
  mv,
  ln,
  tree,
  stat,
  fileCmd,
  readlink,
  realpath,
  basenameCmd,
  dirnameCmd,
];
