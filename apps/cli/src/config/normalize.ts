import { type Address, getAddress, isAddress } from "viem";
import {
    DuplicateLabelError,
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidDriveFormatError,
    InvalidEmptyDriveFormatError,
    InvalidEnumValueError,
    InvalidEnvError,
    InvalidNumberValueError,
    InvalidNvramSizeError,
    InvalidSectionError,
    InvalidStringArrayError,
    InvalidStringValueError,
    MissingNvramSourceError,
    RequiredFieldError,
    TooManyNvramsError,
} from "./errors.js";
import { parseBytes, parseSize } from "./size.js";
import {
    type AccountsDriveMarker,
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
    MAX_NVRAMS,
    NVRAM_ALIGNMENT,
    type NvramConfig,
    type RunConfig,
    type WithdrawalOptions,
} from "./types.js";
import { assertAccountSize, assertAccountsDrive } from "./validate.js";

/**
 * Validation and defaulting of a configuration written by a developer, for
 * every format but the deprecated TOML one.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (section: string, value: unknown): Record<string, unknown> => {
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

const asOptionalAddress = (
    value: unknown,
    key: string,
): Address | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "string" && isAddress(value)) {
        return getAddress(value);
    }
    throw new InvalidAddressValueError(value, key);
};

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

/**
 * Reads the keys that mark a drive or nvram as the accounts drive, leaving them
 * out when unset, so they do not show up as explicit `undefined`.
 */
const normalizeAccountsDriveMarker = (
    drive: Record<string, unknown>,
): AccountsDriveMarker => {
    const accountsDrive = asOptionalBoolean(drive.accountsDrive);
    const accountsDriveSize = parseSize(drive.accountsDriveSize);
    return {
        ...(accountsDrive !== undefined && { accountsDrive }),
        ...(accountsDriveSize !== undefined && { accountsDriveSize }),
    };
};

const normalizeDrive = (value: unknown): DriveConfig => {
    const drive = asRecord("drive", value);
    const marker = normalizeAccountsDriveMarker(drive);
    const mount = asOptionalStringBoolean(drive.mount);
    const shared = asOptionalBoolean(drive.shared);
    const user = asOptionalString(drive.user);

    switch (asBuilder(drive.builder)) {
        case "directory":
            return {
                ...marker,
                builder: "directory",
                directory: asRequiredString(drive.directory, "directory"),
                extraSize: parseBytes(drive.extraSize, 0),
                format: asFormat(drive.format),
                mount,
                shared,
                user,
            };
        case "docker":
            return {
                ...marker,
                builder: "docker",
                buildArgs: asStringArray(drive.buildArgs),
                context: asString(drive.context, "."),
                dockerfile: asString(drive.dockerfile, "Dockerfile"),
                extraSize: parseBytes(drive.extraSize, 0),
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
                ...marker,
                builder: "empty",
                format: asEmptyFormat(drive.format),
                mount,
                shared,
                size: parseBytes(drive.size, 0),
                user,
            };
        case "tar":
            return {
                ...marker,
                builder: "tar",
                extraSize: parseBytes(drive.extraSize, 0),
                filename: asRequiredString(drive.filename, "filename"),
                format: asFormat(drive.format),
                mount,
                shared,
                user,
            };
        case "none": {
            const filename = asRequiredString(drive.filename, "filename");
            return {
                ...marker,
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

const normalizeNvram = (label: string, value: unknown): NvramConfig => {
    const nvram = asRecord("nvram", value);
    const size = parseSize(nvram.size);
    const filename = asOptionalString(nvram.filename);

    if (size === undefined && filename === undefined) {
        throw new MissingNvramSourceError(label);
    }
    if (size !== undefined && (size <= 0 || size % NVRAM_ALIGNMENT !== 0)) {
        throw new InvalidNvramSizeError(label, size);
    }

    return {
        ...normalizeAccountsDriveMarker(nvram),
        filename,
        size,
        shared: asOptionalBoolean(nvram.shared),
        user: asOptionalString(nvram.user),
    };
};

const normalizeNvrams = (value: unknown): Record<string, NvramConfig> => {
    const entries = Object.entries(asRecord("nvrams", value));
    if (entries.length > MAX_NVRAMS) {
        throw new TooManyNvramsError(entries.length);
    }
    return entries.reduce<Record<string, NvramConfig>>(
        (acc, [label, nvram]) => {
            acc[label] = normalizeNvram(label, nvram);
            return acc;
        },
        {},
    );
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

const normalizeWithdrawal = (value: unknown): WithdrawalOptions | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    const withdrawal = asRecord("withdrawal", value);
    return {
        guardian: asOptionalAddress(withdrawal.guardian, "guardian"),
        withdrawal_output_builder: asOptionalAddress(
            withdrawal.withdrawal_output_builder,
            "withdrawal_output_builder",
        ),
        account_size:
            withdrawal.account_size === undefined
                ? undefined
                : assertAccountSize(
                      parseSize(withdrawal.account_size),
                      withdrawal.account_size,
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
    const input_ = asRecord("config", input);

    const drives = normalizeDrives(input_.drives);
    const nvrams = normalizeNvrams(input_.nvrams);

    // drives and nvrams share the DTB /aliases namespace, so labels cannot collide
    for (const label of Object.keys(nvrams)) {
        if (drives[label] !== undefined) {
            throw new DuplicateLabelError(label);
        }
    }

    const config: Config = {
        drives,
        machine: normalizeMachine(input_.machine),
        nvrams,
        run: normalizeRun(input_.run),
        sdk: asString(
            input_.sdk,
            `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`,
        ),
        withdrawal: normalizeWithdrawal(input_.withdrawal),
    };

    assertAccountsDrive(config);

    return config;
};
