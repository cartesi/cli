import type { TomlPrimitive } from "smol-toml";
import { MAX_NVRAMS, NVRAM_ALIGNMENT } from "../constants.js";
import {
    InvalidNvramSizeError,
    InvalidTableError,
    MissingNvramSourceError,
    TooManyNvramsError,
} from "../errors.js";
import type { NvramConfig } from "../types.js";
import { assertKnownKeys, isTomlTable } from "./tables.js";
import {
    parseOptionalBoolean,
    parseOptionalString,
    parseSize,
} from "./values.js";
import { ACCOUNTS_DRIVE_KEYS, parseAccountsDriveMarker } from "./accounts.js";

const NVRAM_KEYS: readonly string[] = [
    ...ACCOUNTS_DRIVE_KEYS,
    "filename",
    "shared",
    "size",
    "user",
];

const parseNvram = (label: string, value: TomlPrimitive): NvramConfig => {
    if (!isTomlTable(value)) {
        throw new InvalidTableError(`[nvrams.${label}]`, value);
    }
    const toml = value;
    assertKnownKeys(toml, NVRAM_KEYS, `in [nvrams.${label}]`);
    const size = parseSize(toml.size);
    const filename = parseOptionalString(toml.filename);

    if (size === undefined && filename === undefined) {
        throw new MissingNvramSourceError(label);
    }
    if (size !== undefined && (size <= 0 || size % NVRAM_ALIGNMENT !== 0)) {
        throw new InvalidNvramSizeError(label, size);
    }

    return {
        ...parseAccountsDriveMarker(toml),
        filename,
        size,
        shared: parseOptionalBoolean(toml.shared),
        user: parseOptionalString(toml.user),
    };
};

export const parseNvrams = (
    config: TomlPrimitive,
): Record<string, NvramConfig> => {
    if (config !== undefined && !isTomlTable(config)) {
        throw new InvalidTableError("[nvrams]", config);
    }
    const entries = Object.entries(config ?? {});
    if (entries.length > MAX_NVRAMS) {
        throw new TooManyNvramsError(entries.length);
    }
    return entries.reduce<Record<string, NvramConfig>>(
        (acc, [label, nvram]) => {
            acc[label] = parseNvram(label, nvram);
            return acc;
        },
        {},
    );
};
