/** xterm の onData 文字列を編集アクション列へ変換する。 */
export type KeyAction =
  | { type: "text"; text: string }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "deletechar" }
  | { type: "tab" }
  | { type: "left" }
  | { type: "right" }
  | { type: "up" }
  | { type: "down" }
  | { type: "home" }
  | { type: "end" }
  | { type: "wordleft" }
  | { type: "wordright" }
  | { type: "killline" }
  | { type: "killstart" }
  | { type: "killwordback" }
  | { type: "killwordfwd" }
  | { type: "yank" }
  | { type: "interrupt" }
  | { type: "clear" }
  | { type: "rsearch" }
  | { type: "transpose" }
  | { type: "histtop" }
  | { type: "histbottom" }
  | { type: "escape" }
  | { type: "ignore" };

const CSI = /^\x1b\[([0-9;]*)([A-Za-z~])/;
const SS3 = /^\x1bO([A-D])/;

function hasMod(params: string): boolean {
  // 1;5 (Ctrl) や 1;3 (Alt) などの修飾付き
  return params.includes(";5") || params.includes(";3") || params.includes(";2");
}

export function parseKeys(data: string): KeyAction[] {
  const out: KeyAction[] = [];
  const n = data.length;
  let i = 0;

  while (i < n) {
    const c = data[i];

    if (c === "\x1b") {
      const rest = data.slice(i);

      if (rest.startsWith("\x1b\x7f") || rest.startsWith("\x1b\b")) {
        out.push({ type: "killwordback" });
        i += 2;
        continue;
      }
      if (rest.startsWith("\x1bb") || rest.startsWith("\x1bB")) {
        out.push({ type: "wordleft" });
        i += 2;
        continue;
      }
      if (rest.startsWith("\x1bf") || rest.startsWith("\x1bF")) {
        out.push({ type: "wordright" });
        i += 2;
        continue;
      }
      if (rest.startsWith("\x1bd") || rest.startsWith("\x1bD")) {
        out.push({ type: "killwordfwd" });
        i += 2;
        continue;
      }
      if (rest.startsWith("\x1b<")) {
        out.push({ type: "histtop" });
        i += 2;
        continue;
      }
      if (rest.startsWith("\x1b>")) {
        out.push({ type: "histbottom" });
        i += 2;
        continue;
      }

      const mo = SS3.exec(rest);
      if (mo) {
        const a = mo[1];
        out.push({
          type: a === "A" ? "up" : a === "B" ? "down" : a === "C" ? "right" : "left",
        });
        i += 3;
        continue;
      }

      const m = CSI.exec(rest);
      if (m) {
        const params = m[1];
        const final = m[2];
        if (final === "C") out.push(hasMod(params) ? { type: "wordright" } : { type: "right" });
        else if (final === "D") out.push(hasMod(params) ? { type: "wordleft" } : { type: "left" });
        else if (final === "A") out.push({ type: "up" });
        else if (final === "B") out.push({ type: "down" });
        else if (final === "H") out.push({ type: "home" });
        else if (final === "F") out.push({ type: "end" });
        else if (final === "~") {
          if (params === "1" || params === "7") out.push({ type: "home" });
          else if (params === "4" || params === "8") out.push({ type: "end" });
          else if (params === "3") out.push({ type: "deletechar" });
          else out.push({ type: "ignore" });
        } else out.push({ type: "ignore" });
        i += m[0].length;
        continue;
      }

      out.push({ type: "escape" });
      i += 1;
      continue;
    }

    const code = c.charCodeAt(0);
    if (code < 32 || code === 127) {
      switch (code) {
        case 13:
        case 10:
          out.push({ type: "enter" });
          break;
        case 127:
        case 8:
          out.push({ type: "backspace" });
          break;
        case 9:
          out.push({ type: "tab" });
          break;
        case 1:
          out.push({ type: "home" });
          break;
        case 2:
          out.push({ type: "left" });
          break;
        case 3:
          out.push({ type: "interrupt" });
          break;
        case 4:
          out.push({ type: "deletechar" });
          break;
        case 5:
          out.push({ type: "end" });
          break;
        case 6:
          out.push({ type: "right" });
          break;
        case 7:
          out.push({ type: "escape" });
          break;
        case 11:
          out.push({ type: "killline" });
          break;
        case 12:
          out.push({ type: "clear" });
          break;
        case 14:
          out.push({ type: "down" });
          break;
        case 16:
          out.push({ type: "up" });
          break;
        case 18:
          out.push({ type: "rsearch" });
          break;
        case 20:
          out.push({ type: "transpose" });
          break;
        case 21:
          out.push({ type: "killstart" });
          break;
        case 23:
          out.push({ type: "killwordback" });
          break;
        case 25:
          out.push({ type: "yank" });
          break;
        default:
          out.push({ type: "ignore" });
      }
      i += 1;
      continue;
    }

    // 印字可能文字の連続をまとめて text に (ペースト/IME 入力対応)
    let j = i;
    while (j < n) {
      const cc = data.charCodeAt(j);
      if (cc === 0x1b || cc < 32 || cc === 127) break;
      j++;
    }
    out.push({ type: "text", text: data.slice(i, j) });
    i = j;
  }

  return out;
}
