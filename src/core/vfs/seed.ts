import { VFS, type VNode } from "./VFS";

/** 初期ファイルシステムを構築する。コマンドが「実際に動く」ための土台。 */
interface FileOpts {
  mode?: number;
  owner?: string;
  group?: string;
  mtime?: Date;
}

function d(iso: string): Date {
  return new Date(iso);
}

export function buildInitialFS(): VFS {
  const vfs = new VFS();

  const dir = (path: string, opts: FileOpts = {}): VNode | null => {
    const n = vfs.mkdirp(path);
    if (n) applyOpts(n, opts);
    return n;
  };
  const file = (path: string, content: string, opts: FileOpts = {}): VNode | null => {
    const n = vfs.createFile(path, content, opts.mode ?? 0o644);
    if (n) applyOpts(n, opts);
    return n;
  };
  const link = (path: string, target: string, opts: FileOpts = {}): VNode | null => {
    const n = vfs.createSymlink(path, target);
    if (n) applyOpts(n, opts);
    return n;
  };

  const sys: FileOpts = { owner: "root", group: "root", mtime: d("2025-09-01T09:00:00") };
  const me = (extra: FileOpts = {}): FileOpts => ({
    owner: "guest",
    group: "guest",
    mtime: d("2026-05-20T14:30:00"),
    ...extra,
  });

  // ===== ルート構造 =====
  for (const p of ["/bin", "/sbin", "/usr/bin", "/usr/sbin", "/usr/local/bin", "/lib", "/opt", "/srv", "/mnt", "/root", "/boot"]) {
    dir(p, sys);
  }
  dir("/tmp", { owner: "root", group: "root", mode: 0o1777 });
  dir("/var/log", sys);
  dir("/var/www/html", sys);
  dir("/etc", sys);

  // ===== /etc =====
  file(
    "/etc/passwd",
    [
      "root:x:0:0:root:/root:/bin/bash",
      "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
      "bin:x:2:2:bin:/bin:/usr/sbin/nologin",
      "sys:x:3:3:sys:/dev:/usr/sbin/nologin",
      "sync:x:4:65534:sync:/bin:/bin/sync",
      "www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin",
      "sshd:x:110:65534::/run/sshd:/usr/sbin/nologin",
      "postgres:x:111:117:PostgreSQL administrator:/var/lib/postgresql:/bin/bash",
      "guest:x:1000:1000:Guest User,,,:/home/guest:/bin/bash",
      "",
    ].join("\n"),
    sys,
  );
  file(
    "/etc/group",
    [
      "root:x:0:",
      "sudo:x:27:guest",
      "www-data:x:33:",
      "ssh:x:114:",
      "guest:x:1000:",
      "docker:x:998:guest",
      "",
    ].join("\n"),
    sys,
  );
  file("/etc/hostname", "cli-dojo\n", sys);
  file(
    "/etc/hosts",
    [
      "127.0.0.1\tlocalhost",
      "127.0.1.1\tcli-dojo",
      "::1\tlocalhost ip6-localhost ip6-loopback",
      "192.168.1.10\tweb01.example.com web01",
      "192.168.1.11\tdb01.example.com db01",
      "",
    ].join("\n"),
    sys,
  );
  file(
    "/etc/os-release",
    [
      'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"',
      'NAME="Debian GNU/Linux"',
      'VERSION_ID="12"',
      'VERSION="12 (bookworm)"',
      "VERSION_CODENAME=bookworm",
      "ID=debian",
      'HOME_URL="https://www.debian.org/"',
      "",
    ].join("\n"),
    sys,
  );
  file("/etc/shells", ["/bin/sh", "/bin/bash", "/usr/bin/zsh", "/usr/bin/fish", ""].join("\n"), sys);
  file(
    "/etc/fstab",
    [
      "# <file system> <mount point> <type> <options> <dump> <pass>",
      "UUID=8f3a-1b2c /            ext4   errors=remount-ro 0 1",
      "UUID=2d4e-9a0f /home        ext4   defaults          0 2",
      "tmpfs          /tmp         tmpfs  defaults,noatime  0 0",
      "",
    ].join("\n"),
    sys,
  );
  file(
    "/etc/resolv.conf",
    ["nameserver 192.168.1.1", "nameserver 8.8.8.8", "search example.com", ""].join("\n"),
    sys,
  );
  link("/etc/os-release.link", "os-release", sys);

  // ===== /var/log =====
  file(
    "/var/log/syslog",
    [
      "May 20 09:15:01 cli-dojo systemd[1]: Started Daily apt download activities.",
      "May 20 09:17:23 cli-dojo sshd[2042]: Accepted publickey for guest from 192.168.1.50 port 51234 ssh2",
      "May 20 09:18:44 cli-dojo kernel: [12345.6789] usb 1-1: new high-speed USB device",
      "May 20 09:20:01 cli-dojo CRON[2101]: (root) CMD (command -v debian-sa1 > /dev/null)",
      "May 20 09:22:13 cli-dojo systemd[1]: Starting Clean php session files...",
      "May 20 09:25:31 cli-dojo sshd[2210]: Failed password for invalid user admin from 203.0.113.7 port 40222 ssh2",
      "May 20 09:25:35 cli-dojo sshd[2210]: Failed password for invalid user admin from 203.0.113.7 port 40222 ssh2",
      "May 20 09:30:02 cli-dojo systemd[1]: Finished Daily apt upgrade and clean activities.",
      "",
    ].join("\n"),
    sys,
  );
  file(
    "/var/log/auth.log",
    [
      "May 20 09:17:23 cli-dojo sshd[2042]: Accepted publickey for guest from 192.168.1.50 port 51234 ssh2",
      "May 20 09:25:31 cli-dojo sshd[2210]: Failed password for invalid user admin from 203.0.113.7 port 40222 ssh2",
      "May 20 09:25:33 cli-dojo sshd[2210]: Failed password for invalid user root from 203.0.113.7 port 40222 ssh2",
      "May 20 10:02:11 cli-dojo sudo:   guest : TTY=pts/0 ; PWD=/home/guest ; USER=root ; COMMAND=/usr/bin/apt update",
      "May 20 10:05:42 cli-dojo sshd[2333]: Failed password for invalid user test from 198.51.100.22 port 33890 ssh2",
      "",
    ].join("\n"),
    sys,
  );

  // ===== /var/www =====
  file(
    "/var/www/html/index.html",
    ["<!doctype html>", "<html><head><title>It works!</title></head>", "<body><h1>It works!</h1></body></html>", ""].join("\n"),
    { ...sys, owner: "www-data", group: "www-data" },
  );

  // ===== /home/guest =====
  dir("/home/guest", me({ mode: 0o755 }));
  dir("/home/guest/.config", me());
  dir("/home/guest/.ssh", me({ mode: 0o700 }));
  dir("/home/guest/.local/bin", me());

  file(
    "/home/guest/.bashrc",
    [
      "# ~/.bashrc: 対話シェルで実行される",
      "case $- in *i*) ;; *) return;; esac",
      "",
      "HISTSIZE=1000",
      "HISTFILESIZE=2000",
      "shopt -s histappend checkwinsize",
      "",
      "alias ll='ls -alF'",
      "alias la='ls -A'",
      "alias l='ls -CF'",
      "alias grep='grep --color=auto'",
      "",
      "export PS1='\\u@\\h:\\w\\$ '",
      "",
    ].join("\n"),
    me({ mtime: d("2026-04-02T08:00:00") }),
  );
  file(
    "/home/guest/.profile",
    [
      "# ~/.profile: ログインシェルで実行される",
      'if [ -n "$BASH_VERSION" ]; then',
      '    [ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"',
      "fi",
      'PATH="$HOME/.local/bin:$PATH"',
      "",
    ].join("\n"),
    me({ mtime: d("2026-04-02T08:00:00") }),
  );
  file(
    "/home/guest/.vimrc",
    ["set number", "set expandtab shiftwidth=2 tabstop=2", "syntax on", "set hlsearch incsearch", ""].join("\n"),
    me(),
  );
  file(
    "/home/guest/.gitconfig",
    ["[user]", "\tname = Guest User", "\temail = guest@example.com", "[init]", "\tdefaultBranch = main", ""].join("\n"),
    me(),
  );

  file(
    "/home/guest/README.txt",
    [
      "cli-dojo へようこそ！",
      "",
      "ここはブラウザ内の本物のシェルです。実際にコマンドが動きます。",
      "まずは次を試してみましょう:",
      "  ls -la           ファイル一覧 (詳細)",
      "  cd projects      ディレクトリ移動",
      "  cat notes.md     ファイルの中身を表示",
      "  grep -n TODO *   TODO を含む行を検索",
      "",
      "困ったら help と入力してください。",
      "",
    ].join("\n"),
    me({ mtime: d("2026-05-28T19:10:00") }),
  );
  file(
    "/home/guest/notes.md",
    [
      "# 作業メモ",
      "",
      "## やること",
      "- [ ] TODO: ログ集計スクリプトを書く",
      "- [x] バックアップ設定",
      "- [ ] TODO: cron を見直す",
      "",
      "## メモ",
      "正規表現で電話番号 090-1234-5678 を抽出したい。",
      "メールは guest@example.com と admin@example.org。",
      "",
    ].join("\n"),
    me({ mtime: d("2026-05-30T11:05:00") }),
  );
  file(
    "/home/guest/todo.txt",
    [
      "TODO buy milk",
      "DONE write report",
      "TODO call alice",
      "TODO review PR #42",
      "DONE deploy v1.2.0",
      "",
    ].join("\n"),
    me({ mtime: d("2026-06-01T07:45:00") }),
  );

  // ----- projects -----
  dir("/home/guest/projects", me());
  file(
    "/home/guest/projects/hello.sh",
    ["#!/bin/bash", 'echo "Hello, $USER!"', 'for i in 1 2 3; do echo "count $i"; done', ""].join("\n"),
    me({ mode: 0o755, mtime: d("2026-05-15T10:00:00") }),
  );
  file(
    "/home/guest/projects/app.py",
    [
      "#!/usr/bin/env python3",
      "import sys",
      "",
      "def main():",
      '    print("hello from python")',
      "    return 0",
      "",
      'if __name__ == "__main__":',
      "    sys.exit(main())",
      "",
    ].join("\n"),
    me({ mode: 0o755, mtime: d("2026-05-16T16:20:00") }),
  );
  file(
    "/home/guest/projects/server.js",
    [
      "const http = require('http');",
      "const server = http.createServer((req, res) => {",
      "  res.end('ok\\n');",
      "});",
      "server.listen(3000);",
      "",
    ].join("\n"),
    me({ mtime: d("2026-05-18T12:00:00") }),
  );
  file(
    "/home/guest/projects/Makefile",
    ["build:", "\tgcc -O2 -o app main.c", "", "clean:", "\trm -f app *.o", ""].join("\n"),
    me({ mtime: d("2026-05-10T09:00:00") }),
  );
  file("/home/guest/projects/.gitignore", ["node_modules/", "*.log", "*.o", "dist/", ""].join("\n"), me());
  // git リポジトリ (プロンプトの git セグメント用)
  dir("/home/guest/projects/.git/refs/heads", me());
  file("/home/guest/projects/.git/HEAD", "ref: refs/heads/main\n", me());
  file(
    "/home/guest/projects/.git/config",
    ["[core]", "\trepositoryformatversion = 0", '[remote "origin"]', "\turl = git@github.com:guest/app.git", ""].join("\n"),
    me(),
  );
  file("/home/guest/projects/.git/refs/heads/main", "a1b2c3d4e5f6a7b8c9d0\n", me());

  // ----- docs -----
  dir("/home/guest/docs", me());
  file(
    "/home/guest/docs/guide.md",
    [
      "# Linux 入門ガイド",
      "",
      "ファイル操作: ls, cd, pwd, cp, mv, rm, mkdir",
      "テキスト処理: cat, grep, sed, awk, sort, uniq",
      "権限: chmod, chown, umask",
      "",
    ].join("\n"),
    me(),
  );

  // ----- data (集計・正規表現の練習用) -----
  dir("/home/guest/data", me());
  file(
    "/home/guest/data/numbers.txt",
    ["42", "7", "128", "3", "99", "15", "8", "42", "256", "1", "73", "42", ""].join("\n"),
    me(),
  );
  file(
    "/home/guest/data/fruits.txt",
    ["apple", "banana", "cherry", "apple", "date", "banana", "elderberry", "apple", "fig", ""].join("\n"),
    me(),
  );
  file(
    "/home/guest/data/scores.csv",
    [
      "name,subject,score",
      "alice,math,92",
      "bob,math,78",
      "carol,math,85",
      "alice,english,88",
      "bob,english,95",
      "carol,english,73",
      "dave,math,64",
      "dave,english,80",
      "",
    ].join("\n"),
    me(),
  );
  file(
    "/home/guest/data/users.csv",
    [
      "id,name,email,age",
      "1,Alice,alice@example.com,30",
      "2,Bob,bob@example.org,25",
      "3,Carol,carol@example.com,35",
      "4,Dave,dave@test.co.jp,28",
      "",
    ].join("\n"),
    me(),
  );
  file(
    "/home/guest/data/users.json",
    JSON.stringify(
      [
        { id: 1, name: "Alice", email: "alice@example.com", age: 30, langs: ["go", "rust"] },
        { id: 2, name: "Bob", email: "bob@example.org", age: 25, langs: ["python"] },
        { id: 3, name: "Carol", email: "carol@example.com", age: 35, langs: ["typescript", "elixir"] },
        { id: 4, name: "Dave", email: "dave@test.co.jp", age: 28, langs: [] },
      ],
      null,
      2,
    ) + "\n",
    me(),
  );
  file(
    "/home/guest/data/access.log",
    [
      '192.168.1.50 - - [20/May/2026:09:17:23 +0900] "GET /index.html HTTP/1.1" 200 1043',
      '192.168.1.50 - - [20/May/2026:09:17:25 +0900] "GET /style.css HTTP/1.1" 200 512',
      '203.0.113.7 - - [20/May/2026:09:25:31 +0900] "POST /login HTTP/1.1" 401 0',
      '203.0.113.7 - - [20/May/2026:09:25:35 +0900] "POST /login HTTP/1.1" 401 0',
      '198.51.100.22 - - [20/May/2026:10:05:42 +0900] "GET /admin HTTP/1.1" 403 287',
      '192.168.1.51 - - [20/May/2026:10:11:09 +0900] "GET /api/users HTTP/1.1" 200 2048',
      '192.168.1.51 - - [20/May/2026:10:11:10 +0900] "GET /favicon.ico HTTP/1.1" 404 153',
      '10.0.0.5 - - [20/May/2026:11:02:55 +0900] "GET /index.html HTTP/1.1" 200 1043',
      "",
    ].join("\n"),
    me(),
  );
  file(
    "/home/guest/data/words.txt",
    [
      "color colour",
      "organize organise",
      "grey gray",
      "centre center",
      "foobar foo bar",
      "192.168.0.1 not-an-ip 256.1.1.1",
      "tel: 090-1234-5678, 03-1234-5678",
      "",
    ].join("\n"),
    me(),
  );

  // ----- logs -----
  dir("/home/guest/logs", me());
  file(
    "/home/guest/logs/app.log",
    [
      "2026-05-20 09:00:01 INFO  starting application",
      "2026-05-20 09:00:02 DEBUG config loaded from /etc/app.conf",
      "2026-05-20 09:01:15 WARN  cache miss for key=user:42",
      "2026-05-20 09:02:33 ERROR failed to connect to db: timeout",
      "2026-05-20 09:02:34 INFO  retrying connection (1/3)",
      "2026-05-20 09:02:36 ERROR failed to connect to db: timeout",
      "2026-05-20 09:02:40 INFO  connection established",
      "2026-05-20 09:10:00 INFO  request id=abc123 path=/api/users status=200",
      "",
    ].join("\n"),
    me({ mtime: d("2026-06-02T09:10:00") }),
  );

  dir("/home/guest/tmp", me());

  // 末尾: cwd の所有者などを整える
  return vfs;
}

function applyOpts(node: VNode, opts: FileOpts): void {
  if (opts.mode != null) node.mode = opts.mode;
  if (opts.owner) node.owner = opts.owner;
  if (opts.group) node.group = opts.group;
  if (opts.mtime) node.mtime = opts.mtime;
}
