import { Config, DriveConfig, ImageInfo } from "./config.js";
import { cartesiMachine } from "./exec/index.js";

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

export const bootMachine = async (
    config: Config,
    info: ImageInfo | undefined,
    destination: string,
) => {
    const { machine } = config;
    const {
        assertRollingTemplate,
        finalHash,
        interactive,
        maxMCycle,
        noRollup,
        ramLength,
        ramImage,
        store,
        user,
    } = machine;

    // list of environment variables of docker image
    const env = info?.env ?? [];
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
    const entrypoint =
        machine.entrypoint ?? // takes priority
        (info ? [...info.entrypoint, ...info.cmd].join(" ") : undefined); // ENTRYPOINT and CMD as a space separated string

    if (!entrypoint) {
        throw new Error("Undefined machine entrypoint");
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
        `--append-entrypoint=${entrypoint}`,
    ];
    if (assertRollingTemplate) {
        args.push("--assert-rolling-template");
    }
    if (finalHash) {
        args.push("--final-hash");
    }
    if (info?.workdir) {
        args.push(`--workdir="${info.workdir}"`);
    }
    if (interactive) {
        args.push("-it");
    }
    if (noRollup) {
        args.push("--no-rollup");
    }
    if (maxMCycle) {
        args.push(`--max-mcycle=${maxMCycle.toString()}`);
    }
    if (store) {
        args.push(`--store=${store}`);
    }
    if (user) {
        args.push(`--user=${user}`);
    }

    return cartesiMachine.boot(args, {
        cwd: destination,
        image: config.sdk,
        stdio: "inherit",
    });
};
