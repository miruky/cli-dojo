/**
 * 常駐チートシート用の「全コマンド」リファレンス。
 * シェルに登録された実際のコマンド配列から生成するので、コマンドを追加すれば
 * 自動的にここにも載る (取りこぼしゼロ)。末尾にキーバインド表も持つ。
 */
import type { Command } from "../core/shell/types";
import { filesystemCommands } from "../core/shell/commands/filesystem";
import { textCommands } from "../core/shell/commands/text";
import { builtinCommands } from "../core/shell/commands/builtins";
import { grep } from "../core/shell/commands/grep";
import { filterCommands } from "../core/shell/commands/filters";
import { sed } from "../core/shell/commands/sed";
import { awk } from "../core/shell/commands/awk";
import { find } from "../core/shell/commands/find";
import { textMoreCommands } from "../core/shell/commands/textmore";
import { permissionCommands } from "../core/shell/commands/permissions";
import { sysinfoCommands } from "../core/shell/commands/sysinfo";
import { hashingCommands } from "../core/shell/commands/hashing";
import { archiveCommands } from "../core/shell/commands/archives";
import { simCommands } from "../core/shell/commands/sims";
import { containerCommands } from "../core/shell/commands/containers";
import { scriptingCommands } from "../core/shell/commands/scripting";
import { launcherCommands } from "../core/shell/commands/launchers";
import { pagerCommands } from "../core/shell/commands/pagers";
import { modernCommands } from "../core/shell/commands/modern";
import { gitCommands } from "../core/shell/commands/git";
import { funCommands } from "../core/shell/commands/fun";
import { extraCommands } from "../core/shell/commands/extras";
import { challengeCommands } from "../core/shell/commands/challenge";
import { learnCommands } from "../core/shell/commands/learn";

export interface RefEntry {
  cmd: string;
  desc: string;
  /** true ならキー表記 (クリックでプロンプト挿入しない)。 */
  keys?: boolean;
}
export interface RefGroup {
  title: string;
  accent: string;
  /** コマンド系か (検索の「コマンド数」カウント対象)。 */
  commands?: boolean;
  items: RefEntry[];
}

const GREEN = "var(--accent-green)";
const CYAN = "var(--accent-cyan)";
const MAGENTA = "var(--accent-magenta)";
const YELLOW = "var(--accent)";
const BLUE = "var(--accent-blue)";
const RED = "var(--accent-red)";

function entries(list: Command[]): RefEntry[] {
  return list
    .map((c) => ({ cmd: c.name, desc: c.summary }))
    .sort((a, b) => a.cmd.localeCompare(b.cmd));
}
function pick(list: Command[], names: string[]): RefEntry[] {
  const set = new Set(names);
  return entries(list.filter((c) => set.has(c.name)));
}

// sims.ts は1配列なので見やすく分類する。
const SIM_NET = ["ip", "ifconfig", "ss", "netstat", "ping", "traceroute", "dig", "host", "curl", "wget", "ssh"];
const SIM_PKG = ["apt", "apt-get", "yum", "dnf", "dpkg", "rpm"];
const SIM_SVC = ["systemctl", "journalctl", "service", "openssl", "crontab", "at", "timedatectl", "hostnamectl", "lsmod", "modprobe"];
const SIM_USR = ["sudo", "su", "passwd", "useradd", "userdel", "groupadd", "getent", "last"];

const grepGroup: Command[] = [
  grep,
  { name: "egrep", summary: "grep -E と同じ (拡張正規表現)", run: grep.run },
  { name: "fgrep", summary: "grep -F と同じ (固定文字列)", run: grep.run },
  find,
  sed,
  awk,
];

export const REFERENCE: RefGroup[] = [
  { title: "ファイル操作・移動", accent: GREEN, commands: true, items: entries(filesystemCommands) },
  { title: "ファイル表示・整形", accent: GREEN, commands: true, items: entries(textCommands) },
  { title: "シェル組み込み", accent: CYAN, commands: true, items: entries(builtinCommands) },
  { title: "検索・抽出 (grep / find / sed / awk)", accent: CYAN, commands: true, items: entries(grepGroup) },
  { title: "フィルタ・パイプ", accent: CYAN, commands: true, items: entries(filterCommands) },
  { title: "テキスト処理 (その他)", accent: CYAN, commands: true, items: entries(textMoreCommands) },
  { title: "権限・所有者", accent: YELLOW, commands: true, items: entries(permissionCommands) },
  { title: "システム情報・プロセス", accent: BLUE, commands: true, items: entries(sysinfoCommands) },
  { title: "ハッシュ・チェックサム", accent: MAGENTA, commands: true, items: entries(hashingCommands) },
  { title: "アーカイブ・圧縮", accent: YELLOW, commands: true, items: entries(archiveCommands) },
  { title: "ネットワーク (模擬)", accent: BLUE, commands: true, items: pick(simCommands, SIM_NET) },
  { title: "パッケージ管理 (模擬)", accent: BLUE, commands: true, items: pick(simCommands, SIM_PKG) },
  { title: "サービス/systemd/暗号 (模擬)", accent: BLUE, commands: true, items: pick(simCommands, SIM_SVC) },
  { title: "ユーザー・権限管理 (模擬)", accent: YELLOW, commands: true, items: pick(simCommands, SIM_USR) },
  { title: "コンテナ・オーケストレーション (模擬)", accent: GREEN, commands: true, items: entries(containerCommands.filter((c) => ["docker", "podman", "nerdctl", "podman-compose", "kubectl"].includes(c.name))) },
  { title: "仮想化・名前空間 (模擬)", accent: GREEN, commands: true, items: entries(containerCommands.filter((c) => !["docker", "podman", "nerdctl", "podman-compose", "kubectl"].includes(c.name))) },
  { title: "シェルスクリプト (制御構文)", accent: YELLOW, commands: true, items: entries(scriptingCommands) },
  { title: "Git (本当に動く)", accent: YELLOW, commands: true, items: entries(gitCommands) },
  { title: "モダン CLI ツール", accent: CYAN, commands: true, items: entries(modernCommands) },
  { title: "ページャ・全画面アプリ", accent: MAGENTA, commands: true, items: entries(pagerCommands) },
  { title: "diff・計算・ダンプ", accent: GREEN, commands: true, items: entries(extraCommands) },
  { title: "お楽しみ (ドヤ用)", accent: RED, commands: true, items: entries(funCommands) },
  { title: "🥋 チャレンジ道場", accent: YELLOW, commands: true, items: entries([...challengeCommands, ...learnCommands]) },
  { title: "対話モード起動", accent: RED, commands: true, items: entries(launcherCommands) },

  // ===== パイプレシピ (クリックでプロンプト挿入) =====
  {
    title: "🔗 パイプ実践レシピ",
    accent: CYAN,
    items: [
      { cmd: "ls -la | grep '^d'", desc: "ディレクトリだけ表示" },
      { cmd: "ls -la | sort -k5 -nr | head -3", desc: "大きいファイル トップ3" },
      { cmd: "ps aux | grep nginx", desc: "プロセスを名前で探す" },
      { cmd: "history | grep git", desc: "打ったコマンドを検索" },
      { cmd: "grep -c ERROR logs/app.log", desc: "エラー行数を数える" },
      { cmd: "awk '{print $1}' data/access.log | sort | uniq -c | sort -nr | head -5", desc: "IP別アクセス数トップ5" },
      { cmd: "grep ' 401 ' data/access.log | awk '{print $1}' | sort -u", desc: "認証失敗IPの一覧" },
      { cmd: "du -s * | sort -n | tail -3", desc: "大きいディレクトリ トップ3" },
      { cmd: "find . -name '*.log' | xargs wc -l", desc: "ログの行数をまとめて" },
      { cmd: "sort data/fruits.txt | uniq -c | sort -nr", desc: "出現回数ランキング" },
    ],
  },

  // ===== キーバインド (クリック不可) =====
  {
    title: "⌨ Ghostty (あなたの設定)",
    accent: YELLOW,
    items: [
      { cmd: "ctrl+h / j / k / l", desc: "ペイン移動 (左/下/上/右)", keys: true },
      { cmd: "ctrl+shift+v", desc: "右に分割", keys: true },
      { cmd: "ctrl+shift+h", desc: "下に分割", keys: true },
      { cmd: "ctrl+x", desc: "ペインを閉じる", keys: true },
      { cmd: "ctrl+, / . / ; / '", desc: "リサイズ (左/右/下/上)", keys: true },
      { cmd: "ctrl+shift+k / j", desc: "上 / 下にスクロール", keys: true },
    ],
  },
  {
    title: "⌨ シェル (readline)",
    accent: GREEN,
    items: [
      { cmd: "Ctrl-A / Ctrl-E", desc: "行頭 / 行末", keys: true },
      { cmd: "Ctrl-K / Ctrl-U", desc: "カーソル以降 / 以前を削除", keys: true },
      { cmd: "Ctrl-W / Ctrl-Y", desc: "前の単語を削除 / 貼り付け", keys: true },
      { cmd: "↑ / ↓ / Ctrl-R", desc: "履歴 前 / 次 / 逆検索", keys: true },
      { cmd: "Tab / Ctrl-L / Ctrl-C", desc: "補完 / 画面クリア / 中断", keys: true },
    ],
  },
  {
    title: "⌨ tmux (prefix Ctrl-b)",
    accent: GREEN,
    items: [
      { cmd: "Ctrl-b c / n / p", desc: "新window / 次 / 前", keys: true },
      { cmd: 'Ctrl-b % / "', desc: "縦分割 / 横分割", keys: true },
      { cmd: "Ctrl-b 矢印 / o", desc: "ペイン移動 / 巡回", keys: true },
      { cmd: "Ctrl-b x / d", desc: "ペインを閉じる / デタッチ", keys: true },
      { cmd: "Ctrl-b [ / :", desc: "コピーモード / コマンド", keys: true },
    ],
  },
  {
    title: "⌨ Vim / Neovim",
    accent: GREEN,
    items: [
      { cmd: "i a o O / Esc", desc: "挿入開始 / normal へ", keys: true },
      { cmd: "h j k l w b e", desc: "カーソル / 単語移動", keys: true },
      { cmd: "0 ^ $ gg G", desc: "行頭 / 行末 / 先頭 / 末尾", keys: true },
      { cmd: "dd yy p / dw ciw", desc: "行削除·ヤンク·貼付 / 単語", keys: true },
      { cmd: ":w :q :wq :q!", desc: "保存 / 終了 / 保存終了 / 強制", keys: true },
      { cmd: ":%s/a/b/g  /word n N", desc: "全置換 / 検索·次·前", keys: true },
      { cmd: "u / Ctrl-r / .", desc: "undo / redo / 繰り返し", keys: true },
    ],
  },
  {
    title: "⌨ Emacs (C-=Ctrl M-=Alt)",
    accent: MAGENTA,
    items: [
      { cmd: "C-f C-b C-n C-p", desc: "前後の文字 / 上下の行", keys: true },
      { cmd: "C-a C-e / M-f M-b", desc: "行頭·行末 / 単語移動", keys: true },
      { cmd: "C-d DEL / C-k C-y", desc: "削除 / 切取·貼付 (yank)", keys: true },
      { cmd: "C-Space C-w M-w", desc: "マーク / 切取 / コピー", keys: true },
      { cmd: "C-x C-f / C-x C-s / C-x C-c", desc: "開く / 保存 / 終了", keys: true },
      { cmd: "C-s C-r / M-x / C-/", desc: "検索 / コマンド / undo", keys: true },
      { cmd: "C-x d (dired)", desc: "ディレクトリ編集を開く", keys: true },
      { cmd: "dired: n p RET ^ q", desc: "上下移動 / 開く / 親へ / 閉じる", keys: true },
      { cmd: "M-x tab-line-mode", desc: "ファイルをタブ表示 ON/OFF", keys: true },
      { cmd: "C-x ← / C-x →", desc: "tab-line: 前 / 次のファイルへ", keys: true },
    ],
  },
];

/** 登録コマンド総数 (重複名は除外)。 */
export function commandCount(): number {
  const names = new Set<string>();
  for (const g of REFERENCE) {
    if (!g.commands) continue;
    for (const it of g.items) names.add(it.cmd);
  }
  return names.size;
}
