import type { Command, ExecContext } from "../types";
import type { VNode } from "../../vfs/VFS";
import { permString, humanSize, fileSize } from "../../vfs/format";
import { makeRegex } from "../regex";

/** モダン CLI ツール群: eza / bat / fd / rg / jq / tldr / dust / duf / procs / z。 */

const R = "\x1b[0m";
const B = "\x1b[1m";
const DIM = "\x1b[38;2;120;128;150m";
const CYAN = "\x1b[38;2;24;179;199m";
const GREEN = "\x1b[38;2;126;214;126m";
const YELLOW = "\x1b[38;2;255;198;0m";
const MAGENTA = "\x1b[38;2;251;148;255m";
const RED = "\x1b[38;2;255;98;140m";
const BLUE = "\x1b[38;2;120;170;255m";

// ===== アイコン (Nerd Font) =====
const ICON_DIR = ""; //
const ICON_FILE = "";
const ICON_LINK = "";
const ICONS_BY_EXT: Record<string, string> = {
  sh: "", bash: "",
  md: "", txt: "", log: "",
  json: "", js: "", ts: "",
  py: "", html: "", css: "",
  csv: "", conf: "", cfg: "", yml: "", yaml: "",
  tar: "", gz: "", zip: "", xz: "",
  c: "", h: "", makefile: "",
};

function iconFor(node: VNode): string {
  if (node.type === "dir") return ICON_DIR;
  if (node.type === "symlink") return ICON_LINK;
  const name = node.name.toLowerCase();
  if (name === "makefile") return ICONS_BY_EXT.makefile;
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return ICONS_BY_EXT[ext] ?? ICON_FILE;
}

function colorName(node: VNode, withIcon: boolean): string {
  const icon = withIcon ? iconFor(node) + " " : "";
  if (node.type === "dir") return `${B}${BLUE}${icon}${node.name}${R}`;
  if (node.type === "symlink") return `${MAGENTA}${icon}${node.name}${R} ${DIM}-> ${node.target}${R}`;
  if (node.mode & 0o111) return `${B}${GREEN}${icon}${node.name}${R}`;
  return `${icon}${node.name}`;
}

function colorPerm(node: VNode): string {
  const s = permString(node);
  let out = "";
  for (const ch of s) {
    if (ch === "d") out += BLUE + ch;
    else if (ch === "l") out += MAGENTA + ch;
    else if (ch === "r") out += YELLOW + ch;
    else if (ch === "w") out += RED + ch;
    else if (ch === "x" || ch === "s" || ch === "t") out += GREEN + ch;
    else out += DIM + ch;
  }
  return out + R;
}

// ===== eza =====

const eza: Command = {
  name: "eza",
  summary: "モダンな ls (アイコン・色付き・--tree)",
  run(ctx) {
    const args = ctx.args.slice(1);
    const flags = new Set<string>();
    const paths: string[] = [];
    for (const a of args) {
      if (a === "--tree") flags.add("T");
      else if (a === "--icons" || a === "--git") continue; // 既定で ON / 無視
      else if (a.startsWith("--")) continue;
      else if (a.startsWith("-")) for (const c of a.slice(1)) flags.add(c);
      else paths.push(a);
    }
    const target = ctx.resolve(paths[0] ?? ".");
    const node = ctx.vfs.stat(target);
    if (!node) {
      ctx.err(`eza: ${paths[0] ?? "."}: そのようなファイルはありません\n`);
      return 2;
    }
    if (flags.has("T")) {
      printTree(ctx, node, "", 0, flags.has("a"));
      return 0;
    }
    if (node.type !== "dir" || !node.children) {
      ctx.out(colorName(node, true) + "\n");
      return 0;
    }
    const names = [...node.children.keys()].sort();
    const items = names
      .filter((n) => flags.has("a") || !n.startsWith("."))
      .map((n) => node.children!.get(n)!);
    if (flags.has("l")) {
      for (const c of items) {
        const date = c.mtime.toISOString().slice(0, 10);
        ctx.out(
          `${colorPerm(c)} ${GREEN}${humanSize(fileSize(c)).padStart(5)}${R} ` +
            `${YELLOW}${c.owner.padEnd(6)}${R} ${DIM}${date}${R} ${colorName(c, true)}\n`,
        );
      }
    } else {
      ctx.out(items.map((c) => colorName(c, true)).join("  ") + (items.length ? "\n" : ""));
    }
    return 0;
  },
};

function printTree(ctx: ExecContext, node: VNode, prefix: string, depth: number, all: boolean): void {
  if (depth === 0) ctx.out(colorName(node, true).replace(node.name, ".") + "\n");
  if (node.type !== "dir" || !node.children || depth > 8) return;
  const names = [...node.children.keys()].sort().filter((n) => all || !n.startsWith("."));
  names.forEach((name, i) => {
    const child = node.children!.get(name)!;
    const last = i === names.length - 1;
    ctx.out(prefix + DIM + (last ? "└── " : "├── ") + R + colorName(child, true) + "\n");
    if (child.type === "dir") printTree(ctx, child, prefix + (last ? "    " : DIM + "│   " + R), depth + 1, all);
  });
}

// ===== bat =====

interface HiRule {
  re: RegExp;
  color: string;
}
function rulesFor(ext: string): HiRule[] {
  const comment = (re: RegExp): HiRule => ({ re, color: DIM });
  const str = { re: /("[^"]*"|'[^']*')/g, color: YELLOW };
  const num = { re: /\b\d+(\.\d+)?\b/g, color: CYAN };
  const common: Record<string, HiRule[]> = {
    sh: [
      comment(/#.*$/g),
      str,
      { re: /\b(if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|return|local|echo|exit|read|export)\b/g, color: MAGENTA },
      { re: /\$\{?[A-Za-z_@#?][A-Za-z0-9_]*\}?/g, color: GREEN },
      num,
    ],
    js: [
      comment(/\/\/.*$/g),
      str,
      { re: /\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|=>)\b/g, color: MAGENTA },
      num,
    ],
    py: [
      comment(/#.*$/g),
      str,
      { re: /\b(def|return|if|elif|else|for|while|import|from|class|print|in|not|and|or|None|True|False|with|as)\b/g, color: MAGENTA },
      num,
    ],
    json: [{ re: /"[^"]*"(?=\s*:)/g, color: CYAN }, { re: /:\s*"[^"]*"/g, color: YELLOW }, num, { re: /\b(true|false|null)\b/g, color: MAGENTA }],
    md: [
      { re: /^#{1,6} .*$/g, color: B + CYAN },
      { re: /\*\*[^*]+\*\*/g, color: B + YELLOW },
      { re: /`[^`]+`/g, color: GREEN },
      { re: /^\s*[-*] /g, color: MAGENTA },
    ],
  };
  const map: Record<string, string> = { bash: "sh", zsh: "sh", ts: "js", mjs: "js", jsx: "js", tsx: "js", markdown: "md", py3: "py" };
  return common[map[ext] ?? ext] ?? [comment(/#.*$/g), str, num];
}

function highlightLine(line: string, rules: HiRule[]): string {
  // 単純な「最初にマッチしたルール優先」: 区間に色を割り当てる
  const colors: (string | null)[] = new Array(line.length).fill(null);
  for (const rule of rules) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(line)) != null) {
      for (let i = m.index; i < m.index + m[0].length; i++) {
        if (colors[i] == null) colors[i] = rule.color;
      }
      if (m[0].length === 0) rule.re.lastIndex++;
    }
  }
  let out = "";
  let cur: string | null = null;
  for (let i = 0; i < line.length; i++) {
    if (colors[i] !== cur) {
      out += R + (colors[i] ?? "");
      cur = colors[i];
    }
    out += line[i];
  }
  return out + R;
}

const bat: Command = {
  name: "bat",
  summary: "シンタックスハイライト付き cat",
  run(ctx) {
    const args = ctx.args.slice(1);
    const plain = args.includes("-p") || args.includes("--plain");
    const files = args.filter((a) => !a.startsWith("-"));
    const width = Math.min(ctx.cols, 100);
    const sources: Array<{ name: string; content: string }> = [];
    if (files.length === 0) {
      sources.push({ name: "STDIN", content: ctx.stdin });
    } else {
      for (const f of files) {
        const node = ctx.vfs.stat(ctx.resolve(f));
        if (!node || node.type !== "file") {
          ctx.err(`bat: ${f}: そのようなファイルはありません\n`);
          return 1;
        }
        sources.push({ name: f, content: node.content });
      }
    }
    for (const src of sources) {
      const ext = src.name.toLowerCase().split(".").pop() ?? "";
      const rules = rulesFor(ext);
      const lines = src.content.split("\n");
      if (lines.length && lines[lines.length - 1] === "") lines.pop();
      if (!plain && ctx.tty) {
        ctx.out(DIM + "─".repeat(width) + R + "\n");
        ctx.out(`${DIM}       │${R} File: ${B}${src.name}${R}\n`);
        ctx.out(DIM + "─".repeat(width) + R + "\n");
        lines.forEach((line, i) => {
          ctx.out(`${DIM}${String(i + 1).padStart(6)} │${R} ${highlightLine(line, rules)}\n`);
        });
        ctx.out(DIM + "─".repeat(width) + R + "\n");
      } else {
        for (const line of lines) ctx.out(line + "\n");
      }
    }
    return 0;
  },
};

// ===== fd =====

const fd: Command = {
  name: "fd",
  summary: "シンプル・高速な find 代替",
  run(ctx) {
    const args = ctx.args.slice(1);
    let pattern = "";
    let root = ".";
    let ext = "";
    let type = "";
    let hidden = false;
    const positional: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-e" || a === "--extension") ext = args[++i] ?? "";
      else if (a === "-t" || a === "--type") type = args[++i] ?? "";
      else if (a === "-H" || a === "--hidden") hidden = true;
      else if (a.startsWith("-")) continue;
      else positional.push(a);
    }
    pattern = positional[0] ?? "";
    root = positional[1] ?? ".";
    const smartCase = pattern === pattern.toLowerCase();
    const rootAbs = ctx.resolve(root);
    const rootNode = ctx.vfs.stat(rootAbs);
    if (!rootNode) {
      ctx.err(`fd: ${root}: そのようなディレクトリはありません\n`);
      return 1;
    }
    let count = 0;
    const walk = (node: VNode, rel: string, depth: number): void => {
      if (!node.children || depth > 15 || count > 2000) return;
      for (const name of [...node.children.keys()].sort()) {
        if (!hidden && name.startsWith(".")) continue;
        const child = node.children.get(name)!;
        const r = rel ? `${rel}/${name}` : name;
        const hay = smartCase ? name.toLowerCase() : name;
        const matches =
          (pattern === "" || hay.includes(pattern)) &&
          (ext === "" || name.toLowerCase().endsWith("." + ext.toLowerCase())) &&
          (type === "" || (type === "d") === (child.type === "dir"));
        if (matches) {
          count++;
          if (child.type === "dir") ctx.out(`${B}${BLUE}${r}/${R}\n`);
          else {
            const dir = r.includes("/") ? r.slice(0, r.lastIndexOf("/") + 1) : "";
            ctx.out(`${BLUE}${dir}${R}${r.slice(dir.length)}\n`);
          }
        }
        if (child.type === "dir") walk(child, r, depth + 1);
      }
    };
    walk(rootNode, root === "." ? "" : root.replace(/\/$/, ""), 0);
    return 0;
  },
};

// ===== rg (ripgrep) =====

const rg: Command = {
  name: "rg",
  summary: "ripgrep: 高速な再帰検索 (色付き・ファイル別表示)",
  run(ctx) {
    const args = ctx.args.slice(1);
    let icase = false, filesOnly = false, countOnly = false, word = false;
    const positional: string[] = [];
    for (const a of args) {
      if (a === "-i" || a === "--ignore-case") icase = true;
      else if (a === "-l" || a === "--files-with-matches") filesOnly = true;
      else if (a === "-c" || a === "--count") countOnly = true;
      else if (a === "-w" || a === "--word-regexp") word = true;
      else if (a === "-n" || a === "--line-number" || a.startsWith("--")) continue;
      else if (a.startsWith("-")) continue;
      else positional.push(a);
    }
    const pattern = positional[0];
    if (pattern == null) {
      ctx.err("rg: パターンを指定してください (例: rg TODO)\n");
      return 2;
    }
    let re: RegExp;
    try {
      re = makeRegex(pattern, { extended: true, ignoreCase: icase, global: true, wholeWord: word });
    } catch {
      ctx.err(`rg: 正規表現エラー: ${pattern}\n`);
      return 2;
    }
    const roots = positional.slice(1).length ? positional.slice(1) : ["."];
    let found = 0;
    const searchFile = (rel: string, content: string): void => {
      const lines = content.split("\n");
      if (lines.length && lines[lines.length - 1] === "") lines.pop();
      const hits: Array<[number, string]> = [];
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        if (re.test(lines[i])) hits.push([i + 1, lines[i]]);
      }
      if (hits.length === 0) return;
      found += hits.length;
      if (filesOnly) {
        ctx.out(`${MAGENTA}${rel}${R}\n`);
        return;
      }
      if (countOnly) {
        ctx.out(`${MAGENTA}${rel}${R}${DIM}:${R}${hits.length}\n`);
        return;
      }
      if (ctx.tty) {
        ctx.out(`${B}${MAGENTA}${rel}${R}\n`);
        for (const [ln, line] of hits) {
          re.lastIndex = 0;
          const colored = line.replace(re, (m) => `${B}${RED}${m}${R}`);
          ctx.out(`${GREEN}${ln}${R}${DIM}:${R}${colored}\n`);
        }
        ctx.out("\n");
      } else {
        for (const [ln, line] of hits) ctx.out(`${rel}:${ln}:${line}\n`);
      }
    };
    const walk = (node: VNode, rel: string, depth: number): void => {
      if (depth > 15) return;
      if (node.type === "file") {
        searchFile(rel, node.content);
        return;
      }
      if (!node.children) return;
      for (const name of [...node.children.keys()].sort()) {
        if (name.startsWith(".")) continue;
        const child = node.children.get(name)!;
        walk(child, rel === "" ? name : `${rel}/${name}`, depth + 1);
      }
    };
    for (const root of roots) {
      const abs = ctx.resolve(root);
      const node = ctx.vfs.stat(abs);
      if (!node) {
        ctx.err(`rg: ${root}: そのようなファイルはありません\n`);
        continue;
      }
      walk(node, root === "." ? "" : root.replace(/\/$/, ""), 0);
    }
    return found > 0 ? 0 : 1;
  },
};

// ===== jq =====

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function jqApplyStage(stage: string, values: Json[], ctx: ExecContext): Json[] | null {
  const out: Json[] = [];
  const fail = (msg: string): null => {
    ctx.err(`jq: error: ${msg}\n`);
    return null;
  };
  for (const v of values) {
    if (stage === "." || stage === "") {
      out.push(v);
    } else if (stage === "keys") {
      if (Array.isArray(v)) out.push(v.map((_, i) => i));
      else if (v && typeof v === "object") out.push(Object.keys(v).sort());
      else return fail(`${typeof v} には keys を適用できません`);
    } else if (stage === "length") {
      if (Array.isArray(v) || typeof v === "string") out.push(v.length);
      else if (v && typeof v === "object") out.push(Object.keys(v).length);
      else if (v == null) out.push(0);
      else return fail("length を適用できません");
    } else if (/^\.[\w.[\]"]*$/.test(stage)) {
      // .foo.bar[0].baz[] のようなパス
      let cur: Json[] = [v];
      const tokens = stage.slice(1).match(/[^.[\]]+|\[\d*\]|\[\]/g) ?? [];
      for (const tok of tokens) {
        const next: Json[] = [];
        for (const c of cur) {
          if (tok === "[]") {
            if (Array.isArray(c)) next.push(...c);
            else if (c && typeof c === "object") next.push(...Object.values(c));
            else return fail("配列ではない値に [] を適用しました");
          } else if (/^\[\d+\]$/.test(tok)) {
            const idx = parseInt(tok.slice(1, -1), 10);
            if (Array.isArray(c)) next.push(c[idx] ?? null);
            else return fail("配列ではない値に添字を適用しました");
          } else {
            const key = tok.replace(/^"|"$/g, "");
            if (c && typeof c === "object" && !Array.isArray(c)) next.push((c as Record<string, Json>)[key] ?? null);
            else if (c == null) next.push(null);
            else return fail(`オブジェクトではない値にフィールド .${key} を適用しました`);
          }
        }
        cur = next;
      }
      out.push(...cur);
    } else {
      return fail(`未対応のフィルタです: ${stage} (対応: . .foo .[] .[N] keys length |)`);
    }
  }
  return out;
}

function jqColor(v: Json, indent: number, color: boolean): string {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (v === null) return color ? DIM + "null" + R : "null";
  if (typeof v === "boolean" || typeof v === "number") return color ? YELLOW + JSON.stringify(v) + R : JSON.stringify(v);
  if (typeof v === "string") return color ? GREEN + JSON.stringify(v) + R : JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return "[\n" + v.map((x) => padIn + jqColor(x, indent + 1, color)).join(",\n") + "\n" + pad + "]";
  }
  const keys = Object.keys(v);
  if (keys.length === 0) return "{}";
  return (
    "{\n" +
    keys.map((k) => `${padIn}${color ? CYAN + JSON.stringify(k) + R : JSON.stringify(k)}: ${jqColor(v[k], indent + 1, color)}`).join(",\n") +
    "\n" + pad + "}"
  );
}

const jq: Command = {
  name: "jq",
  summary: "JSON プロセッサ (.foo / .[] / keys / length)",
  run(ctx) {
    const args = ctx.args.slice(1);
    const raw = args.includes("-r");
    const rest = args.filter((a) => !a.startsWith("-"));
    const filter = rest[0] ?? ".";
    const file = rest[1];
    let input: string;
    if (file) {
      const node = ctx.vfs.stat(ctx.resolve(file));
      if (!node || node.type !== "file") {
        ctx.err(`jq: ${file}: そのようなファイルはありません\n`);
        return 2;
      }
      input = node.content;
    } else {
      input = ctx.stdin;
    }
    let data: Json;
    try {
      data = JSON.parse(input) as Json;
    } catch (e) {
      ctx.err(`jq: JSON の解析に失敗しました: ${(e as Error).message}\n`);
      return 2;
    }
    let values: Json[] = [data];
    for (const stage of filter.split("|").map((s) => s.trim())) {
      const next = jqApplyStage(stage, values, ctx);
      if (next == null) return 3;
      values = next;
    }
    for (const v of values) {
      if (raw && typeof v === "string") ctx.out(v + "\n");
      else ctx.out(jqColor(v, 0, ctx.tty) + "\n");
    }
    return 0;
  },
};

// ===== tldr =====

const TLDR: Record<string, Array<[string, string]>> = {
  tar: [
    ["アーカイブを作成する", "tar czf target.tar.gz file1 file2"],
    ["アーカイブを展開する", "tar xzf source.tar.gz"],
    ["中身を一覧する", "tar tzf source.tar.gz"],
  ],
  grep: [
    ["ファイルからパターンを検索", "grep \"pattern\" file"],
    ["再帰 + 行番号 + 大小無視", "grep -rin \"pattern\" ."],
    ["一致しない行", "grep -v \"pattern\" file"],
  ],
  find: [
    ["名前で検索", "find . -name '*.txt'"],
    ["ディレクトリのみ", "find . -type d"],
    ["見つけたファイルに実行", "find . -name '*.log' -exec wc -l {} \\;"],
  ],
  git: [
    ["リポジトリ作成", "git init"],
    ["変更を確認", "git status"],
    ["ステージしてコミット", "git add . && git commit -m 'message'"],
    ["履歴を見る", "git log --oneline"],
  ],
  sed: [
    ["置換して表示", "sed 's/old/new/g' file"],
    ["特定行のみ表示", "sed -n '5,10p' file"],
    ["行を削除", "sed '/pattern/d' file"],
  ],
  awk: [
    ["列を表示", "awk '{print $1}' file"],
    ["区切り指定 + 条件", "awk -F, '$3 > 80 {print $1}' data.csv"],
    ["合計", "awk '{s+=$1} END {print s}' file"],
  ],
  ssh: [["ホストに接続", "ssh user@host"], ["コマンドだけ実行", "ssh user@host command"]],
  curl: [["ページ取得", "curl http://example.com"], ["ヘッダのみ", "curl -I http://example.com"]],
  chmod: [["実行権を付ける", "chmod +x script.sh"], ["8進数で設定", "chmod 644 file"]],
  ps: [["全プロセス表示", "ps aux"], ["特定プロセスを探す", "ps aux | grep nginx"]],
  docker: [["コンテナ一覧", "docker ps"], ["イメージ一覧", "docker images"], ["コンテナ起動", "docker run -d nginx"]],
  kubectl: [["Pod 一覧", "kubectl get pods"], ["詳細表示", "kubectl describe pod NAME"]],
  xargs: [["検索結果に実行", "find . -name '*.log' | xargs wc -l"], ["1件ずつ実行", "cat list | xargs -n1 echo"]],
  jq: [["整形表示", "cat file.json | jq ."], ["フィールド抽出", "jq '.[] | .name' file.json"]],
  rg: [["再帰検索", "rg pattern"], ["大小無視", "rg -i pattern dir/"]],
  fzf: [["ファイルを曖昧検索", "fzf"], ["パイプから選ぶ", "history | fzf"]],
  eza: [["アイコン付き一覧", "eza -l"], ["ツリー表示", "eza --tree"]],
  bat: [["ハイライト表示", "bat script.sh"]],
  htop: [["プロセスをリアルタイム監視", "htop"]],
  tmux: [["セッション開始", "tmux"], ["デタッチ", "(Ctrl-b d)"], ["復帰", "tmux attach"]],
  man: [["マニュアルを読む", "man ls"], ["キーワード検索", "man -k copy"]],
};

const tldr: Command = {
  name: "tldr",
  summary: "コマンドの要点だけの簡易ヘルプ",
  run(ctx) {
    const topic = ctx.args.slice(1).filter((a) => !a.startsWith("-"))[0];
    if (!topic) {
      ctx.out(`使い方: tldr <command>\n収録: ${Object.keys(TLDR).sort().join(", ")}\n`);
      return 0;
    }
    const page = TLDR[topic];
    if (!page) {
      const cmd = ctx.services.listCommands().find((c) => c.name === topic);
      if (cmd) {
        ctx.out(`\n  ${B}${topic}${R}\n  ${cmd.summary}\n\n  ${DIM}(tldr ページ未収録。man ${topic} を見てください)${R}\n\n`);
        return 0;
      }
      ctx.err(`tldr: ${topic} のページがありません\n`);
      return 1;
    }
    ctx.out(`\n  ${B}${CYAN}${topic}${R}\n\n`);
    for (const [desc, ex] of page) {
      ctx.out(`  ${GREEN}- ${desc}${R}\n    ${YELLOW}${ex}${R}\n\n`);
    }
    return 0;
  },
};

// ===== dust =====

function duSize(node: VNode): number {
  if (node.type === "file") return node.content.length;
  if (!node.children) return 0;
  let s = 0;
  for (const c of node.children.values()) s += duSize(c);
  return s;
}

const dust: Command = {
  name: "dust",
  summary: "du の見やすい版 (バー付きディスク使用量)",
  run(ctx) {
    const target = ctx.resolve(ctx.args.slice(1).filter((a) => !a.startsWith("-"))[0] ?? ".");
    const node = ctx.vfs.stat(target);
    if (!node || node.type !== "dir" || !node.children) {
      ctx.err("dust: ディレクトリを指定してください\n");
      return 1;
    }
    const entries = [...node.children.entries()]
      .map(([name, c]) => ({ name: c.type === "dir" ? name + "/" : name, size: duSize(c), isDir: c.type === "dir" }))
      .sort((a, b) => a.size - b.size);
    const total = Math.max(1, duSize(node));
    const barW = 25;
    for (const e of entries) {
      const ratio = e.size / total;
      const fill = Math.max(e.size > 0 ? 1 : 0, Math.round(barW * ratio));
      const bar = "█".repeat(fill) + DIM + "░".repeat(barW - fill) + R;
      const color = ratio > 0.5 ? RED : ratio > 0.2 ? YELLOW : GREEN;
      ctx.out(
        `${humanSize(e.size).padStart(6)} ${color}${bar}${R} ${(ratio * 100).toFixed(0).padStart(3)}% ` +
          `${e.isDir ? B + BLUE : ""}${e.name}${R}\n`,
      );
    }
    ctx.out(`${humanSize(total).padStart(6)} ${DIM}合計 (${ctx.env.cwd === target ? "." : target})${R}\n`);
    return 0;
  },
};

// ===== duf =====

const duf: Command = {
  name: "duf",
  summary: "df の見やすい版 (罫線テーブル)",
  run(ctx) {
    const rows: Array<[string, string, string, string, number, string, string]> = [
      ["/", "20G", "8.5G", "10.4G", 45, "ext4", "/dev/vda1"],
      ["/home", "50G", "12.3G", "35.2G", 26, "ext4", "/dev/vda2"],
      ["/boot", "512M", "98M", "414M", 19, "vfat", "/dev/vda15"],
      ["/tmp", "3.9G", "12M", "3.9G", 1, "tmpfs", "tmpfs"],
    ];
    const W = [12, 7, 7, 7, 22, 6, 12];
    const line = (l: string, m: string, r: string): string =>
      DIM + l + W.map((w) => "─".repeat(w + 2)).join(m) + r + R + "\n";
    const cells = (cols: string[], colored = true): string =>
      DIM + "│" + R + cols.map((c, i) => " " + (colored ? c : c) + " ".repeat(Math.max(0, W[i] - vlen(c))) + " ").join(DIM + "│" + R) + DIM + "│" + R + "\n";
    const vlen = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, "").length;
    ctx.out(DIM + " 4 local devices" + R + "\n");
    ctx.out(line("╭", "┬", "╮"));
    ctx.out(cells([B + "MOUNTED ON" + R, B + "SIZE" + R, B + "USED" + R, B + "AVAIL" + R, B + "USE%" + R, B + "TYPE" + R, B + "FILESYSTEM" + R]));
    ctx.out(line("├", "┼", "┤"));
    for (const [mnt, size, used, avail, pct, type, fs] of rows) {
      const barW = 14;
      const fill = Math.round((pct / 100) * barW);
      const color = pct > 80 ? RED : pct > 60 ? YELLOW : GREEN;
      const bar = `${color}${"▓".repeat(fill)}${DIM}${"░".repeat(barW - fill)}${R} ${String(pct).padStart(3)}%`;
      ctx.out(cells([CYAN + mnt + R, size, used, avail, bar, type, DIM + fs + R]));
    }
    ctx.out(line("╰", "┴", "╯"));
    return 0;
  },
};

// ===== procs =====

const procs: Command = {
  name: "procs",
  summary: "ps の見やすい版 (色付きテーブル)",
  run(ctx) {
    const rows: Array<[number, string, number, number, string, string]> = [
      [1, "root", 0.0, 0.4, "19:02", "systemd"],
      [423, "root", 0.0, 0.2, "19:02", "sshd"],
      [811, "www-data", 1.8, 1.1, "19:03", "nginx: worker process"],
      [812, "postgres", 0.9, 2.3, "19:03", "postgres: writer"],
      [1204, "guest", 7.2, 3.1, "20:14", "node /srv/app/server.js"],
      [1342, "guest", 0.0, 0.1, "21:00", "bash"],
      [1377, "guest", 0.4, 0.3, "21:05", "tmux: server"],
      [1402, "guest", 1.2, 0.5, "21:06", "procs"],
    ];
    ctx.out(
      `${B}${CYAN} PID    ${R}${B}${GREEN}User      ${R}${B}${YELLOW}CPU(%)  MEM(%) ${R}${B}${DIM}Start  ${R}${B} Command${R}\n`,
    );
    for (const [pid, user, cpu, mem, start, cmd] of rows) {
      const cpuC = cpu > 5 ? RED : cpu > 1 ? YELLOW : GREEN;
      ctx.out(
        `${CYAN}${String(pid).padStart(5)}${R}  ${GREEN}${user.padEnd(9)}${R} ` +
          `${cpuC}${cpu.toFixed(1).padStart(5)}${R}  ${mem.toFixed(1).padStart(5)}  ${DIM}${start}${R}   ${cmd}\n`,
      );
    }
    return 0;
  },
};

// ===== z (zoxide) =====

const zoxide: Command = {
  name: "z",
  summary: "賢い cd (部分一致でディレクトリへジャンプ)",
  run(ctx) {
    const q = ctx.args[1];
    if (!q) {
      const home = ctx.env.get("HOME") ?? "/";
      ctx.env.oldpwd = ctx.env.cwd;
      ctx.env.cwd = home;
      return 0;
    }
    // ホーム以下 + cwd 以下からディレクトリを集めて最短マッチへ
    const candidates: string[] = [];
    const collect = (abs: string, depth: number): void => {
      const node = ctx.vfs.stat(abs);
      if (!node || !node.children || depth > 6) return;
      for (const [name, c] of node.children) {
        if (c.type !== "dir" || name.startsWith(".")) continue;
        const p = (abs === "/" ? "" : abs) + "/" + name;
        candidates.push(p);
        collect(p, depth + 1);
      }
    };
    collect(ctx.env.get("HOME") ?? "/", 0);
    collect("/var", 0);
    collect("/etc", 0);
    const ql = q.toLowerCase();
    const hit = candidates
      .filter((p) => p.toLowerCase().includes(ql))
      .sort((a, b) => {
        const ab = a.split("/").pop()!.toLowerCase() === ql ? 0 : 1;
        const bb = b.split("/").pop()!.toLowerCase() === ql ? 0 : 1;
        return ab - bb || a.length - b.length;
      })[0];
    if (!hit) {
      ctx.err(`z: ${q} に一致するディレクトリがありません\n`);
      return 1;
    }
    ctx.env.oldpwd = ctx.env.cwd;
    ctx.env.cwd = hit;
    if (ctx.tty) ctx.out(`${DIM}${hit}${R}\n`);
    return 0;
  },
};

const exa: Command = { name: "exa", summary: "eza の旧名 (同じ動作)", run: eza.run };
const lsd: Command = { name: "lsd", summary: "モダンな ls (eza と同等)", run: eza.run };
const batcat: Command = { name: "batcat", summary: "bat の Debian での名前", run: bat.run };
const fdfind: Command = { name: "fdfind", summary: "fd の Debian での名前", run: fd.run };

export const modernCommands: Command[] = [eza, exa, lsd, bat, batcat, fd, fdfind, rg, jq, tldr, dust, duf, procs, zoxide];
