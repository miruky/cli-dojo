import type { Command, ExecContext } from "../types";

/**
 * コンテナ / 仮想化 / 名前空間まわりの模擬コマンド (LPIC-3 304/305 相当)。
 * 実際の隔離は行わず、現実的な出力を返す学習用シミュレーション。
 */

interface FakeContainer {
  id: string;
  image: string;
  command: string;
  created: string;
  status: string;
  ports: string;
  name: string;
}

// docker / podman で共有する擬似状態
const CONTAINERS: FakeContainer[] = [
  { id: "a1b2c3d4e5f6", image: "nginx:1.27", command: '"nginx -g \'daemon off;\'"', created: "2 hours ago", status: "Up 2 hours", ports: "0.0.0.0:80->80/tcp", name: "web" },
  { id: "f6e5d4c3b2a1", image: "postgres:16", command: '"docker-entrypoint.s…"', created: "3 hours ago", status: "Up 3 hours", ports: "5432/tcp", name: "db" },
  { id: "0badc0ffee11", image: "redis:7", command: '"docker-entrypoint.s…"', created: "5 hours ago", status: "Exited (0) 1 hour ago", ports: "", name: "cache" },
];

const IMAGES = [
  { repo: "nginx", tag: "1.27", id: "5ef79149e0ec", created: "2 weeks ago", size: "188MB" },
  { repo: "postgres", tag: "16", id: "d4e0a5f1b3c2", created: "3 weeks ago", size: "431MB" },
  { repo: "redis", tag: "7", id: "a1f2e3d4c5b6", created: "4 weeks ago", size: "117MB" },
  { repo: "debian", tag: "12", id: "9c2b3a4d5e6f", created: "5 weeks ago", size: "117MB" },
];

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function dockerLike(name: string): Command {
  return {
    name,
    summary: `${name}: コンテナ管理 (模擬)`,
    run(ctx: ExecContext) {
      const sub = ctx.args[1] ?? "";
      const rest = ctx.args.slice(2);
      const arg = rest.filter((a) => !a.startsWith("-"));
      switch (sub) {
        case "":
        case "help":
        case "--help":
          ctx.out(
            [
              `${name} — コンテナ管理 (模擬)`,
              "使い方: " + name + " COMMAND",
              "  ps [-a]          コンテナ一覧",
              "  images           イメージ一覧",
              "  run IMAGE        コンテナ起動",
              "  pull IMAGE       イメージ取得",
              "  build -t T .     イメージ構築",
              "  exec -it C CMD   コンテナ内でコマンド実行",
              "  logs C           ログ表示",
              "  stop/start/rm C  停止/開始/削除",
              "  version | info   バージョン/情報",
              "",
            ].join("\n"),
          );
          return 0;
        case "ps": {
          const all = ctx.args.includes("-a") || ctx.args.includes("--all");
          const list = all ? CONTAINERS : CONTAINERS.filter((c) => c.status.startsWith("Up"));
          let out = pad("CONTAINER ID", 14) + pad("IMAGE", 16) + pad("COMMAND", 24) + pad("CREATED", 16) + pad("STATUS", 24) + pad("PORTS", 22) + "NAMES\n";
          for (const c of list) {
            out += pad(c.id.slice(0, 12), 14) + pad(c.image, 16) + pad(c.command, 24) + pad(c.created, 16) + pad(c.status, 24) + pad(c.ports, 22) + c.name + "\n";
          }
          ctx.out(out);
          return 0;
        }
        case "images": {
          let out = pad("REPOSITORY", 14) + pad("TAG", 10) + pad("IMAGE ID", 16) + pad("CREATED", 16) + "SIZE\n";
          for (const im of IMAGES) {
            out += pad(im.repo, 14) + pad(im.tag, 10) + pad(im.id, 16) + pad(im.created, 16) + im.size + "\n";
          }
          ctx.out(out);
          return 0;
        }
        case "pull": {
          const image = arg[0] ?? "debian:12";
          ctx.out(
            [
              `Using default tag: latest`,
              `latest: Pulling from library/${image.split(":")[0]}`,
              "a2318d6c47ec: Pull complete",
              "f1c3a4b5d6e7: Pull complete",
              `Digest: sha256:${"0123456789abcdef".repeat(4)}`,
              `Status: Downloaded newer image for ${image}`,
              `docker.io/library/${image}`,
              "",
            ].join("\n"),
          );
          return 0;
        }
        case "run": {
          const image = arg[0] ?? "debian:12";
          const detached = ctx.args.includes("-d") || ctx.args.includes("--detach");
          if (detached) {
            ctx.out("8fd9a1c0b2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9\n");
          } else {
            ctx.out(`(模擬) ${image} を起動しました。-d でバックグラウンド実行、--rm で終了時削除。\n`);
          }
          return 0;
        }
        case "build": {
          ctx.out(
            [
              "[+] Building 12.3s (8/8) FINISHED",
              " => [internal] load build definition from Dockerfile",
              " => [1/3] FROM docker.io/library/debian:12",
              " => [2/3] RUN apt-get update && apt-get install -y curl",
              " => [3/3] COPY . /app",
              " => exporting to image",
              " => => naming to docker.io/library/myapp:latest",
              "",
            ].join("\n"),
          );
          return 0;
        }
        case "exec": {
          ctx.out("(模擬) コンテナ内コマンドを実行しました (-it で対話端末)。\n");
          return 0;
        }
        case "logs": {
          ctx.out(
            [
              "2026/06/09 09:00:01 [notice] 1#1: nginx/1.27.0",
              "2026/06/09 09:00:01 [notice] 1#1: start worker processes",
              '192.168.1.50 - - [09/Jun/2026:09:01:12] "GET / HTTP/1.1" 200 612',
              "",
            ].join("\n"),
          );
          return 0;
        }
        case "stop":
        case "start":
        case "restart":
        case "rm":
        case "rmi":
        case "kill":
          ctx.out((arg[0] ?? "container") + "\n");
          return 0;
        case "version":
          ctx.out(
            [
              "Client:",
              ` Version:           ${name === "podman" ? "4.9.3" : "26.1.4"}`,
              " API version:       1.45",
              " Go version:        go1.22.2",
              "Server:",
              `  Version:          ${name === "podman" ? "4.9.3" : "26.1.4"}`,
              "  containerd:       1.7.18",
              "  runc:             1.1.12",
              "",
            ].join("\n"),
          );
          return 0;
        case "info":
          ctx.out(
            [
              "Server:",
              ` Containers: ${CONTAINERS.length}`,
              `  Running: ${CONTAINERS.filter((c) => c.status.startsWith("Up")).length}`,
              `  Stopped: ${CONTAINERS.filter((c) => !c.status.startsWith("Up")).length}`,
              ` Images: ${IMAGES.length}`,
              " Server Version: 26.1.4",
              " Storage Driver: overlay2",
              " Cgroup Driver: systemd",
              " Cgroup Version: 2",
              " Kernel Version: 6.1.0-21-amd64",
              "",
            ].join("\n"),
          );
          return 0;
        case "compose": {
          const cs = ctx.args[2] ?? "";
          if (cs === "up") ctx.out("[+] Running 3/3\n ✔ Network app_default  Created\n ✔ Container app-db-1   Started\n ✔ Container app-web-1  Started\n");
          else if (cs === "down") ctx.out("[+] Running 3/3\n ✔ Container app-web-1  Removed\n ✔ Container app-db-1   Removed\n ✔ Network app_default  Removed\n");
          else if (cs === "ps") ctx.out("NAME        IMAGE        STATUS         PORTS\napp-web-1   nginx:1.27   Up 2 minutes   0.0.0.0:80->80/tcp\napp-db-1    postgres:16  Up 2 minutes   5432/tcp\n");
          else ctx.out("docker compose: up / down / ps / logs (模擬)\n");
          return 0;
        }
        default:
          ctx.out(`${name} ${sub}: (模擬) サポート: ps/images/run/pull/build/exec/logs/version/info/compose\n`);
          return 0;
      }
    },
  };
}

const kubectl: Command = {
  name: "kubectl",
  summary: "Kubernetes クラスタ操作 (模擬)",
  run(ctx) {
    const sub = ctx.args[1] ?? "";
    const res = ctx.args[2] ?? "";
    if (sub === "get") {
      if (/^pods?$/.test(res) || res === "po") {
        ctx.out(
          [
            "NAME                        READY   STATUS    RESTARTS   AGE",
            "web-7d9f8c6b5d-2xk4p        1/1     Running   0          2h",
            "web-7d9f8c6b5d-9qm7t        1/1     Running   0          2h",
            "db-statefulset-0            1/1     Running   0          3h",
            "redis-6c8d7f5b4a-lp3wz      1/1     Running   1          5h",
            "",
          ].join("\n"),
        );
        return 0;
      }
      if (/^nodes?$/.test(res) || res === "no") {
        ctx.out(
          [
            "NAME           STATUS   ROLES           AGE   VERSION",
            "cp-node-1      Ready    control-plane   10d   v1.30.2",
            "worker-node-1  Ready    <none>          10d   v1.30.2",
            "worker-node-2  Ready    <none>          10d   v1.30.2",
            "",
          ].join("\n"),
        );
        return 0;
      }
      if (/^(svc|services?)$/.test(res)) {
        ctx.out(
          [
            "NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE",
            "kubernetes   ClusterIP   10.96.0.1       <none>        443/TCP        10d",
            "web          ClusterIP   10.96.120.45    <none>        80/TCP         2h",
            "",
          ].join("\n"),
        );
        return 0;
      }
      if (/^(ns|namespaces?)$/.test(res)) {
        ctx.out("NAME              STATUS   AGE\ndefault           Active   10d\nkube-system       Active   10d\nkube-public       Active   10d\n");
        return 0;
      }
      if (res === "deploy" || res === "deployments") {
        ctx.out("NAME   READY   UP-TO-DATE   AVAILABLE   AGE\nweb    2/2     2            2           2h\n");
        return 0;
      }
      ctx.out("No resources found.\n");
      return 0;
    }
    if (sub === "version") {
      ctx.out("Client Version: v1.30.2\nKustomize Version: v5.0.4-0.20230601165947\nServer Version: v1.30.2\n");
      return 0;
    }
    if (sub === "cluster-info") {
      ctx.out("Kubernetes control plane is running at https://10.0.0.1:6443\nCoreDNS is running at https://10.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy\n");
      return 0;
    }
    if (sub === "describe") {
      ctx.out(`Name:         ${ctx.args[3] ?? "web-7d9f8c6b5d-2xk4p"}\nNamespace:    default\nStatus:       Running\nNode:         worker-node-1/10.0.0.11\nContainers:\n  web:\n    Image:      nginx:1.27\n    State:      Running\n`);
      return 0;
    }
    if (sub === "apply") {
      ctx.out("deployment.apps/web configured\nservice/web unchanged\n");
      return 0;
    }
    if (sub === "logs") {
      ctx.out('192.168.1.50 - - [09/Jun/2026:09:01:12] "GET / HTTP/1.1" 200 612\n');
      return 0;
    }
    if (sub === "exec" || sub === "scale" || sub === "delete" || sub === "rollout") {
      ctx.out(`(模擬) kubectl ${sub} を実行しました。\n`);
      return 0;
    }
    ctx.out("kubectl (模擬): get pods|nodes|svc / version / cluster-info / describe / apply / logs / scale\n");
    return 0;
  },
};

const virsh: Command = {
  name: "virsh",
  summary: "libvirt/KVM 仮想マシン管理 (模擬)",
  run(ctx) {
    const sub = ctx.args[1] ?? "";
    if (sub === "list") {
      const all = ctx.args.includes("--all");
      ctx.out(
        [
          " Id   Name        State",
          "----------------------------",
          " 1    web-vm      running",
          " 2    db-vm       running",
          all ? " -    build-vm    shut off" : null,
        ]
          .filter((l): l is string => l !== null)
          .join("\n") + "\n",
      );
      return 0;
    }
    if (sub === "dominfo") {
      ctx.out(
        [
          `Id:             1`,
          `Name:           ${ctx.args[2] ?? "web-vm"}`,
          "UUID:           4dea22b3-1d52-d8f3-2516-782e98ab3fa0",
          "OS Type:        hvm",
          "State:          running",
          "CPU(s):         2",
          "Max memory:     2097152 KiB",
          "Used memory:    2097152 KiB",
          "Autostart:      enable",
          "",
        ].join("\n"),
      );
      return 0;
    }
    if (/^(start|shutdown|destroy|reboot|suspend|resume|undefine|autostart)$/.test(sub)) {
      ctx.out(`Domain '${ctx.args[2] ?? "web-vm"}' ${sub === "start" ? "started" : sub === "shutdown" ? "is being shutdown" : sub + "ed"}\n`);
      return 0;
    }
    if (sub === "nodeinfo") {
      ctx.out("CPU model:           x86_64\nCPU(s):              8\nCPU frequency:       3200 MHz\nCPU socket(s):       1\nCore(s) per socket:  4\nThread(s) per core:  2\nMemory size:         16384000 KiB\n");
      return 0;
    }
    if (sub === "net-list") {
      ctx.out(" Name      State    Autostart   Persistent\n--------------------------------------------\n default   active   yes         yes\n");
      return 0;
    }
    ctx.out("virsh (模擬): list [--all] / dominfo NAME / start|shutdown NAME / nodeinfo / net-list\n");
    return 0;
  },
};

const vagrant: Command = {
  name: "vagrant",
  summary: "Vagrant 仮想環境管理 (模擬)",
  run(ctx) {
    const sub = ctx.args[1] ?? "";
    if (sub === "status") {
      ctx.out("Current machine states:\n\ndefault                   running (virtualbox)\n\nThe VM is running. To stop this VM, you can run `vagrant halt`.\n");
      return 0;
    }
    if (sub === "up") {
      ctx.out("Bringing machine 'default' up with 'virtualbox' provider...\n==> default: Importing base box 'debian/bookworm64'...\n==> default: Booting VM...\n==> default: Machine booted and ready!\n");
      return 0;
    }
    if (sub === "halt") {
      ctx.out("==> default: Attempting graceful shutdown of VM...\n");
      return 0;
    }
    if (sub === "ssh") {
      ctx.err("(模擬) vagrant ssh: サンドボックスでは VM へ接続できません。\n");
      return 0;
    }
    if (sub === "global-status") {
      ctx.out("id       name     provider   state    directory\n---------------------------------------------------------\n1a2b3c4  default  virtualbox running  /home/guest/vm\n");
      return 0;
    }
    ctx.out("vagrant (模擬): up / status / halt / ssh / global-status / init\n");
    return 0;
  },
};

const lxc: Command = {
  name: "lxc",
  summary: "LXD システムコンテナ管理 (模擬)",
  run(ctx) {
    const sub = ctx.args[1] ?? "";
    if (sub === "list") {
      ctx.out(
        [
          "+--------+---------+----------------------+------+-----------+-----------+",
          "|  NAME  |  STATE  |         IPV4         | IPV6 |   TYPE    | SNAPSHOTS |",
          "+--------+---------+----------------------+------+-----------+-----------+",
          "| web    | RUNNING | 10.0.3.21 (eth0)     |      | CONTAINER | 0         |",
          "+--------+---------+----------------------+------+-----------+-----------+",
          "| db     | STOPPED |                      |      | CONTAINER | 1         |",
          "+--------+---------+----------------------+------+-----------+-----------+",
          "",
        ].join("\n"),
      );
      return 0;
    }
    if (sub === "launch" || sub === "init") {
      ctx.out(`Creating ${ctx.args[3] ?? "container"}\nStarting ${ctx.args[3] ?? "container"}\n`);
      return 0;
    }
    if (/^(start|stop|restart|delete|exec)$/.test(sub)) {
      ctx.out(`(模擬) lxc ${sub} ${ctx.args[2] ?? ""} を実行しました。\n`);
      return 0;
    }
    if (sub === "image" && ctx.args[2] === "list") {
      ctx.out("+-------+--------------+--------+-------------------------------+--------------+\n| ALIAS | FINGERPRINT  | PUBLIC |          DESCRIPTION           | ARCHITECTURE |\n+-------+--------------+--------+-------------------------------+--------------+\n| d12   | a1b2c3d4e5f6 | no     | Debian bookworm amd64         | x86_64       |\n+-------+--------------+--------+-------------------------------+--------------+\n");
      return 0;
    }
    ctx.out("lxc (模擬): list / launch IMG NAME / start|stop|delete NAME / exec NAME -- CMD / image list\n");
    return 0;
  },
};

const lsns: Command = {
  name: "lsns",
  summary: "Linux 名前空間の一覧 (模擬)",
  run(ctx) {
    ctx.out(
      [
        "        NS TYPE   NPROCS   PID USER  COMMAND",
        "4026531834 mnt        92     1 root  /sbin/init",
        "4026531835 cgroup     92     1 root  /sbin/init",
        "4026531836 pid        92     1 root  /sbin/init",
        "4026531837 user       92     1 root  /sbin/init",
        "4026531838 uts        92     1 root  /sbin/init",
        "4026531839 ipc        92     1 root  /sbin/init",
        "4026531840 net        92     1 root  /sbin/init",
        "4026532184 net         2  1820 guest nginx: master process",
        "",
      ].join("\n"),
    );
    return 0;
  },
};

const nsenter: Command = {
  name: "nsenter",
  summary: "既存の名前空間に入る (模擬)",
  run(ctx) {
    ctx.err("(模擬) nsenter: 対象 PID の名前空間でコマンドを実行します。例: nsenter -t 1820 -n ip a\n");
    return 0;
  },
};

const unshare: Command = {
  name: "unshare",
  summary: "新しい名前空間で実行 (模擬)",
  run(ctx) {
    ctx.err("(模擬) unshare: 新しい名前空間を作成して実行します。例: unshare --pid --fork --mount-proc bash\n");
    return 0;
  },
};

const machinectl: Command = {
  name: "machinectl",
  summary: "systemd マシン/コンテナ管理 (模擬)",
  run(ctx) {
    const sub = ctx.args[1] ?? "list";
    if (sub === "list") {
      ctx.out("MACHINE  CLASS     SERVICE        OS     VERSION ADDRESSES\nweb      container systemd-nspawn debian 12      10.0.0.21\n\n1 machines listed.\n");
      return 0;
    }
    ctx.out("machinectl (模擬): list / start / poweroff / login / status NAME\n");
    return 0;
  },
};

const systemdNspawn: Command = {
  name: "systemd-nspawn",
  summary: "軽量コンテナで chroot 起動 (模擬)",
  run(ctx) {
    ctx.err("(模擬) systemd-nspawn: ディレクトリツリーをコンテナとして起動します。例: systemd-nspawn -D /var/lib/machines/debian -b\n");
    return 0;
  },
};

const podmanCompose: Command = {
  name: "podman-compose",
  summary: "podman の compose ラッパ (模擬)",
  run(ctx) {
    ctx.out("(模擬) podman-compose up / down (docker compose 互換)\n");
    return 0;
  },
};

const docker = dockerLike("docker");
const podman = dockerLike("podman");
const nerdctl = dockerLike("nerdctl");

export const containerCommands: Command[] = [
  docker,
  podman,
  nerdctl,
  podmanCompose,
  kubectl,
  virsh,
  vagrant,
  lxc,
  lsns,
  nsenter,
  unshare,
  machinectl,
  systemdNspawn,
];
