import "./styles/main.css";
import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

/* -------------------------------------------------------------
 * Phase 0: 最小の端末。
 * 透過ガラス + Cobalt Next 風テーマで「動く公開URL」を確保する。
 * 実際の readline / シェル / モードは後続フェーズで差し替える。
 * ----------------------------------------------------------- */

// Cobalt Next 系パレット (背景は #app 側のガラスに任せて完全透過)
const COBALT_THEME = {
  background: "rgba(0, 0, 0, 0)",
  foreground: "#d6e0f5",
  cursor: "#ffc600",
  cursorAccent: "#0a1020",
  selectionBackground: "rgba(0, 136, 255, 0.35)",
  black: "#16213a",
  red: "#ff628c",
  green: "#3ad900",
  yellow: "#ffc600",
  blue: "#0088ff",
  magenta: "#fb94ff",
  cyan: "#18b3c7",
  white: "#c7d3e8",
  brightBlack: "#626688",
  brightRed: "#ff849c",
  brightGreen: "#67ec5a",
  brightYellow: "#ffe066",
  brightBlue: "#5ab0ff",
  brightMagenta: "#ffb3ff",
  brightCyan: "#6fe0ef",
  brightWhite: "#ffffff",
};

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

const term = new Terminal({
  allowTransparency: true,
  cursorBlink: true,
  cursorStyle: "block",
  fontFamily:
    "'HackGen Console NF', 'HackGen Console', ui-monospace, 'SFMono-Regular', Menlo, monospace",
  fontSize: 16,
  lineHeight: 1.2,
  theme: COBALT_THEME,
  scrollback: 5000,
});

const fit = new FitAddon();
term.loadAddon(fit);
term.open(app);
fit.fit();
window.addEventListener("resize", () => fit.fit());

// ---- ANSI ヘルパ ----
const rgb = (r: number, g: number, b: number, s: string) =>
  `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
const yellow = (s: string) => rgb(255, 198, 0, s);
const dim = (s: string) => rgb(138, 147, 173, s);
const green = (s: string) => rgb(58, 217, 0, s);
const blue = (s: string) => rgb(0, 136, 255, s);

const PROMPT = `${green("guest@cli-dojo")}:${blue("~")}$ `;

function banner(): void {
  term.writeln("");
  term.writeln("  " + yellow("cli-dojo") + "  " + dim("— ターミナル練習道場"));
  term.writeln(
    "  " + dim("Linux · Ghostty · tmux · Neovim · Emacs を一つの画面で"),
  );
  term.writeln("");
  term.writeln(
    "  " + dim("準備中 (Phase 0)。実シェル・モード・レッスンは順次実装します。"),
  );
  term.writeln("");
}

let line = "";
function prompt(): void {
  term.write(PROMPT);
}

banner();
prompt();

// Phase 0 の簡易ライン入力 (Phase 2 で本物の Readline に置換)
term.onData((data) => {
  for (const ch of data) {
    const code = ch.charCodeAt(0);
    if (ch === "\r") {
      term.write("\r\n");
      const cmd = line.trim();
      if (cmd.length > 0) {
        term.writeln(dim("未実装のコマンドです: ") + cmd);
      }
      line = "";
      prompt();
    } else if (code === 127) {
      if (line.length > 0) {
        line = line.slice(0, -1);
        term.write("\b \b");
      }
    } else if (code === 3) {
      term.write("^C\r\n");
      line = "";
      prompt();
    } else if (code >= 32) {
      line += ch;
      term.write(ch);
    }
  }
});
