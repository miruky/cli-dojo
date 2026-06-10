import type { Command, ExecContext } from "../types";
import { VFS, type VNode } from "../../vfs/VFS";

interface Member {
  path: string;
  type: "file" | "dir";
  mode: number;
  content: string;
}

const MAGIC = "CLIDOJO-ARCHIVE-V1\n";

function serialize(members: Member[]): string {
  return MAGIC + JSON.stringify(members);
}
function deserialize(content: string): Member[] | null {
  if (!content.startsWith(MAGIC)) return null;
  try {
    return JSON.parse(content.slice(MAGIC.length));
  } catch {
    return null;
  }
}

function gather(ctx: ExecContext, path: string, members: Member[]): void {
  const node = ctx.vfs.lstat(ctx.resolve(path));
  if (!node) {
    ctx.err(`tar: ${path}: Cannot stat: No such file or directory\n`);
    return;
  }
  const walk = (n: VNode, p: string): void => {
    if (n.type === "dir") {
      members.push({ path: p, type: "dir", mode: n.mode, content: "" });
      if (n.children) for (const [name, c] of n.children) walk(c, p + "/" + name);
    } else if (n.type === "file") {
      members.push({ path: p, type: "file", mode: n.mode, content: n.content });
    }
  };
  walk(node, path.replace(/\/+$/, ""));
}

function extract(ctx: ExecContext, members: Member[], verbose: boolean, out: string[], chdir: string): void {
  const baseAbs = ctx.resolve(chdir || ".");
  for (const m of members) {
    const abs = ctx.vfs.resolve(baseAbs, m.path);
    if (m.type === "dir") {
      ctx.vfs.mkdirp(abs);
    } else {
      const parent = VFS.dirname(abs);
      ctx.vfs.mkdirp(parent);
      const existing = ctx.vfs.lstat(abs);
      if (existing && existing.type === "file") existing.content = m.content;
      else ctx.vfs.createFile(abs, m.content, m.mode);
    }
    if (verbose) out.push(m.path);
  }
}

function parseTarArgs(args: string[]): {
  create: boolean;
  extractMode: boolean;
  list: boolean;
  verbose: boolean;
  archive: string;
  files: string[];
  chdir: string;
} {
  let create = false, extractMode = false, list = false, verbose = false;
  let needArchive = false;
  let needChdir = false;
  let archive = "";
  let chdir = "";
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const isCluster = a.startsWith("-") || (i === 0 && /^[cxtzvfjJC]+$/.test(a));
    if (isCluster) {
      for (const c of a.replace(/^-+/, "")) {
        if (c === "c") create = true;
        else if (c === "x") extractMode = true;
        else if (c === "t") list = true;
        else if (c === "v") verbose = true;
        else if (c === "f") needArchive = true;
        else if (c === "C") needChdir = true;
      }
      continue;
    }
    if (needArchive && archive === "") {
      archive = a;
      needArchive = false;
      continue;
    }
    if (needChdir && chdir === "") {
      chdir = a;
      needChdir = false;
      continue;
    }
    files.push(a);
  }
  return { create, extractMode, list, verbose, archive, files, chdir };
}

const tar: Command = {
  name: "tar",
  summary: "アーカイブの作成/展開/一覧",
  run(ctx) {
    const { create, extractMode, list, verbose, archive, files, chdir } = parseTarArgs(ctx.args.slice(1));
    if (chdir && !ctx.vfs.stat(ctx.resolve(chdir))) {
      ctx.err(`tar: ${chdir}: Cannot chdir: No such file or directory\n`);
      return 2;
    }
    if (!archive) {
      ctx.err("tar: アーカイブファイル (-f) を指定してください\n");
      return 2;
    }
    const out: string[] = [];
    if (create) {
      const members: Member[] = [];
      for (const f of files) gather(ctx, f, members);
      const abs = ctx.resolve(archive);
      const node = ctx.vfs.lstat(abs);
      if (node && node.type === "file") node.content = serialize(members);
      else ctx.vfs.createFile(abs, serialize(members));
      if (verbose) for (const m of members) out.push(m.path);
    } else {
      const node = ctx.vfs.stat(ctx.resolve(archive));
      if (!node || node.type !== "file") {
        ctx.err(`tar: ${archive}: Cannot open: No such file or directory\n`);
        return 2;
      }
      const members = deserialize(node.content);
      if (!members) {
        ctx.err(`tar: ${archive}: not in cli-dojo archive format\n`);
        return 2;
      }
      if (list) for (const m of members) out.push(m.path + (m.type === "dir" ? "/" : ""));
      else if (extractMode) extract(ctx, members, verbose, out, chdir);
    }
    if (out.length) ctx.out(out.join("\n") + "\n");
    return 0;
  },
};

// gzip/xz/bzip2 系: 拡張子の付け外しで圧縮/解凍を模擬 (内容は保持)
function makeCompressor(name: string, ext: string, decompressName?: string): Command {
  return {
    name,
    summary: decompressName ? `${ext} を解凍` : `${ext} で圧縮 (内容は保持)`,
    run(ctx: ExecContext) {
      const args = ctx.args.slice(1);
      const decompress = !!decompressName || args.includes("-d");
      const keep = args.includes("-k") || args.includes("--keep");
      const toStdout = args.includes("-c") || args.includes("--stdout");
      const files = args.filter((a) => !a.startsWith("-"));
      if (files.length === 0) {
        ctx.out(ctx.stdin);
        return 0;
      }
      let code = 0;
      for (const f of files) {
        const abs = ctx.resolve(f);
        const node = ctx.vfs.lstat(abs);
        if (!node || node.type !== "file") {
          ctx.err(`${name}: ${f}: No such file or directory\n`);
          code = 1;
          continue;
        }
        if (toStdout) {
          ctx.out(node.content);
          continue;
        }
        if (decompress) {
          const newName = abs.endsWith(ext) ? abs.slice(0, -ext.length) : abs;
          if (newName === abs) {
            ctx.err(`${name}: ${f}: unknown suffix -- ignored\n`);
            code = 1;
            continue;
          }
          ctx.vfs.createFile(newName, node.content, node.mode);
          if (!keep) ctx.vfs.unlink(node);
        } else {
          if (abs.endsWith(ext)) continue;
          ctx.vfs.createFile(abs + ext, node.content, node.mode);
          if (!keep) ctx.vfs.unlink(node);
        }
      }
      return code;
    },
  };
}

const zip: Command = {
  name: "zip",
  summary: "ZIP アーカイブを作成",
  run(ctx) {
    const args = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    if (args.length < 2) {
      ctx.err("zip: usage: zip archive.zip files...\n");
      return 2;
    }
    const archive = args[0].endsWith(".zip") ? args[0] : args[0] + ".zip";
    const members: Member[] = [];
    for (const f of args.slice(1)) gather(ctx, f, members);
    const abs = ctx.resolve(archive);
    const node = ctx.vfs.lstat(abs);
    if (node && node.type === "file") node.content = serialize(members);
    else ctx.vfs.createFile(abs, serialize(members));
    let out = "";
    for (const m of members) out += `  adding: ${m.path}${m.type === "dir" ? "/" : ""}\n`;
    ctx.out(out);
    return 0;
  },
};

const unzip: Command = {
  name: "unzip",
  summary: "ZIP アーカイブを展開/一覧",
  run(ctx) {
    const args = ctx.args.slice(1);
    const list = args.includes("-l");
    const file = args.filter((a) => !a.startsWith("-"))[0];
    if (!file) {
      ctx.err("unzip: usage: unzip archive.zip\n");
      return 2;
    }
    const node = ctx.vfs.stat(ctx.resolve(file));
    if (!node || node.type !== "file") {
      ctx.err(`unzip: cannot find ${file}\n`);
      return 2;
    }
    const members = deserialize(node.content);
    if (!members) {
      ctx.err(`unzip: ${file}: not a cli-dojo archive\n`);
      return 2;
    }
    if (list) {
      let out = "  Length      Date    Time    Name\n---------  ---------- -----   ----\n";
      for (const m of members) out += `${String(m.content.length).padStart(9)}  2026-06-03 10:30   ${m.path}\n`;
      ctx.out(out);
    } else {
      const out: string[] = [];
      for (const m of members) {
        const abs = ctx.resolve(m.path);
        if (m.type === "dir") ctx.vfs.mkdirp(abs);
        else {
          ctx.vfs.mkdirp(VFS.dirname(abs));
          const ex = ctx.vfs.lstat(abs);
          if (ex && ex.type === "file") ex.content = m.content;
          else ctx.vfs.createFile(abs, m.content, m.mode);
        }
        out.push(`  inflating: ${m.path}`);
      }
      ctx.out(out.join("\n") + "\n");
    }
    return 0;
  },
};

export const archiveCommands: Command[] = [
  tar,
  zip,
  unzip,
  makeCompressor("gzip", ".gz"),
  makeCompressor("gunzip", ".gz", "gunzip"),
  makeCompressor("xz", ".xz"),
  makeCompressor("unxz", ".xz", "unxz"),
  makeCompressor("bzip2", ".bz2"),
  makeCompressor("bunzip2", ".bz2", "bunzip2"),
];
