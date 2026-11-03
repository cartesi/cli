import type { TomlValue } from "smol-toml";
import { DEFAULT_RAM } from "../constants.js";
import { defaultMachineConfig } from "../defaults.js";
import { InvalidTableError } from "../errors.js";
import type { MachineConfig } from "../types.js";
import { assertKnownKeys, isTomlTable } from "./tables.js";
import {
    parseBoolean,
    parseOptionalBoolean,
    parseOptionalNumber,
    parseOptionalString,
    parseString,
    parseStringArray,
    parseStringRecord,
} from "./values.js";

const MACHINE_KEYS: readonly string[] = [
    "assert_rolling_template",
    "boot_args",
    "entrypoint",
    "env",
    "env_file",
    "max_mcycle",
    "ram_image",
    "ram_length",
    "use_docker_env",
    "use_docker_workdir",
    "user",
];

export const parseMachine = (value: TomlValue): MachineConfig => {
    if (value === undefined) {
        // default machine
        return defaultMachineConfig();
    }
    if (!isTomlTable(value)) {
        throw new InvalidTableError("[machine]", value);
    }
    assertKnownKeys(value, MACHINE_KEYS, "in [machine]");
    const toml = value;

    return {
        assertRollingTemplate: parseOptionalBoolean(
            toml.assert_rolling_template,
        ),
        bootargs: parseStringArray(toml.boot_args),
        entrypoint: parseOptionalString(toml.entrypoint),
        env: parseStringRecord(toml.env),
        envFile: parseOptionalString(toml.env_file),
        maxMCycle: parseOptionalNumber(toml.max_mcycle),
        ramLength: parseString(toml.ram_length, DEFAULT_RAM),
        ramImage: parseOptionalString(toml.ram_image),
        useDockerEnv: parseBoolean(toml.use_docker_env, true),
        useDockerWorkdir: parseBoolean(toml.use_docker_workdir, true),
        user: parseOptionalString(toml.user),
    };
};
