// シェル E2E 検証: コマンド列を打ち込み、端末バッファ全文を取得する。
// 使い方: node scripts/test-shell.mjs <url> [screenshot.png]
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.argv[2] || "http://localhost:4173/cli-dojo/";
const SHOT = process.argv[3];

const cmds = process.env.CMDS
  ? JSON.parse(process.env.CMDS)
  : [
      "pwd",
      "ls",
      "ls -la",
      "cat todo.txt",
      'echo "HOME=$HOME user=$USER"',
      "cd projects",
      "ls -la",
      "cd ..",
      "mkdir demo && cd demo && touch a.txt b.txt && ls && cd ..",
      "echo hello > /tmp/greet.txt",
      "cat /tmp/greet.txt",
      "cat data/numbers.txt | cat -n",
      "ls *.txt",
      "echo logs: {1..3}.log",
      'echo "id: $(whoami)@$(hostname)"',
      "which ls cat nope",
      "type ll",
    ];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  defaultViewport: { width: 1200, height: 800, deviceScaleFactor: SHOT ? 2 : 1 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  // ウェルカムツアーが E2E の入力を奪わないように既読フラグを先に入れる
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("cli-dojo.tour.done", "1");
    } catch {}
  });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
  await page.click(".terminal-host");
  await new Promise((r) => setTimeout(r, 150));
  for (const c of cmds) {
    await page.keyboard.type(c);
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 70));
  }
  await new Promise((r) => setTimeout(r, 250));
  const text = await page.evaluate(() => {
    const t = window.__cliDojo.term;
    const buf = t.buffer.active;
    const out = [];
    for (let i = 0; i < buf.length; i++) {
      const ln = buf.getLine(i);
      if (ln) out.push(ln.translateToString(true).replace(/\s+$/, ""));
    }
    return out.join("\n");
  });
  console.log(text.replace(/\n{3,}/g, "\n\n"));
  if (SHOT) await page.screenshot({ path: SHOT });
} finally {
  await browser.close();
}
