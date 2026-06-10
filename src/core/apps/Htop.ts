import type { TerminalView } from "../terminal/TerminalView";
import { padAnsi } from "./util";

export interface HtopOptions {
  term: TerminalView;
  onExit: () => void;
}

interface Proc {
  pid: number;
  user: string;
  pri: number;
  ni: number;
  virt: number; // KiB
  res: number; // KiB
  cpu: number;
  mem: number;
  timeSec: number;
  cmd: string;
}

const R = "\x1b[0m";
const CYAN = "\x1b[38;2;24;179;199m";
const GREEN = "\x1b[38;2;126;214;126m";
const YELLOW = "\x1b[38;2;255;198;0m";
const RED = "\x1b[38;2;255;98;140m";
const DIM = "\x1b[38;2;120;128;150m";
const WHITE = "\x1b[38;2;230;234;245m";

const PROC_SEED: Array<[string, string, number]> = [
  ["systemd", "root", 0.0],
  ["sshd", "root", 0.1],
  ["nginx: worker process", "www-data", 2.0],
  ["nginx: master process", "root", 0.0],
  ["postgres: writer", "postgres", 1.2],
  ["postgres: checkpointer", "postgres", 0.4],
  ["node /srv/app/server.js", "guest", 8.5],
  ["python3 train.py --epochs 50", "guest", 42.0],
  ["ffmpeg -i input.mp4 out.webm", "guest", 31.0],
  ["bash", "guest", 0.0],
  ["tmux: server", "guest", 0.2],
  ["htop", "guest", 1.5],
  ["kworker/0:1-events", "root", 0.3],
  ["rcu_sched", "root", 0.1],
  ["journald", "root", 0.2],
  ["dockerd", "root", 1.1],
  ["containerd-shim", "root", 0.4],
  ["redis-server *:6379", "redis", 1.8],
];

/** htop 風のリアルタイムプロセスビューア (1秒ごとに更新)。q / F10 で終了。 */
export class HtopApp {
  private term: TerminalView;
  private onExit: () => void;
  private timer: number | null = null;
  private procs: Proc[];
  private cores: number[];
  private memUsed = 2480; // MiB
  private memTotal = 7872;
  private swpUsed = 0;
  private swpTotal = 2048;
  private load = [0.42, 0.31, 0.18];
  private selected = 0;
  private startedAt = Date.now();
  private done = false;

  constructor(opts: HtopOptions) {
    this.term = opts.term;
    this.onExit = opts.onExit;
    const nCores = Math.min(8, Math.max(2, navigator.hardwareConcurrency || 4));
    this.cores = Array.from({ length: nCores }, () => 5 + Math.random() * 20);
    let pid = 1;
    this.procs = PROC_SEED.map(([cmd, user, cpu], i) => ({
      pid: i === 0 ? 1 : (pid = pid + 13 + Math.floor(Math.random() * 90)),
      user,
      pri: 20,
      ni: 0,
      virt: 80_000 + Math.floor(Math.random() * 900_000),
      res: 4_000 + Math.floor(Math.random() * 250_000),
      cpu,
      mem: +(Math.random() * 4).toFixed(1),
      timeSec: Math.floor(Math.random() * 4000),
      cmd,
    }));
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[?25l");
    this.render();
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  dispose(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.done) return;
    this.done = true;
    this.term.term.write("\x1b[?1049l\x1b[?25h\x1b[0 q");
  }

  fit(): void {
    this.render();
  }

  onData(data: string): void {
    if (data === "q" || data === "\x03" || data === "\x1b[21~" /* F10 */) {
      this.dispose();
      this.onExit();
      return;
    }
    if (data === "\x1b[A" || data === "k") {
      this.selected = Math.max(0, this.selected - 1);
      this.render();
    } else if (data === "\x1b[B" || data === "j") {
      this.selected = Math.min(this.procs.length - 1, this.selected + 1);
      this.render();
    }
  }

  /** 乱数ウォークで値を生っぽく揺らす。 */
  private tick(): void {
    this.cores = this.cores.map((v) => clamp(v + (Math.random() - 0.48) * 18, 1, 99));
    this.memUsed = clamp(this.memUsed + (Math.random() - 0.5) * 120, 1500, 6500);
    this.load[0] = clamp(this.load[0] + (Math.random() - 0.48) * 0.2, 0.05, 4);
    this.load[1] = this.load[1] * 0.9 + this.load[0] * 0.1;
    this.load[2] = this.load[2] * 0.95 + this.load[1] * 0.05;
    for (const p of this.procs) {
      if (p.cpu > 0.5 || Math.random() < 0.15) {
        p.cpu = clamp(p.cpu + (Math.random() - 0.5) * p.cpu * 0.6 + (Math.random() - 0.5), 0, 99);
      }
      p.timeSec += p.cpu / 100;
    }
    this.render();
  }

  private bar(label: string, value: number, max: number, width: number, text?: string): string {
    const inner = width - label.length - 2;
    const ratio = clamp(value / max, 0, 1);
    const fill = Math.round(inner * ratio);
    const color = ratio < 0.5 ? GREEN : ratio < 0.8 ? YELLOW : RED;
    const t = text ?? `${value.toFixed(1)}%`;
    let body = "|".repeat(fill) + " ".repeat(Math.max(0, inner - fill));
    // 右端に数値を重ねる
    const overlay = t.slice(0, inner);
    body = body.slice(0, Math.max(0, inner - overlay.length)) + overlay;
    const fillPart = body.slice(0, fill);
    const restPart = body.slice(fill);
    return `${CYAN}${label}${WHITE}[${color}${fillPart}${DIM}${restPart}${WHITE}]${R}`;
  }

  private render(): void {
    const t = this.term.term;
    const cols = this.term.cols;
    const rows = this.term.rows;
    const half = Math.floor(cols / 2) - 1;
    const lines: string[] = [];

    // CPU コアのバー (2列)
    for (let i = 0; i < this.cores.length; i += 2) {
      const left = this.bar(String(i), this.cores[i], 100, half);
      const right = i + 1 < this.cores.length ? this.bar(String(i + 1), this.cores[i + 1], 100, half) : "";
      lines.push("  " + left + " " + right);
    }
    lines.push(
      "  " +
        this.bar("Mem", this.memUsed, this.memTotal, half, `${(this.memUsed / 1024).toFixed(2)}G/${(this.memTotal / 1024).toFixed(2)}G`) +
        " " +
        this.bar("Swp", this.swpUsed, this.swpTotal, half, `${this.swpUsed}M/${(this.swpTotal / 1024).toFixed(2)}G`),
    );
    const up = Date.now() - this.startedAt;
    const upStr = fmtUptime(up / 1000 + 3600 * 26 + 754);
    lines.push(
      `  ${CYAN}Tasks: ${WHITE}${this.procs.length}${DIM}, ${WHITE}1${DIM} running   ` +
        `${CYAN}Load average: ${WHITE}${this.load.map((l) => l.toFixed(2)).join(" ")}   ` +
        `${CYAN}Uptime: ${WHITE}${upStr}${R}`,
    );
    lines.push("");

    // ヘッダ行 (背景色を右端まで: 素のテキストを手動パディング)
    const padPlain = (s: string): string => (s.length >= cols ? s.slice(0, cols) : s + " ".repeat(cols - s.length));
    const header = `  ${"PID".padStart(5)} ${"USER".padEnd(9)} PRI  NI ${"VIRT".padStart(7)} ${"RES".padStart(7)} ${"CPU%".padStart(5)} ${"MEM%".padStart(5)} ${"TIME+".padStart(9)}  Command`;
    lines.push("\x1b[48;2;40;90;60m\x1b[38;2;10;14;10m" + padPlain(header) + R);

    const sorted = [...this.procs].sort((a, b) => b.cpu - a.cpu);
    const bodyRows = rows - lines.length - 1;
    for (let i = 0; i < bodyRows; i++) {
      if (i >= sorted.length) {
        lines.push("");
        continue;
      }
      const p = sorted[i];
      const cpuC = p.cpu > 50 ? RED : p.cpu > 10 ? YELLOW : GREEN;
      const row =
        `  ${WHITE}${String(p.pid).padStart(5)} ${CYAN}${p.user.padEnd(9)}${WHITE} ` +
        `${String(p.pri).padStart(3)} ${String(p.ni).padStart(3)} ` +
        `${fmtKib(p.virt).padStart(7)} ${fmtKib(p.res).padStart(7)} ` +
        `${cpuC}${p.cpu.toFixed(1).padStart(5)}${WHITE} ${p.mem.toFixed(1).padStart(5)} ` +
        `${DIM}${fmtTime(p.timeSec).padStart(9)}${WHITE}  ${p.user === "root" ? DIM : GREEN}${p.cmd}${R}`;
      if (i === this.selected) {
        // 選択行は色を落として反転背景で塗る
        const plain = row.replace(/\x1b\[[0-9;]*m/g, "");
        lines.push("\x1b[48;2;60;110;140m\x1b[38;2;240;244;255m" + padPlain(plain) + R);
      } else {
        lines.push(row);
      }
    }

    // ファンクションキーバー
    const fkeys: Array<[string, string]> = [
      ["F1", "Help"], ["F2", "Setup"], ["F3", "Search"], ["F4", "Filter"], ["F5", "Tree"],
      ["F6", "SortBy"], ["F9", "Kill"], ["F10", "Quit"],
    ];
    let fbar = "";
    for (const [k, label] of fkeys) fbar += `${WHITE}${k}\x1b[48;2;24;179;199m\x1b[38;2;10;14;20m${label.padEnd(6)}${R}`;

    let buf = "\x1b[H";
    for (let r = 0; r < rows - 1; r++) {
      buf += padAnsi(r < lines.length ? lines[r] : "", cols) + "\r\n";
    }
    buf += padAnsi(fbar + DIM + "  (q で終了)", cols);
    t.write(buf);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function fmtKib(k: number): string {
  if (k >= 1024 * 1024) return (k / 1024 / 1024).toFixed(1) + "G";
  if (k >= 10240) return Math.round(k / 1024) + "M";
  return String(k);
}
function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}
function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const hms = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return d > 0 ? `${d} day${d > 1 ? "s" : ""}, ${hms}` : hms;
}
