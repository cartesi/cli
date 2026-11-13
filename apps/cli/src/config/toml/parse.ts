import { parse as parseToml, type TomlTable } from "smol-toml";
import { assertAccountsDrive } from "../accounts.js";
import { DEFAULT_SDK_IMAGE, DEFAULT_SDK_VERSION } from "../constants.js";
import { defaultRunConfig } from "../defaults.js";
import { DuplicateLabelError } from "../errors.js";
import type { Config } from "../types.js";
import { parseOptionalWithdrawal } from "./accounts.js";
import { parseDrives } from "./drives.js";
import { parseMachine } from "./machine.js";
import { parseNvrams } from "./nvrams.js";
import { parseOptionalPrt } from "./prt.js";
import { assertKnownKeys, mergeTomlTables } from "./tables.js";
import { parseString } from "./values.js";

/**
 * Parser of the deprecated `cartesi.toml` configuration file, superseded by
 * `cartesi.config.ts` and its plain data equivalents. It uses snake_case keys
 * and has no `[run]` section, and is kept working so existing applications
 * keep building.
 */

const CONFIG_KEYS: readonly string[] = [
    "drives",
    "machine",
    "nvrams",
    "prt",
    "sdk",
    "withdrawal",
];

export const parse = (str: string[]): Config => {
    let toml: TomlTable = {};
    for (const s of str) {
        toml = mergeTomlTables(toml, parseToml(s));
    }
    assertKnownKeys(toml, CONFIG_KEYS, "at the top level");

    const drives = parseDrives(toml.drives);
    const nvrams = parseNvrams(toml.nvrams);

    // drives and nvrams share the DTB /aliases namespace, so labels cannot collide
    for (const label of Object.keys(nvrams)) {
        if (drives[label] !== undefined) {
            throw new DuplicateLabelError(label);
        }
    }

    const config: Config = {
        withdrawal: parseOptionalWithdrawal(toml.withdrawal),
        drives,
        machine: parseMachine(toml.machine),
        nvrams,
        prt: parseOptionalPrt(toml.prt),
        run: defaultRunConfig(),
        sdk: parseString(
            toml.sdk,
            `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
        ),
    };

    assertAccountsDrive(config);

    return config;
};
