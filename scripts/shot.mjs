// 開発用スクリーンショット & 操作ツール (system Chrome を駆動、ブラウザDLなし)
//
// 使い方:
//   node scripts/shot.mjs <url> <out.png> [action ...]
// アクション:
//   click:<selector>      要素をクリック
//   wait:<ms>             待機
//   type:<text>           キーボード入力
//   key:<Key>             キー押下 (例: Enter, Control+L)
//   eval:<js>             ページ内で JS 実行
//   focus:<selector>      要素にフォーカス
//
// 例:
//   node scripts/shot.mjs http://localhost:4173/cli-dojo/ /tmp/menu.png click:.hamburger wait:400
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const url = process.argv[2] || "http://localhost:4173/cli-dojo/";
const out = process.argv[3] || "/tmp/cli-dojo-shot.png";
const actions = process.argv.slice(4);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--hide-scrollbars", "--force-color-profile=srgb"],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});

try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning") console.log(`[page.${t}]`, m.text());
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

  for (const a of actions) {
    const idx = a.indexOf(":");
    const cmd = idx === -1 ? a : a.slice(0, idx);
    const arg = idx === -1 ? "" : a.slice(idx + 1);
    if (cmd === "click") await page.click(arg);
    else if (cmd === "focus") await page.focus(arg);
    else if (cmd === "wait") await new Promise((r) => setTimeout(r, Number(arg)));
    else if (cmd === "type") await page.keyboard.type(arg);
    else if (cmd === "key") await page.keyboard.press(arg);
    else if (cmd === "eval") await page.evaluate(arg);
    else console.log("unknown action:", a);
  }

  await page.screenshot({ path: out });
  console.log("saved", out);
} finally {
  await browser.close();
}
