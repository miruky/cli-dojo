import type { Command, ExecContext } from "../types";
import { stringWidth } from "../../terminal/wcwidth";

/** お楽しみ系: neofetch / fastfetch / cowsay / figlet / lolcat / fortune。画面共有の主役。 */

const R = "\x1b[0m";
const B = "\x1b[1m";

const pageStart = Date.now();

// ===== neofetch =====

const DEBIAN_ART = [
  "       _,met$$$$$gg.       ",
  "    ,g$$$$$$$$$$$$$$$P.    ",
  '  ,g$$P"     """Y$$.".     ',
  " ,$$P'              `$$$.  ",
  "',$$P       ,ggs.     `$$b:",
  "`d$$'     ,$P\"'   .    $$$ ",
  " $$P      d$'     ,    $$P ",
  " $$:      $$.   -    ,d$$' ",
  " $$;      Y$b._   _,d$P'   ",
  ' Y$$.    `.`"Y$$$$P"\'      ',
  ' `$$b      "-.__           ',
  "  `Y$$                     ",
  "   `Y$$.                   ",
  "     `$$b.                 ",
  "       `Y$$b.              ",
  '          `"Y$b._          ',
  '              `"""         ',
];

function uptimeStr(): string {
  const sec = Math.floor((Date.now() - pageStart) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} hour${h > 1 ? "s" : ""}, ${m} min${m !== 1 ? "s" : ""}`;
  if (m > 0) return `${m} min${m !== 1 ? "s" : ""}`;
  return `${sec} secs`;
}

function browserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Browser";
}

const neofetch: Command = {
  name: "neofetch",
  summary: "システム情報をロゴ付きで表示 (ドヤ用)",
  run(ctx) {
    const C = "\x1b[38;2;215;58;74m"; // Debian 赤
    const K = "\x1b[1m\x1b[38;2;24;179;199m"; // ラベル色
    const cmds = ctx.services.listCommands().length;
    const cores = navigator.hardwareConcurrency || 4;
    const info: Array<[string, string]> = [
      ["", `${B}guest${R}@${B}cli-dojo${R}`],
      ["", "-".repeat(15)],
      ["OS", "Debian GNU/Linux 12 (bookworm) x86_64"],
      ["Host", `${browserName()} (cli-dojo web terminal)`],
      ["Kernel", "6.1.0-dojo-amd64"],
      ["Uptime", uptimeStr()],
      ["Packages", `${cmds} (dojo)`],
      ["Shell", "bash 5.2.15 (dojo)"],
      ["Resolution", `${window.innerWidth}x${window.innerHeight}`],
      ["Terminal", "xterm.js / Ghostty風"],
      ["CPU", `${cores} cores (navigator.hardwareConcurrency)`],
      ["Memory", "2480MiB / 7872MiB"],
    ];
    const artW = DEBIAN_ART[0].length + 2;
    const rows = Math.max(DEBIAN_ART.length, info.length + 2);
    ctx.out("\n");
    for (let i = 0; i < rows; i++) {
      const art = DEBIAN_ART[i] ?? " ".repeat(artW - 2);
      let line = C + B + art + R + "  ";
      const inf = info[i];
      if (inf) line += inf[0] ? `${K}${inf[0]}${R}: ${inf[1]}` : inf[1];
      if (i === info.length + 1) {
        // 色ブロック
        let blocks = "";
        for (let c = 0; c < 8; c++) blocks += `\x1b[4${c}m   `;
        line += blocks + R;
      }
      ctx.out(line + "\n");
    }
    ctx.out("\n");
    return 0;
  },
};

const fastfetch: Command = {
  name: "fastfetch",
  summary: "neofetch の高速版 (同じ表示)",
  run: neofetch.run,
};

// ===== figlet (5行ブロックフォント) =====

const FONT: Record<string, string[]> = {
  A: [" ██ ", "█  █", "████", "█  █", "█  █"],
  B: ["███ ", "█  █", "███ ", "█  █", "███ "],
  C: [" ███", "█   ", "█   ", "█   ", " ███"],
  D: ["███ ", "█  █", "█  █", "█  █", "███ "],
  E: ["████", "█   ", "███ ", "█   ", "████"],
  F: ["████", "█   ", "███ ", "█   ", "█   "],
  G: [" ███", "█   ", "█ ██", "█  █", " ███"],
  H: ["█  █", "█  █", "████", "█  █", "█  █"],
  I: ["███", " █ ", " █ ", " █ ", "███"],
  J: ["  ██", "   █", "   █", "█  █", " ██ "],
  K: ["█  █", "█ █ ", "██  ", "█ █ ", "█  █"],
  L: ["█   ", "█   ", "█   ", "█   ", "████"],
  M: ["█   █", "██ ██", "█ █ █", "█   █", "█   █"],
  N: ["█   █", "██  █", "█ █ █", "█  ██", "█   █"],
  O: [" ██ ", "█  █", "█  █", "█  █", " ██ "],
  P: ["███ ", "█  █", "███ ", "█   ", "█   "],
  Q: [" ██ ", "█  █", "█  █", "█ ██", " ███"],
  R: ["███ ", "█  █", "███ ", "█ █ ", "█  █"],
  S: [" ███", "█   ", " ██ ", "   █", "███ "],
  T: ["█████", "  █  ", "  █  ", "  █  ", "  █  "],
  U: ["█  █", "█  █", "█  █", "█  █", " ██ "],
  V: ["█   █", "█   █", "█   █", " █ █ ", "  █  "],
  W: ["█   █", "█   █", "█ █ █", "██ ██", "█   █"],
  X: ["█   █", " █ █ ", "  █  ", " █ █ ", "█   █"],
  Y: ["█   █", " █ █ ", "  █  ", "  █  ", "  █  "],
  Z: ["████", "  █ ", " █  ", "█   ", "████"],
  "0": [" ██ ", "█  █", "█  █", "█  █", " ██ "],
  "1": [" █ ", "██ ", " █ ", " █ ", "███"],
  "2": ["███ ", "   █", " ██ ", "█   ", "████"],
  "3": ["███ ", "   █", " ██ ", "   █", "███ "],
  "4": ["█  █", "█  █", "████", "   █", "   █"],
  "5": ["████", "█   ", "███ ", "   █", "███ "],
  "6": [" ███", "█   ", "███ ", "█  █", " ██ "],
  "7": ["████", "   █", "  █ ", " █  ", " █  "],
  "8": [" ██ ", "█  █", " ██ ", "█  █", " ██ "],
  "9": [" ██ ", "█  █", " ███", "   █", " ██ "],
  "-": ["    ", "    ", "████", "    ", "    "],
  "!": ["█", "█", "█", " ", "█"],
  "?": ["███ ", "   █", " ██ ", "    ", " █  "],
  ".": [" ", " ", " ", " ", "█"],
  " ": ["  ", "  ", "  ", "  ", "  "],
};

function figletRender(text: string): string[] {
  const rows = ["", "", "", "", ""];
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < 5; r++) rows[r] += glyph[r] + " ";
  }
  return rows;
}

const figlet: Command = {
  name: "figlet",
  summary: "テキストを大きなアスキーアートに",
  run(ctx) {
    const text = ctx.args.slice(1).filter((a) => !a.startsWith("-")).join(" ") || ctx.stdin.trim();
    if (!text) {
      ctx.err("figlet: テキストを指定してください (例: figlet CLI DOJO)\n");
      return 1;
    }
    for (const row of figletRender(text.slice(0, 24))) ctx.out(row + "\n");
    return 0;
  },
};

// ===== lolcat =====

function hsvToRgb(h: number): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)) * 0.65));
  };
  return [f(5), f(3), f(1)];
}

const lolcat: Command = {
  name: "lolcat",
  summary: "入力を虹色にして出力",
  run(ctx) {
    const files = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    let input: string;
    if (files.length) {
      const node = ctx.vfs.stat(ctx.resolve(files[0]));
      if (!node || node.type !== "file") {
        ctx.err(`lolcat: ${files[0]}: そのようなファイルはありません\n`);
        return 1;
      }
      input = node.content;
    } else {
      input = ctx.stdin;
    }
    // eslint-disable-next-line no-control-regex
    input = input.replace(/\x1b\[[0-9;]*m/g, "");
    const offset = Math.random();
    const lines = input.split("\n");
    for (let y = 0; y < lines.length; y++) {
      let out = "";
      const line = lines[y];
      for (let x = 0; x < line.length; x++) {
        const [r, g, b] = hsvToRgb((offset + x / 28 + y / 8) % 1);
        out += `\x1b[38;2;${r};${g};${b}m${line[x]}`;
      }
      ctx.out(out + R + (y < lines.length - 1 ? "\n" : ""));
    }
    return 0;
  },
};

// ===== cowsay =====

function wrapText(text: string, width: number): string[] {
  // 全角を幅2として折り返す
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line === "") line = w;
    else if (stringWidth(line) + 1 + stringWidth(w) <= width) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const COW_BODIES: Record<string, string[]> = {
  default: [
    "        {t}   ^__^",
    "         {t}  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||",
  ],
  tux: [
    "   {t}",
    "    {t}",
    "        .--.",
    "       |o_o |",
    "       |:_/ |",
    "      //   \\ \\",
    "     (|     | )",
    "    /'\\_   _/`\\",
    "    \\___)=(___/",
  ],
};

function cowsayRun(ctx: ExecContext, think: boolean): number {
  const args = ctx.args.slice(1);
  let body = COW_BODIES.default;
  const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-f") {
      const name = args[++i] ?? "";
      body = COW_BODIES[name] ?? body;
      if (!COW_BODIES[name]) {
        ctx.err(`cowsay: ${name} というキャラはいません (default / tux)\n`);
        return 1;
      }
    } else if (!args[i].startsWith("-")) {
      words.push(args[i]);
    }
  }
  const text = words.join(" ") || ctx.stdin.trim() || "Moo!";
  const lines = wrapText(text, 38);
  const w = Math.max(...lines.map((l) => stringWidth(l)));
  const pad = (l: string): string => l + " ".repeat(Math.max(0, w - stringWidth(l)));
  ctx.out(" " + "_".repeat(w + 2) + "\n");
  if (lines.length === 1) {
    ctx.out((think ? `( ${pad(lines[0])} )` : `< ${pad(lines[0])} >`) + "\n");
  } else {
    lines.forEach((l, i) => {
      const [lb, rb] = think
        ? ["(", ")"]
        : i === 0
          ? ["/", "\\"]
          : i === lines.length - 1
            ? ["\\", "/"]
            : ["|", "|"];
      ctx.out(`${lb} ${pad(l)} ${rb}\n`);
    });
  }
  ctx.out(" " + "-".repeat(w + 2) + "\n");
  const c = think ? "o" : "\\";
  for (const line of body) ctx.out(line.replace(/\{t\}/g, c) + "\n");
  return 0;
}

const cowsay: Command = {
  name: "cowsay",
  summary: "牛がしゃべる",
  run: (ctx) => cowsayRun(ctx, false),
};
const cowthink: Command = {
  name: "cowthink",
  summary: "牛が考える",
  run: (ctx) => cowsayRun(ctx, true),
};

// ===== fortune =====

const FORTUNES = [
  "UNIX is simple. It just takes a genius to understand its simplicity.\n        -- Dennis Ritchie",
  "Talk is cheap. Show me the code.\n        -- Linus Torvalds",
  "プログラムは思った通りには動かない。書いた通りに動く。",
  "rm -rf / を打つ前に深呼吸を。打った後では遅い。",
  "There is no place like ~",
  "sudo は魔法の言葉。ただし責任も root 級。",
  "良い設計とは、取り除くものが無くなったときに完成する。\n        -- Antoine de Saint-Exupéry (意訳)",
  "C-x C-c を知るまで Emacs から出られなかった者は数知れず。",
  ":q! — Vim から脱出した者だけが世界を語れる。",
  "grep するは一時の恥、grep せぬは一生のバグ。",
  "The best way to predict the future is to implement it.\n        -- Alan Kay (意訳)",
  "シェルは友達。怖くない。",
  "Premature optimization is the root of all evil.\n        -- Donald Knuth",
  "tar -czvf … 「Compress Ze Vile Files!」と覚えるとよい。",
  "パイプ | は UNIX の魂である。小さな道具を繋げ。",
  "今日の TODO は明日の DONE。たぶん。",
  "Simplicity is the ultimate sophistication.",
  "9割のバグは、自分が3日前に書いたコードの中にいる。",
  "man を読む者はコマンドを制し、コマンドを制す者は端末を制す。",
  "Real programmers count from 0.",
];

const fortune: Command = {
  name: "fortune",
  summary: "おみくじ (ランダムな格言)",
  run(ctx) {
    ctx.out(FORTUNES[Math.floor(Math.random() * FORTUNES.length)] + "\n");
    return 0;
  },
};

export const funCommands: Command[] = [neofetch, fastfetch, figlet, lolcat, cowsay, cowthink, fortune];
