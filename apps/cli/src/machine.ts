import type {
    MachineConfig as EmulatorMachineConfig,
    MachineRuntimeConfig,
    MemoryRangeConfig,
} from "@cartesi/machine";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import type { Config, DriveConfig, ImageInfo } from "./config.js";
import { cartesiMachine } from "./exec/index.js";
import type { Reporter } from "./exec/util.js";
import { getRamImage } from "./images.js";

export class InvalidMemorySizeError extends Error {
    constructor(value: string) {
        super(`Invalid memory size: ${value}`);
        this.name = "InvalidMemorySizeError";
    }
}

export class InvalidEnvNameError extends Error {
    constructor(name: string) {
        super(`Invalid environment variable name: ${name}`);
        this.name = "InvalidEnvNameError";
    }
}

const SHIFTS: Record<string, bigint> = {
    Ki: 10n,
    Mi: 20n,
    Gi: 30n,
    Ti: 40n,
};

/**
 * Parses a memory size the way the cartesi-machine CLI does: a decimal or
 * 0x-prefixed hexadecimal integer, optionally followed by a Ki/Mi/Gi/Ti
 * suffix or a `<< n` shift.
 */
export const parseMemorySize = (value: string): bigint => {
    const match = value.trim().match(/^(0[xX][0-9a-fA-F]+|[0-9]+)\s*(.*)$/);
    if (!match) {
        throw new InvalidMemorySizeError(value);
    }
    const [, literal, suffix] = match;
    const size = BigInt(
        literal.toLowerCase().startsWith("0x")
            ? literal.toLowerCase()
            : literal.replace(/^0+(?=[0-9])/, ""),
    );

    const rest = suffix.trim();
    let shift = 0n;
    if (rest !== "") {
        const shiftMatch = rest.match(/^<<\s*([0-9]+)$/);
        if (rest in SHIFTS) {
            shift = SHIFTS[rest];
        } else if (shiftMatch) {
            shift = BigInt(shiftMatch[1]);
        } else {
            throw new InvalidMemorySizeError(value);
        }
    }

    if (size === 0n) {
        return 0n;
    }
    if (shift >= 64n || size >> (64n - shift) !== 0n) {
        throw new InvalidMemorySizeError(value);
    }
    return size << shift;
};

/**
 * Splash the cartesi-machine CLI prints from init on boot. Every backslash is
 * doubled so `echo` emits the art verbatim.
 */
const SPLASH = String.raw`echo "
         .
        / \\
      /    \\
\\---/---\\  /----\\
 \\       X       \\
  \\----/  \\---/---\\
       \\    / CARTESI
        \\ /   MACHINE
         '
"
`;

/**
 * Mount point of a drive, following the cartesi-machine defaults: a drive
 * backed by a file is mounted at /mnt/<label> unless told otherwise.
 */
const mountPoint = (
    label: string,
    mount: string | boolean | undefined,
): string | false => {
    if (mount === undefined || mount === true) {
        return `/mnt/${label}`;
    }
    if (mount === false) {
        return false;
    }
    return mount;
};

/**
 * Flash drives of the machine, root first so it lands on /dev/pmem0, which is
 * what the default bootargs mount as the root filesystem.
 */
const flashDrives = (
    drives: Record<string, DriveConfig>,
    cwd: string,
): { label: string; drive: DriveConfig; config: MemoryRangeConfig }[] => {
    const labels = [
        ...(drives.root ? ["root"] : []),
        ...Object.keys(drives).filter((label) => label !== "root"),
    ];
    return labels.map((label) => {
        const drive = drives[label];
        return {
            label,
            drive,
            config: {
                label,
                length: -1, // derived from the backing file
                backing_store: {
                    data_filename: path.resolve(
                        cwd,
                        `${label}.${drive.format}`,
                    ),
                    shared: drive.shared ?? false,
                },
            },
        };
    });
};

/**
 * Commands init runs to mount the non-root drives and hand them to their user.
 */
const drivesInit = (
    drives: { label: string; drive: DriveConfig }[],
): string => {
    let init = "";
    for (const { label, drive } of drives) {
        if (label === "root") {
            // the kernel already mounted it as the root filesystem
            continue;
        }
        const mount = mountPoint(label, drive.mount);
        if (!mount && !drive.user) {
            continue;
        }
        init += `dev=$(flashdrive ${label})\n`;
        if (mount) {
            init += `busybox mkdir -p "${mount}" && busybox mount "$dev" "${mount}"\n`;
        }
        if (drive.user) {
            init += `busybox chown ${drive.user}: "${mount || "$dev"}"\n`;
        }
    }
    return init;
};

/**
 * Environment variables injected into the machine, by increasing precedence:
 * docker image ENV, env_file, then the env object of the configuration.
 */
const environment = (
    machine: Config["machine"],
    info: ImageInfo | undefined,
): Record<string, string> => {
    const envMap: Record<string, string> = {};

    // environment variables of docker image
    if (machine.useDockerEnv) {
        for (const variable of info?.env ?? []) {
            const [key, value = ""] = variable.split("=");
            envMap[key] = value;
        }
    }

    // environment variables from an .env file
    if (machine.envFile) {
        Object.assign(envMap, dotenv.parse(fs.readFileSync(machine.envFile)));
    }

    // environment variables explicitly defined in the config
    Object.assign(envMap, machine.env);

    return envMap;
};

export type BootMachineOptions = {
    /** directory holding the drive images, and the machine snapshot */
    cwd?: string;
    finalHash?: boolean;
    interactive?: boolean;
    reporter?: Reporter;
    /** directory to store the machine snapshot into, relative to cwd */
    store?: string;
};

export type MachineConfigOptions = {
    /** directory the drive images live in */
    cwd?: string;
    interactive?: boolean;
    /** path to the Linux kernel image the machine boots */
    ramImage: string;
};

/**
 * Translates the application configuration into the configuration of a Cartesi
 * machine, the same way the cartesi-machine CLI translates its command line.
 */
export const buildMachineConfig = (
    config: Config,
    info: ImageInfo | undefined,
    options: MachineConfigOptions,
): {
    config: EmulatorMachineConfig;
    runtimeConfig: MachineRuntimeConfig | undefined;
} => {
    const { machine } = config;
    const { ramLength, useDockerWorkdir, user } = machine;
    const { interactive, ramImage } = options;
    const cwd = path.resolve(options.cwd ?? process.cwd());

    // check if we need a rootfstype boot arg
    const extraBootargs: string[] = [];
    const root = config.drives.root;
    if (root?.format === "sqfs") {
        const definedRootfsType = machine.bootargs.find((arg) =>
            arg.startsWith("rootfstype="),
        );
        // not checking here if user intentionally defined wrong type
        if (!definedRootfsType) {
            extraBootargs.push("rootfstype=squashfs");
        }
    }

    // entrypoint from config or image info (Docker ENTRYPOINT + CMD)
    let entrypoint: string | undefined;

    if (machine.entrypoint) {
        entrypoint = machine.entrypoint;
    } else if (info && (info.entrypoint.length > 0 || info.cmd.length > 0)) {
        entrypoint = [...info.entrypoint, ...info.cmd].join(" ");
    }

    if (!entrypoint) {
        throw new Error(
            "Undefined machine entrypoint. Please define an entrypoint in your cartesi.toml config or in your Dockerfile.",
        );
    }

    // an interactive machine talks to the terminal through a VirtIO console,
    // which makes it unreproducible
    let bootargs = cartesiMachine.defaultConfig().dtb?.bootargs ?? "";
    if (interactive) {
        bootargs = bootargs.replace("console=hvc0", "console=hvc1");
    }
    bootargs = [bootargs, ...machine.bootargs, ...extraBootargs].join(" ");

    const drives = flashDrives(config.drives, cwd);

    // init runs the splash, mounts the drives, and then sets up the
    // environment the entrypoint is executed in
    let init = SPLASH + drivesInit(drives);

    for (const [key, value] of Object.entries(environment(machine, info))) {
        if (!/^[0-9a-zA-Z_]+$/.test(key)) {
            throw new InvalidEnvNameError(key);
        }
        init += `export ${key}="${value}"\n`;
    }

    if (useDockerWorkdir && info?.workdir) {
        init += `WORKDIR="${info.workdir}"\n`;
    }

    if (interactive) {
        // sync the guest date with the host, and expose the terminal features
        // of the host to the virtual terminal
        init += `busybox date -s @${Math.floor(Date.now() / 1000) + 1} >> /dev/null\n`;
        const { TERM, LANG } = process.env;
        if (TERM) {
            init += `export TERM=${TERM}\n`;
        }
        if (LANG?.includes("utf8")) {
            init += "export LANG=C.utf8\n";
        }
    }

    if (user) {
        init += `USER=${user}\n`;
    }

    const emulatorConfig: EmulatorMachineConfig = {
        processor: { registers: { iunrep: interactive ? 1 : 0 } },
        ram: {
            length: Number(parseMemorySize(ramLength)),
            backing_store: { data_filename: path.resolve(ramImage) },
        },
        dtb: { bootargs, entrypoint, init },
        flash_drive: drives.map(({ config: driveConfig }) => driveConfig),
    };

    let runtimeConfig: MachineRuntimeConfig | undefined;
    if (interactive) {
        emulatorConfig.virtio = [{ type: "console" }];
        runtimeConfig = {
            console: {
                input_source: "from_stdin",
                output_flush_mode: "every_char",
            },
        };
    }

    return { config: emulatorConfig, runtimeConfig };
};

export const bootMachine = async (
    config: Config,
    info: ImageInfo | undefined,
    bootOptions: BootMachineOptions,
): Promise<cartesiMachine.RunResult> => {
    const { assertRollingTemplate, maxMCycle, ramImage } = config.machine;
    const { cwd, interactive, reporter } = bootOptions;

    const { config: emulatorConfig, runtimeConfig } = buildMachineConfig(
        config,
        info,
        {
            cwd,
            interactive,
            ramImage: ramImage ?? (await getRamImage(reporter)),
        },
    );

    return cartesiMachine.run(emulatorConfig, runtimeConfig, {
        assertRollingTemplate,
        finalHash: bootOptions.finalHash,
        maxMCycle,
        store: bootOptions.store
            ? path.resolve(cwd ?? process.cwd(), bootOptions.store)
            : undefined,
    });
};
