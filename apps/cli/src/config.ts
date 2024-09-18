import bytes from "bytes";
import { extname } from "path";
import { TomlPrimitive, parse as parseToml } from "smol-toml";

/**
 * Configuration for drives of a Cartesi Machine. A drive may already exist or be built by a builder
 */
const DEFAULT_FORMAT = "ext2";
const DEFAULT_RAM = "128Mi";
const DEFAULT_RAM_IMAGE = "/usr/share/cartesi-machine/images/linux.bin";
const DEFAULT_SDK = "cartesi/sdk:0.10.0";

type Builder = "directory" | "docker" | "empty" | "none" | "tar";
type DriveFormat = "ext2" | "ext4" | "sqfs";

export type DirectoryDriveConfig = {
    builder: "directory";
    extraSize: number; // default is 0 (no extra size)
    format: DriveFormat;
    directory: string; // required
};

export type DockerDriveConfig = {
    builder: "docker";
    dockerfile: string;
    extraSize: number; // default is 0 (no extra size)
    format: DriveFormat;
    image?: string; // default is to build an image from a Dockerfile
    tags: string[]; // default is empty array
    target?: string; // default is last stage of multi-stage
};

export type EmptyDriveConfig = {
    builder: "empty";
    format: "ext2" | "ext4" | "raw";
    size: number; // in bytes
};

export type ExistingDriveConfig = {
    builder: "none";
    filename: string; // required
    format: DriveFormat;
};

export type TarDriveConfig = {
    builder: "tar";
    filename: string; // required
    format: DriveFormat;
    extraSize: number; // default is 0 (no extra size)
};

export type DriveConfig = (
    | DirectoryDriveConfig
    | DockerDriveConfig
    | EmptyDriveConfig
    | ExistingDriveConfig
    | TarDriveConfig
) & {
    mount?: string | boolean; // default given by cartesi-machine
    shared?: boolean; // default given by cartesi-machine
    user?: string; // default given by cartesi-machine
};

export type MachineConfig = {
    assertRollingTemplate?: boolean; // default given by cartesi-machine
    bootargs: string[];
    entrypoint?: string;
    maxMCycle?: bigint; // default given by cartesi-machine
    noRollup?: boolean; // default given by cartesi-machine
    ramLength: string;
    ramImage: string;
};

export type Config = {
    drives: Record<string, DriveConfig>;
    machine: MachineConfig;
    sdk: string;
};

type TomlTable = { [key: string]: TomlPrimitive };

export const defaultRootDriveConfig = (): DriveConfig => ({
    builder: "docker",
    dockerfile: "Dockerfile", // file on current working directory
    extraSize: 0,
    format: DEFAULT_FORMAT,
    tags: [],
});

export const defaultMachineConfig = (): MachineConfig => ({
    assertRollingTemplate: undefined,
    bootargs: [],
    entrypoint: undefined,
    maxMCycle: undefined,
    noRollup: undefined,
    ramLength: DEFAULT_RAM,
    ramImage: DEFAULT_RAM_IMAGE,
});

export const defaultConfig = (): Config => ({
    drives: { root: defaultRootDriveConfig() },
    machine: defaultMachineConfig(),
    sdk: DEFAULT_SDK,
});

const parseBoolean = (value: TomlPrimitive, defaultValue: boolean): boolean => {
    if (value === undefined) {
        return defaultValue;
    } else if (typeof value === "boolean") {
        return value;
    }
    throw new Error(`Invalid boolean value: ${value}`);
};

const parseOptionalBoolean = (value: TomlPrimitive): boolean | undefined => {
    if (value === undefined) {
        return undefined;
    } else if (typeof value === "boolean") {
        return value;
    }
    throw new Error(`Invalid boolean value: ${value}`);
};

const parseString = (value: TomlPrimitive, defaultValue: string): string => {
    if (value === undefined) {
        return defaultValue;
    } else if (typeof value === "string") {
        return value;
    }
    throw new Error(`Invalid string value: ${value}`);
};

const parseStringArray = (value: TomlPrimitive): string[] => {
    if (value === undefined) {
        return [];
    } else if (typeof value === "string") {
        return [value];
    } else if (typeof value === "object" && Array.isArray(value)) {
        return value.map((v) => {
            if (typeof v === "string") {
                return v;
            }
            throw new Error(`Invalid string value: ${v}`);
        });
    }
    throw new Error(`Invalid string array value: ${value}`);
};

const parseRequiredString = (value: TomlPrimitive, key: string): string => {
    if (value === undefined) {
        throw new Error(`Missing required value: ${key}`);
    } else if (typeof value === "string") {
        return value;
    }
    throw new Error(`Invalid string value: ${value}`);
};

const parseOptionalString = (value: TomlPrimitive): string | undefined => {
    if (value === undefined) {
        return undefined;
    } else if (typeof value === "string") {
        return value;
    }
    throw new Error(`Invalid string value: ${value}`);
};

const parseOptionalStringBoolean = (
    value: TomlPrimitive,
): string | boolean | undefined => {
    if (value === undefined) {
        return undefined;
    } else if (typeof value === "string") {
        return value;
    } else if (typeof value === "boolean") {
        return value;
    }
    throw new Error(`Invalid string value: ${value}`);
};

const parseOptionalNumber = (value: TomlPrimitive): bigint | undefined => {
    if (value === undefined) {
        return undefined;
    } else if (typeof value === "bigint") {
        return value;
    } else if (typeof value === "number") {
        return BigInt(value);
    }
    throw new Error(`Invalid number value: ${value}`);
};

const parseBytes = (value: TomlPrimitive, defaultValue: number): number => {
    if (value === undefined) {
        return defaultValue;
    } else if (typeof value === "bigint") {
        return Number(value);
    } else if (typeof value === "number" || typeof value === "string") {
        return bytes.parse(value);
    }
    throw new Error(`Invalid bytes value: ${value}`);
};

const parseBuilder = (value: TomlPrimitive): Builder => {
    if (value === undefined) {
        return "docker";
    } else if (typeof value === "string") {
        switch (value) {
            case "directory":
                return "directory";
            case "docker":
                return "docker";
            case "empty":
                return "empty";
            case "none":
                return "none";
            case "tar":
                return "tar";
        }
    }
    throw new Error(`Invalid builder: ${value}`);
};

const parseFormat = (value: TomlPrimitive): DriveFormat => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    } else if (typeof value === "string") {
        switch (value) {
            case "ext2":
                return "ext2";
            case "ext4":
                return "ext4";
            case "sqfs":
                return "sqfs";
        }
    }
    throw new Error(`Invalid format: ${value}`);
};

const parseEmptyFormat = (value: TomlPrimitive): "ext2" | "ext4" | "raw" => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    } else if (typeof value === "string") {
        switch (value) {
            case "ext2":
                return "ext2";
            case "ext4":
                return "ext4";
            case "raw":
                return "raw";
        }
    }
    throw new Error(`Invalid format: ${value}`);
};

const parseMachine = (value: TomlPrimitive): MachineConfig => {
    if (value === undefined) {
        // default machine
        return defaultMachineConfig();
    }
    if (typeof value !== "object") {
        throw new Error(`Invalid machine configuration: ${value}`);
    }
    const toml = value as TomlTable;

    return {
        assertRollingTemplate: parseOptionalBoolean(
            toml["assert-rolling-template"],
        ),
        bootargs: parseStringArray(toml.bootargs),
        maxMCycle: parseOptionalNumber(toml["max-mcycle"]),
        noRollup: parseBoolean(toml["no-rollup"], false),
        ramLength: parseString(toml["ram-length"], DEFAULT_RAM),
        ramImage: parseString(toml["ram-image"], DEFAULT_RAM_IMAGE),
    };
};

export const getDriveFormat = (filename: string): DriveFormat => {
    const extension = extname(filename);
    switch (extension) {
        case ".ext2":
            return "ext2";
        case ".ext4":
            return "ext4";
        case ".sqfs":
            return "sqfs";
        default:
            throw new Error(`Invalid drive format: ${extension}`);
    }
};

const parseDrive = (drive: TomlPrimitive): DriveConfig => {
    const builder = parseBuilder((drive as TomlTable).builder);
    switch (builder) {
        case "directory": {
            const { extraSize, format, mount, directory, shared, user } =
                drive as TomlTable;
            return {
                builder: "directory",
                extraSize: parseBytes(extraSize, 0),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                directory: parseRequiredString(directory, "directory"),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
            };
        }
        case "docker": {
            const {
                dockerfile,
                extraSize,
                format,
                image,
                mount,
                shared,
                tags,
                target,
                user,
            } = drive as TomlTable;
            return {
                builder: "docker",
                image: parseOptionalString(image),
                dockerfile: parseString(dockerfile, "Dockerfile"),
                extraSize: parseBytes(extraSize, 0),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
                tags: parseStringArray(tags),
                target: parseOptionalString(target),
            };
        }
        case "empty": {
            const { format, mount, size, shared, user } = drive as TomlTable;
            return {
                builder: "empty",
                format: parseEmptyFormat(format),
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                size: parseBytes(size, 0),
                user: parseOptionalString(user),
            };
        }
        case "tar": {
            const { extraSize, filename, format, mount, shared, user } =
                drive as TomlTable;
            return {
                builder: "tar",
                extraSize: parseBytes(extraSize, 0),
                filename: parseRequiredString(filename, "filename"),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
            };
        }
        case "none": {
            const { shared, mount, user } = drive as TomlTable;
            const filename = parseRequiredString(
                (drive as TomlTable).filename,
                "filename",
            );
            const format = getDriveFormat(filename);
            return {
                builder: "none",
                filename,
                format,
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
            };
        }
    }
};

const parseDrives = (config: TomlPrimitive): Record<string, DriveConfig> => {
    // load drives from configuration
    const drives = Object.entries((config as TomlTable) ?? {}).reduce<
        Record<string, DriveConfig>
    >((acc, [name, drive]) => {
        acc[name] = parseDrive(drive);
        return acc;
    }, {});

    // check if there is a root drive
    const hasRoot = drives.root !== undefined;
    if (!hasRoot) {
        // there is no root drive, add a default one
        drives.root = defaultRootDriveConfig();
    }
    return drives;
};

export const parse = (str: string): Config => {
    const toml = parseToml(str);

    const config: Config = {
        drives: parseDrives(toml.drives),
        machine: parseMachine(toml.machine),
        sdk: parseString(toml.sdk, DEFAULT_SDK),
    };

    return config;
};
