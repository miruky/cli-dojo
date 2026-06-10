import type { Command, ExecContext } from "../types";
import type { VFS, VNode } from "../../vfs/VFS";

/**
 * VFS 上で本当に動く git (サブセット)。
 * コミットは「全ファイルのスナップショット」として保持するシンプルな実装。
 * init / status / add / commit / log / diff / branch / checkout / switch /
 * restore --staged / show / remote / config / push に対応。
 */

const R = "\x1b[0m";
const B = "\x1b[1m";
const DIM = "\x1b[38;2;120;128;150m";
const GREEN = "\x1b[38;2;126;214;126m";
const YELLOW = "\x1b[38;2;255;198;0m";
const RED = "\x1b[38;2;255;98;140m";
const CYAN = "\x1b[38;2;24;179;199m";

interface GitCommit {
  id: string;
  message: string;
  author: string;
  date: Date;
  parent: string | null;
  /** リポジトリ相対パス → 内容 のスナップショット */
  files: Map<string, string>;
}

interface Repo {
  root: string;
  head: string; // ブランチ名
  branches: Map<string, string | null>; // ブランチ → コミット id
  commits: Map<string, GitCommit>;
  /** インデックス (ステージ済み): 相対パス → 内容 (null = 削除をステージ) */
  index: Map<string, string | null>;
}

const repos = new WeakMap<VFS, Map<string, Repo>>();

function repoTable(vfs: VFS): Map<string, Repo> {
  let t = repos.get(vfs);
  if (!t) {
    t = new Map();
    repos.set(vfs, t);
  }
  return t;
}

function findRepo(ctx: ExecContext): Repo | null {
  const table = repoTable(ctx.vfs);
  let dir = ctx.env.cwd;
  for (let i = 0; i < 30; i++) {
    const r = table.get(dir);
    if (r) return r;
    // 既存の .git ディレクトリ (seed 由来) があれば暗黙にリポジトリ化
    if (ctx.vfs.stat((dir === "/" ? "" : dir) + "/.git")) {
      return importRepo(ctx.vfs, dir);
    }
    if (dir === "/") break;
    dir = dir.replace(/\/[^/]*\/?$/, "") || "/";
  }
  return null;
}

/** .git ディレクトリだけ持つ (seed 由来の) リポジトリを取り込み、現状を初期コミットにする。 */
function importRepo(vfs: VFS, root: string): Repo {
  const repo = createRepo(vfs, root, headBranchOf(vfs, root));
  const files = worktreeFiles(vfs, root);
  if (files.size > 0) {
    const c: GitCommit = {
      id: newHash(),
      message: "initial commit (imported)",
      author: "Guest User <guest@example.com>",
      date: new Date("2026-05-15T10:00:00"),
      parent: null,
      files: new Map(files),
    };
    repo.commits.set(c.id, c);
    repo.branches.set(repo.head, c.id);
  }
  return repo;
}

/**
 * seed に .git を持つディレクトリをシェル起動時に取り込んでおく。
 * 「編集してから初めて git を打つと初期コミットに編集後が入る」事故を防ぐ。
 */
export function ensureSeedRepos(vfs: VFS): void {
  const table = repoTable(vfs);
  const walk = (node: VNode, abs: string, depth: number): void => {
    if (!node.children || depth > 6) return;
    if (node.children.has(".git") && !table.has(abs || "/")) {
      importRepo(vfs, abs || "/");
      return; // ネストしたリポジトリは見ない
    }
    for (const [name, child] of node.children) {
      if (child.type === "dir" && !name.startsWith(".")) walk(child, `${abs}/${name}`, depth + 1);
    }
  };
  walk(vfs.root, "", 0);
}

function headBranchOf(vfs: VFS, root: string): string {
  const head = vfs.stat((root === "/" ? "" : root) + "/.git/HEAD");
  const m = head ? /ref:\s*refs\/heads\/(.+)/.exec(head.content) : null;
  return m ? m[1].trim() : "main";
}

function createRepo(vfs: VFS, root: string, branch = "main"): Repo {
  const repo: Repo = {
    root,
    head: branch,
    branches: new Map([[branch, null]]),
    commits: new Map(),
    index: new Map(),
  };
  repoTable(vfs).set(root, repo);
  return repo;
}

function newHash(): string {
  let h = "";
  for (let i = 0; i < 40; i++) h += Math.floor(Math.random() * 16).toString(16);
  return h;
}

function makeCommit(repo: Repo, message: string, files: Map<string, string>, date = new Date()): GitCommit {
  const c: GitCommit = {
    id: newHash(),
    message,
    author: "Guest User <guest@example.com>",
    date,
    parent: repo.branches.get(repo.head) ?? null,
    files: new Map(files),
  };
  repo.commits.set(c.id, c);
  return c;
}

/** 作業ツリーの全ファイル (リポジトリ相対パス → 内容)。.git は除外。 */
function worktreeFiles(vfs: VFS, root: string): Map<string, string> {
  const out = new Map<string, string>();
  const rootNode = vfs.stat(root);
  if (!rootNode || !rootNode.children) return out;
  const walk = (node: VNode, rel: string, depth: number): void => {
    if (!node.children || depth > 15) return;
    for (const [name, child] of node.children) {
      if (name === ".git") continue;
      const r = rel ? `${rel}/${name}` : name;
      if (child.type === "dir") walk(child, r, depth + 1);
      else if (child.type === "file") out.set(r, child.content);
    }
  };
  walk(rootNode, "", 0);
  return out;
}

function headFiles(repo: Repo): Map<string, string> {
  const id = repo.branches.get(repo.head);
  if (!id) return new Map();
  return new Map(repo.commits.get(id)?.files ?? []);
}

/** HEAD + index を重ねた「次のコミットに入る内容」。 */
function stagedFiles(repo: Repo): Map<string, string> {
  const out = headFiles(repo);
  for (const [p, content] of repo.index) {
    if (content == null) out.delete(p);
    else out.set(p, content);
  }
  return out;
}

interface StatusInfo {
  staged: Array<[string, string]>; // [状態, パス]
  modified: Array<[string, string]>;
  untracked: string[];
}

function computeStatus(ctx: ExecContext, repo: Repo): StatusInfo {
  const head = headFiles(repo);
  const staged = stagedFiles(repo);
  const work = worktreeFiles(ctx.vfs, repo.root);
  const info: StatusInfo = { staged: [], modified: [], untracked: [] };
  // index vs HEAD = ステージ済みの変更
  for (const [p, content] of staged) {
    if (!head.has(p)) info.staged.push(["new file", p]);
    else if (head.get(p) !== content) info.staged.push(["modified", p]);
  }
  for (const p of head.keys()) {
    if (!staged.has(p)) info.staged.push(["deleted", p]);
  }
  // worktree vs index = 未ステージの変更
  for (const [p, content] of work) {
    if (!staged.has(p)) info.untracked.push(p);
    else if (staged.get(p) !== content) info.modified.push(["modified", p]);
  }
  for (const p of staged.keys()) {
    if (!work.has(p)) info.modified.push(["deleted", p]);
  }
  info.staged.sort((a, b) => a[1].localeCompare(b[1]));
  info.modified.sort((a, b) => a[1].localeCompare(b[1]));
  info.untracked.sort();
  return info;
}

/** ctx.env.cwd から見た相対パス指定をリポジトリ相対へ。 */
function toRepoRel(ctx: ExecContext, repo: Repo, spec: string): string | null {
  const abs = ctx.resolve(spec);
  const prefix = repo.root === "/" ? "/" : repo.root + "/";
  if (abs === repo.root) return "";
  if (!abs.startsWith(prefix)) return null;
  return abs.slice(prefix.length);
}

// ===== unified diff =====

/** LCS ベースの unified diff (git diff 用にも使う)。 */
export function unifiedDiff(aText: string, bText: string, aName: string, bName: string, color: boolean): string {
  const a = aText.split("\n");
  const b = bText.split("\n");
  if (a.length && a[a.length - 1] === "") a.pop();
  if (b.length && b[b.length - 1] === "") b.pop();
  // DP で LCS (サイズ制限付き)
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return "(ファイルが大きすぎて diff を計算できません)\n";
  const ops: Array<["=" | "-" | "+", string]> = [];
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push(["=", a[i]]);
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push(["-", a[i++]]);
    } else {
      ops.push(["+", b[j++]]);
    }
  }
  while (i < n) ops.push(["-", a[i++]]);
  while (j < m) ops.push(["+", b[j++]]);
  if (!ops.some(([t]) => t !== "=")) return "";

  const CTX = 3;
  const c = {
    meta: color ? CYAN : "",
    add: color ? GREEN : "",
    del: color ? RED : "",
    hunk: color ? "\x1b[38;2;24;179;199m" : "",
    r: color ? R : "",
  };
  let out = `${c.meta}--- ${aName}\n+++ ${bName}${c.r}\n`;
  // ハンクへ分割
  let k = 0;
  let aLine = 1, bLine = 1;
  while (k < ops.length) {
    if (ops[k][0] === "=") {
      aLine++; bLine++; k++;
      continue;
    }
    // 変更の塊: 前後 CTX 行の文脈を含める
    let start = k;
    let ctxBefore = 0;
    while (start > 0 && ops[start - 1][0] === "=" && ctxBefore < CTX) {
      start--; ctxBefore++;
    }
    let end = k;
    let run = 0;
    let probe = k;
    while (probe < ops.length) {
      if (ops[probe][0] === "=") {
        run++;
        if (run > CTX * 2) break;
      } else {
        run = 0;
        end = probe;
      }
      probe++;
    }
    const hunkEnd = Math.min(ops.length, end + 1 + CTX);
    // 開始行番号を計算
    const aStart = aLine - ctxBefore;
    const bStart = bLine - ctxBefore;
    let aCount = 0, bCount = 0;
    const body: string[] = [];
    for (let x = start; x < hunkEnd; x++) {
      const [t, line] = ops[x];
      if (t === "=") {
        body.push(" " + line);
        aCount++; bCount++;
        if (x >= k) { aLine++; bLine++; }
      } else if (t === "-") {
        body.push(c.del + "-" + line + c.r);
        aCount++;
        if (x >= k) aLine++;
      } else {
        body.push(c.add + "+" + line + c.r);
        bCount++;
        if (x >= k) bLine++;
      }
    }
    out += `${c.hunk}@@ -${aStart},${aCount} +${bStart},${bCount} @@${c.r}\n`;
    out += body.join("\n") + "\n";
    k = hunkEnd;
    // 行番号を hunk 末尾まで合わせ直す (k 以前の = はカウント済み)
  }
  return out;
}

function shortId(id: string | null | undefined): string {
  return (id ?? "").slice(0, 7);
}

function fmtDate(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const mons = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${days[d.getDay()]} ${mons[d.getMonth()]} ${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()} +0900`;
}

// ===== サブコマンド =====

function gitInit(ctx: ExecContext): number {
  const root = ctx.env.cwd;
  if (findRepoAt(ctx, root)) {
    ctx.out(`Reinitialized existing Git repository in ${root}/.git/\n`);
    return 0;
  }
  createRepo(ctx.vfs, root);
  ctx.vfs.mkdirp((root === "/" ? "" : root) + "/.git/refs/heads");
  ctx.vfs.createFile((root === "/" ? "" : root) + "/.git/HEAD", "ref: refs/heads/main\n");
  ctx.out(`Initialized empty Git repository in ${root}/.git/\n`);
  return 0;
}

function findRepoAt(ctx: ExecContext, root: string): Repo | undefined {
  return repoTable(ctx.vfs).get(root);
}

function gitStatus(ctx: ExecContext, repo: Repo): number {
  const st = computeStatus(ctx, repo);
  ctx.out(`On branch ${repo.head}\n`);
  if (!repo.branches.get(repo.head)) ctx.out("\nNo commits yet\n");
  if (st.staged.length) {
    ctx.out("\nChanges to be committed:\n");
    ctx.out(`${DIM}  (use "git restore --staged <file>..." to unstage)${R}\n`);
    for (const [kind, p] of st.staged) ctx.out(`\t${GREEN}${kind}:   ${p}${R}\n`);
  }
  if (st.modified.length) {
    ctx.out("\nChanges not staged for commit:\n");
    ctx.out(`${DIM}  (use "git add <file>..." to update what will be committed)${R}\n`);
    for (const [kind, p] of st.modified) ctx.out(`\t${RED}${kind}:   ${p}${R}\n`);
  }
  if (st.untracked.length) {
    ctx.out("\nUntracked files:\n");
    ctx.out(`${DIM}  (use "git add <file>..." to include in what will be committed)${R}\n`);
    for (const p of st.untracked) ctx.out(`\t${RED}${p}${R}\n`);
  }
  if (!st.staged.length && !st.modified.length && !st.untracked.length) {
    ctx.out("nothing to commit, working tree clean\n");
  }
  return 0;
}

function gitAdd(ctx: ExecContext, repo: Repo, specs: string[]): number {
  if (specs.length === 0) {
    ctx.err("使い方: git add <path>... (全部なら git add .)\n");
    return 1;
  }
  const work = worktreeFiles(ctx.vfs, repo.root);
  const staged = stagedFiles(repo);
  let added = 0;
  for (const spec of specs) {
    const rel = toRepoRel(ctx, repo, spec);
    if (rel == null) {
      ctx.err(`fatal: pathspec '${spec}' はリポジトリ外です\n`);
      return 128;
    }
    const prefix = rel === "" ? "" : rel + "/";
    let hit = false;
    for (const [p, content] of work) {
      if (p === rel || p.startsWith(prefix) || rel === "") {
        if (staged.get(p) !== content) repo.index.set(p, content);
        hit = true;
        added++;
      }
    }
    // 削除のステージ (作業ツリーに無いが staged にある)
    for (const p of staged.keys()) {
      if ((p === rel || p.startsWith(prefix) || rel === "") && !work.has(p)) {
        repo.index.set(p, null);
        hit = true;
      }
    }
    if (!hit && !work.has(rel)) {
      ctx.err(`fatal: pathspec '${spec}' did not match any files\n`);
      return 128;
    }
  }
  void added;
  return 0;
}

function gitCommit(ctx: ExecContext, repo: Repo, args: string[]): number {
  let message = "";
  let all = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-m") message = args[++i] ?? "";
    else if (args[i] === "-am" || args[i] === "-a") {
      all = true;
      if (args[i] === "-am") message = args[++i] ?? "";
    }
  }
  if (all) {
    // tracked なファイルの変更を全部ステージ
    const head = headFiles(repo);
    const work = worktreeFiles(ctx.vfs, repo.root);
    for (const [p, content] of work) if (head.has(p) && head.get(p) !== content) repo.index.set(p, content);
    for (const p of head.keys()) if (!work.has(p)) repo.index.set(p, null);
  }
  if (!message) {
    ctx.err("Aborting commit due to empty commit message. (-m \"メッセージ\" を付けてください)\n");
    return 1;
  }
  const st = computeStatus(ctx, repo);
  if (st.staged.length === 0) {
    ctx.out("nothing to commit, working tree clean\n");
    return 1;
  }
  const files = stagedFiles(repo);
  const c = makeCommit(repo, message, files);
  repo.branches.set(repo.head, c.id);
  repo.index.clear();
  const stats = st.staged.length;
  ctx.out(`[${repo.head} ${shortId(c.id)}] ${message}\n`);
  ctx.out(` ${stats} file${stats > 1 ? "s" : ""} changed\n`);
  return 0;
}

function gitLog(ctx: ExecContext, repo: Repo, args: string[]): number {
  const oneline = args.includes("--oneline");
  const graph = args.includes("--graph");
  let id = repo.branches.get(repo.head) ?? null;
  if (!id) {
    ctx.err(`fatal: 現在のブランチ '${repo.head}' にはまだコミットがありません\n`);
    return 128;
  }
  let n = 0;
  while (id && n < 100) {
    const c = repo.commits.get(id);
    if (!c) break;
    const decorate = id === repo.branches.get(repo.head) ? ` ${YELLOW}(${CYAN}HEAD -> ${GREEN}${repo.head}${YELLOW})${R}` : "";
    if (oneline) {
      ctx.out(`${graph ? RED + "* " + R : ""}${YELLOW}${shortId(c.id)}${R}${decorate} ${c.message}\n`);
    } else {
      ctx.out(`${graph ? RED + "* " + R : ""}${YELLOW}commit ${c.id}${R}${decorate}\n`);
      ctx.out(`${graph ? RED + "| " + R : ""}Author: ${c.author}\n`);
      ctx.out(`${graph ? RED + "| " + R : ""}Date:   ${fmtDate(c.date)}\n`);
      ctx.out(`${graph ? RED + "| " + R : ""}\n${graph ? RED + "| " + R : ""}    ${c.message}\n${graph ? RED + "| " + R : ""}\n`);
    }
    id = c.parent;
    n++;
  }
  return 0;
}

function gitDiff(ctx: ExecContext, repo: Repo, args: string[]): number {
  const stagedMode = args.includes("--staged") || args.includes("--cached");
  const base = stagedMode ? headFiles(repo) : stagedFiles(repo);
  const target = stagedMode ? stagedFiles(repo) : worktreeFiles(ctx.vfs, repo.root);
  const paths = new Set([...base.keys(), ...target.keys()]);
  let printed = false;
  for (const p of [...paths].sort()) {
    const a = base.get(p);
    const b = target.get(p);
    if (a === b) continue;
    const d = unifiedDiff(a ?? "", b ?? "", a == null ? "/dev/null" : "a/" + p, b == null ? "/dev/null" : "b/" + p, ctx.tty);
    if (!d) continue;
    printed = true;
    ctx.out(`${B}diff --git a/${p} b/${p}${R}\n`);
    ctx.out(d);
  }
  if (!printed && ctx.tty) ctx.out(DIM + "(差分はありません)" + R + "\n");
  return 0;
}

function gitBranch(ctx: ExecContext, repo: Repo, args: string[]): number {
  const names = args.filter((a) => !a.startsWith("-"));
  if (args.includes("-d") || args.includes("-D")) {
    const name = names[0];
    if (!name || !repo.branches.has(name)) {
      ctx.err(`error: branch '${name}' not found.\n`);
      return 1;
    }
    if (name === repo.head) {
      ctx.err(`error: 現在いるブランチ '${name}' は削除できません\n`);
      return 1;
    }
    repo.branches.delete(name);
    ctx.out(`Deleted branch ${name}.\n`);
    return 0;
  }
  if (names.length === 0) {
    for (const b of [...repo.branches.keys()].sort()) {
      ctx.out(b === repo.head ? `* ${GREEN}${b}${R}\n` : `  ${b}\n`);
    }
    return 0;
  }
  if (repo.branches.has(names[0])) {
    ctx.err(`fatal: a branch named '${names[0]}' already exists\n`);
    return 128;
  }
  repo.branches.set(names[0], repo.branches.get(repo.head) ?? null);
  return 0;
}

/** 作業ツリーをコミットスナップショットの内容に合わせる。 */
function restoreWorktree(ctx: ExecContext, repo: Repo, files: Map<string, string>): void {
  const work = worktreeFiles(ctx.vfs, repo.root);
  const rootPrefix = repo.root === "/" ? "" : repo.root;
  for (const [p, content] of files) {
    const abs = rootPrefix + "/" + p;
    const node = ctx.vfs.stat(abs);
    if (node && node.type === "file") {
      node.content = content;
      node.mtime = new Date();
    } else {
      ctx.vfs.mkdirp(abs.slice(0, abs.lastIndexOf("/")) || "/");
      ctx.vfs.createFile(abs, content);
    }
  }
  for (const p of work.keys()) {
    if (!files.has(p)) {
      const node = ctx.vfs.stat(rootPrefix + "/" + p);
      if (node) ctx.vfs.unlink(node);
    }
  }
}

function gitCheckout(ctx: ExecContext, repo: Repo, args: string[]): number {
  const create = args.includes("-b") || args.includes("-c");
  const names = args.filter((a) => !a.startsWith("-"));
  const name = names[0];
  if (!name) {
    ctx.err("使い方: git checkout [-b] <branch>\n");
    return 1;
  }
  const st = computeStatus(ctx, repo);
  if (create) {
    if (repo.branches.has(name)) {
      ctx.err(`fatal: a branch named '${name}' already exists\n`);
      return 128;
    }
    repo.branches.set(name, repo.branches.get(repo.head) ?? null);
    repo.head = name;
    writeHeadFile(ctx, repo);
    ctx.out(`Switched to a new branch '${name}'\n`);
    return 0;
  }
  if (!repo.branches.has(name)) {
    ctx.err(`error: pathspec '${name}' did not match any branch known to git\n`);
    return 1;
  }
  if (st.staged.length || st.modified.length) {
    ctx.err("error: ローカルの変更があるため切り替えできません。commit してください。\n");
    return 1;
  }
  repo.head = name;
  writeHeadFile(ctx, repo);
  const id = repo.branches.get(name);
  if (id) restoreWorktree(ctx, repo, repo.commits.get(id)?.files ?? new Map());
  ctx.out(`Switched to branch '${name}'\n`);
  return 0;
}

function writeHeadFile(ctx: ExecContext, repo: Repo): void {
  const p = (repo.root === "/" ? "" : repo.root) + "/.git/HEAD";
  const node = ctx.vfs.stat(p);
  if (node && node.type === "file") node.content = `ref: refs/heads/${repo.head}\n`;
  else {
    ctx.vfs.mkdirp((repo.root === "/" ? "" : repo.root) + "/.git");
    ctx.vfs.createFile(p, `ref: refs/heads/${repo.head}\n`);
  }
}

function gitShow(ctx: ExecContext, repo: Repo): number {
  const id = repo.branches.get(repo.head);
  const c = id ? repo.commits.get(id) : null;
  if (!c) {
    ctx.err("fatal: コミットがありません\n");
    return 128;
  }
  ctx.out(`${YELLOW}commit ${c.id}${R} ${YELLOW}(${CYAN}HEAD -> ${GREEN}${repo.head}${YELLOW})${R}\n`);
  ctx.out(`Author: ${c.author}\nDate:   ${fmtDate(c.date)}\n\n    ${c.message}\n\n`);
  const parent = c.parent ? repo.commits.get(c.parent) : null;
  const base = parent?.files ?? new Map<string, string>();
  const paths = new Set([...base.keys(), ...c.files.keys()]);
  for (const p of [...paths].sort()) {
    const a = base.get(p);
    const b = c.files.get(p);
    if (a === b) continue;
    ctx.out(`${B}diff --git a/${p} b/${p}${R}\n`);
    ctx.out(unifiedDiff(a ?? "", b ?? "", a == null ? "/dev/null" : "a/" + p, b == null ? "/dev/null" : "b/" + p, ctx.tty));
  }
  return 0;
}

function gitRestore(ctx: ExecContext, repo: Repo, args: string[]): number {
  const stagedMode = args.includes("--staged");
  const specs = args.filter((a) => !a.startsWith("-"));
  if (specs.length === 0) {
    ctx.err("使い方: git restore [--staged] <path>...\n");
    return 1;
  }
  for (const spec of specs) {
    const rel = toRepoRel(ctx, repo, spec);
    if (rel == null) continue;
    const prefix = rel === "" ? "" : rel + "/";
    if (stagedMode) {
      for (const p of [...repo.index.keys()]) {
        if (p === rel || p.startsWith(prefix) || rel === "") repo.index.delete(p);
      }
    } else {
      const staged = stagedFiles(repo);
      for (const [p, content] of staged) {
        if (p === rel || p.startsWith(prefix) || rel === "") {
          const abs = (repo.root === "/" ? "" : repo.root) + "/" + p;
          const node = ctx.vfs.stat(abs);
          if (node && node.type === "file") node.content = content;
          else ctx.vfs.createFile(abs, content);
        }
      }
    }
  }
  return 0;
}

const git: Command = {
  name: "git",
  summary: "バージョン管理 (init/add/commit/log/diff/branch...)",
  run(ctx) {
    const args = ctx.args.slice(1);
    const sub = args[0];
    const rest = args.slice(1);
    if (!sub || sub === "--help" || sub === "help") {
      ctx.out(
        [
          "使い方: git <command> [<args>]",
          "",
          "対応コマンド:",
          "   init       リポジトリを作成",
          "   status     作業ツリーの状態",
          "   add        変更をステージ",
          "   commit     コミット (-m \"msg\" / -am)",
          "   log        履歴 (--oneline / --graph)",
          "   diff       差分 (--staged で index vs HEAD)",
          "   show       最新コミットの内容",
          "   branch     ブランチ一覧/作成/-d 削除",
          "   checkout   ブランチ切替 (-b で作成)",
          "   switch     ブランチ切替 (-c で作成)",
          "   restore    変更を戻す (--staged でアンステージ)",
          "   remote     リモート表示 (-v)",
          "   push/pull  模擬",
          "",
        ].join("\n"),
      );
      return sub ? 0 : 1;
    }
    if (sub === "init") return gitInit(ctx);
    if (sub === "config") return 0; // 受け付けて何もしない
    const repo = findRepo(ctx);
    if (!repo) {
      ctx.err("fatal: not a git repository (or any of the parent directories): .git\n");
      return 128;
    }
    switch (sub) {
      case "status":
        return gitStatus(ctx, repo);
      case "add":
        return gitAdd(ctx, repo, rest);
      case "commit":
        return gitCommit(ctx, repo, rest);
      case "log":
        return gitLog(ctx, repo, rest);
      case "diff":
        return gitDiff(ctx, repo, rest);
      case "branch":
        return gitBranch(ctx, repo, rest);
      case "checkout":
        return gitCheckout(ctx, repo, rest);
      case "switch":
        return gitCheckout(ctx, repo, rest);
      case "show":
        return gitShow(ctx, repo);
      case "restore":
        return gitRestore(ctx, repo, rest);
      case "remote":
        ctx.out(rest.includes("-v") ? "origin\tgit@github.com:guest/app.git (fetch)\norigin\tgit@github.com:guest/app.git (push)\n" : "origin\n");
        return 0;
      case "push": {
        const id = repo.branches.get(repo.head);
        ctx.out(
          id
            ? `Enumerating objects: ${repo.commits.size * 3}, done.\nWriting objects: 100% (${repo.commits.size * 3}/${repo.commits.size * 3}), done.\nTo github.com:guest/app.git\n   ${shortId(id)}..${shortId(id)}  ${repo.head} -> ${repo.head}\n`
            : "error: failed to push some refs (コミットがありません)\n",
        );
        return id ? 0 : 1;
      }
      case "pull":
        ctx.out("Already up to date.\n");
        return 0;
      case "fetch":
        return 0;
      case "stash":
        ctx.out("この道場の git は stash 未対応です (commit で代用してください)\n");
        return 1;
      default:
        ctx.err(`git: '${sub}' is not a git command. See 'git --help'.\n`);
        return 1;
    }
  },
};

export const gitCommands: Command[] = [git];
