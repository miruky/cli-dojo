import type { Command, ExecContext } from "../types";
import { base64Decode, base64Encode, bytesOf, cksum, md5, sha1, sha256 } from "../crypto";

function makeSum(name: string, fn: (b: Uint8Array) => string): Command {
  return {
    name,
    summary: `${name.toUpperCase().replace("SUM", "")} ハッシュを計算/照合`,
    run(ctx: ExecContext) {
      const args = ctx.args.slice(1);
      const check = args.includes("-c") || args.includes("--check");
      const files = args.filter((a) => !a.startsWith("-"));
      if (check) {
        let code = 0;
        for (const f of files) {
          const node = ctx.vfs.stat(ctx.resolve(f));
          if (!node || node.type !== "file") {
            ctx.err(`${name}: ${f}: No such file or directory\n`);
            code = 1;
            continue;
          }
          for (const line of node.content.split("\n")) {
            if (line.trim() === "") continue;
            const m = /^(\w+)\s+[ *]?(.+)$/.exec(line);
            if (!m) continue;
            const target = ctx.vfs.stat(ctx.resolve(m[2]));
            if (!target || target.type !== "file") {
              ctx.out(`${m[2]}: FAILED open or read\n`);
              code = 1;
              continue;
            }
            const ok = fn(bytesOf(target.content)) === m[1];
            ctx.out(`${m[2]}: ${ok ? "OK" : "FAILED"}\n`);
            if (!ok) code = 1;
          }
        }
        return code;
      }
      if (files.length === 0) {
        ctx.out(`${fn(bytesOf(ctx.stdin))}  -\n`);
        return 0;
      }
      let code = 0;
      for (const f of files) {
        const node = ctx.vfs.stat(ctx.resolve(f));
        if (!node) {
          ctx.err(`${name}: ${f}: No such file or directory\n`);
          code = 1;
        } else if (node.type === "dir") {
          ctx.err(`${name}: ${f}: Is a directory\n`);
          code = 1;
        } else ctx.out(`${fn(bytesOf(node.content))}  ${f}\n`);
      }
      return code;
    },
  };
}

const cksumCmd: Command = {
  name: "cksum",
  summary: "CRC チェックサムとバイト数",
  run(ctx) {
    const files = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    if (files.length === 0) {
      const r = cksum(bytesOf(ctx.stdin));
      ctx.out(`${r.crc} ${r.len}\n`);
      return 0;
    }
    let code = 0;
    for (const f of files) {
      const node = ctx.vfs.stat(ctx.resolve(f));
      if (!node || node.type !== "file") {
        ctx.err(`cksum: ${f}: No such file or directory\n`);
        code = 1;
        continue;
      }
      const r = cksum(bytesOf(node.content));
      ctx.out(`${r.crc} ${r.len} ${f}\n`);
    }
    return code;
  },
};

const base64Cmd: Command = {
  name: "base64",
  summary: "Base64 エンコード/デコード",
  run(ctx) {
    const args = ctx.args.slice(1);
    const decode = args.includes("-d") || args.includes("--decode");
    let wrap = 76;
    const wi = args.findIndex((a) => a === "-w" || a === "--wrap");
    if (wi >= 0) wrap = parseInt(args[wi + 1] ?? "76", 10) || 0;
    const files = args.filter((a, i) => !a.startsWith("-") && !(wi >= 0 && i === wi + 1));
    const input = files.length ? (ctx.vfs.stat(ctx.resolve(files[0]))?.content ?? "") : ctx.stdin;
    if (decode) {
      try {
        ctx.out(base64Decode(input));
      } catch {
        ctx.err("base64: invalid input\n");
        return 1;
      }
      return 0;
    }
    let enc = base64Encode(input);
    if (wrap > 0) {
      const parts: string[] = [];
      for (let i = 0; i < enc.length; i += wrap) parts.push(enc.slice(i, i + wrap));
      enc = parts.join("\n");
    }
    ctx.out(enc + "\n");
    return 0;
  },
};

export const hashingCommands: Command[] = [
  makeSum("md5sum", md5),
  makeSum("sha1sum", sha1),
  makeSum("sha256sum", sha256),
  cksumCmd,
  base64Cmd,
];
