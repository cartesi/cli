import { type Address, getAddress, isAddress, isHex } from "viem";
import {
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidDriveFormatError,
    InvalidEmptyDriveFormatError,
    InvalidEnumValueError,
    InvalidEnvError,
    InvalidNumberValueError,
    InvalidSectionError,
    InvalidStringArrayError,
    InvalidStringValueError,
    RequiredFieldError,
} from "./errors.js";
import { parseSize } from "./size.js";
import {
    type Builder,
    type Config,
    DEFAULT_BLOCKS,
    DEFAULT_FORMAT,
    DEFAULT_RAM,
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    type DefaultBlock,
    defaultRootDriveConfig,
    type DriveConfig,
    type DriveFormat,
    getDriveFormat,
    type MachineConfig,
    type RunConfig,
    type WithdrawalConfig,
} from "./types.js";

type Record_ = Record<string, unknown>;

const isRecord = (value: unknown): value is Record_ =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (section: string, value: unknown): Record_ => {
    if (value === undefined || value === null) {
        return {};
    }
    if (!isRecord(value)) {
        throw new InvalidSectionError(section, value);
    }
    return value;
};

const asBoolean = (value: unknown, defaultValue: boolean): boolean => {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new InvalidBooleanValueError(value);
};

const asOptionalBoolean = (value: unknown): boolean | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new InvalidBooleanValueError(value);
};

const asString = (value: unknown, defaultValue: string): string => {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const asOptionalString = (value: unknown): string | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const asRequiredString = (value: unknown, key: string): string => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    }
    if (typeof value === "string") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const asOptionalStringBoolean = (
    value: unknown,
): string | boolean | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    throw new InvalidStringValueError(value);
};

const asStringArray = (value: unknown): string[] => {
    if (value === undefined) {
        return [];
    }
    if (typeof value === "string") {
        return [value];
    }
    if (Array.isArray(value)) {
        return value.map((v) => {
            if (typeof v === "string") {
                return v;
            }
            throw new InvalidStringValueError(v);
        });
    }
    throw new InvalidStringArrayError();
};

const asOptionalStringArray = (value: unknown): string[] | undefined =>
    value === undefined ? undefined : asStringArray(value);

/**
 * Coerce a table of environment variables into a record of strings, since the
 * value of an environment variable is always a string.
 */
const asStringRecord = (value: unknown): Record<string, string> => {
    if (value === undefined) {
        return {};
    }
    if (!isRecord(value)) {
        throw new InvalidEnvError(value);
    }
    return Object.entries(value).reduce<Record<string, string>>(
        (acc, [key, val]) => {
            if (typeof val === "string") {
                acc[key] = val;
            } else if (
                typeof val === "number" ||
                typeof val === "bigint" ||
                typeof val === "boolean"
            ) {
                acc[key] = String(val);
            } else {
                throw new InvalidStringValueError(val);
            }
            return acc;
        },
        {},
    );
};

const asOptionalNumber = (value: unknown, key?: string): number | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    throw new InvalidNumberValueError(value, key);
};

const asRequiredNumber = (value: unknown, key: string): number => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    }
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }

    // numbers of the withdrawal configuration are commonly written as hex
    const val =
        typeof value === "string" && isHex(value) ? parseInt(value, 16) : null;
    if (val !== null && !Number.isNaN(val)) {
        return val;
    }

    throw new InvalidNumberValueError(value, key);
};

const asOptionalBigInt = (value: unknown): bigint | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "bigint") {
        return value;
    }
    if (typeof value === "number" && Number.isInteger(value)) {
        return BigInt(value);
    }
    throw new InvalidNumberValueError(value);
};

const asRequiredAddress = (value: unknown, key: string): Address => {
    if (value === undefined) {
        throw new RequiredFieldError(key);
    }
    if (typeof value === "string" && isAddress(value)) {
        return getAddress(value);
    }
    throw new InvalidAddressValueError(value, key);
};

const asBytes = (value: unknown, defaultValue: number): number =>
    value === undefined ? defaultValue : parseSize(value);

const asBuilder = (value: unknown): Builder => {
    if (value === undefined) {
        return "docker";
    }
    if (typeof value === "string") {
        switch (value) {
            case "directory":
            case "docker":
            case "empty":
            case "none":
            case "tar":
                return value;
        }
    }
    throw new InvalidBuilderError(value);
};

const asFormat = (value: unknown): DriveFormat => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    }
    if (value === "ext2" || value === "sqfs") {
        return value;
    }
    throw new InvalidDriveFormatError(value);
};

const asEmptyFormat = (value: unknown): "ext2" | "raw" => {
    if (value === undefined) {
        return DEFAULT_FORMAT;
    }
    if (value === "ext2" || value === "raw") {
        return value;
    }
    throw new InvalidEmptyDriveFormatError(value);
};

const normalizeDrive = (value: unknown): DriveConfig => {
    const drive = asRecord("drive", value);
    const mount = asOptionalStringBoolean(drive.mount);
    const shared = asOptionalBoolean(drive.shared);
    const user = asOptionalString(drive.user);

    switch (asBuilder(drive.builder)) {
        case "directory":
            return {
                builder: "directory",
                directory: asRequiredString(drive.directory, "directory"),
                extraSize: asBytes(drive.extraSize, 0),
                format: asFormat(drive.format),
                mount,
                shared,
                user,
            };
        case "docker":
            return {
                builder: "docker",
                buildArgs: asStringArray(drive.buildArgs),
                context: asString(drive.context, "."),
                dockerfile: asString(drive.dockerfile, "Dockerfile"),
                extraSize: asBytes(drive.extraSize, 0),
                format: asFormat(drive.format),
                image: asOptionalString(drive.image),
                mount,
                shared,
                tags: asStringArray(drive.tags),
                target: asOptionalString(drive.target),
                user,
            };
        case "empty":
            return {
                builder: "empty",
                format: asEmptyFormat(drive.format),
                mount,
                shared,
                size: asBytes(drive.size, 0),
                user,
            };
        case "tar":
            return {
                builder: "tar",
                extraSize: asBytes(drive.extraSize, 0),
                filename: asRequiredString(drive.filename, "filename"),
                format: asFormat(drive.format),
                mount,
                shared,
                user,
            };
        case "none": {
            const filename = asRequiredString(drive.filename, "filename");
            return {
                builder: "none",
                filename,
                // the format of an existing drive comes from its extension,
                // unless it is explicitly given
                format:
                    drive.format === undefined
                        ? getDriveFormat(filename)
                        : asFormat(drive.format),
                mount,
                shared,
                user,
            };
        }
    }
};

const normalizeDrives = (value: unknown): Record<string, DriveConfig> => {
    const drives = Object.entries(asRecord("drives", value)).reduce<
        Record<string, DriveConfig>
    >((acc, [name, drive]) => {
        acc[name] = normalizeDrive(drive);
        return acc;
    }, {});

    if (drives.root === undefined) {
        // every machine needs a root drive, add a default one
        drives.root = defaultRootDriveConfig();
    }
    return drives;
};

const normalizeMachine = (value: unknown): MachineConfig => {
    const machine = asRecord("machine", value);
    return {
        assertRollingTemplate: asOptionalBoolean(machine.assertRollingTemplate),
        bootargs: asStringArray(machine.bootargs),
        entrypoint: asOptionalString(machine.entrypoint),
        env: asStringRecord(machine.env),
        envFile: asOptionalString(machine.envFile),
        maxMCycle: asOptionalBigInt(machine.maxMCycle),
        ramLength: asString(machine.ramLength, DEFAULT_RAM),
        ramImage: asOptionalString(machine.ramImage),
        useDockerEnv: asBoolean(machine.useDockerEnv, true),
        useDockerWorkdir: asBoolean(machine.useDockerWorkdir, true),
        user: asOptionalString(machine.user),
    };
};

const asDefaultBlock = (value: unknown): DefaultBlock | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (DEFAULT_BLOCKS.includes(value as DefaultBlock)) {
        return value as DefaultBlock;
    }
    throw new InvalidEnumValueError("defaultBlock", value, DEFAULT_BLOCKS);
};

const normalizeRun = (value: unknown): RunConfig => {
    const run = asRecord("run", value);
    return {
        blockTime: asOptionalNumber(run.blockTime, "blockTime"),
        claimStagingPeriod: asOptionalNumber(
            run.claimStagingPeriod,
            "claimStagingPeriod",
        ),
        cpus: asOptionalNumber(run.cpus, "cpus"),
        defaultBlock: asDefaultBlock(run.defaultBlock),
        epochLength: asOptionalNumber(run.epochLength, "epochLength"),
        forkBlockNumber: asOptionalNumber(
            run.forkBlockNumber,
            "forkBlockNumber",
        ),
        forkUrl: asOptionalString(run.forkUrl),
        memory: asOptionalNumber(run.memory, "memory"),
        port: asOptionalNumber(run.port, "port"),
        projectName: asOptionalString(run.projectName),
        prt: asOptionalBoolean(run.prt),
        runtimeVersion: asOptionalString(run.runtimeVersion),
        services: asOptionalStringArray(run.services),
        verbose: asOptionalBoolean(run.verbose),
    };
};

const normalizeWithdrawal = (value: unknown): WithdrawalConfig | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    const withdrawal = asRecord("withdrawal", value);
    if (Object.keys(withdrawal).length === 0) {
        return undefined;
    }
    return {
        guardian: asRequiredAddress(withdrawal.guardian, "guardian"),
        log2_leaves_per_account: asRequiredNumber(
            withdrawal.log2_leaves_per_account,
            "log2_leaves_per_account",
        ),
        log2_max_num_of_accounts: asRequiredNumber(
            withdrawal.log2_max_num_of_accounts,
            "log2_max_num_of_accounts",
        ),
        accounts_drive_start_index: asRequiredNumber(
            withdrawal.accounts_drive_start_index,
            "accounts_drive_start_index",
        ),
        withdrawal_output_builder: asRequiredAddress(
            withdrawal.withdrawal_output_builder,
            "withdrawal_output_builder",
        ),
    };
};

/**
 * Validate a configuration written by a developer and resolve it into the
 * fully defaulted {@link Config} the rest of the CLI works with.
 *
 * The input is deliberately typed as `unknown`: a `cartesi.config.ts` file is
 * type checked at author time, but a `cartesi.config.json` or
 * `cartesi.config.yaml` file is not, so every field is validated here.
 *
 * An already resolved {@link Config} is a valid input, and normalizing it again
 * yields an equivalent configuration.
 *
 * @param input configuration as written, or `undefined` for the defaults
 * @returns resolved application configuration
 */
export const normalizeConfig = (input: unknown): Config => {
    const config = asRecord("config", input);

    return {
        drives: normalizeDrives(config.drives),
        machine: normalizeMachine(config.machine),
        run: normalizeRun(config.run),
        sdk: asString(
            config.sdk,
            `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
        ),
        withdrawalConfig: normalizeWithdrawal(
            config.withdrawal ?? config.withdrawalConfig,
        ),
    };
};
