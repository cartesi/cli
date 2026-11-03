import { extname } from "node:path";
import type { TomlTable, TomlValue } from "smol-toml";
import { DEFAULT_FORMAT } from "../constants.js";
import { defaultRootDriveConfig } from "../defaults.js";
import {
    InvalidBuilderError,
    InvalidDriveFormatError,
    InvalidEmptyDriveFormatError,
    InvalidTableError,
} from "../errors.js";
import type { Builder, DriveConfig, DriveFormat } from "../types.js";
import { assertKnownKeys, isTomlTable } from "./tables.js";
import {
    parseBytes,
    parseOptionalBoolean,
    parseOptionalString,
    parseOptionalStringBoolean,
    parseRequiredString,
    parseString,
    parseStringArray,
} from "./values.js";
import { ACCOUNTS_DRIVE_KEYS, parseAccountsDriveMarker } from "./accounts.js";

const parseBuilder = (value: TomlValue): Builder => {
    if (value === undefined) {
        return "docker";
    }
    if (typeof value === "string") {
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

const parseFormat = (value: TomlValue): DriveFormat => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    }
    if (typeof value === "string") {
        switch (value) {
            case "ext2":
                return "ext2";
            case "sqfs":
                return "sqfs";
        }
    }
    throw new InvalidDriveFormatError(value);
};

const parseEmptyFormat = (value: TomlValue): "ext2" | "raw" => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    }
    if (typeof value === "string") {
        switch (value) {
            case "ext2":
                return "ext2";
            case "raw":
                return "raw";
        }
    }
    throw new InvalidEmptyDriveFormatError(value);
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

const DRIVE_KEYS: readonly string[] = [
    ...ACCOUNTS_DRIVE_KEYS,
    "builder",
    "mount",
    "shared",
    "user",
];

/**
 * The keys each builder reads, on top of DRIVE_KEYS
 */
const BUILDER_KEYS: Record<Builder, readonly string[]> = {
    directory: ["directory", "extra_size", "format"],
    docker: [
        "build_args",
        "context",
        "dockerfile",
        "extra_size",
        "format",
        "image",
        "tags",
        "target",
    ],
    empty: ["format", "size"],
    none: ["filename"],
    tar: ["extra_size", "filename", "format"],
};

const parseDrive = (name: string, drive: TomlValue): DriveConfig => {
    if (!isTomlTable(drive)) {
        throw new InvalidTableError(`[drives.${name}]`, drive);
    }
    const toml = drive;
    // the keys depend on the builder, so an invalid one is reported first
    const builder = parseBuilder(toml.builder);
    const implicit = toml.builder === undefined ? " by default" : "";
    assertKnownKeys(
        toml,
        [...DRIVE_KEYS, ...BUILDER_KEYS[builder]],
        `in [drives.${name}] (builder = "${builder}"${implicit})`,
    );
    return {
        ...parseBuilderDrive(builder, toml),
        ...parseAccountsDriveMarker(toml),
    };
};

const parseBuilderDrive = (builder: Builder, drive: TomlTable): DriveConfig => {
    switch (builder) {
        case "directory": {
            const { extra_size, format, mount, directory, shared, user } =
                drive;
            return {
                builder: "directory",
                extraSize: parseBytes(extra_size, 0),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                directory: parseRequiredString(directory, "directory"),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
            };
        }
        case "docker": {
            const {
                build_args,
                context,
                dockerfile,
                extra_size,
                format,
                image,
                mount,
                shared,
                tags,
                target,
                user,
            } = drive;
            return {
                builder: "docker",
                buildArgs: parseStringArray(build_args),
                image: parseOptionalString(image),
                context: parseString(context, "."),
                dockerfile: parseString(dockerfile, "Dockerfile"),
                extraSize: parseBytes(extra_size, 0),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
                tags: parseStringArray(tags),
                target: parseOptionalString(target),
            };
        }
        case "empty": {
            const { format, mount, size, shared, user } = drive;
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
            const { extra_size, filename, format, mount, shared, user } = drive;
            return {
                builder: "tar",
                extraSize: parseBytes(extra_size, 0),
                filename: parseRequiredString(filename, "filename"),
                format: parseFormat(format),
                mount: parseOptionalStringBoolean(mount),
                shared: parseOptionalBoolean(shared),
                user: parseOptionalString(user),
            };
        }
        case "none": {
            const { shared, mount, user } = drive;
            const filename = parseRequiredString(drive.filename, "filename");
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

export const parseDrives = (config: TomlValue): Record<string, DriveConfig> => {
    if (config !== undefined && !isTomlTable(config)) {
        throw new InvalidTableError("[drives]", config);
    }
    // load drives from configuration
    const drives = Object.entries(config ?? {}).reduce<
        Record<string, DriveConfig>
    >((acc, [name, drive]) => {
        acc[name] = parseDrive(name, drive);
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
