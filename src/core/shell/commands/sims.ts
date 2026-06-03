import type { Command, ExecContext } from "../types";
import { bytesOf, sha256 } from "../crypto";

const text = (s: string): Command["run"] => (ctx) => {
  ctx.out(s.endsWith("\n") ? s : s + "\n");
  return 0;
};

// ===== ネットワーク =====
const ip: Command = {
  name: "ip",
  summary: "ネットワーク設定 (ip a / ip route)",
  run(ctx) {
    const sub = ctx.args[1] ?? "";
    if (sub.startsWith("r")) {
      ctx.out(
        [
          "default via 192.168.1.1 dev eth0 proto dhcp metric 100",
          "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.50 metric 100",
          "",
        ].join("\n"),
      );
      return 0;
    }
    ctx.out(
      [
        "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000",
        "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
        "    inet 127.0.0.1/8 scope host lo",
        "    inet6 ::1/128 scope host",
        "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000",
        "    link/ether 52:54:00:a1:b2:c3 brd ff:ff:ff:ff:ff:ff",
        "    inet 192.168.1.50/24 brd 192.168.1.255 scope global dynamic eth0",
        "    inet6 fe80::5054:ff:fea1:b2c3/64 scope link",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

const ifconfig: Command = {
  name: "ifconfig",
  summary: "ネットワークインターフェース情報",
  run: text(
    [
      "eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500",
      "        inet 192.168.1.50  netmask 255.255.255.0  broadcast 192.168.1.255",
      "        inet6 fe80::5054:ff:fea1:b2c3  prefixlen 64  scopeid 0x20<link>",
      "        ether 52:54:00:a1:b2:c3  txqueuelen 1000  (Ethernet)",
      "        RX packets 184273  bytes 218374651 (208.2 MiB)",
      "        TX packets 98211  bytes 12837465 (12.2 MiB)",
      "",
      "lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536",
      "        inet 127.0.0.1  netmask 255.0.0.0",
      "        loop  txqueuelen 1000  (Local Loopback)",
    ].join("\n"),
  ),
};

const ss: Command = {
  name: "ss",
  summary: "ソケット統計",
  run: text(
    [
      "Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      "tcp   LISTEN 0      128          0.0.0.0:ssh        0.0.0.0:*",
      "tcp   LISTEN 0      511          0.0.0.0:http       0.0.0.0:*",
      "tcp   LISTEN 0      244        127.0.0.1:postgresql 0.0.0.0:*",
      "tcp   ESTAB  0      0       192.168.1.50:ssh   192.168.1.50:51234",
    ].join("\n"),
  ),
};

const netstat: Command = {
  name: "netstat",
  summary: "ネットワーク接続/ポート",
  run: text(
    [
      "Active Internet connections (servers and established)",
      "Proto Recv-Q Send-Q Local Address           Foreign Address         State",
      "tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN",
      "tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN",
      "tcp        0      0 192.168.1.50:22         192.168.1.50:51234      ESTABLISHED",
    ].join("\n"),
  ),
};

const ping: Command = {
  name: "ping",
  summary: "到達性を確認 (模擬)",
  run(ctx) {
    const host = ctx.args.slice(1).filter((a) => !a.startsWith("-")).pop() ?? "localhost";
    const ipaddr = host === "localhost" ? "127.0.0.1" : "93.184.216.34";
    let out = `PING ${host} (${ipaddr}) 56(84) bytes of data.\n`;
    for (let i = 1; i <= 4; i++) {
      out += `64 bytes from ${ipaddr}: icmp_seq=${i} ttl=56 time=${(10 + Math.random() * 6).toFixed(1)} ms\n`;
    }
    out += `\n--- ${host} ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss, time 3004ms\nrtt min/avg/max/mdev = 10.1/12.4/14.8/1.2 ms\n`;
    ctx.out(out);
    return 0;
  },
};

const curl: Command = {
  name: "curl",
  summary: "URL を取得 (模擬)",
  run(ctx) {
    const args = ctx.args.slice(1);
    const url = args.filter((a) => !a.startsWith("-")).pop() ?? "";
    if (/ifconfig|ipify|myip/.test(url)) {
      ctx.out("203.0.113.50\n");
      return 0;
    }
    if (args.includes("-I")) {
      ctx.out("HTTP/2 200\ncontent-type: text/html; charset=UTF-8\nserver: nginx\ncontent-length: 1256\n\n");
      return 0;
    }
    ctx.out("<!doctype html>\n<html><head><title>Example Domain</title></head>\n<body><h1>Example Domain</h1><p>This domain is for use in illustrative examples.</p></body></html>\n");
    return 0;
  },
};

const wget: Command = {
  name: "wget",
  summary: "ファイルをダウンロード (模擬)",
  run(ctx) {
    const url = ctx.args.slice(1).filter((a) => !a.startsWith("-")).pop() ?? "";
    const name = url.split("/").pop() || "index.html";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    ctx.err(
      `--${now}--  ${url}\nResolving host... 93.184.216.34\nConnecting... connected.\nHTTP request sent, awaiting response... 200 OK\nLength: 1256 (1.2K) [text/html]\nSaving to: '${name}'\n\n${name}  100%[===================>]   1.23K  --.-KB/s    in 0s\n\n${now} (12.3 MB/s) - '${name}' saved [1256/1256]\n`,
    );
    ctx.vfs.createFile(ctx.resolve(name), "<!doctype html>\n<html><body><h1>Example Domain</h1></body></html>\n");
    return 0;
  },
};

const dig: Command = {
  name: "dig",
  summary: "DNS 問い合わせ (模擬)",
  run(ctx) {
    const host = ctx.args.slice(1).filter((a) => !a.startsWith("-") && !a.startsWith("@")).pop() ?? "example.com";
    ctx.out(
      [
        "; <<>> DiG 9.18.24 <<>> " + host,
        ";; global options: +cmd",
        ";; Got answer:",
        ";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345",
        "",
        ";; QUESTION SECTION:",
        `;${host}.\t\t\tIN\tA`,
        "",
        ";; ANSWER SECTION:",
        `${host}.\t\t300\tIN\tA\t93.184.216.34`,
        "",
        ";; Query time: 23 msec",
        ";; SERVER: 192.168.1.1#53(192.168.1.1)",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

const host: Command = {
  name: "host",
  summary: "ホスト名/IP を解決 (模擬)",
  run(ctx) {
    const h = ctx.args[1] ?? "example.com";
    ctx.out(`${h} has address 93.184.216.34\n${h} has IPv6 address 2606:2800:220:1:248:1893:25c8:1946\n`);
    return 0;
  },
};

const ssh: Command = {
  name: "ssh",
  summary: "SSH 接続 (サンドボックスでは不可)",
  run(ctx) {
    const target = ctx.args.slice(1).filter((a) => !a.startsWith("-")).pop() ?? "host";
    ctx.err(`ssh: connect to host ${target.replace(/^.*@/, "")} port 22: Network is unreachable\n`);
    ctx.err("(cli-dojo サンドボックスでは外部 SSH 接続はできません)\n");
    return 255;
  },
};

const traceroute: Command = {
  name: "traceroute",
  summary: "経路を表示 (模擬)",
  run(ctx) {
    const h = ctx.args.slice(1).filter((a) => !a.startsWith("-")).pop() ?? "example.com";
    ctx.out(
      [
        `traceroute to ${h} (93.184.216.34), 30 hops max, 60 byte packets`,
        " 1  _gateway (192.168.1.1)  1.234 ms  1.102 ms  0.998 ms",
        " 2  10.0.0.1 (10.0.0.1)  8.451 ms  8.332 ms  8.210 ms",
        " 3  93.184.216.34 (93.184.216.34)  12.5 ms  12.3 ms  12.1 ms",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

// ===== パッケージ =====
function pkg(name: string): Command {
  return {
    name,
    summary: `${name} パッケージ管理 (模擬)`,
    run(ctx: ExecContext) {
      const sub = ctx.args[1] ?? "";
      const target = ctx.args.slice(2).filter((a) => !a.startsWith("-")).join(" ");
      if (/^(update|check-update)$/.test(sub)) {
        ctx.out("Hit:1 http://deb.debian.org/debian bookworm InRelease\nReading package lists... Done\nAll packages are up to date.\n");
        return 0;
      }
      if (/^(install|reinstall)$/.test(sub)) {
        ctx.out(`Reading package lists... Done\nBuilding dependency tree... Done\nThe following NEW packages will be installed:\n  ${target}\n0 upgraded, 1 newly installed, 0 to remove.\nGet:1 ${target} [1,234 kB]\nUnpacking ${target} ...\nSetting up ${target} ...\n`);
        return 0;
      }
      if (/^(remove|purge|erase|autoremove)$/.test(sub)) {
        ctx.out(`Reading package lists... Done\nThe following packages will be REMOVED:\n  ${target}\nRemoving ${target} ...\n`);
        return 0;
      }
      if (/^(upgrade|full-upgrade|dist-upgrade)$/.test(sub)) {
        ctx.out("Reading package lists... Done\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n");
        return 0;
      }
      if (sub === "list" || sub === "search") {
        ctx.out(`${target || "bash"}/stable 5.2.15-2 amd64 [installed]\n`);
        return 0;
      }
      if (sub === "show" || sub === "info") {
        ctx.out(`Package: ${target || "bash"}\nVersion: 5.2.15-2\nPriority: required\nSection: shells\nMaintainer: Matthias Klose\nDescription: GNU Bourne Again SHell\n`);
        return 0;
      }
      ctx.out(`${name} 1.6 (模擬)。サブコマンド: update / install / remove / upgrade / search / show\n`);
      return 0;
    },
  };
}

const dpkg: Command = {
  name: "dpkg",
  summary: "Debian パッケージ (模擬)",
  run(ctx) {
    if (ctx.args.includes("-l") || ctx.args.includes("--list")) {
      ctx.out(
        [
          "Desired=Unknown/Install/Remove/Purge/Hold",
          "| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend",
          "||/ Name           Version      Architecture Description",
          "+++-==============-============-============-=================================",
          "ii  bash           5.2.15-2     amd64        GNU Bourne Again SHell",
          "ii  coreutils      9.1-1        amd64        GNU core utilities",
          "ii  vim            9.0.1378-2   amd64        Vi IMproved",
          "",
        ].join("\n"),
      );
      return 0;
    }
    if (ctx.args.includes("-L")) {
      ctx.out("/usr/bin/bash\n/usr/share/doc/bash\n/etc/bash.bashrc\n");
      return 0;
    }
    ctx.out("dpkg 1.21 (模擬)。-l 一覧 / -L パッケージのファイル\n");
    return 0;
  },
};

const rpm: Command = {
  name: "rpm",
  summary: "RPM パッケージ (模擬)",
  run(ctx) {
    if (ctx.args.includes("-qa")) {
      ctx.out("bash-5.2.15-1.el9.x86_64\ncoreutils-9.1-1.el9.x86_64\nvim-enhanced-9.0.1378-1.el9.x86_64\n");
      return 0;
    }
    ctx.out("RPM version 4.18 (模擬)。-qa 全パッケージ / -qi 情報\n");
    return 0;
  },
};

// ===== systemd / サービス =====
const SERVICES: Record<string, { active: boolean; desc: string }> = {
  nginx: { active: true, desc: "A high performance web server and a reverse proxy server" },
  ssh: { active: true, desc: "OpenBSD Secure Shell server" },
  sshd: { active: true, desc: "OpenBSD Secure Shell server" },
  cron: { active: true, desc: "Regular background program processing daemon" },
  postgresql: { active: true, desc: "PostgreSQL RDBMS" },
  docker: { active: false, desc: "Docker Application Container Engine" },
};

const systemctl: Command = {
  name: "systemctl",
  summary: "systemd の制御 (模擬)",
  run(ctx) {
    const sub = ctx.args[1] ?? "";
    const unit = (ctx.args[2] ?? "").replace(/\.service$/, "");
    if (sub === "" || sub === "list-units" || sub === "list-unit-files") {
      let out = "UNIT                     LOAD   ACTIVE SUB     DESCRIPTION\n";
      for (const [n, s] of Object.entries(SERVICES)) {
        out += `${(n + ".service").padEnd(24)} loaded ${s.active ? "active running" : "inactive dead   "} ${s.desc}\n`;
      }
      ctx.out(out);
      return 0;
    }
    if (sub === "status") {
      const s = SERVICES[unit];
      if (!s) {
        ctx.err(`Unit ${unit}.service could not be found.\n`);
        return 4;
      }
      ctx.out(
        [
          `● ${unit}.service - ${s.desc}`,
          `     Loaded: loaded (/lib/systemd/system/${unit}.service; enabled; preset: enabled)`,
          `     Active: ${s.active ? "active (running)" : "inactive (dead)"} since Tue 2026-06-03 09:01:12 JST`,
          s.active ? `   Main PID: 733 (${unit})` : "",
          s.active ? "      Tasks: 2 (limit: 4915)" : "",
          s.active ? "     Memory: 16.8M" : "",
          "",
        ].filter((l) => l !== "").join("\n"),
      );
      return s.active ? 0 : 3;
    }
    if (/^(start|stop|restart|reload|enable|disable|mask|unmask)$/.test(sub)) {
      if (unit && SERVICES[unit]) {
        if (sub === "start" || sub === "restart") SERVICES[unit].active = true;
        if (sub === "stop") SERVICES[unit].active = false;
      }
      return 0;
    }
    if (sub === "is-active") {
      ctx.out((SERVICES[unit]?.active ? "active" : "inactive") + "\n");
      return SERVICES[unit]?.active ? 0 : 3;
    }
    if (sub === "is-enabled") {
      ctx.out("enabled\n");
      return 0;
    }
    ctx.out("systemctl (模擬): status/start/stop/restart/enable/list-units\n");
    return 0;
  },
};

const journalctl: Command = {
  name: "journalctl",
  summary: "systemd ジャーナル (模擬)",
  run(ctx) {
    const unitIdx = ctx.args.findIndex((a) => a === "-u" || a === "--unit");
    const unit = unitIdx >= 0 ? ctx.args[unitIdx + 1] : "";
    const lines = [
      "Jun 03 09:00:01 cli-dojo systemd[1]: Starting Daily apt activities...",
      `Jun 03 09:01:12 cli-dojo ${unit || "nginx"}[733]: started successfully`,
      `Jun 03 09:25:31 cli-dojo ${unit || "sshd"}[2210]: Failed password for invalid user admin from 203.0.113.7`,
      "Jun 03 10:11:09 cli-dojo kernel: eth0: link up, 1000Mbps",
    ];
    ctx.out(lines.join("\n") + "\n");
    return 0;
  },
};

const service: Command = {
  name: "service",
  summary: "サービス制御 (模擬)",
  run(ctx) {
    const unit = ctx.args[1] ?? "";
    const action = ctx.args[2] ?? "status";
    if (action === "status") {
      const s = SERVICES[unit.replace(/\.service$/, "")];
      ctx.out(`● ${unit} - ${s?.desc ?? "service"}\n     Active: ${s?.active ? "active (running)" : "inactive (dead)"}\n`);
      return 0;
    }
    return 0;
  },
};

// ===== openssl (version/rand/dgst は実動) =====
const openssl: Command = {
  name: "openssl",
  summary: "OpenSSL ツール (version/rand/dgst は実動)",
  run(ctx) {
    const sub = ctx.args[1] ?? "";
    if (sub === "version") {
      ctx.out("OpenSSL 3.0.11 19 Sep 2023 (Library: OpenSSL 3.0.11)\n");
      return 0;
    }
    if (sub === "rand") {
      const hex = ctx.args.includes("-hex");
      const base64 = ctx.args.includes("-base64");
      const n = parseInt(ctx.args.filter((a) => /^\d+$/.test(a))[0] ?? "16", 10);
      const buf = new Uint8Array(n);
      crypto.getRandomValues(buf);
      if (base64) {
        let bin = "";
        for (const b of buf) bin += String.fromCharCode(b);
        ctx.out(btoa(bin) + "\n");
      } else if (hex) {
        ctx.out([...buf].map((b) => b.toString(16).padStart(2, "0")).join("") + "\n");
      } else ctx.out([...buf].map((b) => b.toString(16).padStart(2, "0")).join("") + "\n");
      return 0;
    }
    if (sub === "dgst") {
      const file = ctx.args.slice(2).filter((a) => !a.startsWith("-")).pop();
      const node = file ? ctx.vfs.stat(ctx.resolve(file)) : null;
      const data = node && node.type === "file" ? node.content : ctx.stdin;
      ctx.out(`SHA2-256(${file ?? "stdin"})= ${sha256(bytesOf(data))}\n`);
      return 0;
    }
    ctx.out("openssl 3.0 (模擬): version / rand -hex N / dgst -sha256 FILE\n");
    return 0;
  },
};

// ===== cron / at =====
const crontab: Command = {
  name: "crontab",
  summary: "cron ジョブ管理 (模擬)",
  run(ctx) {
    if (ctx.args.includes("-l")) {
      const node = ctx.vfs.stat("/var/spool/cron/crontabs/guest");
      if (node && node.type === "file") {
        ctx.out(node.content);
      } else {
        ctx.out("# m h  dom mon dow   command\n0 2 * * * /home/guest/backup.sh\n*/15 * * * * /usr/bin/check-health\n");
      }
      return 0;
    }
    if (ctx.args.includes("-e")) {
      ctx.err("crontab: エディタは Phase 8/9 で。`crontab -l` で一覧を確認できます\n");
      return 0;
    }
    ctx.out("usage: crontab [-l] [-e] [-r]\n");
    return 0;
  },
};

const at: Command = {
  name: "at",
  summary: "指定時刻にジョブ実行 (模擬)",
  run(ctx) {
    ctx.err("warning: commands will be executed using /bin/sh\njob 1 at Tue Jun  3 11:00:00 2026\n");
    return 0;
  },
};

// ===== カーネルモジュール/その他 =====
const lsmod: Command = {
  name: "lsmod",
  summary: "ロード済みカーネルモジュール (模擬)",
  run: text(
    [
      "Module                  Size  Used by",
      "nf_conntrack          172032  1 nf_nat",
      "overlay               151552  0",
      "ext4                  962560  2",
      "e1000e                307200  0",
      "",
    ].join("\n"),
  ),
};
const modprobe: Command = { name: "modprobe", summary: "モジュールをロード (模擬)", run: () => 0 };
const timedatectl: Command = {
  name: "timedatectl",
  summary: "時刻設定 (模擬)",
  run: text(
    [
      "               Local time: Tue 2026-06-03 10:30:00 JST",
      "           Universal time: Tue 2026-06-03 01:30:00 UTC",
      "                Time zone: Asia/Tokyo (JST, +0900)",
      "System clock synchronized: yes",
      "              NTP service: active",
    ].join("\n"),
  ),
};
const hostnamectl: Command = {
  name: "hostnamectl",
  summary: "ホスト名/OS 情報 (模擬)",
  run: text(
    [
      "   Static hostname: cli-dojo",
      "         Icon name: computer-vm",
      "           Chassis: vm",
      "  Operating System: Debian GNU/Linux 12 (bookworm)",
      "            Kernel: Linux 6.1.0-21-amd64",
      "      Architecture: x86-64",
    ].join("\n"),
  ),
};

// ===== ユーザー管理 =====
const sudo: Command = {
  name: "sudo",
  summary: "他ユーザー権限で実行",
  run(ctx) {
    let i = 1;
    while (i < ctx.args.length) {
      const a = ctx.args[i];
      if (a === "-u" || a === "-g" || a === "-p") i += 2;
      else if (a === "-i" || a === "-s" || a === "-E" || a === "-H" || a === "-k") i += 1;
      else break;
    }
    const cmd = ctx.args.slice(i);
    if (cmd.length === 0) {
      ctx.err("usage: sudo command [args]\n");
      return 1;
    }
    const r = ctx.services.runArgv(cmd, ctx.stdin);
    if (r.stderr) ctx.err(r.stderr);
    ctx.out(r.stdout);
    return r.code;
  },
};

const su: Command = {
  name: "su",
  summary: "ユーザー切替 (サンドボックスでは不可)",
  run(ctx) {
    ctx.err("su: cli-dojo サンドボックスではユーザー切替はできません (sudo <cmd> は利用可能)\n");
    return 1;
  },
};

const passwd: Command = {
  name: "passwd",
  summary: "パスワード変更 (模擬)",
  run(ctx) {
    const user = ctx.args.slice(1).filter((a) => !a.startsWith("-"))[0] ?? ctx.env.user;
    ctx.out(`Changing password for user ${user}.\npasswd: all authentication tokens updated successfully.\n`);
    return 0;
  },
};

function nextUid(passwdContent: string): number {
  let max = 1000;
  for (const line of passwdContent.split("\n")) {
    const f = line.split(":");
    const uid = parseInt(f[2], 10);
    if (uid >= 1000 && uid < 60000 && uid > max) max = uid;
  }
  return max + 1;
}

const useradd: Command = {
  name: "useradd",
  summary: "ユーザーを追加 (/etc/passwd に追記)",
  run(ctx) {
    const makeHome = ctx.args.includes("-m");
    const name = ctx.args.slice(1).filter((a) => !a.startsWith("-")).pop();
    if (!name) {
      ctx.err("useradd: ユーザー名が必要です\n");
      return 1;
    }
    const pw = ctx.vfs.stat("/etc/passwd");
    if (!pw || pw.type !== "file") return 1;
    if (pw.content.split("\n").some((l) => l.split(":")[0] === name)) {
      ctx.err(`useradd: user '${name}' already exists\n`);
      return 9;
    }
    const uid = nextUid(pw.content);
    const line = `${name}:x:${uid}:${uid}::/home/${name}:/bin/bash`;
    pw.content = pw.content.replace(/\n*$/, "\n") + line + "\n";
    const grp = ctx.vfs.stat("/etc/group");
    if (grp && grp.type === "file") grp.content = grp.content.replace(/\n*$/, "\n") + `${name}:x:${uid}:\n`;
    if (makeHome) ctx.vfs.mkdirp(`/home/${name}`);
    return 0;
  },
};

const userdel: Command = {
  name: "userdel",
  summary: "ユーザーを削除 (/etc/passwd から)",
  run(ctx) {
    const name = ctx.args.slice(1).filter((a) => !a.startsWith("-")).pop();
    if (!name) return 1;
    const pw = ctx.vfs.stat("/etc/passwd");
    if (pw && pw.type === "file") {
      pw.content = pw.content.split("\n").filter((l) => l.split(":")[0] !== name).join("\n");
      if (!pw.content.endsWith("\n")) pw.content += "\n";
    }
    return 0;
  },
};

const groupadd: Command = {
  name: "groupadd",
  summary: "グループを追加 (/etc/group に追記)",
  run(ctx) {
    const name = ctx.args.slice(1).filter((a) => !a.startsWith("-")).pop();
    if (!name) return 1;
    const grp = ctx.vfs.stat("/etc/group");
    if (!grp || grp.type !== "file") return 1;
    if (grp.content.split("\n").some((l) => l.split(":")[0] === name)) {
      ctx.err(`groupadd: group '${name}' already exists\n`);
      return 9;
    }
    let max = 1000;
    for (const line of grp.content.split("\n")) {
      const gid = parseInt(line.split(":")[2], 10);
      if (gid >= 1000 && gid < 60000 && gid > max) max = gid;
    }
    grp.content = grp.content.replace(/\n*$/, "\n") + `${name}:x:${max + 1}:\n`;
    return 0;
  },
};

const getent: Command = {
  name: "getent",
  summary: "NSS データベースを参照 (/etc/passwd 等)",
  run(ctx) {
    const db = ctx.args[1] ?? "";
    const key = ctx.args[2];
    const fileMap: Record<string, string> = { passwd: "/etc/passwd", group: "/etc/group", hosts: "/etc/hosts", services: "/etc/services" };
    const path = fileMap[db];
    if (!path) {
      ctx.err(`getent: Unknown database: ${db}\n`);
      return 2;
    }
    const node = ctx.vfs.stat(path);
    if (!node || node.type !== "file") return 2;
    const lines = node.content.split("\n").filter((l) => l !== "");
    if (!key) {
      ctx.out(lines.join("\n") + "\n");
      return 0;
    }
    const match = lines.filter((l) => l.split(":")[0] === key || l.split(":")[2] === key);
    if (match.length === 0) return 2;
    ctx.out(match.join("\n") + "\n");
    return 0;
  },
};

const last: Command = {
  name: "last",
  summary: "ログイン履歴 (模擬)",
  run: text(
    [
      "guest    pts/0        192.168.1.50     Tue Jun  3 09:15   still logged in",
      "guest    pts/0        192.168.1.50     Mon Jun  2 14:02 - 18:30  (04:28)",
      "reboot   system boot  6.1.0-21-amd64   Mon Jun  2 08:55   still running",
      "",
      "wtmp begins Mon Jun  2 08:55:01 2026",
    ].join("\n"),
  ),
};

export const simCommands: Command[] = [
  ip, ifconfig, ss, netstat, ping, curl, wget, dig, host, ssh, traceroute,
  pkg("apt"), pkg("apt-get"), pkg("yum"), pkg("dnf"), dpkg, rpm,
  systemctl, journalctl, service, openssl, crontab, at,
  lsmod, modprobe, timedatectl, hostnamectl,
  sudo, su, passwd, useradd, userdel, groupadd, getent, last,
];
