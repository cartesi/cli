import { parse as parseToml, type TomlTable } from "smol-toml";
import { assertAccountsDrive } from "./config/accounts.js";
import { DEFAULT_SDK_IMAGE, DEFAULT_SDK_VERSION } from "./config/constants.js";
import { DuplicateLabelError } from "./config/errors.js";
import { parseDrives } from "./config/toml/drives.js";
import { parseMachine } from "./config/toml/machine.js";
import { parseNvrams } from "./config/toml/nvrams.js";
import { assertKnownKeys, mergeTomlTables } from "./config/toml/tables.js";
import { parseString } from "./config/toml/values.js";
import { parseOptionalWithdrawal } from "./config/toml/accounts.js";
import type { Config } from "./config/types.js";

export {
    type AccountsDrive,
    assertAccountsDriveLength,
    getAccountsDrive,
    getLog2LeavesPerAccount,
    LOG2_LEAF_SIZE,
} from "./config/accounts.js";
export {
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    NVRAM_ALIGNMENT,
    PREFERRED_PORT,
} from "./config/constants.js";
export {
    defaultConfig,
    defaultMachineConfig,
    defaultRootDriveConfig,
} from "./config/defaults.js";
export * from "./config/errors.js";
export { splitSize } from "./config/size.js";
export { getDriveFormat } from "./config/toml/drives.js";
export type * from "./config/types.js";

const CONFIG_KEYS: readonly string[] = [
    "drives",
    "machine",
    "nvrams",
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
        sdk: parseString(
            toml.sdk,
            `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
        ),
    };

    assertAccountsDrive(config);

    return config;
};
