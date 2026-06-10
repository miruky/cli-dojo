import type { Command } from "../types";
import { filesystemCommands } from "./filesystem";
import { textCommands } from "./text";
import { builtinCommands } from "./builtins";
import { grep } from "./grep";
import { filterCommands } from "./filters";
import { sed } from "./sed";
import { awk } from "./awk";
import { find } from "./find";
import { textMoreCommands } from "./textmore";
import { permissionCommands } from "./permissions";
import { sysinfoCommands } from "./sysinfo";
import { hashingCommands } from "./hashing";
import { archiveCommands } from "./archives";
import { simCommands } from "./sims";
import { containerCommands } from "./containers";
import { scriptingCommands } from "./scripting";
import { launcherCommands } from "./launchers";
import { pagerCommands } from "./pagers";
import { modernCommands } from "./modern";
import { gitCommands } from "./git";
import { funCommands } from "./fun";
import { extraCommands } from "./extras";

const egrep: Command = { name: "egrep", summary: "grep -E と同じ", run: grep.run };
const fgrep: Command = { name: "fgrep", summary: "grep -F と同じ", run: grep.run };

export const allCommands: Command[] = [
  ...filesystemCommands,
  ...textCommands,
  ...builtinCommands,
  grep,
  egrep,
  fgrep,
  ...filterCommands,
  sed,
  awk,
  find,
  ...textMoreCommands,
  ...permissionCommands,
  ...sysinfoCommands,
  ...hashingCommands,
  ...archiveCommands,
  ...simCommands,
  ...containerCommands,
  ...scriptingCommands,
  ...launcherCommands,
  ...pagerCommands,
  ...modernCommands,
  ...gitCommands,
  ...funCommands,
  ...extraCommands,
];

export function buildRegistry(): Map<string, Command> {
  const m = new Map<string, Command>();
  for (const c of allCommands) m.set(c.name, c);
  return m;
}
