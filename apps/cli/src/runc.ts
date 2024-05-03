import { ImageInfo } from "./commands/build.js";

export const createConfig = (imageInfo: ImageInfo) => {
    return {
        ociVersion: "1.0.0",
        process: {
            terminal: false,
            args: [...imageInfo.entrypoint, ...imageInfo.cmd],
            env: [
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin,/opt/cartesi/sbin:/opt/cartesi/bin",
                "TERM=xterm",
                "ROLLUP_HTTP_SERVER_URL=http://127.0.0.1:5004",
                ...imageInfo.env,
            ],
            cwd: imageInfo.workdir,
            capabilities: {
                bounding: [
                    "CAP_AUDIT_WRITE",
                    "CAP_KILL",
                    "CAP_NET_BIND_SERVICE",
                ],
                effective: [
                    "CAP_AUDIT_WRITE",
                    "CAP_KILL",
                    "CAP_NET_BIND_SERVICE",
                ],
                inheritable: [],
                permitted: [
                    "CAP_AUDIT_WRITE",
                    "CAP_KILL",
                    "CAP_NET_BIND_SERVICE",
                ],
                ambient: [
                    "CAP_AUDIT_WRITE",
                    "CAP_KILL",
                    "CAP_NET_BIND_SERVICE",
                ],
            },
            rlimits: [
                {
                    type: "RLIMIT_NOFILE",
                    hard: 1024,
                    soft: 1024,
                },
            ],
            noNewPrivileges: true,
        },
        root: {
            path: "rootfs",
            readonly: true,
        },
        hostname: "dapp",
        mounts: [
            {
                destination: "/proc",
                type: "proc",
                source: "proc",
            },
            {
                destination: "/dev",
                type: "tmpfs",
                source: "tmpfs",
                options: ["nosuid", "strictatime", "mode=755", "size=65536k"],
            },
            {
                destination: "/dev/pts",
                type: "devpts",
                source: "devpts",
                options: [
                    "nosuid",
                    "noexec",
                    "newinstance",
                    "ptmxmode=0666",
                    "mode=0620",
                    "gid=5",
                ],
            },
            {
                destination: "/dev/shm",
                type: "tmpfs",
                source: "shm",
                options: [
                    "nosuid",
                    "noexec",
                    "nodev",
                    "mode=1777",
                    "size=65536k",
                ],
            },
            {
                destination: "/dev/mqueue",
                type: "mqueue",
                source: "mqueue",
                options: ["nosuid", "noexec", "nodev"],
            },
            {
                destination: "/sys",
                type: "sysfs",
                source: "sysfs",
                options: ["nosuid", "noexec", "nodev", "ro"],
            },
            {
                destination: "/sys/fs/cgroup",
                type: "cgroup",
                source: "cgroup",
                options: ["nosuid", "noexec", "nodev", "relatime", "ro"],
            },
        ],
        linux: {
            resources: {
                devices: [
                    {
                        allow: false,
                        access: "rwm",
                    },
                ],
            },
            namespaces: [
                {
                    type: "pid",
                },
                {
                    type: "ipc",
                },
                {
                    type: "uts",
                },
                {
                    type: "cgroup",
                },
                {
                    type: "mount",
                },
                {
                    type: "user",
                },
            ],
            maskedPaths: [
                "/proc/acpi",
                "/proc/asound",
                "/proc/kcore",
                "/proc/keys",
                "/proc/latency_stats",
                "/proc/timer_list",
                "/proc/timer_stats",
                "/proc/sched_debug",
                "/sys/firmware",
                "/proc/scsi",
            ],
            readonlyPaths: [
                "/proc/bus",
                "/proc/fs",
                "/proc/irq",
                "/proc/sys",
                "/proc/sysrq-trigger",
            ],
        },
    };
};
