import "./styles/main.css";
import "./styles/chrome.css";
import "./styles/terminal.css";
import "./styles/panes.css";
import "./styles/lessons.css";
import { App } from "./app/App";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");

new App().mount(appEl);
