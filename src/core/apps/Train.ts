import type { TerminalView } from "../terminal/TerminalView";

export interface TrainOptions {
  term: TerminalView;
  onExit: () => void;
}

// sl の D51。車輪 2 フレームで回転して見せる。
const D51_TOP = [
  "      ====        ________                ___________ ",
  "  _D _|  |_______/        \\__I_I_____===__|_________| ",
  "   |(_)---  |   H\\________/ |   |        =|___ ___|   ",
  "   /     |  |   H  |  |     |   |         ||_| |_||   ",
  "  |      |  |   H  |__--------------------| [___] |   ",
  "  | ________|___H__/__|_____/[][]~\\_______|       |   ",
  "  |/ |   |-----------I_____I [][] []  D   |=======|__ ",
];
const D51_WHEELS = [
  [
    "__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ",
    " |/-=|___|=    ||    ||    ||    |_____/~\\___/        ",
    "  \\_/      \\O=====O=====O=====O_/      \\_/            ",
  ],
  [
    "__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ",
    " |/-=|___|=O=====O=====O=====O   |_____/~\\___/        ",
    "  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            ",
  ],
];
const COACH = [
  "    _________________         ",
  "   _|                \\_____A  ",
  " =|                        |  ",
  " -|                        |  ",
  "__|________________________|_ ",
  "|__________________________|_ ",
  "   |_D__D__D_|  |_D__D__D_|   ",
  "    \\_/   \\_/    \\_/   \\_/    ",
];

/** sl: 蒸気機関車が右から左へ走り抜ける。Ctrl-C も効かない (本家準拠)。 */
export class TrainApp {
  private term: TerminalView;
  private onExit: () => void;
  private timer: number | null = null;
  private x = 0;
  private frame = 0;
  private done = false;

  constructor(opts: TrainOptions) {
    this.term = opts.term;
    this.onExit = opts.onExit;
  }

  start(): void {
    this.term.term.write("\x1b[?1049h\x1b[?25l\x1b[2J");
    this.x = this.term.cols;
    this.timer = window.setInterval(() => this.tick(), 60);
  }

  dispose(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.done) return;
    this.done = true;
    this.term.term.write("\x1b[?1049l\x1b[?25h\x1b[0 q");
  }

  fit(): void {
    this.term.term.write("\x1b[2J");
  }

  onData(_data: string): void {
    // 本家 sl と同じく、何を押しても止まらない
  }

  private tick(): void {
    const t = this.term.term;
    const rows = this.term.rows;
    const cols = this.term.cols;
    this.frame++;
    this.x -= 1;

    const wheels = D51_WHEELS[Math.floor(this.frame / 2) % 2];
    const engine = [...D51_TOP, ...wheels];
    const gap = "  ";
    const body: string[] = [];
    for (let r = 0; r < 10; r++) {
      const eng = engine[r] ?? " ".repeat(54);
      const coach = r >= 2 ? (COACH[r - 2] ?? "") : " ".repeat(30);
      body.push(eng + gap + coach);
    }
    const trainWidth = body[0].length;
    if (this.x < -trainWidth) {
      this.dispose();
      this.onExit();
      return;
    }

    const topRow = Math.max(1, Math.floor(rows / 2) - 6);
    let buf = "\x1b[2J";
    // 煙
    const smokes = ["(  )", "(@@)", "( )", "()"];
    for (let s = 0; s < 4; s++) {
      const sx = this.x + 6 + s * 12 + ((this.frame >> 1) % 3);
      const sy = topRow - 1 - (s % 2);
      if (sx >= 1 && sx < cols - 4 && sy >= 1) {
        buf += `\x1b[${sy};${sx}H\x1b[38;2;150;158;180m${smokes[(s + (this.frame >> 2)) % smokes.length]}\x1b[0m`;
      }
    }
    for (let r = 0; r < body.length; r++) {
      const y = topRow + r;
      if (y < 1 || y > rows) continue;
      let line = body[r];
      let x = this.x;
      if (x < 1) {
        line = line.slice(1 - x);
        x = 1;
      }
      if (x > cols) continue;
      line = line.slice(0, Math.max(0, cols - x + 1));
      if (line) buf += `\x1b[${y};${x}H\x1b[38;2;230;234;245m${line}\x1b[0m`;
    }
    t.write(buf);
  }
}
