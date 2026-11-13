import { type Address, getAddress, isAddress } from "viem";
import {
    assertAccountsDrive,
    LOG2_LEAF_SIZE,
    log2OfPowerOfTwo,
} from "./accounts.js";
import {
    DEFAULT_FORMAT,
    DEFAULT_RAM,
    DEFAULT_SDK_IMAGE,
    DEFAULT_SDK_VERSION,
    MAX_NVRAMS,
    NVRAM_ALIGNMENT,
} from "./constants.js";
import { defaultRootDriveConfig } from "./defaults.js";
import {
    DuplicateLabelError,
    formatValue,
    InvalidAddressValueError,
    InvalidBooleanValueError,
    InvalidBuilderError,
    InvalidDriveFormatError,
    InvalidEmptyDriveFormatError,
    InvalidEnumValueError,
    InvalidEnvError,
    InvalidNumberValueError,
    InvalidNvramSizeError,
    InvalidStringArrayError,
    InvalidStringValueError,
    InvalidTableError,
    InvalidWithdrawalConfigError,
    MissingNvramSourceError,
    RequiredFieldError,
    TooManyNvramsError,
    UnknownConfigKeyError,
} from "./errors.js";
import { parseBytes, parseSize } from "./size.js";
import { getDriveFormat } from "./toml/drives.js";
import { parseOptionalPrt, PRT_KEYS, PRT_NODE_KEYS } from "./toml/prt.js";
import {
    type AccountsDriveMarker,
    type Builder,
    type Config,
    DEFAULT_BLOCKS,
    type DefaultBlock,
    type DriveConfig,
    type DriveFormat,
    type MachineConfig,
    type NvramConfig,
    type PrtOptions,
    type RunConfig,
    type WithdrawalOptions,
} from "./types.js";

/**
 * Validation and defaulting of a configuration written by a developer, for
 * every format but the deprecated TOML one: a `cartesi.config.ts` file through
 * `defineConfig`, or the same configuration as plain data.
 *
 * A `cartesi.config.ts` file is type checked where it is written, but a JSON or
 * YAML one is not, so every value is checked here, and, as the TOML parser
 * does, a key no section reads is an error rather than a typo that does
 * nothing.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const asTable = (
    where: string,
    value: unknown,
    known: readonly string[],
): Record<string, unknown> => {
    if (value === undefined || value === null) {
        return {};
    }
    if (!isRecord(value)) {
        throw new InvalidTableError(where, value);
    }
    const unknown = Object.keys(value).filter((key) => !known.includes(key));
    if (unknown.length > 0) {
        throw new UnknownConfigKeyError(unknown, known, `in ${where}`);
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

const ACCOUNTS_DRIVE_KEYS: readonly string[] = [
    "accountsDrive",
    "accountsDriveSize",
];

const DRIVE_KEYS: readonly string[] = [
    ...ACCOUNTS_DRIVE_KEYS,
    "builder",
    "mount",
    "shared",
    "user",
];

/** The keys each builder reads, on top of DRIVE_KEYS */
const BUILDER_KEYS: Record<Builder, readonly string[]> = {
    directory: ["directory", "extraSize", "format"],
    docker: [
        "buildArgs",
        "context",
        "dockerfile",
        "extraSize",
        "format",
        "image",
        "tags",
        "target",
    ],
    empty: ["format", "size"],
    none: ["filename", "format"],
    tar: ["extraSize", "filename", "format"],
};

const NVRAM_KEYS: readonly string[] = [
    ...ACCOUNTS_DRIVE_KEYS,
    "filename",
    "shared",
    "size",
    "user",
];

const MACHINE_KEYS: readonly string[] = [
    "assertRollingTemplate",
    "bootargs",
    "entrypoint",
    "env",
    "envFile",
    "maxMCycle",
    "ramImage",
    "ramLength",
    "useDockerEnv",
    "useDockerWorkdir",
    "user",
];

const RUN_KEYS: readonly string[] = [
    "blockTime",
    "claimStagingPeriod",
    "cpus",
    "defaultBlock",
    "epochLength",
    "forkBlockNumber",
    "forkUrl",
    "memory",
    "port",
    "projectName",
    "prt",
    "runtimeVersion",
    "services",
    "verbose",
];

const PRT_KEYS_CAMEL: readonly string[] = PRT_KEYS.map((key) =>
    key === "sentry_manager" ? "sentryManager" : key,
);

const PRT_NODE_KEYS_CAMEL: readonly string[] = PRT_NODE_KEYS.map((key) =>
    key === "private_key_file" ? "privateKeyFile" : key,
);

const WITHDRAWAL_KEYS: readonly string[] = [
    "account_size",
    "guardian",
    "withdrawal_output_builder",
];

// '$schema' is not configuration, it points a JSON or YAML editor at the schema
const CONFIG_KEYS: readonly string[] = [
    "$schema",
    "drives",
    "machine",
    "nvrams",
    "prt",
    "run",
    "sdk",
    "withdrawal",
];

/**
 * Reads the keys that mark a drive or nvram as the accounts drive, leaving them
 * out when unset, so they do not show up as an explicit `undefined`.
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

const normalizeDrive = (name: string, value: unknown): DriveConfig => {
    if (value !== undefined && !isRecord(value)) {
        throw new InvalidTableError(`drives.${name}`, value);
    }
    const builder = asBuilder((value as Record<string, unknown>)?.builder);
    const implicit =
        (value as Record<string, unknown>)?.builder === undefined
            ? ", by default"
            : "";
    const drive = asTable(
        `drives.${name} (builder "${builder}"${implicit})`,
        value,
        [...DRIVE_KEYS, ...BUILDER_KEYS[builder]],
    );

    const marker = normalizeAccountsDriveMarker(drive);
    const mount = asOptionalStringBoolean(drive.mount);
    const shared = asOptionalBoolean(drive.shared);
    const user = asOptionalString(drive.user);

    switch (builder) {
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
    if (value !== undefined && !isRecord(value)) {
        throw new InvalidTableError("drives", value);
    }
    const drives = Object.entries(
        (value as Record<string, unknown>) ?? {},
    ).reduce<Record<string, DriveConfig>>((acc, [name, drive]) => {
        acc[name] = normalizeDrive(name, drive);
        return acc;
    }, {});

    if (drives.root === undefined) {
        // every machine needs a root drive, add a default one
        drives.root = defaultRootDriveConfig();
    }
    return drives;
};

const normalizeNvram = (label: string, value: unknown): NvramConfig => {
    const nvram = asTable(`nvrams.${label}`, value, NVRAM_KEYS);
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
    if (value !== undefined && !isRecord(value)) {
        throw new InvalidTableError("nvrams", value);
    }
    const entries = Object.entries((value as Record<string, unknown>) ?? {});
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
    const machine = asTable("machine", value, MACHINE_KEYS);
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
    const run = asTable("run", value, RUN_KEYS);
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

/**
 * Checks `account_size`, which divides the accounts drive into accounts and so
 * must be a power of two of at least one 32-byte leaf.
 */
const asAccountSize = (value: unknown): number => {
    const size = parseSize(value);
    if (
        size === undefined ||
        size < 2 ** LOG2_LEAF_SIZE ||
        log2OfPowerOfTwo(size) === undefined
    ) {
        throw new InvalidWithdrawalConfigError(
            `account_size ${formatValue(value)} must be a power of two of at least 32 bytes, such as 32 or 64`,
        );
    }
    return size;
};

/**
 * The `prt` section, whose entries constrain each other and each other's
 * addresses. Rather than keep a second copy of those checks, the camelCase keys
 * are mapped onto the names the TOML parser reads and handed to it, so both
 * formats are validated by the same code. Unknown keys are reported first, as
 * the developer spelled them.
 */
const normalizePrt = (value: unknown): PrtOptions | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    const prt = asTable("prt", value, PRT_KEYS_CAMEL);

    let nodes: Record<string, unknown> | undefined;
    if (prt.nodes !== undefined) {
        if (!isRecord(prt.nodes)) {
            throw new InvalidTableError("prt.nodes", prt.nodes);
        }
        nodes = Object.fromEntries(
            Object.entries(prt.nodes).map(([label, entry]) => {
                const node = asTable(
                    `prt.nodes.${label}`,
                    entry,
                    PRT_NODE_KEYS_CAMEL,
                );
                const { privateKeyFile, ...rest } = node;
                return [
                    label,
                    {
                        ...rest,
                        ...(privateKeyFile !== undefined && {
                            private_key_file: privateKeyFile,
                        }),
                    },
                ];
            }),
        );
    }

    const { sentryManager, ...rest } = prt;
    return parseOptionalPrt({
        ...rest,
        ...(sentryManager !== undefined && { sentry_manager: sentryManager }),
        ...(nodes !== undefined && { nodes }),
    } as never);
};

const normalizeWithdrawal = (value: unknown): WithdrawalOptions | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    const withdrawal = asTable("withdrawal", value, WITHDRAWAL_KEYS);
    return {
        guardian: asOptionalAddress(withdrawal.guardian, "guardian"),
        withdrawal_output_builder: asOptionalAddress(
            withdrawal.withdrawal_output_builder,
            "withdrawal_output_builder",
        ),
        account_size:
            withdrawal.account_size === undefined
                ? undefined
                : asAccountSize(withdrawal.account_size),
    };
};

/**
 * Validate a configuration written by a developer and resolve it into the fully
 * defaulted {@link Config} the rest of the CLI works with.
 *
 * An already resolved {@link Config} is a valid input, and normalizing it again
 * yields an equivalent configuration.
 *
 * @param input configuration as written, or `undefined` for the defaults
 * @returns resolved application configuration
 */
export const normalizeConfig = (input: unknown): Config => {
    const table = asTable("the configuration", input, CONFIG_KEYS);

    const drives = normalizeDrives(table.drives);
    const nvrams = normalizeNvrams(table.nvrams);

    // drives and nvrams share the DTB /aliases namespace, so labels cannot collide
    for (const label of Object.keys(nvrams)) {
        if (drives[label] !== undefined) {
            throw new DuplicateLabelError(label);
        }
    }

    const config: Config = {
        drives,
        machine: normalizeMachine(table.machine),
        nvrams,
        prt: normalizePrt(table.prt),
        run: normalizeRun(table.run),
        sdk: asString(table.sdk, `${DEFAULT_SDK_IMAGE}:${DEFAULT_SDK_VERSION}`),
        withdrawal: normalizeWithdrawal(table.withdrawal),
    };

    assertAccountsDrive(config);

    return config;
};
