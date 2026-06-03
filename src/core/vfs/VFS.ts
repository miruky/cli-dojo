/** ブラウザ内の仮想ファイルシステム。ディレクトリ/ファイル/シンボリックリンクを木構造で保持する。 */
export type FileType = "file" | "dir" | "symlink";

export interface VNode {
  type: FileType;
  name: string;
  /** パーミッションビット (例: 0o644)。タイプは type で別管理。 */
  mode: number;
  owner: string;
  group: string;
  mtime: Date;
  /** file の内容 */
  content: string;
  /** symlink のターゲット */
  target: string;
  /** dir の子 */
  children: Map<string, VNode> | null;
  parent: VNode | null;
}

export interface ResolveOpts {
  followFinal?: boolean;
}

let counter = 0;

export class VFS {
  readonly root: VNode;

  constructor() {
    this.root = {
      type: "dir",
      name: "",
      mode: 0o755,
      owner: "root",
      group: "root",
      mtime: new Date(),
      content: "",
      target: "",
      children: new Map(),
      parent: null,
    };
  }

  // ---- パス操作 ----
  static normalize(path: string): string {
    const isAbs = path.startsWith("/");
    const out: string[] = [];
    for (const seg of path.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        if (out.length && out[out.length - 1] !== "..") out.pop();
        else if (!isAbs) out.push("..");
      } else out.push(seg);
    }
    const joined = out.join("/");
    return isAbs ? "/" + joined : joined || ".";
  }

  static dirname(path: string): string {
    const norm = VFS.normalize(path);
    const idx = norm.lastIndexOf("/");
    if (idx < 0) return ".";
    if (idx === 0) return "/";
    return norm.slice(0, idx);
  }

  static basename(path: string): string {
    const norm = VFS.normalize(path);
    const idx = norm.lastIndexOf("/");
    return norm.slice(idx + 1);
  }

  resolve(cwd: string, path: string): string {
    if (path.startsWith("/")) return VFS.normalize(path);
    const base = cwd.endsWith("/") ? cwd : cwd + "/";
    return VFS.normalize(base + path);
  }

  pathOf(node: VNode): string {
    const parts: string[] = [];
    let n: VNode | null = node;
    while (n && n.parent) {
      parts.unshift(n.name);
      n = n.parent;
    }
    return "/" + parts.join("/");
  }

  // ---- 探索 ----
  lookup(absPath: string, opts: ResolveOpts = {}): VNode | null {
    return this.walk(absPath, opts.followFinal ?? true, 0);
  }

  lstat(absPath: string): VNode | null {
    return this.walk(absPath, false, 0);
  }

  stat(absPath: string): VNode | null {
    return this.walk(absPath, true, 0);
  }

  exists(absPath: string): boolean {
    return this.walk(absPath, false, 0) != null;
  }

  private walk(absPath: string, followFinal: boolean, depth: number): VNode | null {
    if (depth > 40) return null;
    const parts = absPath.split("/").filter((s) => s.length > 0);
    let node: VNode = this.root;
    for (let i = 0; i < parts.length; i++) {
      if (node.type === "symlink") {
        const t = this.resolveSymlink(node, depth);
        if (!t) return null;
        node = t;
      }
      if (node.type !== "dir" || !node.children) return null;
      const child = node.children.get(parts[i]);
      if (!child) return null;
      node = child;
      const isLast = i === parts.length - 1;
      if (node.type === "symlink" && (!isLast || followFinal)) {
        const t = this.resolveSymlink(node, depth);
        if (!t) return null;
        node = t;
      }
    }
    return node;
  }

  private resolveSymlink(link: VNode, depth: number): VNode | null {
    const parentPath = link.parent ? this.pathOf(link.parent) : "/";
    const targetAbs = this.resolve(parentPath, link.target);
    return this.walk(targetAbs, true, depth + 1);
  }

  lookupParent(absPath: string): { parent: VNode | null; base: string } {
    const norm = VFS.normalize(absPath);
    const idx = norm.lastIndexOf("/");
    const parentPath = idx <= 0 ? "/" : norm.slice(0, idx);
    const base = norm.slice(idx + 1);
    const parent = this.lookup(parentPath, { followFinal: true });
    return { parent: parent && parent.type === "dir" ? parent : null, base };
  }

  // ---- 生成/変更 ----
  private mk(
    type: FileType,
    name: string,
    parent: VNode,
    extra: Partial<VNode> = {},
  ): VNode {
    counter++;
    const node: VNode = {
      type,
      name,
      mode: type === "dir" ? 0o755 : type === "symlink" ? 0o777 : 0o644,
      owner: parent.owner,
      group: parent.group,
      mtime: new Date(),
      content: "",
      target: "",
      children: type === "dir" ? new Map() : null,
      parent,
      ...extra,
    };
    return node;
  }

  link(parent: VNode, name: string, node: VNode): void {
    if (!parent.children) return;
    node.name = name;
    node.parent = parent;
    parent.children.set(name, node);
    parent.mtime = new Date();
  }

  unlink(node: VNode): void {
    const p = node.parent;
    if (p && p.children) {
      p.children.delete(node.name);
      p.mtime = new Date();
    }
    node.parent = null;
  }

  createFile(absPath: string, content = "", mode = 0o644): VNode | null {
    const { parent, base } = this.lookupParent(absPath);
    if (!parent || !parent.children || !base) return null;
    const node = this.mk("file", base, parent, { content, mode });
    this.link(parent, base, node);
    return node;
  }

  createDir(absPath: string, mode = 0o755): VNode | null {
    const { parent, base } = this.lookupParent(absPath);
    if (!parent || !parent.children || !base) return null;
    if (parent.children.has(base)) return null;
    const node = this.mk("dir", base, parent, { mode });
    this.link(parent, base, node);
    return node;
  }

  createSymlink(absPath: string, target: string): VNode | null {
    const { parent, base } = this.lookupParent(absPath);
    if (!parent || !parent.children || !base) return null;
    if (parent.children.has(base)) return null;
    const node = this.mk("symlink", base, parent, { target });
    this.link(parent, base, node);
    return node;
  }

  /** mkdir -p 相当。途中ディレクトリを作りつつ末端まで。 */
  mkdirp(absPath: string): VNode | null {
    const parts = absPath.split("/").filter((s) => s.length > 0);
    let cur = this.root;
    let path = "";
    for (const part of parts) {
      path += "/" + part;
      let next = cur.children?.get(part) ?? null;
      if (next && next.type === "symlink") next = this.stat(path);
      if (!next) {
        const made = this.createDir(path);
        if (!made) return null;
        next = made;
      }
      if (!next || next.type !== "dir") return null;
      cur = next;
    }
    return cur;
  }
}
