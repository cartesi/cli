import type { Config, DriveConfig, ImageInfo } from "./config.js";
import { cartesiMachine } from "./exec/index.js";
import type { ExecaOptionsDockerFallback } from "./exec/util.js";

const flashDrive = (label: string, drive: DriveConfig): string => {
    const { format, mount, shared, user } = drive;
    const filename = `${label}.${format}`;
    const vars = [`label:${label}`, `filename:${filename}`];
    if (mount !== undefined) {
        vars.push(`mount:${mount}`);
    }
    if (user) {
        vars.push(`user:${user}`);
    }
    if (shared) {
        vars.push("shared");
    }
    // don't specify start and length
    return `--flash-drive=${vars.join(",")}`;
};

export type BootMachineOptions = {
    finalHash?: boolean;
    interactive?: boolean;
    store?: string;
};

export const bootMachine = (
    config: Config,
    info: ImageInfo | undefined,
    bootOptions: BootMachineOptions,
    options?: ExecaOptionsDockerFallback,
) => {
    const { machine } = config;
    const {
        assertRollingTemplate,
        maxMCycle,
        noRollup,
        ramLength,
        ramImage,
        useDockerEnv,
        useDockerWorkdir,
        user,
    } = machine;

    // list of environment variables of docker image
    const env = useDockerEnv ? (info?.env ?? []) : [];
    const envs = env.map((variable) => `--env=${variable}`);

    // check if we need a rootfstype boot arg
    const root = config.drives.root;
    if (root?.format === "sqfs") {
        const definedRootfsType = config.machine.bootargs.find((arg) =>
            arg.startsWith("rootfstype="),
        );
        // not checking here if user intentionally defined wrong type
        if (!definedRootfsType) {
            config.machine.bootargs.push("rootfstype=squashfs");
        }
    }

    // bootargs from config string array
    const bootargs = machine.bootargs.map(
        (arg) => `--append-bootargs="${arg}"`,
    );

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

    const flashDrives = Object.entries(config.drives).map(([label, drive]) =>
        flashDrive(label, drive),
    );

    // command to change working directory if WORKDIR is defined
    const args = [
        ...bootargs,
        ...envs,
        ...flashDrives,
        `--ram-image=${ramImage}`,
        `--ram-length=${ramLength}`,
    ];
    if (assertRollingTemplate) {
        args.push("--assert-rolling-template");
    }
    if (bootOptions.finalHash) {
        args.push("--final-hash");
    }
    if (useDockerWorkdir && info?.workdir) {
        args.push(`--workdir="${info.workdir}"`);
    }
    if (bootOptions.interactive) {
        args.push("-it");
    }
    if (noRollup) {
        args.push("--no-rollup");
    }
    if (maxMCycle) {
        args.push(`--max-mcycle=${maxMCycle.toString()}`);
    }
    if (bootOptions.store) {
        args.push(`--store=${bootOptions.store}`);
    }
    if (user) {
        args.push(`--user=${user}`);
    }
    args.push("--");
    args.push(entrypoint);

    return cartesiMachine.boot(args, {
        image: config.sdk,
        ...options,
    });
};
