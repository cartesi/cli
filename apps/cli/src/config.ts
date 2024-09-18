import bytes from "bytes";
import os from "os";
import { extname } from "path";
import { TomlPrimitive, parse as parseToml } from "smol-toml";

/**
 * Typed Errors
 */
export class InvalidBuilderError extends Error {
    constructor(builder: TomlPrimitive) {
        super(`Invalid builder: ${builder}`);
        this.name = "InvalidBuilder";
    }
}

export class InvalidDriveFormatError extends Error {
    constructor(format: TomlPrimitive) {
        super(`Invalid drive format: ${format}`);
        this.name = "InvalidDriveFormatError";
    }
}

export class InvalidEmptyDriveFormatError extends Error {
    constructor(format: TomlPrimitive) {
        super(`Invalid empty drive format: ${format}`);
        this.name = "InvalidEmptyDriveFormatError";
    }
}

export class InvalidStringValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid string value: ${value}`);
        this.name = "InvalidStringValueError";
    }
}

export class InvalidBooleanValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid boolean value: ${value}`);
        this.name = "InvalidBooleanValueError";
    }
}

export class InvalidNumberValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid number value: ${value}`);
        this.name = "InvalidNumberValueError";
    }
}

export class InvalidBytesValueError extends Error {
    constructor(value: TomlPrimitive) {
        super(`Invalid bytes value: ${value}`);
        this.name = "InvalidBytesValueError";
    }
}

export class RequiredFieldError extends Error {
    constructor(key: TomlPrimitive) {
        super(`Missing required field: ${key}`);
        this.name = "RequiredFieldError";
    }
}

export class InvalidStringArrayError extends Error {
    constructor() {
        super(`Invalid string array`);
        this.name = "InvalidStringArrayError";
    }
}

/**
 * Configuration for drives of a Cartesi Machine. A drive may already exist or be built by a builder
 */
const DEFAULT_FORMAT = "ext2";
const DEFAULT_RAM = "128Mi";
const DEFAULT_RAM_IMAGE_DOCKER = "/usr/share/cartesi-machine/images/linux.bin";
const DEFAULT_RAM_IMAGE_LINUX = "/usr/share/cartesi-machine/images/linux.bin";
const DEFAULT_RAM_IMAGE_MAC =
    "/opt/homebrew/share/cartesi-machine/images/linux.bin";
const DEFAULT_SDK = "cartesi/sdk:0.12.0-alpha.0";

type Builder = "directory" | "docker" | "empty" | "none" | "tar";
type DriveFormat = "ext2" | "sqfs";

export type ImageInfo = {
    cmd: string[];
    entrypoint: string[];
    env: string[];
    workdir: string;
};

export type DriveResult = ImageInfo | undefined | void;

export type DirectoryDriveConfig = {
    builder: "directory";
    extraSize: number; // default is 0 (no extra size)
    format: DriveFormat;
    directory: string; // required
};

export type DockerDriveConfig = {
    builder: "docker";
    context: string;
    dockerfile: string;
    extraSize: number; // default is 0 (no extra size)
    format: DriveFormat;
    image?: string; // default is to build an image from a Dockerfile
    tags: string[]; // default is empty array
    target?: string; // default is last stage of multi-stage
};

export type EmptyDriveConfig = {
    builder: "empty";
    format: "ext2" | "raw";
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
    finalHash: boolean;
    interactive?: boolean; // default given by cartesi-machine
    maxMCycle?: bigint; // default given by cartesi-machine
    noRollup?: boolean; // default given by cartesi-machine
    ramLength: string;
    ramImage: string;
    store?: string;
    user?: string; // default given by cartesi-machine
};

export type Config = {
    drives: Record<string, DriveConfig>;
    machine: MachineConfig;
    sdk: string;
};

type TomlTable = { [key: string]: TomlPrimitive };

export const defaultRootDriveConfig = (): DriveConfig => ({
    builder: "docker",
    context: ".",
    dockerfile: "Dockerfile", // file on current working directory
    extraSize: 0,
    format: DEFAULT_FORMAT,
    tags: [],
});

export const defaultRamImage = (): string => {
    switch (os.platform()) {
        case "darwin":
            return DEFAULT_RAM_IMAGE_MAC;
        default:
            return DEFAULT_RAM_IMAGE_LINUX;
    }
};

export const defaultMachineConfig = (): MachineConfig => ({
    assertRollingTemplate: undefined,
    bootargs: [],
    entrypoint: undefined,
    finalHash: true,
    interactive: undefined,
    maxMCycle: undefined,
    noRollup: undefined,
    ramLength: DEFAULT_RAM,
    ramImage: defaultRamImage(),
    store: "image",
    user: undefined,
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
    throw new InvalidBooleanValueError(value);
};

const parseOptionalBoolean = (value: TomlPrimitive): boolean | undefined => {
    if (value === undefined) {
        return undefined;
    } else if (typeof value === "boolean") {
        return value;
    }
    throw new InvalidBooleanValueError(value);
};

const parseString = (value: TomlPrimitive, defaultValue: string): string => {
    if (value === undefined) {
        return defaultValue;
    } else if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
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
            throw new InvalidStringValueError(v);
        });
    }
    throw new InvalidStringArrayError();
};

const parseRequiredString = (value: TomlPrimitive, key: string): string => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    } else if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const parseOptionalString = (value: TomlPrimitive): string | undefined => {
    if (value === undefined) {
        return undefined;
    } else if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
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
    throw new InvalidStringValueError(value);
};

const parseOptionalNumber = (value: TomlPrimitive): bigint | undefined => {
    if (value === undefined) {
        return undefined;
    } else if (typeof value === "bigint") {
        return value;
    } else if (typeof value === "number") {
        return BigInt(value);
    }
    throw new InvalidNumberValueError(value);
};

const parseBytes = (value: TomlPrimitive, defaultValue: number): number => {
    if (value === undefined) {
        return defaultValue;
    } else if (typeof value === "bigint") {
        return Number(value);
    } else if (typeof value === "number" || typeof value === "string") {
        const output = bytes.parse(value);
        if (output !== null) {
            return output;
        }
    }
    throw new InvalidBytesValueError(value);
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
    throw new InvalidBuilderError(value);
};

const parseFormat = (value: TomlPrimitive): DriveFormat => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    } else if (typeof value === "string") {
        switch (value) {
            case "ext2":
                return "ext2";
            case "sqfs":
                return "sqfs";
        }
    }
    throw new InvalidDriveFormatError(value);
};

const parseEmptyFormat = (value: TomlPrimitive): "ext2" | "raw" => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    } else if (typeof value === "string") {
        switch (value) {
            case "ext2":
                return "ext2";
            case "raw":
                return "raw";
        }
    }
    throw new InvalidEmptyDriveFormatError(value);
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
        finalHash: parseBoolean(toml["final-hash"], true),
        interactive: undefined,
        maxMCycle: parseOptionalNumber(toml["max-mcycle"]),
        noRollup: parseBoolean(toml["no-rollup"], false),
        ramLength: parseString(toml["ram-length"], DEFAULT_RAM),
        ramImage: parseString(toml["ram-image"], defaultRamImage()),
        store: "image",
        user: parseOptionalString(toml.user),
    };
};

export const getDriveFormat = (filename: string): DriveFormat => {
    const extension = extname(filename);
    switch (extension) {
        case ".ext2":
            return "ext2";
        case ".sqfs":
            return "sqfs";
        default:
            throw new InvalidDriveFormatError(extension);
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
                context,
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
                context: parseString(context, "."),
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
