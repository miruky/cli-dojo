import "./styles/fonts.css";
import "./styles/main.css";
import "./styles/chrome.css";
import "./styles/terminal.css";
import "./styles/panes.css";
import "./styles/tmux.css";
import "./styles/lessons.css";
import "./styles/help.css";
import { App } from "./app/App";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");

let booted = false;
const boot = (): void => {
  if (booted) return;
  booted = true;
  new App().mount(appEl);
};

// Nerd Font (CaskaydiaMono NF) を読み込んでから起動 (xterm のセル幅計測のため)
const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
if (fonts && typeof fonts.load === "function") {
  Promise.race([
    fonts.load('16px "CaskaydiaMono NF"'),
    new Promise((r) => setTimeout(r, 1500)),
  ]).finally(boot);
} else {
  boot();
}
