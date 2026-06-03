import { type VFS, type VNode } from "../vfs/VFS";

export function hasGlobChars(s: string): boolean {
  return /[*?[]/.test(s);
}

function matchClose(comp: string, open: number): number {
  // open は '[' の位置。対応する ']' を探す ([!...] や先頭 ] に対応)
  let j = open + 1;
  if (comp[j] === "!" || comp[j] === "^") j++;
  if (comp[j] === "]") j++;
  while (j < comp.length && comp[j] !== "]") j++;
  return j < comp.length ? j : -1;
}

function globToRegex(comp: string): RegExp {
  let re = "^";
  for (let i = 0; i < comp.length; i++) {
    const c = comp[i];
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const close = matchClose(comp, i);
      if (close < 0) {
        re += "\\[";
        continue;
      }
      let inner = comp.slice(i + 1, close);
      let neg = false;
      if (inner.startsWith("!") || inner.startsWith("^")) {
        neg = true;
        inner = inner.slice(1);
      }
      inner = inner.replace(/\\/g, "\\\\");
      re += "[" + (neg ? "^" : "") + inner + "]";
      i = close;
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  re += "$";
  return new RegExp(re);
}

interface Item {
  node: VNode;
  path: string;
}

/** glob パターンをファイルシステムに対して展開。マッチ無しは null/空配列。 */
export function globExpand(vfs: VFS, cwd: string, pattern: string): string[] | null {
  if (!hasGlobChars(pattern)) return null;
  const isAbs = pattern.startsWith("/");
  const comps = pattern.split("/");
  const startNode = isAbs ? vfs.root : vfs.lookup(cwd, { followFinal: true });
  if (!startNode) return [];

  let frontier: Item[] = [{ node: startNode, path: "" }];

  for (const comp of comps) {
    if (comp === "") continue;
    const next: Item[] = [];
    const glob = hasGlobChars(comp);
    const re = glob ? globToRegex(comp) : null;
    for (const item of frontier) {
      let dir = item.node;
      if (dir.type === "symlink") {
        const r = vfs.stat(vfs.pathOf(dir));
        if (!r) continue;
        dir = r;
      }
      if (dir.type !== "dir" || !dir.children) continue;
      if (re) {
        const names = [...dir.children.keys()].sort();
        for (const name of names) {
          if (name.startsWith(".") && !comp.startsWith(".")) continue;
          if (re.test(name)) {
            next.push({ node: dir.children.get(name)!, path: item.path + "/" + name });
          }
        }
      } else {
        const child = dir.children.get(comp);
        if (child) next.push({ node: child, path: item.path + "/" + comp });
      }
    }
    frontier = next;
  }

  const results = frontier.map((f) => (isAbs ? f.path : f.path.replace(/^\//, "")));
  results.sort();
  return results;
}
