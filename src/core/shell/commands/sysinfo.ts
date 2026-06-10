import type { Command, ExecContext } from "../types";

interface Proc {
  user: string;
  pid: number;
  ppid: number;
  cpu: number;
  mem: number;
  vsz: number;
  rss: number;
  tty: string;
  stat: string;
  start: string;
  time: string;
  cmd: string;
}

const PROCS: Proc[] = [
  { user: "root", pid: 1, ppid: 0, cpu: 0.0, mem: 0.1, vsz: 168944, rss: 11876, tty: "?", stat: "Ss", start: "09:00", time: "0:01", cmd: "/sbin/init" },
  { user: "root", pid: 2, ppid: 0, cpu: 0.0, mem: 0.0, vsz: 0, rss: 0, tty: "?", stat: "S", start: "09:00", time: "0:00", cmd: "[kthreadd]" },
  { user: "root", pid: 412, ppid: 1, cpu: 0.0, mem: 0.2, vsz: 15852, rss: 9472, tty: "?", stat: "Ss", start: "09:00", time: "0:00", cmd: "/usr/sbin/sshd -D" },
  { user: "root", pid: 520, ppid: 1, cpu: 0.0, mem: 0.1, vsz: 8512, rss: 3200, tty: "?", stat: "Ss", start: "09:00", time: "0:00", cmd: "/usr/sbin/cron -f" },
  { user: "www-data", pid: 733, ppid: 1, cpu: 0.1, mem: 0.4, vsz: 57340, rss: 16880, tty: "?", stat: "S", start: "09:01", time: "0:02", cmd: "nginx: worker process" },
  { user: "postgres", pid: 811, ppid: 1, cpu: 0.0, mem: 1.2, vsz: 219000, rss: 49000, tty: "?", stat: "Ss", start: "09:01", time: "0:03", cmd: "postgres: checkpointer" },
  { user: "guest", pid: 1042, ppid: 412, cpu: 0.0, mem: 0.1, vsz: 12784, rss: 5120, tty: "pts/0", stat: "Ss", start: "09:15", time: "0:00", cmd: "-bash" },
  { user: "guest", pid: 1180, ppid: 1042, cpu: 0.0, mem: 0.0, vsz: 11220, rss: 3400, tty: "pts/0", stat: "R+", start: "10:30", time: "0:00", cmd: "ps aux" },
];

function pad(s: string | number, w: number, right = false): string {
  const str = String(s);
  return right ? str.padStart(w) : str.padEnd(w);
}

const ps: Command = {
  name: "ps",
  summary: "プロセス一覧を表示",
  run(ctx) {
    const argstr = ctx.args.slice(1).join(" ");
    const aux = /a/.test(argstr) && /x/.test(argstr);
    const ef = argstr.includes("-e") || argstr.includes("-A");
    if (aux) {
      let out = "USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n";
      for (const p of PROCS) {
        out += `${pad(p.user, 10)} ${pad(p.pid, 5, true)} ${pad(p.cpu.toFixed(1), 4, true)} ${pad(p.mem.toFixed(1), 4, true)} ${pad(p.vsz, 6, true)} ${pad(p.rss, 5, true)} ${pad(p.tty, 8)} ${pad(p.stat, 4)} ${pad(p.start, 5)} ${pad(p.time, 6, true)} ${p.cmd}\n`;
      }
      ctx.out(out);
      return 0;
    }
    if (ef) {
      let out = "UID          PID    PPID  C STIME TTY          TIME CMD\n";
      for (const p of PROCS) {
        out += `${pad(p.user, 8)} ${pad(p.pid, 7, true)} ${pad(p.ppid, 7, true)}  0 ${pad(p.start, 5)} ${pad(p.tty, 8)} ${pad(p.time, 8, true)} ${p.cmd}\n`;
      }
      ctx.out(out);
      return 0;
    }
    let out = "    PID TTY          TIME CMD\n";
    for (const p of PROCS.filter((x) => x.user === ctx.env.user && x.tty !== "?")) {
      out += `${pad(p.pid, 7, true)} ${pad(p.tty, 8)} ${pad(p.time, 8, true)} ${p.cmd.replace(/^-/, "")}\n`;
    }
    ctx.out(out);
    return 0;
  },
};

const top: Command = {
  name: "top",
  summary: "プロセス/リソースのスナップショット",
  run(ctx) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    let out = "";
    out += `top - ${hh}:${mm}:00 up 3:42,  1 user,  load average: 0.08, 0.03, 0.01\n`;
    out += `Tasks: ${PROCS.length} total,   1 running, ${PROCS.length - 1} sleeping,   0 stopped,   0 zombie\n`;
    out += `%Cpu(s):  1.3 us,  0.7 sy,  0.0 ni, 97.8 id,  0.2 wa,  0.0 hi,  0.0 si,  0.0 st\n`;
    out += `MiB Mem :   3936.0 total,   2104.5 free,    812.3 used,   1019.2 buff/cache\n`;
    out += `MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   2873.1 avail Mem\n\n`;
    out += "    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n";
    for (const p of [...PROCS].sort((a, b) => b.cpu - a.cpu)) {
      out += `${pad(p.pid, 7, true)} ${pad(p.user, 9)} 20   0 ${pad(p.vsz, 7, true)} ${pad(p.rss, 6, true)} ${pad(Math.floor(p.rss / 2), 6, true)} ${p.stat[0]} ${pad(p.cpu.toFixed(1), 5, true)} ${pad(p.mem.toFixed(1), 5, true)} ${pad(p.time + ".00", 9, true)} ${p.cmd.split(" ")[0].replace(/^[-/].*\//, "")}\n`;
    }
    ctx.out(out);
    return 0;
  },
};

const kill: Command = {
  name: "kill",
  summary: "プロセスにシグナルを送る",
  run(ctx) {
    const args = ctx.args.slice(1);
    if (args[0] === "-l") {
      ctx.out(" 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 9) SIGKILL\t15) SIGTERM\n");
      return 0;
    }
    const pids = args.filter((a) => /^\d+$/.test(a));
    if (pids.length === 0) {
      ctx.err("kill: usage: kill [-s sigspec | -n signum | -sigspec] pid ...\n");
      return 1;
    }
    let code = 0;
    for (const pid of pids) {
      if (!PROCS.some((p) => p.pid === parseInt(pid, 10))) {
        ctx.err(`bash: kill: (${pid}) - No such process\n`);
        code = 1;
      }
    }
    return code;
  },
};

const killall: Command = {
  name: "killall",
  summary: "名前でプロセスを終了",
  run(ctx) {
    const names = ctx.args.slice(1).filter((a) => !a.startsWith("-"));
    let code = 0;
    for (const n of names) {
      if (!PROCS.some((p) => p.cmd.includes(n))) {
        ctx.err(`${n}: no process found\n`);
        code = 1;
      }
    }
    return code;
  },
};

const jobs: Command = { name: "jobs", summary: "ジョブ一覧 (ジョブ制御なし)", run: () => 0 };
const bg: Command = { name: "bg", summary: "ジョブをバックグラウンドへ", run: (ctx) => { ctx.err("bash: bg: current: no such job\n"); return 1; } };
const fg: Command = { name: "fg", summary: "ジョブをフォアグラウンドへ", run: (ctx) => { ctx.err("bash: fg: current: no such job\n"); return 1; } };

const nice: Command = {
  name: "nice",
  summary: "優先度を指定してコマンド実行",
  run(ctx) {
    const args = ctx.args.slice(1);
    let i = 0;
    if (args[i] === "-n") i += 2;
    else if (args[i]?.startsWith("-n")) i += 1;
    else if (args[i]?.startsWith("-") && /^-\d+$/.test(args[i])) i += 1;
    const cmd = args.slice(i);
    if (cmd.length === 0) {
      ctx.out("0\n");
      return 0;
    }
    const r = ctx.services.runArgv(cmd, ctx.stdin);
    if (r.stderr) ctx.err(r.stderr);
    ctx.out(r.stdout);
    return r.code;
  },
};

const sleepCmd: Command = { name: "sleep", summary: "指定秒待つ (サンドボックスでは即時)", run: () => 0 };

const df: Command = {
  name: "df",
  summary: "ファイルシステムの空き容量",
  run(ctx) {
    const human = ctx.args.includes("-h");
    let out = human
      ? "Filesystem      Size  Used Avail Use% Mounted on\n"
      : "Filesystem     1K-blocks    Used Available Use% Mounted on\n";
    const rows = human
      ? [
          ["/dev/sda1", "20G", "8.4G", "11G", "45%", "/"],
          ["tmpfs", "2.0G", "0", "2.0G", "0%", "/dev/shm"],
          ["tmpfs", "394M", "1.2M", "393M", "1%", "/run"],
          ["/dev/sda2", "50G", "12G", "36G", "25%", "/home"],
        ]
      : [
          ["/dev/sda1", "20480000", "8808038", "11671962", "45%", "/"],
          ["tmpfs", "2015232", "0", "2015232", "0%", "/dev/shm"],
          ["tmpfs", "403046", "1228", "401818", "1%", "/run"],
          ["/dev/sda2", "52428800", "12582912", "39845888", "25%", "/home"],
        ];
    for (const r of rows) {
      out += `${pad(r[0], 14)} ${pad(r[1], 9, true)} ${pad(r[2], 7, true)} ${pad(r[3], 9, true)} ${pad(r[4], 4, true)} ${r[5]}\n`;
    }
    ctx.out(out);
    return 0;
  },
};

const free: Command = {
  name: "free",
  summary: "メモリ使用状況",
  run(ctx) {
    const human = ctx.args.includes("-h") || ctx.args.includes("-m");
    let out = "               total        used        free      shared  buff/cache   available\n";
    if (human) {
      out += "Mem:           3.8Gi       812Mi       2.1Gi        12Mi       1.0Gi       2.8Gi\n";
      out += "Swap:          2.0Gi          0B       2.0Gi\n";
    } else {
      out += "Mem:         4030208      831456     2154496       12544     1044256     2941312\n";
      out += "Swap:        2097152           0     2097152\n";
    }
    ctx.out(out);
    return 0;
  },
};

const uptime: Command = {
  name: "uptime",
  summary: "稼働時間とロードアベレージ",
  run(ctx) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    ctx.out(` ${hh}:${mm}:00 up 3:42,  1 user,  load average: 0.08, 0.03, 0.01\n`);
    return 0;
  },
};

const mount: Command = {
  name: "mount",
  summary: "マウント情報を表示",
  run(ctx) {
    ctx.out(
      [
        "/dev/sda1 on / type ext4 (rw,relatime,errors=remount-ro)",
        "/dev/sda2 on /home type ext4 (rw,relatime)",
        "proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)",
        "sysfs on /sys type sysfs (rw,nosuid,nodev,noexec,relatime)",
        "tmpfs on /run type tmpfs (rw,nosuid,nodev,size=403048k,mode=755)",
        "tmpfs on /dev/shm type tmpfs (rw,nosuid,nodev)",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

const lsblk: Command = {
  name: "lsblk",
  summary: "ブロックデバイス一覧",
  run(ctx) {
    ctx.out(
      [
        "NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS",
        "sda      8:0    0   70G  0 disk",
        "├─sda1   8:1    0   20G  0 part /",
        "└─sda2   8:2    0   50G  0 part /home",
        "sr0     11:0    1 1024M  0 rom",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

const lsof: Command = {
  name: "lsof",
  summary: "オープン中のファイル (簡易)",
  run(ctx) {
    ctx.out(
      [
        "COMMAND  PID  USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
        "sshd     412  root    3u  IPv4  18234      0t0  TCP *:ssh (LISTEN)",
        "nginx    733 www-data 6u  IPv4  18987      0t0  TCP *:http (LISTEN)",
        "bash    1042 guest   cwd   DIR    8,2     4096 1000 /home/guest",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

const dmesg: Command = {
  name: "dmesg",
  summary: "カーネルリングバッファ (簡易)",
  run(ctx) {
    ctx.out(
      [
        "[    0.000000] Linux version 6.1.0-21-amd64 (debian-kernel@lists.debian.org)",
        "[    0.000000] Command line: BOOT_IMAGE=/vmlinuz root=UUID=8f3a-1b2c ro quiet",
        "[    0.345123] systemd[1]: Detected virtualization kvm.",
        "[    1.892340] EXT4-fs (sda1): mounted filesystem with ordered data mode.",
        "[    2.103998] eth0: link up, 1000Mbps, full-duplex",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

const SYSCTL: Record<string, string> = {
  "kernel.hostname": "cli-dojo",
  "kernel.ostype": "Linux",
  "kernel.osrelease": "6.1.0-21-amd64",
  "net.ipv4.ip_forward": "0",
  "vm.swappiness": "60",
  "fs.file-max": "9223372036854775807",
  "kernel.pid_max": "4194304",
};

const sysctl: Command = {
  name: "sysctl",
  summary: "カーネルパラメータを表示/設定",
  run(ctx) {
    const args = ctx.args.slice(1);
    if (args.includes("-a") || args.includes("-A")) {
      let out = "";
      for (const [k, v] of Object.entries(SYSCTL)) out += `${k} = ${v}\n`;
      ctx.out(out);
      return 0;
    }
    let code = 0;
    for (const a of args) {
      if (a.startsWith("-")) continue;
      const key = a.includes("=") ? a.split("=")[0] : a;
      if (key in SYSCTL) ctx.out(`${key} = ${a.includes("=") ? a.split("=")[1] : SYSCTL[key]}\n`);
      else {
        ctx.err(`sysctl: cannot stat /proc/sys/${key.replace(/\./g, "/")}: No such file or directory\n`);
        code = 1;
      }
    }
    return code;
  },
};

const lscpu: Command = {
  name: "lscpu",
  summary: "CPU 情報",
  run(ctx) {
    ctx.out(
      [
        "Architecture:            x86_64",
        "  CPU op-mode(s):        32-bit, 64-bit",
        "  Byte Order:            Little Endian",
        "CPU(s):                  4",
        "  On-line CPU(s) list:   0-3",
        "Vendor ID:               GenuineIntel",
        "  Model name:            Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz",
        "  CPU MHz:               2592.000",
        "Virtualization:          VT-x",
        "Caches (sum of all):     ",
        "  L1d:                   128 KiB",
        "  L2:                    1 MiB",
        "  L3:                    12 MiB",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

const who: Command = {
  name: "who",
  summary: "ログイン中のユーザー",
  run(ctx) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    ctx.out(`${ctx.env.user}   pts/0        2026-06-03 ${hh}:${mm} (192.168.1.50)\n`);
    return 0;
  },
};

const w: Command = {
  name: "w",
  summary: "ログインユーザーと操作内容",
  run(ctx) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    ctx.out(
      ` ${hh}:${mm}:00 up 3:42,  1 user,  load average: 0.08, 0.03, 0.01\n` +
        "USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n" +
        `${pad(ctx.env.user, 8)} pts/0    192.168.1.50     09:15    0.00s  0.10s  0.00s w\n`,
    );
    return 0;
  },
};

const pgrep: Command = {
  name: "pgrep",
  summary: "名前でプロセスを探して PID を表示",
  run(ctx) {
    const args = ctx.args.slice(1);
    const full = args.includes("-f");
    const listName = args.includes("-l");
    const pattern = args.filter((a) => !a.startsWith("-"))[0];
    if (!pattern) {
      ctx.err("pgrep: パターンを指定してください (例: pgrep nginx)\n");
      return 2;
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      ctx.err(`pgrep: 正規表現エラー: ${pattern}\n`);
      return 2;
    }
    let hit = false;
    for (const p of PROCS) {
      const name = p.cmd.replace(/^-/, "").split(/[\s:]/)[0].split("/").pop() ?? "";
      if (full ? re.test(p.cmd) : re.test(name)) {
        ctx.out(listName ? `${p.pid} ${name}\n` : `${p.pid}\n`);
        hit = true;
      }
    }
    return hit ? 0 : 1;
  },
};

const pkill: Command = {
  name: "pkill",
  summary: "名前でプロセスへシグナル送信 (模擬)",
  run(ctx) {
    const pattern = ctx.args.slice(1).filter((a) => !a.startsWith("-"))[0];
    if (!pattern) {
      ctx.err("pkill: パターンを指定してください\n");
      return 2;
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      ctx.err(`pkill: 正規表現エラー: ${pattern}\n`);
      return 2;
    }
    const hits = PROCS.filter((p) => re.test(p.cmd.replace(/^-/, "").split(/[\s:]/)[0].split("/").pop() ?? ""));
    if (hits.length === 0) return 1;
    // 模擬: 実際には消さず、何が起きるかを伝える
    for (const p of hits) ctx.out(`pkill: ${p.pid} (${p.cmd}) に SIGTERM を送信 (模擬)\n`);
    return 0;
  },
};

export const sysinfoCommands: Command[] = [
  ps, top, kill, killall, jobs, bg, fg, nice, sleepCmd,
  df, free, uptime, mount, lsblk, lsof, dmesg, sysctl, lscpu, who, w,
  pgrep, pkill,
];
